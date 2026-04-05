// ══════════════════════════════════════════════════════════════════════════
// FRUIT NINJA — Swipe to slash fruits, avoid bombs
// ══════════════════════════════════════════════════════════════════════════

let fnCanvas, fnCtx, fnW, fnH;
let fnState = 'idle'; // idle | playing | ended
let fnRaf = null;
let fnScore = 0, fnLives = 3, fnCombo = 0, fnComboTimer = 0;
let fnFruits = [];
let fnSliceTrail = []; // [{x,y,t}] mouse/touch trail
let fnParticles = [];
let fnFloats = [];
let fnFrame = 0;
let fnSpawnTimer = 0, fnSpawnInterval = 55;
let fnDifficulty = 0;
let fnIsSlicing = false;
let fnLastSliceX = 0, fnLastSliceY = 0;

const FN_FRUITS = [
  { emoji: '🍉', color: '#e53935', juice: '#ff8f00', pts: 10, r: 28 },
  { emoji: '🍊', color: '#ff7043', juice: '#ffd600', pts: 10, r: 24 },
  { emoji: '🍋', color: '#fdd835', juice: '#fff176', pts: 10, r: 22 },
  { emoji: '🍇', color: '#7b1fa2', juice: '#ce93d8', pts: 15, r: 22 },
  { emoji: '🍓', color: '#e53935', juice: '#ff8f00', pts: 15, r: 20 },
  { emoji: '🍍', color: '#f9a825', juice: '#fff176', pts: 20, r: 26 },
  { emoji: '🥭', color: '#ff8f00', juice: '#ffd54f', pts: 20, r: 25 },
  { emoji: '🍎', color: '#c62828', juice: '#ef9a9a', pts: 15, r: 23 },
];

function fnResize() {
  const cont = document.getElementById('fnContainer');
  fnW = cont.clientWidth;
  fnH = cont.clientHeight;
  fnCanvas.width = fnW;
  fnCanvas.height = fnH;
}

function showFnOverlay(showResults) {
  const ov = document.getElementById('fnOverlay');
  ov.style.display = 'flex';
  const earned = document.getElementById('fnEarned');
  const result = document.getElementById('fnResult');
  if (showResults) {
    earned.style.display = 'block';
    earned.textContent = '🍉 ' + fnScore + ' points!';
    result.style.display = 'block';
    result.textContent = 'Best combo: ' + fnBestCombo + 'x';
    document.getElementById('fnPlayBtn').textContent = '▶ Play Again';
  } else {
    earned.style.display = 'none';
    result.style.display = 'none';
    document.getElementById('fnPlayBtn').textContent = '▶ Play';
  }
}

function exitFruitNinja() {
  fnState = 'idle';
  if (fnRaf) cancelAnimationFrame(fnRaf);
  fnRaf = null;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-home').classList.add('active');
  document.getElementById('bottomNav').style.display = 'flex';
  currentPage = 'home';
  refreshHome();
}

let fnBestCombo = 0;

function fnSpawnFruit() {
  const def = FN_FRUITS[Math.floor(Math.random() * FN_FRUITS.length)];
  const isBomb = Math.random() < 0.12;
  const x = def.r + Math.random() * (fnW - def.r * 2);
  const vy = -(10 + Math.random() * 7 + fnDifficulty * 0.4);
  const vx = (Math.random() - 0.5) * 4;
  fnFruits.push({
    x, y: fnH + def.r,
    vx, vy,
    r: isBomb ? 22 : def.r,
    emoji: isBomb ? '💣' : def.emoji,
    color: isBomb ? '#333' : def.color,
    juice: isBomb ? '#ff0000' : def.juice,
    pts: isBomb ? 0 : def.pts,
    isBomb,
    sliced: false,
    sliceAngle: 0,
    sliceTimer: 0,
    halfA: null, halfB: null,
    spin: (Math.random() - 0.5) * 0.08,
    angle: 0,
    bobPhase: Math.random() * 6.28
  });
}

function fnSliceFruit(fruit, sx, sy, ex, ey) {
  if (fruit.sliced || fruit.isBomb === undefined) return;
  // distance from fruit center to slice line segment
  const dx = ex - sx, dy = ey - sy;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return;
  const t = Math.max(0, Math.min(1, ((fruit.x - sx) * dx + (fruit.y - sy) * dy) / len2));
  const nx = sx + t * dx - fruit.x;
  const ny = sy + t * dy - fruit.y;
  const dist = Math.sqrt(nx * nx + ny * ny);
  if (dist < fruit.r * 1.1) {
    fruit.sliced = true;
    if (fruit.isBomb) {
      fnLives--;
      document.getElementById('fnLives').textContent = '❤️'.repeat(Math.max(0, fnLives));
      fnCombo = 0;
      fnSpawnParticles(fruit.x, fruit.y, '#ff0000', 20);
      fnAddFloat('💥 BOOM!', '#ff4444', fruit.x, fruit.y);
      if (fnLives <= 0) { setTimeout(() => fnEndGame(), 400); }
    } else {
      fnCombo++;
      if (fnCombo > fnBestCombo) fnBestCombo = fnCombo;
      fnComboTimer = 90;
      const bonus = fnCombo >= 3 ? fnCombo : 1;
      const earned = fruit.pts * bonus;
      fnScore += earned;
      document.getElementById('fnScore').textContent = fnScore;
      fnSpawnParticles(fruit.x, fruit.y, fruit.juice, 12);
      const txt = fnCombo >= 3 ? fnCombo + 'x COMBO! +' + earned : '+' + earned;
      fnAddFloat(txt, fnCombo >= 3 ? '#ffd700' : '#fff', fruit.x, fruit.y - fruit.r);
    }
  }
}

function fnSpawnParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1 + Math.random() * 5;
    fnParticles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, r: 2 + Math.random() * 4, life: 1, color });
  }
}

function fnAddFloat(text, color, x, y) {
  fnFloats.push({ text, color, x, y, life: 60 });
}

function fnUpdate() {
  if (fnState !== 'playing') return;
  fnFrame++;

  // spawn
  fnSpawnTimer++;
  if (fnSpawnTimer >= fnSpawnInterval) {
    fnSpawnTimer = 0;
    const count = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) fnSpawnFruit();
  }

  // difficulty
  fnDifficulty = Math.floor(fnScore / 100);
  fnSpawnInterval = Math.max(25, 55 - fnDifficulty * 3);

  // combo decay
  if (fnComboTimer > 0) {
    fnComboTimer--;
    if (fnComboTimer === 0) fnCombo = 0;
  }

  // update fruits
  for (let i = fnFruits.length - 1; i >= 0; i--) {
    const f = fnFruits[i];
    if (f.sliced) {
      f.sliceTimer++;
      if (f.sliceTimer > 40) fnFruits.splice(i, 1);
      continue;
    }
    f.vy += 0.35; // gravity
    f.x += f.vx;
    f.y += f.vy;
    f.angle += f.spin;
    // missed — fell off bottom without bomb
    if (f.y > fnH + f.r * 2) {
      if (!f.isBomb) {
        fnLives--;
        document.getElementById('fnLives').textContent = '❤️'.repeat(Math.max(0, fnLives));
        fnCombo = 0;
        fnAddFloat('MISS!', '#ff6666', f.x, fnH - 60);
        if (fnLives <= 0) setTimeout(() => fnEndGame(), 400);
      }
      fnFruits.splice(i, 1);
    }
  }

  // slice detection against trail
  if (fnSliceTrail.length >= 2) {
    const now = Date.now();
    const recent = fnSliceTrail.filter(p => now - p.t < 80);
    if (recent.length >= 2) {
      const p1 = recent[recent.length - 2];
      const p2 = recent[recent.length - 1];
      for (const f of fnFruits) {
        if (!f.sliced) fnSliceFruit(f, p1.x, p1.y, p2.x, p2.y);
      }
    }
  }

  // clean old trail
  const now2 = Date.now();
  fnSliceTrail = fnSliceTrail.filter(p => now2 - p.t < 150);

  // particles
  for (let i = fnParticles.length - 1; i >= 0; i--) {
    const p = fnParticles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life -= 0.04;
    if (p.life <= 0) fnParticles.splice(i, 1);
  }
  for (let i = fnFloats.length - 1; i >= 0; i--) {
    fnFloats[i].life--;
    fnFloats[i].y -= 1.2;
    if (fnFloats[i].life <= 0) fnFloats.splice(i, 1);
  }
}

function fnRender() {
  fnCtx.clearRect(0, 0, fnW, fnH);

  // background
  const bg = fnCtx.createLinearGradient(0, 0, 0, fnH);
  bg.addColorStop(0, '#1a0a2e');
  bg.addColorStop(1, '#2d1b4e');
  fnCtx.fillStyle = bg;
  fnCtx.fillRect(0, 0, fnW, fnH);

  // slice trail
  if (fnSliceTrail.length >= 2) {
    fnCtx.save();
    const now = Date.now();
    for (let i = 1; i < fnSliceTrail.length; i++) {
      const p1 = fnSliceTrail[i - 1], p2 = fnSliceTrail[i];
      const age = now - p2.t;
      const alpha = Math.max(0, 1 - age / 150);
      fnCtx.strokeStyle = `rgba(255,255,255,${alpha * 0.8})`;
      fnCtx.lineWidth = 3 * alpha;
      fnCtx.shadowColor = `rgba(200,230,255,${alpha})`;
      fnCtx.shadowBlur = 8;
      fnCtx.beginPath();
      fnCtx.moveTo(p1.x, p1.y);
      fnCtx.lineTo(p2.x, p2.y);
      fnCtx.stroke();
    }
    fnCtx.restore();
  }

  // fruits
  for (const f of fnFruits) {
    fnCtx.save();
    fnCtx.translate(f.x, f.y);
    fnCtx.rotate(f.angle);
    if (f.sliced) {
      // split halves
      const prog = f.sliceTimer / 40;
      fnCtx.globalAlpha = 1 - prog;
      fnCtx.font = (f.r * 2) + 'px sans-serif';
      fnCtx.textAlign = 'center';
      fnCtx.textBaseline = 'middle';
      fnCtx.save();
      fnCtx.translate(-prog * 20, prog * 15);
      fnCtx.rotate(-prog * 0.5);
      fnCtx.fillText(f.emoji, 0, 0);
      fnCtx.restore();
      fnCtx.save();
      fnCtx.translate(prog * 20, prog * 15);
      fnCtx.rotate(prog * 0.5);
      fnCtx.fillText(f.emoji, 0, 0);
      fnCtx.restore();
    } else {
      fnCtx.font = (f.r * 2) + 'px sans-serif';
      fnCtx.textAlign = 'center';
      fnCtx.textBaseline = 'middle';
      // glow for bombs
      if (f.isBomb) {
        fnCtx.shadowColor = '#ff4400';
        fnCtx.shadowBlur = 12 + Math.sin(fnFrame * 0.15) * 6;
      }
      fnCtx.fillText(f.emoji, 0, 0);
    }
    fnCtx.restore();
  }

  // particles
  fnCtx.save();
  for (const p of fnParticles) {
    fnCtx.globalAlpha = p.life;
    fnCtx.fillStyle = p.color;
    fnCtx.beginPath();
    fnCtx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    fnCtx.fill();
  }
  fnCtx.restore();

  // floats
  fnCtx.save();
  for (const f of fnFloats) {
    fnCtx.globalAlpha = Math.min(1, f.life / 20);
    fnCtx.fillStyle = f.color;
    fnCtx.font = 'bold 16px sans-serif';
    fnCtx.textAlign = 'center';
    fnCtx.fillText(f.text, f.x, f.y);
  }
  fnCtx.restore();

  // combo display
  if (fnCombo >= 2) {
    fnCtx.save();
    fnCtx.globalAlpha = 0.7 + Math.sin(fnFrame * 0.2) * 0.3;
    fnCtx.font = 'bold 22px sans-serif';
    fnCtx.textAlign = 'center';
    fnCtx.fillStyle = '#ffd700';
    fnCtx.shadowColor = '#ffd700';
    fnCtx.shadowBlur = 10;
    fnCtx.fillText(fnCombo + 'x COMBO!', fnW / 2, 50);
    fnCtx.restore();
  }
}

function fnLoop() {
  if (fnState !== 'playing') { if (fnRaf) cancelAnimationFrame(fnRaf); fnRaf = null; return; }
  fnUpdate();
  fnRender();
  fnRaf = requestAnimationFrame(fnLoop);
}

function fnStartGame() {
  fnState = 'playing';
  fnScore = 0; fnLives = 3; fnCombo = 0; fnComboTimer = 0;
  fnFruits = []; fnParticles = []; fnFloats = []; fnSliceTrail = [];
  fnSpawnTimer = 0; fnSpawnInterval = 55; fnDifficulty = 0; fnFrame = 0;
  fnBestCombo = 0;
  document.getElementById('fnScore').textContent = '0';
  document.getElementById('fnLives').textContent = '❤️❤️❤️';
  document.getElementById('fnOverlay').style.display = 'none';
  fnResize();
  fnRaf = requestAnimationFrame(fnLoop);
}

function fnEndGame() {
  fnState = 'ended';
  if (fnRaf) cancelAnimationFrame(fnRaf);
  fnRaf = null;
  recordGameEnd(fnScore, fnBestCombo);
  setTimeout(() => showFnOverlay(true), 300);
}

// ── Input ──
(function fnInit() {
  fnCanvas = document.getElementById('fnCanvas');
  if (!fnCanvas) return;
  fnCtx = fnCanvas.getContext('2d');

  document.getElementById('fnPlayBtn').addEventListener('click', e => { e.stopPropagation(); fnStartGame(); });

  function addTrail(x, y) {
    const rect = fnCanvas.getBoundingClientRect();
    fnSliceTrail.push({ x: (x - rect.left) * (fnW / rect.width), y: (y - rect.top) * (fnH / rect.height), t: Date.now() });
  }

  fnCanvas.addEventListener('mousedown', e => { if (fnState !== 'playing') return; fnIsSlicing = true; addTrail(e.clientX, e.clientY); });
  fnCanvas.addEventListener('mousemove', e => { if (fnState !== 'playing' || !fnIsSlicing) return; addTrail(e.clientX, e.clientY); });
  fnCanvas.addEventListener('mouseup', () => { fnIsSlicing = false; });

  fnCanvas.addEventListener('touchstart', e => { if (fnState !== 'playing') return; e.preventDefault(); addTrail(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
  fnCanvas.addEventListener('touchmove', e => { if (fnState !== 'playing') return; e.preventDefault(); addTrail(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });

  window.addEventListener('resize', () => { if (currentPage === 'fruitninja') fnResize(); });

  // idle frame
  fnResize();
  fnCtx.fillStyle = '#1a0a2e';
  fnCtx.fillRect(0, 0, fnW, fnH);
  fnCtx.font = 'bold 28px sans-serif';
  fnCtx.textAlign = 'center';
  fnCtx.fillStyle = '#ff7043';
  fnCtx.fillText('🍉 Fruit Ninja', fnW / 2, fnH / 2 - 10);
  fnCtx.font = '13px sans-serif';
  fnCtx.fillStyle = '#aac';
  fnCtx.fillText('Swipe to slash fruits!', fnW / 2, fnH / 2 + 20);
})();
