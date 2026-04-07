// ══════════════════════════════════════════════════════════════════════════
// URBAN HUNT — Top-down city shooter
// ══════════════════════════════════════════════════════════════════════════
(function(){
'use strict';

// ── Canvas ────────────────────────────────────────────────────────────────
const uhc=document.getElementById('uhCanvas');
const uctx=uhc.getContext('2d');
let UW=520, UH=400;

function uhResize(){
  const cont=document.getElementById('uhContainer');
  UW=Math.max(280,cont.clientWidth||520);
  UH=Math.max(320,cont.clientHeight||400);
  uhc.width=UW; uhc.height=UH;
}

// ── Map ───────────────────────────────────────────────────────────────────
const CELL=48, COLS=26, ROWS=26;
const T_ROAD=0, T_WALL=1;
let tileMap=[], spawnPoints=[];

function uhGenMap(){
  tileMap=[]; spawnPoints=[];
  for(let r=0;r<ROWS;r++){
    tileMap[r]=[];
    for(let c=0;c<COLS;c++){
      if(r===0||r===ROWS-1||c===0||c===COLS-1){ tileMap[r][c]=T_WALL; continue; }
      tileMap[r][c]=(r%5===0||c%5===0)?T_ROAD:T_WALL;
    }
  }
  for(let r=1;r<ROWS-1;r++)for(let c=1;c<COLS-1;c++){
    if(tileMap[r][c]===T_ROAD){
      const wx=(c+0.5)*CELL,wy=(r+0.5)*CELL;
      if(wx>CELL*4||wy>CELL*4) spawnPoints.push({x:wx,y:wy});
    }
  }
}

function tileAt(wx,wy){
  const c=Math.floor(wx/CELL),r=Math.floor(wy/CELL);
  if(r<0||r>=ROWS||c<0||c>=COLS) return T_WALL;
  return tileMap[r][c];
}
function isWalkable(wx,wy){
  const m=10;
  return tileAt(wx-m,wy-m)===T_ROAD&&tileAt(wx+m,wy-m)===T_ROAD&&
         tileAt(wx-m,wy+m)===T_ROAD&&tileAt(wx+m,wy+m)===T_ROAD;
}

// ── Weapons ───────────────────────────────────────────────────────────────
const WEAPONS=[
  {name:'Pistol', dmg:18, rate:18, range:260, color:'#4dd0e1', bspd:7},
  {name:'Sniper', dmg:85, rate:55, range:600, color:'#ffeb3b', bspd:14},
];

// ── Upgrades ──────────────────────────────────────────────────────────────
const UPG_DEFS=[
  {id:'pDmg',  name:'Pistol Damage',  desc:'+10 dmg',      icon:'🔫', cost:[2,3,4,5], apply:()=>{ WEAPONS[0].dmg+=10; }},
  {id:'pRate', name:'Pistol Speed',   desc:'-3 cooldown',  icon:'⚡', cost:[2,3,4],   apply:()=>{ WEAPONS[0].rate=Math.max(6,WEAPONS[0].rate-3); }},
  {id:'sDmg',  name:'Sniper Power',   desc:'+25 dmg',      icon:'🎯', cost:[3,4,5,6], apply:()=>{ WEAPONS[1].dmg+=25; }},
  {id:'sZoom', name:'Sniper Zoom',    desc:'wider scope',  icon:'🔭', cost:[3,4],     apply:()=>{ uhScopeRad=Math.min(140,uhScopeRad+20); }},
  {id:'spd',   name:'Agility',        desc:'+0.4 speed',   icon:'👟', cost:[2,3,4],   apply:()=>{ uhPSpeed+=0.4; }},
  {id:'hp',    name:'Armour',         desc:'+25 max HP',   icon:'🛡️', cost:[3,4,5],   apply:()=>{ uhHPMax+=25; pHP=Math.min(pHP+25,uhHPMax); }},
];
let uhUpgLvl={};

// ── Game state vars ───────────────────────────────────────────────────────
let uhRunning=false, uhWave=1, uhUpgPts=0;
let uhAnimId=null;
let uhPSpeed=2.8, uhHPMax=100, uhScopeRad=80;

// Camera
let camX=0, camY=0;

// Player
let px=0,py=0,pAngle=0,pHP=100;
let pInvTimer=0, pFireCd=0, pWeapon=0, pScoping=false;

// Enemies & bullets & particles
let enemies=[], bullets=[], uhParts=[];

// Timers / effects
let uhKillFlash=0, uhDmgFlash=0, uhWaveClearTimer=0;

// Virtual joystick (left half of canvas)
let vjOn=false, vjId=-1, vjBX=0, vjBY=0, vjDX=0, vjDY=0;
const VJ_R=50, VJ_K=22;

// Aim drag (right half)
let aimOn=false, aimId=-1, aimLX=0, aimLY=0;

// Shoot button held
let uhShootHeld=false;

// Keyboard
const keys={};

// Path timer for A*
let pathTick=0;

// ── Enemy types ───────────────────────────────────────────────────────────
const ETYPES=[
  {hp:50,  dmg:8,  pts:15, spd:1.1, rate:90,  range:180, color:'#ef5350', emoji:'👊'},
  {hp:100, dmg:14, pts:30, spd:0.9, rate:70,  range:220, color:'#ab47bc', emoji:'💂'},
  {hp:75,  dmg:30, pts:50, spd:0.7, rate:120, range:350, color:'#ffa726', emoji:'🎯'},
];

// ── Spawn wave ────────────────────────────────────────────────────────────
function uhSpawnWave(){
  enemies=[];
  const count=4+uhWave*2;
  const pts=[...spawnPoints].sort(()=>Math.random()-0.5);
  for(let i=0;i<count&&i<pts.length;i++){
    const sp=pts[i];
    const ti=uhWave<=1?0:uhWave<=3?Math.floor(Math.random()*2):Math.floor(Math.random()*3);
    const t=ETYPES[Math.min(ti,2)];
    enemies.push({
      x:sp.x,y:sp.y,
      hp:t.hp+uhWave*8, maxHp:t.hp+uhWave*8,
      dmg:t.dmg, pts:t.pts, spd:t.spd,
      rate:t.rate, fireCd:Math.floor(Math.random()*t.rate),
      range:t.range, color:t.color, emoji:t.emoji,
      angle:0, state:'patrol',
      patrolTimer:60+Math.random()*120,
      patrolDX:(Math.random()-0.5)*2, patrolDY:(Math.random()-0.5)*2,
      alertTimer:0, _pt:null, dead:false,
    });
  }
}

// ── LOS ──────────────────────────────────────────────────────────────────
function hasLOS(ax,ay,bx,by){
  const dx=bx-ax,dy=by-ay,d=Math.sqrt(dx*dx+dy*dy);
  const steps=Math.ceil(d/CELL*2);
  for(let i=1;i<steps;i++){
    const t=i/steps;
    if(tileAt(ax+dx*t,ay+dy*t)===T_WALL) return false;
  }
  return true;
}

// ── A* (tile grid, ≤200 iterations) ──────────────────────────────────────
function astar(sx,sy,tx,ty){
  const sc=Math.floor(sx/CELL),sr=Math.floor(sy/CELL);
  const tc=Math.floor(tx/CELL),tr=Math.floor(ty/CELL);
  if(sc===tc&&sr===tr) return null;
  const key=(c,r)=>r*COLS+c;
  const open=[],closed=new Set(),g={},parent={};
  const h=(c,r)=>Math.abs(c-tc)+Math.abs(r-tr);
  g[key(sc,sr)]=0;
  open.push({c:sc,r:sr,f:h(sc,sr)});
  const dirs=[[-1,0],[1,0],[0,-1],[0,1]];
  let found=null,itr=0;
  while(open.length&&itr++<200){
    open.sort((a,b)=>a.f-b.f);
    const cur=open.shift(),ck=key(cur.c,cur.r);
    if(closed.has(ck)) continue;
    closed.add(ck);
    if(cur.c===tc&&cur.r===tr){found=cur;break;}
    for(const [dc,dr] of dirs){
      const nc=cur.c+dc,nr=cur.r+dr;
      if(nc<0||nc>=COLS||nr<0||nr>=ROWS||tileMap[nr][nc]===T_WALL) continue;
      const nk=key(nc,nr);
      if(closed.has(nk)) continue;
      const ng=(g[ck]||0)+1;
      if(g[nk]===undefined||ng<g[nk]){
        g[nk]=ng; parent[nk]={c:cur.c,r:cur.r};
        open.push({c:nc,r:nr,f:ng+h(nc,nr)});
      }
    }
  }
  if(!found) return null;
  let cur={c:tc,r:tr};
  while(true){
    const ck=key(cur.c,cur.r),par=parent[ck];
    if(!par) break;
    if(par.c===sc&&par.r===sr) return {x:(cur.c+0.5)*CELL,y:(cur.r+0.5)*CELL};
    cur=par;
  }
  return null;
}

// ── Init player ───────────────────────────────────────────────────────────
function initPlayer(){
  px=CELL*2.5; py=CELL*2.5;
  let tries=0;
  while(!isWalkable(px,py)&&tries++<100){ px+=CELL; if(px>CELL*8){px=CELL*1.5;py+=CELL;} }
  pAngle=0; pHP=uhHPMax; pInvTimer=0; pFireCd=0; pScoping=false;
  camX=px-UW/2; camY=py-UH/2;
}

// ── Fire helpers ──────────────────────────────────────────────────────────
function playerFire(){
  const w=WEAPONS[pWeapon];
  if(pFireCd>0) return;
  pFireCd=w.rate;
  bullets.push({x:px,y:py,vx:Math.cos(pAngle)*w.bspd,vy:Math.sin(pAngle)*w.bspd,
    dmg:w.dmg,range:w.range,traveled:0,fromEnemy:false,color:w.color});
}
function enemyFire(e){
  const dx=px-e.x,dy=py-e.y,d=Math.sqrt(dx*dx+dy*dy)||1;
  bullets.push({x:e.x,y:e.y,
    vx:dx/d*5+(Math.random()-0.5)*0.8,vy:dy/d*5+(Math.random()-0.5)*0.8,
    dmg:e.dmg,range:e.range,traveled:0,fromEnemy:true,color:'#ff5252'});
}

// ── Particles ─────────────────────────────────────────────────────────────
function spawnParts(x,y,color,n){
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2,s=1+Math.random()*3;
    uhParts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,
      life:30+Math.random()*20,maxLife:50,color,r:2+Math.random()*3});
  }
}

// ── Update ────────────────────────────────────────────────────────────────
function uhUpdate(){
  if(pFireCd>0) pFireCd--;
  if(pInvTimer>0) pInvTimer--;

  // Keyboard movement
  let kx=0,ky=0;
  if(keys['ArrowUp']||keys['w']||keys['W']) ky=-1;
  if(keys['ArrowDown']||keys['s']||keys['S']) ky=1;
  if(keys['ArrowLeft']||keys['a']||keys['A']) kx=-1;
  if(keys['ArrowRight']||keys['d']||keys['D']) kx=1;
  if(kx||ky){
    const mag=Math.sqrt(kx*kx+ky*ky);
    if(isWalkable(px+kx/mag*uhPSpeed,py)) px+=kx/mag*uhPSpeed;
    if(isWalkable(px,py+ky/mag*uhPSpeed)) py+=ky/mag*uhPSpeed;
    pAngle=Math.atan2(ky,kx);
  }
  if(keys[' ']||keys['f']||keys['F']) playerFire();
  if(keys['q']){ keys['q']=false; pWeapon=(pWeapon+1)%2; uhUpdateHUD(); }

  // Joystick movement
  if(vjOn){
    const mag=Math.sqrt(vjDX*vjDX+vjDY*vjDY)||1;
    const ns=Math.min(1,Math.sqrt(vjDX*vjDX+vjDY*vjDY)/VJ_R);
    const nx=vjDX/mag,ny=vjDY/mag;
    if(isWalkable(px+nx*uhPSpeed*ns,py)) px+=nx*uhPSpeed*ns;
    if(isWalkable(px,py+ny*uhPSpeed*ns)) py+=ny*uhPSpeed*ns;
    if(ns>0.1) pAngle=Math.atan2(ny,nx);
  }

  // Shoot button
  if(uhShootHeld&&pWeapon===0) playerFire();

  // Clamp
  px=Math.max(CELL*0.6,Math.min(COLS*CELL-CELL*0.6,px));
  py=Math.max(CELL*0.6,Math.min(ROWS*CELL-CELL*0.6,py));

  // Camera
  camX+=(px-UW/2-camX)*0.12;
  camY+=(py-UH/2-camY)*0.12;
  camX=Math.max(0,Math.min(COLS*CELL-UW,camX));
  camY=Math.max(0,Math.min(ROWS*CELL-UH,camY));

  // Enemies
  pathTick++;
  for(const e of enemies){
    if(e.dead) continue;
    const dx=px-e.x,dy=py-e.y,dist=Math.sqrt(dx*dx+dy*dy)||1;
    e.angle=Math.atan2(dy,dx);

    if(dist<e.range&&hasLOS(e.x,e.y,px,py)){
      e.state='chase'; e.alertTimer=180;
    } else if(e.alertTimer>0&&--e.alertTimer===0) e.state='patrol';

    if(e.state==='chase'){
      if(dist>70){
        if(pathTick%30===0){ const n=astar(e.x,e.y,px,py); if(n) e._pt=n; }
        if(e._pt){
          const pdx=e._pt.x-e.x,pdy=e._pt.y-e.y,pm=Math.sqrt(pdx*pdx+pdy*pdy)||1;
          if(isWalkable(e.x+pdx/pm*e.spd,e.y)) e.x+=pdx/pm*e.spd;
          if(isWalkable(e.x,e.y+pdy/pm*e.spd)) e.y+=pdy/pm*e.spd;
          if(pm<CELL) e._pt=null;
        } else {
          if(isWalkable(e.x+dx/dist*e.spd,e.y)) e.x+=dx/dist*e.spd;
          if(isWalkable(e.x,e.y+dy/dist*e.spd)) e.y+=dy/dist*e.spd;
        }
      }
      if(dist<e.range&&hasLOS(e.x,e.y,px,py)){
        if(e.fireCd>0) e.fireCd--; else{ e.fireCd=e.rate; enemyFire(e); }
      }
    } else {
      if(--e.patrolTimer<=0){
        e.patrolTimer=60+Math.random()*120;
        e.patrolDX=(Math.random()-0.5)*2; e.patrolDY=(Math.random()-0.5)*2;
      }
      const nx=e.x+e.patrolDX*e.spd*0.5,ny=e.y+e.patrolDY*e.spd*0.5;
      if(isWalkable(nx,e.y)) e.x=nx; else e.patrolDX*=-1;
      if(isWalkable(e.x,ny)) e.y=ny; else e.patrolDY*=-1;
    }
  }

  // Bullets
  for(const b of bullets){
    b.x+=b.vx; b.y+=b.vy;
    b.traveled+=Math.sqrt(b.vx*b.vx+b.vy*b.vy);
    if(tileAt(b.x,b.y)===T_WALL||b.traveled>b.range){ b.dead=true; spawnParts(b.x,b.y,'#888',3); continue; }
    if(!b.fromEnemy){
      for(const e of enemies){
        if(e.dead) continue;
        if(Math.abs(b.x-e.x)<16&&Math.abs(b.y-e.y)<16){
          e.hp-=b.dmg; b.dead=true; spawnParts(b.x,b.y,e.color,8);
          if(e.hp<=0){ e.dead=true; uhUpgPts+=e.pts; uhKillFlash=20; spawnParts(e.x,e.y,'#ff5252',16); uhUpdateHUD(); }
          break;
        }
      }
    } else if(Math.abs(b.x-px)<14&&Math.abs(b.y-py)<14&&pInvTimer===0){
      pHP-=b.dmg; b.dead=true; pInvTimer=30; uhDmgFlash=15; spawnParts(b.x,b.y,'#00e5ff',6);
      if(pHP<=0){ uhGameOver(); return; }
    }
  }
  bullets=bullets.filter(b=>!b.dead);

  // Particles
  for(const p of uhParts){ p.x+=p.vx; p.y+=p.vy; p.vy+=0.08; p.life--; }
  uhParts=uhParts.filter(p=>p.life>0);

  if(uhKillFlash>0) uhKillFlash--;
  if(uhDmgFlash>0) uhDmgFlash--;
  if(uhWaveClearTimer>0) uhWaveClearTimer--;

  // Wave cleared?
  if(enemies.length>0&&enemies.every(e=>e.dead)){
    uhWaveClearTimer=120;
    uhRunning=false;
    setTimeout(()=>{ uhShowUpgrades(); },1400);
  }
}

// ── Render ────────────────────────────────────────────────────────────────
function uhRender(){
  uctx.clearRect(0,0,UW,UH);
  uctx.save();
  uctx.translate(-Math.round(camX),-Math.round(camY));

  const c0=Math.max(0,Math.floor(camX/CELL)), c1=Math.min(COLS,Math.ceil((camX+UW)/CELL));
  const r0=Math.max(0,Math.floor(camY/CELL)), r1=Math.min(ROWS,Math.ceil((camY+UH)/CELL));

  // Tiles
  for(let r=r0;r<r1;r++) for(let c=c0;c<c1;c++){
    const wx=c*CELL,wy=r*CELL;
    if(tileMap[r][c]===T_WALL){
      uctx.fillStyle=(r+c)%2?'#1a1a2e':'#16213e';
      uctx.fillRect(wx,wy,CELL,CELL);
      uctx.strokeStyle='rgba(0,180,255,0.06)'; uctx.lineWidth=1;
      uctx.strokeRect(wx+2,wy+2,CELL-4,CELL-4);
      // windows
      uctx.fillStyle='rgba(255,230,80,0.13)';
      for(let wr=0;wr<3;wr++) for(let wc2=0;wc2<3;wc2++){
        const wox=wx+8+wc2*14,woy=wy+8+wr*15;
        if(wox+7<wx+CELL-3&&woy+8<wy+CELL-3) uctx.fillRect(wox,woy,7,8);
      }
    } else {
      uctx.fillStyle='#1c1c2b';
      uctx.fillRect(wx,wy,CELL,CELL);
      // lane marks
      uctx.fillStyle='rgba(255,255,255,0.05)';
      if(r%5===0&&c%5!==0) uctx.fillRect(wx+CELL/2-1,wy+2,2,CELL-4);
      if(c%5===0&&r%5!==0) uctx.fillRect(wx+2,wy+CELL/2-1,CELL-4,2);
    }
  }

  // Particles
  for(const p of uhParts){
    uctx.globalAlpha=p.life/p.maxLife;
    uctx.fillStyle=p.color;
    uctx.beginPath(); uctx.arc(p.x,p.y,p.r,0,Math.PI*2); uctx.fill();
  }
  uctx.globalAlpha=1;

  // Enemies
  for(const e of enemies){
    if(e.dead) continue;
    uctx.save(); uctx.translate(e.x,e.y);
    // shadow
    uctx.fillStyle='rgba(0,0,0,0.25)';
    uctx.beginPath(); uctx.ellipse(0,13,12,4,0,0,Math.PI*2); uctx.fill();
    // body
    uctx.rotate(e.angle);
    uctx.fillStyle=e.color;
    uctx.beginPath(); uctx.arc(0,0,12,0,Math.PI*2); uctx.fill();
    uctx.fillStyle='rgba(0,0,0,0.4)';
    uctx.beginPath(); uctx.arc(9,0,4,0,Math.PI*2); uctx.fill();
    uctx.restore();
    // emoji
    uctx.font='13px sans-serif'; uctx.textAlign='center';
    uctx.fillText(e.emoji,e.x,e.y+4);
    // HP bar
    uctx.fillStyle='#222'; uctx.fillRect(e.x-14,e.y-20,28,4);
    uctx.fillStyle=e.hp/e.maxHp>.5?'#4caf50':'#f44336';
    uctx.fillRect(e.x-14,e.y-20,28*(e.hp/e.maxHp),4);
    if(e.state==='chase'){
      uctx.fillStyle='#ff5252'; uctx.font='bold 10px sans-serif'; uctx.textAlign='center';
      uctx.fillText('!',e.x,e.y-22);
    }
  }

  // Bullets
  for(const b of bullets){
    uctx.save(); uctx.translate(b.x,b.y);
    const ang=Math.atan2(b.vy,b.vx), len=b.fromEnemy?8:12;
    uctx.rotate(ang);
    uctx.strokeStyle=b.color; uctx.lineWidth=b.fromEnemy?2:3; uctx.lineCap='round';
    uctx.beginPath(); uctx.moveTo(-len/2,0); uctx.lineTo(len/2,0); uctx.stroke();
    uctx.fillStyle=b.color;
    uctx.beginPath(); uctx.arc(len/2,0,b.fromEnemy?2:3,0,Math.PI*2); uctx.fill();
    uctx.restore();
  }

  // Player
  if(!(pInvTimer>0&&Math.floor(pInvTimer/4)%2===0)){
    uctx.save(); uctx.translate(px,py);
    uctx.fillStyle='rgba(0,0,0,0.3)';
    uctx.beginPath(); uctx.ellipse(0,14,13,5,0,0,Math.PI*2); uctx.fill();
    uctx.rotate(pAngle);
    uctx.fillStyle='#00b4d8';
    uctx.beginPath(); uctx.arc(0,0,13,0,Math.PI*2); uctx.fill();
    uctx.fillStyle=WEAPONS[pWeapon].color;
    uctx.fillRect(8,-2,10,4);
    uctx.restore();
    uctx.font='14px sans-serif'; uctx.textAlign='center';
    uctx.fillText('🧑',px,py+5);
  }

  uctx.restore(); // end world transform

  // ── Screen-space HUD ────────────────────────────────────────────────────
  // HP bar
  const hpW=Math.min(UW*0.4,160),hpH=10,hpX=10,hpY=UH-28;
  uctx.fillStyle='rgba(0,0,0,0.55)'; uctx.fillRect(hpX-2,hpY-2,hpW+4,hpH+4);
  uctx.fillStyle='#333'; uctx.fillRect(hpX,hpY,hpW,hpH);
  const hpR=Math.max(0,pHP/uhHPMax);
  uctx.fillStyle=hpR>.5?'#4caf50':hpR>.25?'#ff9800':'#f44336';
  uctx.fillRect(hpX,hpY,hpW*hpR,hpH);
  uctx.fillStyle='#ddd'; uctx.font='bold 10px sans-serif'; uctx.textAlign='left';
  uctx.fillText('HP '+Math.ceil(pHP)+'/'+uhHPMax,hpX,hpY-3);

  // Wave / enemies
  const alive=enemies.filter(e=>!e.dead).length;
  uctx.fillStyle='rgba(0,0,0,0.55)'; uctx.fillRect(UW/2-72,5,144,26);
  uctx.fillStyle='#fff'; uctx.font='bold 12px sans-serif'; uctx.textAlign='center';
  uctx.fillText('Wave '+uhWave+' · Enemies: '+alive,UW/2,21);

  // Weapon label
  uctx.fillStyle='rgba(0,0,0,0.5)'; uctx.fillRect(UW/2-55,UH-52,110,22);
  uctx.fillStyle=WEAPONS[pWeapon].color; uctx.font='bold 11px sans-serif'; uctx.textAlign='center';
  uctx.fillText((pWeapon===0?'🔫':'🎯')+' '+WEAPONS[pWeapon].name,UW/2,UH-37);

  // Damage flash
  if(uhDmgFlash>0){ uctx.fillStyle='rgba(255,0,0,'+(uhDmgFlash/15*0.35)+')'; uctx.fillRect(0,0,UW,UH); }
  // Kill flash
  if(uhKillFlash>0){ uctx.fillStyle='rgba(0,255,100,'+(uhKillFlash/20*0.18)+')'; uctx.fillRect(0,0,UW,UH); }

  // Wave clear text
  if(uhWaveClearTimer>0){
    uctx.globalAlpha=Math.min(1,uhWaveClearTimer/30);
    uctx.fillStyle='#ffd700'; uctx.font='bold '+Math.round(UW*0.08)+'px sans-serif'; uctx.textAlign='center';
    uctx.fillText('WAVE CLEAR! 🎉',UW/2,UH/2-16);
    uctx.fillStyle='#fff'; uctx.font='bold '+Math.round(UW*0.05)+'px sans-serif';
    uctx.fillText('Choose upgrades →',UW/2,UH/2+20);
    uctx.globalAlpha=1;
  }

  // Sniper scope
  if(pScoping&&pWeapon===1){
    uctx.save();
    const cx=UW/2,cy=UH/2,sr=uhScopeRad;
    uctx.fillStyle='rgba(0,0,12,0.9)'; uctx.fillRect(0,0,UW,UH);
    uctx.globalCompositeOperation='destination-out';
    uctx.beginPath(); uctx.arc(cx,cy,sr,0,Math.PI*2); uctx.fill();
    uctx.globalCompositeOperation='source-over';
    uctx.strokeStyle='#4dd0e1'; uctx.lineWidth=2;
    uctx.beginPath(); uctx.arc(cx,cy,sr,0,Math.PI*2); uctx.stroke();
    uctx.strokeStyle='rgba(77,208,225,0.6)'; uctx.lineWidth=1;
    uctx.beginPath();
    uctx.moveTo(cx-sr,cy); uctx.lineTo(cx+sr,cy);
    uctx.moveTo(cx,cy-sr); uctx.lineTo(cx,cy+sr);
    uctx.stroke();
    uctx.restore();
  }

  // Virtual joystick
  if(vjOn){
    uctx.globalAlpha=0.35; uctx.fillStyle='#fff';
    uctx.beginPath(); uctx.arc(vjBX,vjBY,VJ_R,0,Math.PI*2); uctx.fill();
    uctx.globalAlpha=0.65; uctx.fillStyle='#00b4d8';
    const kx=vjBX+Math.max(-VJ_R,Math.min(VJ_R,vjDX));
    const ky=vjBY+Math.max(-VJ_R,Math.min(VJ_R,vjDY));
    uctx.beginPath(); uctx.arc(kx,ky,VJ_K,0,Math.PI*2); uctx.fill();
    uctx.globalAlpha=1;
  }

  // Minimap
  const mmW=80,mmH=80,mmX=UW-mmW-8,mmY=8;
  const mSX=mmW/(COLS*CELL),mSY=mmH/(ROWS*CELL);
  uctx.fillStyle='rgba(0,0,0,0.55)'; uctx.fillRect(mmX,mmY,mmW,mmH);
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    if(tileMap[r][c]===T_WALL){ uctx.fillStyle='#1e2040'; uctx.fillRect(mmX+c*CELL*mSX,mmY+r*CELL*mSY,CELL*mSX+.5,CELL*mSY+.5); }
  }
  for(const e of enemies){ if(!e.dead){ uctx.fillStyle=e.color; uctx.fillRect(mmX+e.x*mSX-1.5,mmY+e.y*mSY-1.5,3,3); } }
  uctx.fillStyle='#00e5ff';
  uctx.beginPath(); uctx.arc(mmX+px*mSX,mmY+py*mSY,3,0,Math.PI*2); uctx.fill();
  uctx.strokeStyle='rgba(0,180,255,0.4)'; uctx.lineWidth=1; uctx.strokeRect(mmX,mmY,mmW,mmH);
}

// ── Game loop ─────────────────────────────────────────────────────────────
function uhLoop(){
  if(!uhRunning){ uhAnimId=null; return; }
  uhUpdate(); uhRender();
  uhAnimId=requestAnimationFrame(uhLoop);
}

// ── HUD helpers ───────────────────────────────────────────────────────────
function uhUpdateHUD(){
  const b=document.getElementById('uhUpgBtn'); if(b) b.textContent='⬆ '+uhUpgPts+' pts';
  const w=document.getElementById('uhWeaponBtn'); if(w) w.textContent=WEAPONS[pWeapon].name;
}
function uhShowGameBtns(show){
  ['uhShootBtn','uhScopeBtn','uhWeaponBtn','uhUpgBtn'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display=show?'':'none';
  });
}

// ── Overlays ──────────────────────────────────────────────────────────────
function showUhOverlay(show){
  document.getElementById('uhOverlay').style.display=show?'flex':'none';
}

function uhShowUpgrades(){
  document.getElementById('uhUpgPanel').style.display='flex';
  uhRenderUpgrades();
}
function uhRenderUpgrades(){
  document.getElementById('uhUpgContent').innerHTML=UPG_DEFS.map(u=>{
    const lv=uhUpgLvl[u.id]||0, maxLv=u.cost.length, cost=lv<maxLv?u.cost[lv]:null;
    const canBuy=cost!==null&&uhUpgPts>=cost, maxed=cost===null;
    return `<div class="uh-upg-row">
      <span class="uh-upg-name">${u.icon} ${u.name}</span>
      <span class="uh-upg-desc">${u.desc}</span>
      <span class="uh-upg-lv">Lv ${lv}/${maxLv}</span>
      ${maxed?'<span class="uh-upg-max">MAX</span>':
        `<button class="uh-upg-btn"${canBuy?'':' disabled'} onclick="uhBuyUpg('${u.id}')">${cost} pts</button>`}
    </div>`;
  }).join('');
}

// ── Public API ────────────────────────────────────────────────────────────
window.uhBuyUpg=function(id){
  const u=UPG_DEFS.find(d=>d.id===id); if(!u) return;
  const lv=uhUpgLvl[u.id]||0, cost=u.cost[lv];
  if(uhUpgPts<cost) return;
  uhUpgPts-=cost; uhUpgLvl[u.id]=lv+1; u.apply();
  uhRenderUpgrades();
};

window.showUhOverlay=showUhOverlay;

window.uhStartGame=function(){
  uhResize(); uhGenMap();
  uhWave=1; uhUpgPts=0; uhUpgLvl={};
  WEAPONS[0].dmg=18; WEAPONS[0].rate=18; WEAPONS[0].bspd=7;
  WEAPONS[1].dmg=85; WEAPONS[1].rate=55; WEAPONS[1].bspd=14;
  uhPSpeed=2.8; uhHPMax=100; uhScopeRad=80; pWeapon=0;
  bullets=[]; uhParts=[]; uhKillFlash=0; uhDmgFlash=0; uhWaveClearTimer=0;
  initPlayer(); uhSpawnWave();
  showUhOverlay(false);
  document.getElementById('uhUpgPanel').style.display='none';
  uhShowGameBtns(true); uhUpdateHUD();
  uhRunning=true;
  if(uhAnimId) cancelAnimationFrame(uhAnimId);
  uhLoop();
};

document.getElementById('uhNextBtn').addEventListener('click',()=>{
  uhWave++; bullets=[]; uhParts=[];
  initPlayer(); uhSpawnWave();
  document.getElementById('uhUpgPanel').style.display='none';
  uhShowGameBtns(true); uhUpdateHUD();
  uhRunning=true;
  if(uhAnimId) cancelAnimationFrame(uhAnimId);
  uhLoop();
});

function uhGameOver(){
  uhRunning=false; uhShowGameBtns(false);
  document.getElementById('uhResult').textContent='💀 KIA on Wave '+uhWave+' · '+uhUpgPts+' pts earned';
  showUhOverlay(true);
  document.getElementById('uhPlayBtn').textContent='▶ Retry Mission';
}

window.exitUrbanHunt=function(){
  uhRunning=false;
  if(uhAnimId){ cancelAnimationFrame(uhAnimId); uhAnimId=null; }
  uhShowGameBtns(false);
  navigate('home');
};

// ── Button events ─────────────────────────────────────────────────────────
document.getElementById('uhPlayBtn').addEventListener('click',window.uhStartGame);

const shootBtn=document.getElementById('uhShootBtn');
shootBtn.addEventListener('touchstart',e=>{ e.preventDefault(); uhShootHeld=true; if(pWeapon===1) playerFire(); },{passive:false});
shootBtn.addEventListener('touchend',e=>{ e.preventDefault(); uhShootHeld=false; },{passive:false});
shootBtn.addEventListener('mousedown',()=>{ uhShootHeld=true; if(pWeapon===1) playerFire(); });
shootBtn.addEventListener('mouseup',()=>{ uhShootHeld=false; });

const scopeBtn=document.getElementById('uhScopeBtn');
scopeBtn.addEventListener('touchstart',e=>{ e.preventDefault(); pScoping=true; },{passive:false});
scopeBtn.addEventListener('touchend',e=>{ e.preventDefault(); pScoping=false; },{passive:false});
scopeBtn.addEventListener('mousedown',()=>{ pScoping=true; });
scopeBtn.addEventListener('mouseup',()=>{ pScoping=false; });

document.getElementById('uhWeaponBtn').addEventListener('click',()=>{ pWeapon=(pWeapon+1)%2; pScoping=false; uhUpdateHUD(); });
document.getElementById('uhUpgBtn').addEventListener('click',()=>{ if(!uhRunning) return; uhRunning=false; uhShowUpgrades(); });

// ── Canvas touch ──────────────────────────────────────────────────────────
uhc.addEventListener('touchstart',e=>{
  e.preventDefault();
  for(const t of e.changedTouches){
    const rect=uhc.getBoundingClientRect();
    const tx=t.clientX-rect.left,ty=t.clientY-rect.top;
    if(tx<UW/2){
      if(!vjOn){ vjOn=true; vjId=t.identifier; vjBX=tx; vjBY=ty; vjDX=0; vjDY=0; }
    } else {
      if(!aimOn){ aimOn=true; aimId=t.identifier; aimLX=tx; aimLY=ty; }
    }
  }
},{passive:false});

uhc.addEventListener('touchmove',e=>{
  e.preventDefault();
  for(const t of e.changedTouches){
    const rect=uhc.getBoundingClientRect();
    if(t.identifier===vjId){ vjDX=t.clientX-rect.left-vjBX; vjDY=t.clientY-rect.top-vjBY; }
    if(t.identifier===aimId){
      const nx=t.clientX-rect.left,ny=t.clientY-rect.top;
      pAngle+=( nx-aimLX)*0.04;
      aimLX=nx; aimLY=ny;
    }
  }
},{passive:false});

uhc.addEventListener('touchend',e=>{
  e.preventDefault();
  for(const t of e.changedTouches){
    if(t.identifier===vjId){ vjOn=false; vjId=-1; vjDX=0; vjDY=0; }
    if(t.identifier===aimId){ aimOn=false; aimId=-1; }
  }
},{passive:false});

// Mouse (desktop)
let mdown=false;
uhc.addEventListener('mousedown',e=>{
  mdown=true;
  const rect=uhc.getBoundingClientRect();
  if(e.clientX-rect.left<UW/2){ vjOn=true; vjId=0; vjBX=e.clientX-rect.left; vjBY=e.clientY-rect.top; vjDX=0; vjDY=0; }
});
uhc.addEventListener('mousemove',e=>{
  if(!mdown) return;
  if(vjOn){ const rect=uhc.getBoundingClientRect(); vjDX=e.clientX-rect.left-vjBX; vjDY=e.clientY-rect.top-vjBY; }
  else { pAngle+=e.movementX*0.03; }
});
uhc.addEventListener('mouseup',()=>{ mdown=false; vjOn=false; vjId=-1; vjDX=0; vjDY=0; });

// Keyboard
document.addEventListener('keydown',e=>{ keys[e.key]=true; });
document.addEventListener('keyup',e=>{ keys[e.key]=false; });

// Resize
window.addEventListener('resize',()=>{ if(typeof currentPage!=='undefined'&&currentPage==='hunter') uhResize(); });

// ── Idle frame ────────────────────────────────────────────────────────────
uhResize();
uctx.fillStyle='#0a0a16'; uctx.fillRect(0,0,UW,UH);
for(let i=0;i<8;i++){ uctx.fillStyle='rgba(0,180,255,0.04)'; uctx.fillRect(i*80,0,40,UH); }
uctx.fillStyle='rgba(255,255,255,0.7)'; uctx.font='bold 22px sans-serif'; uctx.textAlign='center';
uctx.fillText('🔫 Urban Hunt',UW/2,UH/2-10);
uctx.fillStyle='rgba(255,255,255,0.35)'; uctx.font='13px sans-serif';
uctx.fillText('Tap "Start Mission" to play',UW/2,UH/2+18);

})();
