// ══════════════════════════════════════════════════════════════════════════
// BRICK BREAKER — Two paddles, five balls, fast
// ══════════════════════════════════════════════════════════════════════════

let bbCanvas, bbCtx, bbW, bbH;
let bbState = 'idle';
let bbRaf = null;
let bbScore = 0, bbLives = 3, bbLevel = 1;
let bbPaddle, bbPaddle2;       // bottom + top paddles
let bbBalls = [];               // all balls in one array
let bbBricks = [];
let bbParticles = [], bbFloats = [];
let bbFrame = 0;
let bbTouchX = null;
let bbPowerups = [];

const BB_ROWS = 8, BB_COLS = 10;
const BB_BRICK_H = 16, BB_BRICK_GAP = 3;
const BB_PAD_H = 10;
const BB_BALL_R = 7;
const BB_BASE_SPD = 7;   // increased from 4

const BB_COLORS = [
  '#e53935','#e91e63','#9c27b0',
  '#3f51b5','#2196f3','#009688',
  '#4caf50','#ff9800','#ff5722',
];

const BB_POWERUP_TYPES = [
  { type:'wide',  emoji:'⬛', color:'#00bcd4', desc:'Wide Paddle' },
  { type:'multi', emoji:'⚡', color:'#ffd700', desc:'Multi Ball'  },
  { type:'slow',  emoji:'🐢', color:'#66bb6a', desc:'Slow Ball'   },
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
  const topY = 50 + BB_PAD_H + 10;   // leave room for top paddle
  const rows = Math.min(BB_ROWS + Math.floor(bbLevel / 2), 12);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < BB_COLS; c++) {
      const hp = r < 2 ? (bbLevel > 3 ? 3 : bbLevel > 1 ? 2 : 1) : 1;
      bbBricks.push({
        x: 10 + c * (bw + BB_BRICK_GAP),
        y: topY + r * (BB_BRICK_H + BB_BRICK_GAP),
        w: bw, h: BB_BRICK_H,
        hp, maxHp: hp,
        color: BB_COLORS[(r * 3 + c * 2) % BB_COLORS.length],
        alive: true, shake: 0,
        hasPowerup: Math.random() < 0.10,
      });
    }
  }
}

function bbResetBalls() {
  const spd = BB_BASE_SPD + bbLevel * 0.5;
  bbBalls = [];
  for (let i = 0; i < 5; i++) {
    // spread angles mostly upward (-60° to -120°)
    const angle = -Math.PI / 2 + (i - 2) * 0.22;
    bbBalls.push({
      x: bbW / 2 + (i - 2) * 24,
      y: bbH - 60,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      r: BB_BALL_R,
      stuck: true,
    });
  }
}

function bbResetPaddles() {
  bbPaddle  = { x: bbW / 2 - 40, y: bbH - 28, w: 80, h: BB_PAD_H, wideTimer: 0 };
  bbPaddle2 = { x: bbW / 2 - 40, y: 18,        w: 80, h: BB_PAD_H, wideTimer: 0 };
}

function bbAddFloat(text, color, x, y) {
  bbFloats.push({ text, color, x, y, life: 50 });
}

function bbSpawnParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1 + Math.random() * 4;
    bbParticles.push({ x, y, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp - 1, r: 2 + Math.random()*3, life: 1, color });
  }
}

// Returns effective x and width for a paddle accounting for wide powerup
function bbPadEffective(pad) {
  const w = pad.wideTimer > 0 ? pad.w * 1.6 : pad.w;
  const x = pad.x - (pad.wideTimer > 0 ? pad.w * 0.3 : 0);
  return { x, w };
}

function bbBounceBall(ball) {
  // side walls
  if (ball.x - ball.r < 0)   { ball.x = ball.r;       ball.vx =  Math.abs(ball.vx); }
  if (ball.x + ball.r > bbW) { ball.x = bbW - ball.r; ball.vx = -Math.abs(ball.vx); }

  // top wall (if no top paddle) — ball shouldn't go above top paddle area
  if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy = Math.abs(ball.vy); }

  // ── bottom paddle ──
  const bp = bbPadEffective(bbPaddle);
  if (ball.vy > 0 &&
      ball.y + ball.r >= bbPaddle.y &&
      ball.y - ball.r <= bbPaddle.y + bbPaddle.h &&
      ball.x >= bp.x && ball.x <= bp.x + bp.w) {
    ball.y = bbPaddle.y - ball.r;
    ball.vy = -Math.abs(ball.vy);
    const rel = (ball.x - (bp.x + bp.w / 2)) / (bp.w / 2);
    ball.vx = rel * 7;
    const spd = BB_BASE_SPD + bbLevel * 0.5;
    const s = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
    ball.vx = (ball.vx / s) * spd;
    ball.vy = (ball.vy / s) * spd;
  }

  // ── top paddle ──
  const tp = bbPadEffective(bbPaddle2);
  if (ball.vy < 0 &&
      ball.y - ball.r <= bbPaddle2.y + bbPaddle2.h &&
      ball.y + ball.r >= bbPaddle2.y &&
      ball.x >= tp.x && ball.x <= tp.x + tp.w) {
    ball.y = bbPaddle2.y + bbPaddle2.h + ball.r;
    ball.vy = Math.abs(ball.vy);
    const rel = (ball.x - (tp.x + tp.w / 2)) / (tp.w / 2);
    ball.vx = rel * 7;
    const spd = BB_BASE_SPD + bbLevel * 0.5;
    const s = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
    ball.vx = (ball.vx / s) * spd;
    ball.vy = (ball.vy / s) * spd;
  }

  // bricks
  for (const br of bbBricks) {
    if (!br.alive) continue;
    if (ball.x + ball.r > br.x && ball.x - ball.r < br.x + br.w &&
        ball.y + ball.r > br.y && ball.y - ball.r < br.y + br.h) {
      const overlapL = ball.x + ball.r - br.x;
      const overlapR = br.x + br.w - (ball.x - ball.r);
      const overlapT = ball.y + ball.r - br.y;
      const overlapB = br.y + br.h - (ball.y - ball.r);
      if (Math.min(overlapL, overlapR) < Math.min(overlapT, overlapB)) ball.vx = -ball.vx;
      else ball.vy = -ball.vy;
      br.hp--;
      br.shake = 5;
      if (br.hp <= 0) {
        br.alive = false;
        bbScore += 10 * bbLevel;
        document.getElementById('bbScore').textContent = bbScore;
        bbSpawnParticles(br.x + br.w / 2, br.y + br.h / 2, br.color, 8);
        bbAddFloat('+' + (10 * bbLevel), '#ffd700', br.x + br.w / 2, br.y);
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

  // paddle wide timers
  if (bbPaddle.wideTimer  > 0) bbPaddle.wideTimer--;
  if (bbPaddle2.wideTimer > 0) bbPaddle2.wideTimer--;

  // move bottom paddle toward touch
  if (bbTouchX !== null) {
    const bp = bbPadEffective(bbPaddle);
    const target = bbTouchX - bp.w / 2;
    bbPaddle.x += (target - bbPaddle.x) * 0.18;
    bbPaddle.x = Math.max(0, Math.min(bbW - bp.w, bbPaddle.x));
    // top paddle mirrors the same x
    const tp = bbPadEffective(bbPaddle2);
    bbPaddle2.x = bbPaddle.x;
  }

  // move balls
  const stuck = bbBalls.filter(b => b.stuck);
  const live  = bbBalls.filter(b => !b.stuck);

  for (const b of stuck) {
    // all stuck balls sit on bottom paddle, spread out
    const idx = bbBalls.indexOf(b);
    const spread = (idx - 2) * (BB_BALL_R * 2 + 2);
    b.x = bbPaddle.x + bbPadEffective(bbPaddle).w / 2 + spread;
    b.y = bbPaddle.y - b.r;
  }

  for (let i = bbBalls.length - 1; i >= 0; i--) {
    const b = bbBalls[i];
    if (b.stuck) continue;
    b.x += b.vx;
    b.y += b.vy;
    bbBounceBall(b);
    if (b.y > bbH + b.r) {
      bbBalls.splice(i, 1);
    }
  }

  // if all balls gone, lose a life
  if (bbBalls.length === 0) {
    bbLives--;
    document.getElementById('bbLives').textContent = '❤️'.repeat(Math.max(0, bbLives));
    if (bbLives <= 0) { setTimeout(() => bbEndGame(), 400); return; }
    bbResetBalls();
  }

  // powerups
  for (let i = bbPowerups.length - 1; i >= 0; i--) {
    const pw = bbPowerups[i];
    pw.y += pw.vy;
    const bp = bbPadEffective(bbPaddle);
    if (pw.y + 10 >= bbPaddle.y && pw.y <= bbPaddle.y + bbPaddle.h &&
        pw.x >= bp.x && pw.x <= bp.x + bp.w) {
      if (pw.type === 'wide') {
        bbPaddle.wideTimer = 300;
        bbPaddle2.wideTimer = 300;
      } else if (pw.type === 'multi') {
        // add 3 more balls
        for (let j = 0; j < 3; j++) {
          const src = bbBalls[Math.floor(Math.random() * bbBalls.length)];
          if (!src) continue;
          const spd = Math.sqrt(src.vx*src.vx + src.vy*src.vy);
          const a = Math.atan2(src.vy, src.vx) + (Math.random()-0.5)*1.2;
          bbBalls.push({ x: src.x, y: src.y, vx: Math.cos(a)*spd, vy: Math.sin(a)*spd, r: BB_BALL_R, stuck: false });
        }
      } else if (pw.type === 'slow') {
        const factor = 0.65;
        for (const b of bbBalls) {
          const s = Math.sqrt(b.vx*b.vx + b.vy*b.vy);
          b.vx = (b.vx / s) * s * factor;
          b.vy = (b.vy / s) * s * factor;
        }
      }
      bbAddFloat(pw.emoji + ' ' + pw.desc + '!', pw.color, pw.x, pw.y);
      bbPowerups.splice(i, 1);
    } else if (pw.y > bbH + 20) {
      bbPowerups.splice(i, 1);
    }
  }

  // level clear
  if (bbBricks.every(b => !b.alive)) {
    bbLevel++;
    document.getElementById('bbLevel').textContent = 'Lv ' + bbLevel;
    bbAddFloat('LEVEL ' + bbLevel + '! 🎉', '#ffd700', bbW / 2, bbH / 2);
    bbCreateBricks();
    bbResetBalls();
    bbResetPaddles();
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

function bbDrawPaddle(pad) {
  const { x: px, w: pw } = bbPadEffective(pad);
  const grad = bbCtx.createLinearGradient(px, pad.y, px + pw, pad.y);
  grad.addColorStop(0,   '#00b4d8');
  grad.addColorStop(0.5, '#90e0ef');
  grad.addColorStop(1,   '#00b4d8');
  bbCtx.shadowColor = '#00b4d8';
  bbCtx.shadowBlur = 14;
  bbCtx.fillStyle = grad;
  bbCtx.beginPath();
  bbCtx.roundRect(px, pad.y, pw, pad.h, 5);
  bbCtx.fill();
  bbCtx.shadowBlur = 0;
}

function bbDrawBall(ball) {
  const grad = bbCtx.createRadialGradient(ball.x-2, ball.y-2, 1, ball.x, ball.y, ball.r);
  grad.addColorStop(0,   '#fff');
  grad.addColorStop(0.5, '#90caf9');
  grad.addColorStop(1,   '#1565c0');
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
    bbCtx.shadowColor = br.color;
    bbCtx.shadowBlur = 6;
    bbCtx.fillStyle = br.color;
    bbCtx.globalAlpha = 0.5 + (br.hp / br.maxHp) * 0.5;
    bbCtx.beginPath();
    bbCtx.roundRect(br.x, br.y, br.w, br.h, 3);
    bbCtx.fill();
    bbCtx.globalAlpha = 1;
    bbCtx.fillStyle = 'rgba(255,255,255,0.15)';
    bbCtx.fillRect(br.x + 2, br.y + 2, br.w - 4, 4);
    if (br.maxHp > 1) {
      for (let d = 0; d < br.hp; d++) {
        bbCtx.fillStyle = '#fff';
        bbCtx.beginPath();
        bbCtx.arc(br.x + br.w/2 - (br.hp-1)*4 + d*8, br.y + br.h/2, 2, 0, Math.PI*2);
        bbCtx.fill();
      }
    }
    if (br.hasPowerup) {
      bbCtx.font = '10px sans-serif'; bbCtx.textAlign = 'center';
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

  // both paddles
  bbDrawPaddle(bbPaddle);
  bbDrawPaddle(bbPaddle2);

  // all balls
  for (const b of bbBalls) bbDrawBall(b);

  // ball count & tap hint
  const stuckBalls = bbBalls.filter(b => b.stuck);
  if (stuckBalls.length > 0) {
    bbCtx.fillStyle = 'rgba(255,255,255,0.6)';
    bbCtx.font = '12px sans-serif';
    bbCtx.textAlign = 'center';
    bbCtx.fillText('Tap to launch ' + stuckBalls.length + ' ball' + (stuckBalls.length > 1 ? 's' : '') + '!',
      bbW / 2, bbPaddle.y - 18);
  }

  // ball count HUD (top-right of play area)
  if (bbState === 'playing' && bbBalls.length > 0) {
    bbCtx.fillStyle = 'rgba(255,255,255,0.5)';
    bbCtx.font = '11px sans-serif';
    bbCtx.textAlign = 'right';
    bbCtx.fillText('🔵 ' + bbBalls.length, bbW - 10, bbH - 36);
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

let _bbLastTs = 0;
function bbLoop(ts = 0) {
  if (bbState !== 'playing') { if (bbRaf) cancelAnimationFrame(bbRaf); bbRaf = null; return; }
  if (_bbLastTs && ts - _bbLastTs < 14) { bbRaf = requestAnimationFrame(bbLoop); return; }
  _bbLastTs = ts;
  bbUpdate();
  bbRender();
  bbRaf = requestAnimationFrame(bbLoop);
}

function bbStartGame() {
  bbState = 'playing';
  bbScore = 0; bbLives = 3; bbLevel = 1;
  bbParticles = []; bbFloats = []; bbPowerups = []; bbBalls = [];
  bbFrame = 0; bbTouchX = null;
  document.getElementById('bbScore').textContent = '0';
  document.getElementById('bbLives').textContent = '❤️❤️❤️';
  document.getElementById('bbLevel').textContent = 'Lv 1';
  document.getElementById('bbOverlay').style.display = 'none';
  bbResize();
  bbCreateBricks();
  bbResetPaddles();
  bbResetBalls();
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
    // launch all stuck balls
    for (const b of bbBalls) b.stuck = false;
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
  bbCtx.fillText('5 balls · 2 paddles · Break them all!', bbW / 2, bbH / 2 + 20);
})();
