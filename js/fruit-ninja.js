// ══════════════════════════════════════════════════════════════════════════
// FRUIT NINJA — Slice falling fruits, never-ending, power-ups
// ══════════════════════════════════════════════════════════════════════════

let fnCanvas, fnCtx, fnW, fnH;
let fnState = 'idle';
let fnRaf = null;
let fnLastTs = 0;
let fnScore = 0, fnCombo = 0, fnComboTimer = 0, fnBestCombo = 0;
let fnFruits = [];
let fnSliceTrail = [];
let fnParticles = [];
let fnFloats = [];
let fnFrame = 0;
let fnSpawnTimer = 0, fnSpawnInterval = 90;
let fnDifficulty = 0;
let fnIsSlicing = false;
// Power-up state
let fnFireTimer = 0;   // fire 3x multiplier (frames)
let fnIceTimer = 0;    // slow-mo (frames)

const FN_FRUITS = [
  { emoji: '🍉', color: '#4caf50', juice: '#ff1744', pts: 10, r: 40 },
  { emoji: '🍊', color: '#ff9800', juice: '#ffb74d', pts: 10, r: 36 },
  { emoji: '🍋', color: '#ffeb3b', juice: '#fff59d', pts: 10, r: 34 },
  { emoji: '🍇', color: '#9c27b0', juice: '#ce93d8', pts: 15, r: 34 },
  { emoji: '🍓', color: '#f44336', juice: '#ff8a80', pts: 15, r: 32 },
  { emoji: '🍍', color: '#ffc107', juice: '#fff9c4', pts: 20, r: 38 },
  { emoji: '🥭', color: '#ff9800', juice: '#ffe082', pts: 20, r: 37 },
  { emoji: '🍎', color: '#f44336', juice: '#ffcdd2', pts: 15, r: 35 },
];

const FN_POWERS = [
  { emoji: '🌟', color: '#ffd700', juice: '#fffde7', pts: 25, r: 36, power: 'star',    label: '★ STAR BLAST!' },
  { emoji: '💎', color: '#00bcd4', juice: '#e0f7fa', pts: 50, r: 34, power: 'diamond', label: '💎 +50 BONUS!' },
  { emoji: '🔥', color: '#ff5722', juice: '#ff8a65', pts: 15, r: 36, power: 'fire',    label: '🔥 3X SCORE!' },
  { emoji: '❄️', color: '#64b5f6', juice: '#e3f2fd', pts: 15, r: 36, power: 'ice',     label: '❄️ SLOW-MO!' },
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

function fnSpawnFruit() {
  const isPower = Math.random() < 0.10;
  const def = isPower
    ? FN_POWERS[Math.floor(Math.random() * FN_POWERS.length)]
    : FN_FRUITS[Math.floor(Math.random() * FN_FRUITS.length)];
  const isBomb = !isPower && Math.random() < 0.08;
  const r = isBomb ? 32 : def.r;
  const x = r + Math.random() * (fnW - r * 2);
  const iceSlow = fnIceTimer > 0 ? 0.4 : 1;
  const vy = (1.8 + Math.random() * 1.6 + fnDifficulty * 0.07) * iceSlow;
  const vx = (Math.random() - 0.5) * 1.2;
  fnFruits.push({
    x, y: -r,
    vx, vy,
    r,
    emoji: isBomb ? '💣' : def.emoji,
    color: isBomb ? '#1b5e20' : def.color,
    juice: isBomb ? '#43a047' : (def.juice || def.color),
    pts: isBomb ? 0 : def.pts,
    isBomb,
    isPower: !isBomb && isPower,
    power: isPower ? def.power : null,
    powerLabel: isPower ? def.label : null,
    sliced: false,
    sliceTimer: 0,
    spin: (Math.random() - 0.5) * 0.025,
    angle: 0,
  });
}

function fnSliceFruit(fruit, sx, sy, ex, ey) {
  if (fruit.sliced) return;
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
      fnScore = Math.max(0, fnScore - 30);
      document.getElementById('fnScore').textContent = fnScore;
      fnCombo = 0;
      fnSpawnParticles(fruit.x, fruit.y, '#ef9a9a', 22);
      fnAddFloat('💥 -30!', '#ff5252', fruit.x, fruit.y);
    } else if (fruit.isPower) {
      fnApplyPower(fruit);
    } else {
      fnCombo++;
      if (fnCombo > fnBestCombo) fnBestCombo = fnCombo;
      fnComboTimer = 90;
      const multiplier = fnFireTimer > 0 ? 3 : 1;
      const bonus = fnCombo >= 3 ? fnCombo : 1;
      const earned = fruit.pts * bonus * multiplier;
      fnScore += earned;
      document.getElementById('fnScore').textContent = fnScore;
      fnSpawnParticles(fruit.x, fruit.y, fruit.juice, 12);
      let txt = '+' + earned;
      if (multiplier === 3) txt = '🔥' + txt;
      if (fnCombo >= 3) txt = fnCombo + 'x COMBO! ' + txt;
      fnAddFloat(txt, fnCombo >= 3 ? '#ffd700' : '#fff', fruit.x, fruit.y - fruit.r);
    }
  }
}

function fnApplyPower(fruit) {
  fnSpawnParticles(fruit.x, fruit.y, fruit.juice, 24);
  fnAddFloat(fruit.powerLabel, '#ffd700', fruit.x, fruit.y - fruit.r);
  switch (fruit.power) {
    case 'star':
      // Auto-slice all non-bomb fruits on screen
      fnFruits.forEach(f => {
        if (!f.sliced && !f.isBomb && !f.isPower) {
          f.sliced = true;
          const multiplier = fnFireTimer > 0 ? 3 : 1;
          fnScore += f.pts * multiplier;
          fnSpawnParticles(f.x, f.y, f.juice, 6);
        }
      });
      document.getElementById('fnScore').textContent = fnScore;
      break;
    case 'diamond':
      fnScore += 50;
      document.getElementById('fnScore').textContent = fnScore;
      break;
    case 'fire':
      fnFireTimer = 60 * 8; // 8 seconds
      break;
    case 'ice':
      fnIceTimer = 60 * 6; // 6 seconds
      // Slow down all existing fruits
      fnFruits.forEach(f => { if (!f.sliced) { f.vx *= 0.4; f.vy *= 0.4; } });
      break;
  }
  fnUpdatePowerHud();
}

function fnUpdatePowerHud() {
  const el = document.getElementById('fnLives');
  if (fnFireTimer > 0) { el.textContent = '🔥 3X'; el.style.color = '#ff7043'; }
  else if (fnIceTimer > 0) { el.textContent = '❄️ SLOW'; el.style.color = '#64b5f6'; }
  else { el.textContent = ''; el.style.color = '#fff'; }
}

function fnSpawnParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1 + Math.random() * 5;
    fnParticles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, r: 2 + Math.random() * 4, life: 1, color });
  }
}

function fnAddFloat(text, color, x, y) {
  fnFloats.push({ text, color, x, y, life: 70 });
}

function fnUpdate(dt) {
  if (fnState !== 'playing') return;
  fnFrame++;

  // Power-up timers
  if (fnFireTimer > 0) { fnFireTimer -= dt; if (fnFireTimer <= 0) { fnFireTimer = 0; fnUpdatePowerHud(); } }
  if (fnIceTimer > 0) { fnIceTimer -= dt; if (fnIceTimer <= 0) { fnIceTimer = 0; fnUpdatePowerHud(); } }

  // Spawn
  fnSpawnTimer += dt;
  if (fnSpawnTimer >= fnSpawnInterval) {
    fnSpawnTimer = 0;
    const count = 1 + Math.floor(Math.random() * (fnDifficulty > 5 ? 3 : 2));
    for (let i = 0; i < count; i++) fnSpawnFruit();
  }

  fnDifficulty = Math.floor(fnScore / 200);
  fnSpawnInterval = Math.max(40, 90 - fnDifficulty * 4);

  // Combo decay
  if (fnComboTimer > 0) {
    fnComboTimer -= dt;
    if (fnComboTimer <= 0) fnCombo = 0;
  }

  // Update fruits
  const iceSlowFactor = fnIceTimer > 0 ? 0.45 : 1;
  for (let i = fnFruits.length - 1; i >= 0; i--) {
    const f = fnFruits[i];
    if (f.sliced) {
      f.sliceTimer += dt;
      if (f.sliceTimer > 40) fnFruits.splice(i, 1);
      continue;
    }
    f.vy += 0.055 * dt * iceSlowFactor;
    f.x  += f.vx * dt * iceSlowFactor;
    f.y  += f.vy * dt * iceSlowFactor;
    f.angle += f.spin * dt;
    // Fruit fell off — just remove, no penalty (never-ending)
    if (f.y > fnH + f.r * 2) {
      fnFruits.splice(i, 1);
    }
  }

  // Slice detection against trail
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
  const now2 = Date.now();
  fnSliceTrail = fnSliceTrail.filter(p => now2 - p.t < 150);

  // Particles
  for (let i = fnParticles.length - 1; i >= 0; i--) {
    const p = fnParticles[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.1 * dt; p.life -= 0.04 * dt;
    if (p.life <= 0) fnParticles.splice(i, 1);
  }
  for (let i = fnFloats.length - 1; i >= 0; i--) {
    fnFloats[i].life -= dt;
    fnFloats[i].y -= 1.2 * dt;
    if (fnFloats[i].life <= 0) fnFloats.splice(i, 1);
  }
}

function fnRender() {
  fnCtx.clearRect(0, 0, fnW, fnH);

  // Background
  const bg = fnCtx.createLinearGradient(0, 0, 0, fnH);
  bg.addColorStop(0, '#1a0a2e');
  bg.addColorStop(1, '#2d1b4e');
  fnCtx.fillStyle = bg;
  fnCtx.fillRect(0, 0, fnW, fnH);

  // Fire/Ice screen tint
  if (fnFireTimer > 0) {
    const alpha = Math.min(0.12, fnFireTimer / 300);
    fnCtx.fillStyle = `rgba(255,80,0,${alpha})`;
    fnCtx.fillRect(0, 0, fnW, fnH);
  }
  if (fnIceTimer > 0) {
    const alpha = Math.min(0.12, fnIceTimer / 300);
    fnCtx.fillStyle = `rgba(100,181,246,${alpha})`;
    fnCtx.fillRect(0, 0, fnW, fnH);
  }

  // Slice trail
  if (fnSliceTrail.length >= 2) {
    fnCtx.save();
    const now = Date.now();
    for (let i = 1; i < fnSliceTrail.length; i++) {
      const p1 = fnSliceTrail[i - 1], p2 = fnSliceTrail[i];
      const age = now - p2.t;
      const alpha = Math.max(0, 1 - age / 150);
      fnCtx.strokeStyle = `rgba(255,255,255,${alpha * 0.85})`;
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

  // Fruits
  for (const f of fnFruits) {
    fnCtx.save();
    fnCtx.translate(f.x, f.y);
    fnCtx.rotate(f.angle);
    if (f.sliced) {
      const prog = f.sliceTimer / 40;
      fnCtx.globalAlpha = 1 - prog;
      fnCtx.font = (f.r * 1.6) + 'px sans-serif';
      fnCtx.textAlign = 'center';
      fnCtx.textBaseline = 'middle';
      // Half A
      fnCtx.save();
      fnCtx.translate(-prog * 22, prog * 16);
      fnCtx.rotate(-prog * 0.5);
      fnCtx.beginPath(); fnCtx.arc(0, 0, f.r, 0, Math.PI * 2);
      fnCtx.fillStyle = f.juice || f.color; fnCtx.fill();
      fnCtx.fillText(f.emoji, 0, 0);
      fnCtx.restore();
      // Half B
      fnCtx.save();
      fnCtx.translate(prog * 22, prog * 16);
      fnCtx.rotate(prog * 0.5);
      fnCtx.beginPath(); fnCtx.arc(0, 0, f.r, 0, Math.PI * 2);
      fnCtx.fillStyle = f.juice || f.color; fnCtx.fill();
      fnCtx.fillText(f.emoji, 0, 0);
      fnCtx.restore();
    } else {
      // Colored circle base (fixes black emojis on Android)
      fnCtx.beginPath();
      fnCtx.arc(0, 0, f.r, 0, Math.PI * 2);
      if (f.isBomb) {
        fnCtx.fillStyle = '#1b5e20';
        fnCtx.shadowColor = '#43a047';
        fnCtx.shadowBlur = 12 + Math.sin(fnFrame * 0.15) * 6;
      } else if (f.isPower) {
        fnCtx.fillStyle = f.color;
        fnCtx.shadowColor = f.color;
        fnCtx.shadowBlur = 16 + Math.sin(fnFrame * 0.18) * 8;
      } else {
        fnCtx.fillStyle = f.color;
        fnCtx.shadowColor = f.juice;
        fnCtx.shadowBlur = 6;
      }
      fnCtx.fill();
      // Highlight
      fnCtx.beginPath();
      fnCtx.arc(-f.r * 0.22, -f.r * 0.26, f.r * 0.42, 0, Math.PI * 2);
      fnCtx.fillStyle = 'rgba(255,255,255,0.22)';
      fnCtx.shadowBlur = 0;
      fnCtx.fill();
      // Emoji
      fnCtx.font = (f.r * 1.6) + 'px sans-serif';
      fnCtx.textAlign = 'center';
      fnCtx.textBaseline = 'middle';
      fnCtx.fillText(f.emoji, 0, 0);
    }
    fnCtx.restore();
  }

  // Particles
  fnCtx.save();
  for (const p of fnParticles) {
    fnCtx.globalAlpha = p.life;
    fnCtx.fillStyle = p.color;
    fnCtx.beginPath();
    fnCtx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    fnCtx.fill();
  }
  fnCtx.restore();

  // Floats
  fnCtx.save();
  for (const f of fnFloats) {
    fnCtx.globalAlpha = Math.min(1, f.life / 20);
    fnCtx.fillStyle = f.color;
    fnCtx.font = 'bold 17px sans-serif';
    fnCtx.textAlign = 'center';
    fnCtx.fillText(f.text, f.x, f.y);
  }
  fnCtx.restore();

  // Combo display
  if (fnCombo >= 2) {
    fnCtx.save();
    fnCtx.globalAlpha = 0.7 + Math.sin(fnFrame * 0.2) * 0.3;
    fnCtx.font = 'bold 22px sans-serif';
    fnCtx.textAlign = 'center';
    fnCtx.fillStyle = '#ffd700';
    fnCtx.shadowColor = '#ffd700';
    fnCtx.shadowBlur = 10;
    fnCtx.fillText(fnCombo + 'x COMBO!', fnW / 2, 54);
    fnCtx.restore();
  }
}

function fnLoop(ts = 0) {
  if (fnState !== 'playing') { if (fnRaf) cancelAnimationFrame(fnRaf); fnRaf = null; return; }
  const dt = fnLastTs ? Math.min((ts - fnLastTs) / 16.667, 3) : 1;
  fnLastTs = ts;
  fnUpdate(dt);
  fnRender();
  fnRaf = requestAnimationFrame(fnLoop);
}

function fnStartGame() {
  fnState = 'playing';
  fnScore = 0; fnCombo = 0; fnComboTimer = 0; fnBestCombo = 0;
  fnFireTimer = 0; fnIceTimer = 0;
  fnFruits = []; fnParticles = []; fnFloats = []; fnSliceTrail = [];
  fnSpawnTimer = 0; fnSpawnInterval = 90; fnDifficulty = 0; fnFrame = 0;
  fnLastTs = 0;
  document.getElementById('fnScore').textContent = '0';
  document.getElementById('fnLives').textContent = '';
  document.getElementById('fnLives').style.color = '#fff';
  document.getElementById('fnOverlay').style.display = 'none';
  fnResize();
  fnRaf = requestAnimationFrame(fnLoop);
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

  // Idle frame
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
