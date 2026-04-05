// ══════════════════════════════════════════════════════════════════════════
// BRICK BREAKER — Classic ball + paddle, multi-level
// ══════════════════════════════════════════════════════════════════════════

let bbCanvas, bbCtx, bbW, bbH;
let bbState = 'idle'; // idle | playing | ended
let bbRaf = null;
let bbScore = 0, bbLives = 3, bbLevel = 1;
let bbBall, bbPaddle, bbBricks = [];
let bbParticles = [], bbFloats = [];
let bbFrame = 0;
let bbTouchX = null;
let bbMultiBalls = []; // extra balls from powerups
let bbPowerups = [];

const BB_ROWS = 5, BB_COLS = 8;
const BB_BRICK_H = 18, BB_BRICK_GAP = 3;
const BB_PAD_H = 10;
const BB_BALL_R = 7;

const BB_COLORS = [
  '#e53935', '#e91e63', '#9c27b0',
  '#3f51b5', '#2196f3', '#009688',
  '#4caf50', '#ff9800', '#ff5722'
];

const BB_POWERUP_TYPES = [
  { type: 'wide', emoji: '⬛', color: '#00bcd4', desc: 'Wide Paddle' },
  { type: 'multi', emoji: '⚡', color: '#ffd700', desc: 'Multi Ball' },
  { type: 'slow', emoji: '🐢', color: '#66bb6a', desc: 'Slow Ball' },
];

function bbResize() {
  const cont = document.getElementById('bbContainer');
  bbW = cont.clientWidth;
  bbH = cont.clientHeight;
  bbCanvas.width = bbW;
  bbCanvas.height = bbH;
}

function showBbOverlay(showResults) {
  const ov = document.getElementById('bbOverlay');
  ov.style.display = 'flex';
  const earned = document.getElementById('bbEarned');
  const result = document.getElementById('bbResult');
  if (showResults) {
    earned.style.display = 'block';
    earned.textContent = '🏆 ' + bbScore + ' points!';
    result.style.display = 'block';
    result.textContent = 'Reached Level ' + bbLevel;
    document.getElementById('bbPlayBtn').textContent = '▶ Play Again';
  } else {
    earned.style.display = 'none';
    result.style.display = 'none';
    document.getElementById('bbPlayBtn').textContent = '▶ Play';
  }
}

function exitBrickBreaker() {
  bbState = 'idle';
  if (bbRaf) cancelAnimationFrame(bbRaf);
  bbRaf = null;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-home').classList.add('active');
  document.getElementById('bottomNav').style.display = 'flex';
  currentPage = 'home';
  refreshHome();
}

function bbBrickW() {
  return (bbW - 20 - (BB_COLS - 1) * BB_BRICK_GAP) / BB_COLS;
}

function bbCreateBricks() {
  bbBricks = [];
  const bw = bbBrickW();
  const topY = 60;
  const rows = Math.min(BB_ROWS + Math.floor(bbLevel / 2), 9);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < BB_COLS; c++) {
      const hp = r < 2 ? (bbLevel > 3 ? 3 : bbLevel > 1 ? 2 : 1) : 1;
      bbBricks.push({
        x: 10 + c * (bw + BB_BRICK_GAP),
        y: topY + r * (BB_BRICK_H + BB_BRICK_GAP),
        w: bw, h: BB_BRICK_H,
        hp, maxHp: hp,
        color: BB_COLORS[(r * 3 + c * 2) % BB_COLORS.length],
        alive: true,
        shake: 0,
        hasPowerup: Math.random() < 0.12
      });
    }
  }
}

function bbResetBall() {
  const speed = 4 + bbLevel * 0.4;
  bbBall = {
    x: bbW / 2, y: bbH - 100,
    vx: (Math.random() > 0.5 ? 1 : -1) * speed * 0.6,
    vy: -speed,
    r: BB_BALL_R,
    stuck: true // stuck to paddle until first tap
  };
  bbMultiBalls = [];
}

function bbResetPaddle() {
  bbPaddle = {
    x: bbW / 2 - 40, y: bbH - 30,
    w: 80, h: BB_PAD_H,
    wideTimer: 0
  };
}

function bbAddFloat(text, color, x, y) {
  bbFloats.push({ text, color, x, y, life: 50 });
}

function bbSpawnParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1 + Math.random() * 4;
    bbParticles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, r: 2 + Math.random() * 3, life: 1, color });
  }
}

function bbBounceBall(ball) {
  // walls
  if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); }
  if (ball.x + ball.r > bbW) { ball.x = bbW - ball.r; ball.vx = -Math.abs(ball.vx); }
  if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy = Math.abs(ball.vy); }

  // paddle
  const pad = bbPaddle;
  const padW = pad.wideTimer > 0 ? pad.w * 1.6 : pad.w;
  const padX = pad.x - (pad.wideTimer > 0 ? pad.w * 0.3 : 0);
  if (ball.vy > 0 &&
    ball.y + ball.r >= pad.y &&
    ball.y - ball.r <= pad.y + pad.h &&
    ball.x >= padX &&
    ball.x <= padX + padW) {
    ball.y = pad.y - ball.r;
    ball.vy = -Math.abs(ball.vy);
    // angle based on hit position
    const rel = (ball.x - (padX + padW / 2)) / (padW / 2);
    ball.vx = rel * 6;
    const spd = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    const targetSpd = 4 + bbLevel * 0.4;
    ball.vx = (ball.vx / spd) * targetSpd;
    ball.vy = (ball.vy / spd) * targetSpd;
  }

  // bricks
  const bw = bbBrickW();
  for (const br of bbBricks) {
    if (!br.alive) continue;
    if (ball.x + ball.r > br.x && ball.x - ball.r < br.x + br.w &&
      ball.y + ball.r > br.y && ball.y - ball.r < br.y + br.h) {
      // which side hit
      const overlapL = ball.x + ball.r - br.x;
      const overlapR = br.x + br.w - (ball.x - ball.r);
      const overlapT = ball.y + ball.r - br.y;
      const overlapB = br.y + br.h - (ball.y - ball.r);
      const minH = Math.min(overlapL, overlapR);
      const minV = Math.min(overlapT, overlapB);
      if (minH < minV) ball.vx = -ball.vx;
      else ball.vy = -ball.vy;

      br.hp--;
      br.shake = 5;
      if (br.hp <= 0) {
        br.alive = false;
        bbScore += 10 * bbLevel;
        document.getElementById('bbScore').textContent = bbScore;
        bbSpawnParticles(br.x + br.w / 2, br.y + br.h / 2, br.color, 8);
        bbAddFloat('+' + (10 * bbLevel), '#ffd700', br.x + br.w / 2, br.y);
        // drop powerup
        if (br.hasPowerup) {
          const pt = BB_POWERUP_TYPES[Math.floor(Math.random() * BB_POWERUP_TYPES.length)];
          bbPowerups.push({ x: br.x + br.w / 2, y: br.y, vy: 2, ...pt });
        }
      }
      break;
    }
  }
}

function bbUpdate() {
  if (bbState !== 'playing') return;
  bbFrame++;

  // paddle powerup timers
  if (bbPaddle.wideTimer > 0) bbPaddle.wideTimer--;

  // move paddle toward touch
  if (bbTouchX !== null) {
    const padW = bbPaddle.wideTimer > 0 ? bbPaddle.w * 1.6 : bbPaddle.w;
    const target = bbTouchX - padW / 2;
    bbPaddle.x += (target - bbPaddle.x) * 0.18;
    bbPaddle.x = Math.max(0, Math.min(bbW - padW, bbPaddle.x));
  }

  // move ball
  if (!bbBall.stuck) {
    bbBall.x += bbBall.vx;
    bbBall.y += bbBall.vy;
    bbBounceBall(bbBall);
    // ball fell off
    if (bbBall.y > bbH + bbBall.r) {
      if (bbMultiBalls.length === 0) {
        bbLives--;
        document.getElementById('bbLives').textContent = '❤️'.repeat(Math.max(0, bbLives));
        if (bbLives <= 0) { setTimeout(() => bbEndGame(), 400); return; }
        bbResetBall();
      }
    }
  } else {
    // stick to paddle
    bbBall.x = bbPaddle.x + bbPaddle.w / 2;
    bbBall.y = bbPaddle.y - bbBall.r;
  }

  // multi balls
  for (let i = bbMultiBalls.length - 1; i >= 0; i--) {
    const b = bbMultiBalls[i];
    b.x += b.vx; b.y += b.vy;
    bbBounceBall(b);
    if (b.y > bbH + b.r) bbMultiBalls.splice(i, 1);
  }

  // powerups
  for (let i = bbPowerups.length - 1; i >= 0; i--) {
    const pw = bbPowerups[i];
    pw.y += pw.vy;
    const padW = bbPaddle.wideTimer > 0 ? bbPaddle.w * 1.6 : bbPaddle.w;
    const padX = bbPaddle.x - (bbPaddle.wideTimer > 0 ? bbPaddle.w * 0.3 : 0);
    if (pw.y + 10 >= bbPaddle.y && pw.y <= bbPaddle.y + bbPaddle.h &&
      pw.x >= padX && pw.x <= padX + padW) {
      // collect
      if (pw.type === 'wide') { bbPaddle.wideTimer = 300; }
      else if (pw.type === 'multi') {
        for (let j = 0; j < 2; j++) {
          const spd = Math.sqrt(bbBall.vx * bbBall.vx + bbBall.vy * bbBall.vy);
          const a = Math.atan2(bbBall.vy, bbBall.vx) + (j === 0 ? 0.4 : -0.4);
          bbMultiBalls.push({ x: bbBall.x, y: bbBall.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: BB_BALL_R });
        }
      } else if (pw.type === 'slow') {
        const spd = Math.sqrt(bbBall.vx * bbBall.vx + bbBall.vy * bbBall.vy);
        const slowFactor = 0.6;
        bbBall.vx = (bbBall.vx / spd) * spd * slowFactor;
        bbBall.vy = (bbBall.vy / spd) * spd * slowFactor;
      }
      bbAddFloat(pw.emoji + ' ' + pw.desc + '!', pw.color, pw.x, pw.y);
      bbPowerups.splice(i, 1);
    } else if (pw.y > bbH + 20) {
      bbPowerups.splice(i, 1);
    }
  }

  // check level clear
  if (bbBricks.every(b => !b.alive)) {
    bbLevel++;
    document.getElementById('bbLevel').textContent = 'Lv ' + bbLevel;
    bbAddFloat('LEVEL ' + bbLevel + '! 🎉', '#ffd700', bbW / 2, bbH / 2);
    bbCreateBricks();
    bbResetBall();
    bbResetPaddle();
  }

  // shake
  for (const br of bbBricks) { if (br.shake > 0) br.shake--; }

  // particles & floats
  for (let i = bbParticles.length - 1; i >= 0; i--) {
    const p = bbParticles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life -= 0.035;
    if (p.life <= 0) bbParticles.splice(i, 1);
  }
  for (let i = bbFloats.length - 1; i >= 0; i--) {
    bbFloats[i].life--;
    bbFloats[i].y -= 0.8;
    if (bbFloats[i].life <= 0) bbFloats.splice(i, 1);
  }
}

function bbDrawBall(ball) {
  const grad = bbCtx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, ball.r);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(0.5, '#90caf9');
  grad.addColorStop(1, '#1565c0');
  bbCtx.beginPath();
  bbCtx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  bbCtx.fillStyle = grad;
  bbCtx.shadowColor = '#64b5f6';
  bbCtx.shadowBlur = 10;
  bbCtx.fill();
  bbCtx.shadowBlur = 0;
}

function bbRender() {
  bbCtx.clearRect(0, 0, bbW, bbH);

  // background
  const bg = bbCtx.createLinearGradient(0, 0, 0, bbH);
  bg.addColorStop(0, '#0a0e1a');
  bg.addColorStop(1, '#0d1a30');
  bbCtx.fillStyle = bg;
  bbCtx.fillRect(0, 0, bbW, bbH);

  // bricks
  for (const br of bbBricks) {
    if (!br.alive) continue;
    const sx = br.shake > 0 ? (Math.random() - 0.5) * 3 : 0;
    bbCtx.save();
    bbCtx.translate(sx, 0);
    // brick glow
    bbCtx.shadowColor = br.color;
    bbCtx.shadowBlur = 6;
    const alpha = 0.5 + (br.hp / br.maxHp) * 0.5;
    bbCtx.fillStyle = br.color;
    bbCtx.globalAlpha = alpha;
    bbCtx.beginPath();
    bbCtx.roundRect(br.x, br.y, br.w, br.h, 4);
    bbCtx.fill();
    bbCtx.globalAlpha = 1;
    // highlight
    bbCtx.fillStyle = 'rgba(255,255,255,0.15)';
    bbCtx.fillRect(br.x + 2, br.y + 2, br.w - 4, 4);
    // hp dots
    if (br.maxHp > 1) {
      for (let d = 0; d < br.hp; d++) {
        bbCtx.fillStyle = '#fff';
        bbCtx.beginPath();
        bbCtx.arc(br.x + br.w / 2 - (br.hp - 1) * 4 + d * 8, br.y + br.h / 2, 2, 0, Math.PI * 2);
        bbCtx.fill();
      }
    }
    if (br.hasPowerup && br.alive) {
      bbCtx.font = '10px sans-serif';
      bbCtx.textAlign = 'center';
      bbCtx.fillText('★', br.x + br.w - 8, br.y + 10);
    }
    bbCtx.restore();
  }

  // powerups
  for (const pw of bbPowerups) {
    bbCtx.font = '20px sans-serif';
    bbCtx.textAlign = 'center';
    bbCtx.fillText(pw.emoji, pw.x, pw.y);
  }

  // paddle
  const padW = bbPaddle.wideTimer > 0 ? bbPaddle.w * 1.6 : bbPaddle.w;
  const padX = bbPaddle.x - (bbPaddle.wideTimer > 0 ? bbPaddle.w * 0.3 : 0);
  const padGrad = bbCtx.createLinearGradient(padX, bbPaddle.y, padX + padW, bbPaddle.y);
  padGrad.addColorStop(0, '#00b4d8');
  padGrad.addColorStop(0.5, '#90e0ef');
  padGrad.addColorStop(1, '#00b4d8');
  bbCtx.shadowColor = '#00b4d8';
  bbCtx.shadowBlur = 12;
  bbCtx.fillStyle = padGrad;
  bbCtx.beginPath();
  bbCtx.roundRect(padX, bbPaddle.y, padW, bbPaddle.h, 5);
  bbCtx.fill();
  bbCtx.shadowBlur = 0;

  // ball
  bbDrawBall(bbBall);
  for (const b of bbMultiBalls) bbDrawBall(b);

  // "tap to launch" hint
  if (bbBall.stuck) {
    bbCtx.fillStyle = 'rgba(255,255,255,0.6)';
    bbCtx.font = '12px sans-serif';
    bbCtx.textAlign = 'center';
    bbCtx.fillText('Tap to launch!', bbW / 2, bbBall.y - 18);
  }

  // particles
  bbCtx.save();
  for (const p of bbParticles) {
    bbCtx.globalAlpha = p.life;
    bbCtx.fillStyle = p.color;
    bbCtx.beginPath();
    bbCtx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    bbCtx.fill();
  }
  bbCtx.restore();

  // floats
  bbCtx.save();
  for (const f of bbFloats) {
    bbCtx.globalAlpha = Math.min(1, f.life / 15);
    bbCtx.fillStyle = f.color;
    bbCtx.font = 'bold 15px sans-serif';
    bbCtx.textAlign = 'center';
    bbCtx.fillText(f.text, f.x, f.y);
  }
  bbCtx.restore();
}

function bbLoop() {
  if (bbState !== 'playing') { if (bbRaf) cancelAnimationFrame(bbRaf); bbRaf = null; return; }
  bbUpdate();
  bbRender();
  bbRaf = requestAnimationFrame(bbLoop);
}

function bbStartGame() {
  bbState = 'playing';
  bbScore = 0; bbLives = 3; bbLevel = 1;
  bbParticles = []; bbFloats = []; bbPowerups = [];
  bbFrame = 0; bbTouchX = null;
  document.getElementById('bbScore').textContent = '0';
  document.getElementById('bbLives').textContent = '❤️❤️❤️';
  document.getElementById('bbLevel').textContent = 'Lv 1';
  document.getElementById('bbOverlay').style.display = 'none';
  bbResize();
  bbCreateBricks();
  bbResetPaddle();
  bbResetBall();
  bbRaf = requestAnimationFrame(bbLoop);
}

function bbEndGame() {
  bbState = 'ended';
  if (bbRaf) cancelAnimationFrame(bbRaf);
  bbRaf = null;
  recordGameEnd(bbScore, bbLevel);
  setTimeout(() => showBbOverlay(true), 300);
}

// ── Input ──
(function bbInit() {
  bbCanvas = document.getElementById('bbCanvas');
  if (!bbCanvas) return;
  bbCtx = bbCanvas.getContext('2d');

  document.getElementById('bbPlayBtn').addEventListener('click', e => { e.stopPropagation(); bbStartGame(); });

  function handleMove(clientX) {
    const rect = bbCanvas.getBoundingClientRect();
    bbTouchX = (clientX - rect.left) * (bbW / rect.width);
  }
  function handleTap() {
    if (bbState !== 'playing') return;
    if (bbBall.stuck) bbBall.stuck = false;
  }

  bbCanvas.addEventListener('mousemove', e => { if (bbState !== 'playing') return; handleMove(e.clientX); });
  bbCanvas.addEventListener('click', handleTap);
  bbCanvas.addEventListener('touchmove', e => { if (bbState !== 'playing') return; e.preventDefault(); handleMove(e.touches[0].clientX); }, { passive: false });
  bbCanvas.addEventListener('touchstart', e => { if (bbState !== 'playing') return; e.preventDefault(); handleMove(e.touches[0].clientX); handleTap(); }, { passive: false });

  window.addEventListener('resize', () => { if (currentPage === 'brickbreaker') bbResize(); });

  // idle frame
  bbResize();
  bbCtx.fillStyle = '#0a0e1a';
  bbCtx.fillRect(0, 0, bbW, bbH);
  bbCtx.font = 'bold 28px sans-serif';
  bbCtx.textAlign = 'center';
  bbCtx.fillStyle = '#00b4d8';
  bbCtx.fillText('🧱 Brick Breaker', bbW / 2, bbH / 2 - 10);
  bbCtx.font = '13px sans-serif';
  bbCtx.fillStyle = '#aac';
  bbCtx.fillText('Break all bricks to advance!', bbW / 2, bbH / 2 + 20);
})();
