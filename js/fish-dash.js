// ══════════════════════════════════════════════════════════════════════════
// FISH DASH GAME ENGINE
// ══════════════════════════════════════════════════════════════════════════
const canvas=document.getElementById('c');
const ctx=canvas.getContext('2d');
const W=520,H=400;
canvas.width=W;canvas.height=H;

let gameState='idle',score,level,frame;
let fishY,fishVY,upHeld,downHeld,boostHeld;
let boostFuel=100;
let pillars,bubbles,particles,enemies;
let bgOffset=0;
let gameRaf,gameSessionStart;

const FISH_X=90,FISH_H=28,FISH_W=44;
const PILLAR_W=40;
const BASE_SPEED=2.2,BASE_GAP=155,MIN_GAP=90;
const SPEED_INC=0.22,GAP_DEC=6,LEVEL_EVERY=10;
const FISH_ACCEL=0.45,FISH_MAX=4.5,FISH_FRICTION=0.84;
const PILLAR_INTERVAL=170;

function rnd(a,b){return a+Math.random()*(b-a);}
function rndInt(a,b){return Math.floor(rnd(a,b+1));}
function getSpeed(){return BASE_SPEED+(level-1)*SPEED_INC;}
function getGap(){return Math.max(MIN_GAP,BASE_GAP-(level-1)*GAP_DEC);}

const ENEMY_TYPES={
  jellyfish:{minLevel:1,hitRadius:12,label:'🪼 Jellyfish!',
    spawn(){return{type:'jellyfish',x:W+30,y:rnd(60,H-80),baseY:0,phase:rnd(0,Math.PI*2),speed:rnd(1.0,1.6),amplitude:rnd(30,55),frame:0};},
    update(e){e.x-=e.speed;e.y=e.baseY+Math.sin(e.frame*0.04+e.phase)*e.amplitude;e.frame++;},
    draw(e){const t=e.frame;ctx.save();ctx.translate(e.x,e.y);const g=ctx.createRadialGradient(0,-6,2,0,-4,16);g.addColorStop(0,'rgba(220,180,255,0.95)');g.addColorStop(1,'rgba(150,80,220,0.8)');ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(0,-4,13,14,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(200,150,255,0.6)';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(0,4,13,4,0,0,Math.PI);ctx.stroke();for(let i=-2;i<=2;i++){const tx=i*5,wave=Math.sin(t*0.08+i*0.9)*5;ctx.strokeStyle='rgba(179,136,255,0.7)';ctx.lineWidth=1.5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(tx,10);ctx.quadraticCurveTo(tx+wave,20,tx+wave*1.3,32);ctx.stroke();}ctx.globalAlpha=0.25;ctx.fillStyle='#d0aaff';ctx.beginPath();ctx.ellipse(0,-4,18,18,0,0,Math.PI*2);ctx.fill();ctx.restore();}
  },
  shark:{minLevel:2,hitRadius:20,label:'🦈 Shark!',
    spawn(){const fromTop=Math.random()<0.5;return{type:'shark',x:W+80,y:fromTop?rnd(40,H/2-20):rnd(H/2+20,H-60),speed:rnd(2.5,3.5),frame:0};},
    update(e){e.x-=e.speed;e.frame++;},
    draw(e){ctx.save();ctx.translate(e.x,e.y);const bg=ctx.createLinearGradient(-30,0,30,0);bg.addColorStop(0,'#546e7a');bg.addColorStop(0.5,'#78909c');bg.addColorStop(1,'#37474f');ctx.fillStyle=bg;ctx.beginPath();ctx.ellipse(0,0,30,12,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(240,240,255,0.7)';ctx.beginPath();ctx.ellipse(4,4,20,6,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#546e7a';ctx.beginPath();ctx.moveTo(-26,0);ctx.lineTo(-42,-13);ctx.lineTo(-42,13);ctx.closePath();ctx.fill();ctx.fillStyle='#455a64';ctx.beginPath();ctx.moveTo(0,-12);ctx.lineTo(-8,-28);ctx.lineTo(12,-12);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(4,6);ctx.lineTo(-10,22);ctx.lineTo(14,10);ctx.closePath();ctx.fill();ctx.fillStyle='#111';ctx.beginPath();ctx.arc(20,-2,3.5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(21,-3,1.2,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#333';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(26,3);ctx.quadraticCurveTo(32,6,28,2);ctx.stroke();for(let t=0;t<3;t++){ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(26+t*1.5,3);ctx.lineTo(27+t*1.5,7);ctx.lineTo(28+t*1.5,3);ctx.closePath();ctx.fill();}ctx.restore();}
  },
  octopus:{minLevel:3,hitRadius:14,label:'🐙 Octopus!',
    spawn(){return{type:'octopus',x:W+40,y:rnd(60,H-70),baseY:0,phase:rnd(0,Math.PI*2),speed:rnd(0.9,1.5),amplitude:rnd(20,45),frame:0};},
    update(e){e.x-=e.speed*0.8;e.y=e.baseY+Math.sin(e.frame*0.035+e.phase)*e.amplitude;e.frame++;},
    draw(e){const t=e.frame;ctx.save();ctx.translate(e.x,e.y);const hg=ctx.createRadialGradient(0,-4,2,0,-2,18);hg.addColorStop(0,'#f06292');hg.addColorStop(1,'#c2185b');ctx.fillStyle=hg;ctx.beginPath();ctx.ellipse(0,-4,16,18,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(-7,-4,4,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(7,-4,4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#111';ctx.beginPath();ctx.arc(-6,-4,2.2,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(8,-4,2.2,0,Math.PI*2);ctx.fill();[-13,-8,-3,2,8,13,-10,10].forEach((tx,i)=>{const wave=Math.sin(t*0.1+i*0.8)*7;ctx.strokeStyle='#ad1457';ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(tx,12);ctx.quadraticCurveTo(tx+wave,24,tx+wave*1.6,38);ctx.stroke();ctx.fillStyle='rgba(255,100,150,0.7)';ctx.beginPath();ctx.arc(tx+wave*0.8,26,2,0,Math.PI*2);ctx.fill();});ctx.globalAlpha=0.18;ctx.fillStyle='#ff80ab';ctx.beginPath();ctx.ellipse(0,-4,22,22,0,0,Math.PI*2);ctx.fill();ctx.restore();}
  },
  pufferfish:{minLevel:4,label:'🐡 Pufferfish!',
    hitRadius(e){return e.puffed?24:16;},
    spawn(){return{type:'pufferfish',x:W+40,y:rnd(60,H-60),baseY:0,phase:rnd(0,Math.PI*2),speed:rnd(0.8,1.3),amplitude:rnd(25,50),frame:0,puffed:false,puffTimer:0};},
    update(e){e.x-=e.speed*0.7;e.y=e.baseY+Math.sin(e.frame*0.03+e.phase)*e.amplitude;e.puffTimer++;if(e.puffTimer>80){e.puffed=!e.puffed;e.puffTimer=0;}e.frame++;},
    draw(e){const sc=e.puffed?1.45:1.0;ctx.save();ctx.translate(e.x,e.y);ctx.scale(sc,sc);const bg=ctx.createRadialGradient(0,0,2,0,0,17);bg.addColorStop(0,'#ffcc02');bg.addColorStop(0.6,'#ff9800');bg.addColorStop(1,'#e65100');ctx.fillStyle=bg;ctx.beginPath();ctx.arc(0,0,17,0,Math.PI*2);ctx.fill();if(e.puffed){for(let a=0;a<16;a++){const ang=(a/16)*Math.PI*2;ctx.strokeStyle='#bf360c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(Math.cos(ang)*17,Math.sin(ang)*17);ctx.lineTo(Math.cos(ang)*26,Math.sin(ang)*26);ctx.stroke();}}else{for(let a=0;a<8;a++){const ang=(a/8)*Math.PI*2;ctx.strokeStyle='#e64a19';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(Math.cos(ang)*17,Math.sin(ang)*17);ctx.lineTo(Math.cos(ang)*22,Math.sin(ang)*22);ctx.stroke();}}ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(8,-4,5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#111';ctx.beginPath();ctx.arc(9,-4,3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(10,-5,1.2,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#333';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(14,2,3,0,Math.PI);ctx.stroke();if(e.puffed){ctx.globalAlpha=0.2;ctx.fillStyle='#ff6d00';ctx.beginPath();ctx.arc(0,0,28,0,Math.PI*2);ctx.fill();}ctx.restore();}
  },
  eel:{minLevel:5,hitRadius:8,label:'⚡ Electric Eel!',
    spawn(){const fromTop=Math.random()<0.5;return{type:'eel',x:W+100,y:fromTop?rnd(30,H/2):rnd(H/2,H-50),speed:rnd(1.8,2.8),phase:rnd(0,Math.PI*2),frame:0};},
    update(e){e.x-=e.speed;e.frame++;},
    draw(e){const t=e.frame;ctx.save();ctx.translate(e.x,e.y);const segs=12,segL=8;ctx.lineWidth=10;ctx.lineCap='round';ctx.lineJoin='round';const eg=ctx.createLinearGradient(-segs*segL,0,0,0);eg.addColorStop(0,'#1b5e20');eg.addColorStop(0.5,'#388e3c');eg.addColorStop(1,'#1b5e20');ctx.strokeStyle=eg;ctx.beginPath();for(let s=0;s<=segs;s++){const sx=-s*segL,sy=Math.sin(t*0.12+s*0.5+e.phase)*9;s===0?ctx.moveTo(sx,sy):ctx.lineTo(sx,sy);}ctx.stroke();ctx.lineWidth=3;ctx.strokeStyle='rgba(178,255,50,0.6)';ctx.beginPath();for(let s=0;s<=segs;s++){const sx=-s*segL,sy=Math.sin(t*0.12+s*0.5+e.phase)*9;s===0?ctx.moveTo(sx,sy):ctx.lineTo(sx,sy);}ctx.stroke();if(t%8<3){for(let k=0;k<3;k++){const sx=rnd(-segs*segL,0),sy=Math.sin(t*0.12+sx/segL*0.5+e.phase)*9+rnd(-8,8);ctx.fillStyle='#ffe57f';ctx.globalAlpha=0.9;ctx.beginPath();ctx.arc(sx,sy,2,0,Math.PI*2);ctx.fill();}}ctx.globalAlpha=1;const headY=Math.sin(t*0.12+e.phase)*9;ctx.fillStyle='#2e7d32';ctx.beginPath();ctx.ellipse(0,headY,10,7,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(6,headY-2,3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#111';ctx.beginPath();ctx.arc(7,headY-2,1.8,0,Math.PI*2);ctx.fill();ctx.restore();}
  }
};

function startGame(){
  score=0;level=1;frame=0;
  fishY=H/2;fishVY=0;upHeld=false;downHeld=false;boostHeld=false;boostFuel=100;
  pillars=[];particles=[];enemies=[];
  bubbles=Array.from({length:18},()=>({x:rnd(0,W),y:rnd(0,H),r:rnd(2,6),speed:rnd(0.3,0.9),alpha:rnd(0.15,0.5)}));
  document.getElementById('overlay').style.display='none';
  document.getElementById('scoreTxt').textContent='Score: 0';
  document.getElementById('levelTxt').textContent='Level 1';
  gameState='playing';gameLoop();
}

function showGameOverlay(died){
  const ov=document.getElementById('overlay');
  ov.style.display='flex';
  ov.querySelector('h2').textContent=died?'💀 Game Over':'🐟 Fish Dash';
  ov.querySelector('.sub').textContent=died?'You were caught!':'Dodge pillars & deadly sea creatures!';
  document.getElementById('finalScore').style.display=died?'block':'none';
  document.getElementById('finalLevel').style.display=died?'block':'none';
  if(died){document.getElementById('finalScore').textContent=`Score: ${score}`;document.getElementById('finalLevel').textContent=`Reached Level ${level}`;}
  document.getElementById('gamePlayBtn').textContent=died?'🔄 Restart':'▶ Play';
}

function showKillMsg(label){
  const el=document.getElementById('killMsg');
  el.textContent=label;el.style.opacity='1';
  setTimeout(()=>el.style.opacity='0',800);
}

function spawnPillar(){
  const gap=getGap(),minTop=40,maxTop=H-gap-40;
  const topH=rndInt(minTop,maxTop);
  pillars.push({x:W+10,topH,botY:topH+gap,scored:false});
}

function trySpawnEnemy(){
  const types=Object.entries(ENEMY_TYPES).filter(([k,v])=>v.minLevel<=level);
  if(!types.length) return;
  const [,def]=types[rndInt(0,types.length-1)];
  const e=def.spawn();e.baseY=e.y;enemies.push(e);
}

function burst(x,y){
  for(let i=0;i<18;i++){const a=rnd(0,Math.PI*2),s=rnd(1.5,4.5);particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:1,r:rnd(2,5),hue:rndInt(180,220)});}
}

function drawBg(){
  const grd=ctx.createLinearGradient(0,0,0,H);grd.addColorStop(0,'#003d6b');grd.addColorStop(0.5,'#00264d');grd.addColorStop(1,'#001529');ctx.fillStyle=grd;ctx.fillRect(0,0,W,H);
  ctx.save();ctx.globalAlpha=0.06;for(let i=0;i<6;i++){const x=((i*90+bgOffset*0.3)%(W+60))-30;ctx.fillStyle='#88ddff';ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+30,0);ctx.lineTo(x+80,H);ctx.lineTo(x+40,H);ctx.closePath();ctx.fill();}ctx.restore();
  const sandG=ctx.createLinearGradient(0,H-28,0,H);sandG.addColorStop(0,'#8b6914');sandG.addColorStop(1,'#5a4010');ctx.fillStyle=sandG;ctx.fillRect(0,H-28,W,28);
  bubbles.forEach(b=>{ctx.save();ctx.globalAlpha=b.alpha;ctx.strokeStyle='#aaddff';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.stroke();ctx.restore();});
}

function drawPillar(p){
  const rx=6;
  function rockGrad(y1,y2){const g=ctx.createLinearGradient(p.x,y1,p.x+PILLAR_W,y2);g.addColorStop(0,'#4a5568');g.addColorStop(0.4,'#5a6678');g.addColorStop(1,'#2d3748');return g;}
  ctx.fillStyle=rockGrad(0,p.topH);ctx.beginPath();ctx.moveTo(p.x+rx,0);ctx.lineTo(p.x+PILLAR_W-rx,0);ctx.lineTo(p.x+PILLAR_W,p.topH-rx);ctx.quadraticCurveTo(p.x+PILLAR_W,p.topH,p.x+PILLAR_W-rx,p.topH);ctx.lineTo(p.x+rx,p.topH);ctx.quadraticCurveTo(p.x,p.topH,p.x,p.topH-rx);ctx.lineTo(p.x,0);ctx.closePath();ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.07)';ctx.fillRect(p.x+4,0,6,p.topH);
  ctx.fillStyle=rockGrad(p.botY,H);ctx.beginPath();ctx.moveTo(p.x,H);ctx.lineTo(p.x+PILLAR_W,H);ctx.lineTo(p.x+PILLAR_W,p.botY+rx);ctx.quadraticCurveTo(p.x+PILLAR_W,p.botY,p.x+PILLAR_W-rx,p.botY);ctx.lineTo(p.x+rx,p.botY);ctx.quadraticCurveTo(p.x,p.botY,p.x,p.botY+rx);ctx.lineTo(p.x,H);ctx.closePath();ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.07)';ctx.fillRect(p.x+4,p.botY,6,H-p.botY);
  for(let s=0;s<3;s++){const sx=p.x+6+s*12,sy=p.botY,wave=Math.sin(frame*0.06+s*1.5)*4;ctx.save();ctx.strokeStyle='#2d6a4f';ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(sx,sy);ctx.quadraticCurveTo(sx+wave,sy-10,sx+wave*1.5,sy-20);ctx.stroke();ctx.strokeStyle='#40916c';ctx.beginPath();ctx.moveTo(sx,sy);ctx.quadraticCurveTo(sx-wave,sy-8,sx-wave*1.2,sy-16);ctx.stroke();ctx.restore();}
}

function drawFish(fy){
  const cx=FISH_X,cy=fy,tilt=Math.max(-0.5,Math.min(0.5,fishVY*0.08));
  ctx.save();ctx.translate(cx,cy);ctx.rotate(tilt);
  const tailWag=Math.sin(frame*0.18)*5;ctx.fillStyle='#ff6b35';ctx.beginPath();ctx.moveTo(-FISH_W/2-2,0);ctx.lineTo(-FISH_W/2-16,-10+tailWag);ctx.lineTo(-FISH_W/2-16,10-tailWag);ctx.closePath();ctx.fill();
  const bodyG=ctx.createRadialGradient(4,-4,2,0,0,FISH_W/2);bodyG.addColorStop(0,'#ffd166');bodyG.addColorStop(0.5,'#ef8c2c');bodyG.addColorStop(1,'#c1440e');ctx.fillStyle=bodyG;ctx.beginPath();ctx.ellipse(0,0,FISH_W/2,FISH_H/2,0,0,Math.PI*2);ctx.fill();
  ctx.save();ctx.globalAlpha=0.3;ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(4,0,FISH_W/4,FISH_H/4,0,0,Math.PI*2);ctx.fill();ctx.restore();
  ctx.fillStyle='#c1440e';ctx.beginPath();ctx.moveTo(-4,-FISH_H/2);ctx.lineTo(6,-FISH_H/2-10);ctx.lineTo(14,-FISH_H/2);ctx.closePath();ctx.fill();
  ctx.fillStyle='#ef8c2c';ctx.beginPath();ctx.ellipse(2,6,10,5,0.5,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(16,-4,5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#111';ctx.beginPath();ctx.arc(17,-4,2.8,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(18,-5.5,1,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function drawParticles(){particles.forEach(p=>{ctx.save();ctx.globalAlpha=p.life;ctx.fillStyle=`hsl(${p.hue},80%,65%)`;ctx.beginPath();ctx.arc(p.x,p.y,p.r*p.life,0,Math.PI*2);ctx.fill();ctx.restore();});}

function drawBoostBar(){
  const bx=W/2-50,by=H-18,bw=100,bh=8;ctx.save();ctx.fillStyle='rgba(0,0,0,0.45)';ctx.beginPath();ctx.roundRect(bx-2,by-2,bw+4,bh+4,4);ctx.fill();
  const pct=boostFuel/100;const boosting=boostHeld&&boostFuel>0;const barG=ctx.createLinearGradient(bx,by,bx+bw,by);
  if(boosting){barG.addColorStop(0,'#fff176');barG.addColorStop(1,'#ff6f00');}else if(pct<0.3){barG.addColorStop(0,'#ff5252');barG.addColorStop(1,'#ff1744');}else{barG.addColorStop(0,'#00e5ff');barG.addColorStop(1,'#00b0ff');}
  ctx.fillStyle=barG;ctx.beginPath();ctx.roundRect(bx,by,bw*pct,bh,3);ctx.fill();ctx.fillStyle='rgba(255,255,255,0.8)';ctx.font='bold 10px Segoe UI';ctx.textAlign='center';ctx.fillText(boosting?'⚡ BOOST':'➡ BOOST',W/2,by-4);ctx.restore();
}

function hitTest(p){
  const pad=5,fx=FISH_X,fy=fishY,fw=FISH_W/2-pad,fh=FISH_H/2-pad;
  const px1=p.x,px2=p.x+PILLAR_W;if(fx+fw<px1||fx-fw>px2)return false;if(fy-fh<p.topH)return true;if(fy+fh>p.botY)return true;return false;
}

function enemyHitTest(e,def){
  const fx=FISH_X,fy=fishY;const hr=typeof def.hitRadius==='function'?def.hitRadius(e):def.hitRadius;
  const dx=fx-e.x,dy=fy-e.y;return Math.sqrt(dx*dx+dy*dy)<hr+FISH_H/2-4;
}

const ENEMY_INTERVAL=[999,240,200,160,130,110];

function gameUpdate(){
  frame++;bgOffset+=getSpeed()*0.5;
  if(upHeld)fishVY-=FISH_ACCEL;if(downHeld)fishVY+=FISH_ACCEL;
  fishVY*=FISH_FRICTION;fishVY=Math.max(-FISH_MAX,Math.min(FISH_MAX,fishVY));fishY+=fishVY;
  const halfH=FISH_H/2;if(fishY-halfH<0){fishY=halfH;fishVY=0;}if(fishY+halfH>H-28){fishY=H-28-halfH;fishVY=0;}
  if(frame%PILLAR_INTERVAL===0)spawnPillar();
  const eInterval=ENEMY_INTERVAL[Math.min(level,ENEMY_INTERVAL.length-1)];
  if(level>=1&&frame%eInterval===0)trySpawnEnemy();
  if(boostHeld&&boostFuel>0){boostFuel=Math.max(0,boostFuel-1.4);}else if(!boostHeld&&boostFuel<100){boostFuel=Math.min(100,boostFuel+0.4);}
  const boosting=boostHeld&&boostFuel>0;const spd=getSpeed()*(boosting?2.2:1);
  for(let i=pillars.length-1;i>=0;i--){pillars[i].x-=spd;if(!pillars[i].scored&&pillars[i].x+PILLAR_W<FISH_X){pillars[i].scored=true;score++;const newLvl=Math.floor(score/LEVEL_EVERY)+1;if(newLvl>level)level=newLvl;}if(hitTest(pillars[i])){gameDie('💥 Hit a Pillar!');return;}if(pillars[i].x+PILLAR_W<-10)pillars.splice(i,1);}
  for(let i=enemies.length-1;i>=0;i--){const e=enemies[i];const def=ENEMY_TYPES[e.type];def.update(e);if(enemyHitTest(e,def)){gameDie(def.label);return;}if(e.x+120<0)enemies.splice(i,1);}
  bubbles.forEach(b=>{b.y-=b.speed;if(b.y+b.r<0){b.y=H+b.r;b.x=rnd(0,W);}});
  particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.life-=0.04;});particles=particles.filter(p=>p.life>0);
  document.getElementById('scoreTxt').textContent=`Score: ${score}`;document.getElementById('levelTxt').textContent=`Level ${level}`;
}

function gameRender(){
  ctx.clearRect(0,0,W,H);drawBg();
  enemies.forEach(e=>{const def=ENEMY_TYPES[e.type];if(def.glow){ctx.save();ctx.globalAlpha=0.3;const gr=ctx.createRadialGradient(e.x,e.y,2,e.x,e.y,40);gr.addColorStop(0,def.glow||'rgba(255,255,255,0.3)');gr.addColorStop(1,'transparent');ctx.fillStyle=gr;ctx.beginPath();ctx.arc(e.x,e.y,40,0,Math.PI*2);ctx.fill();ctx.restore();}});
  pillars.forEach(drawPillar);enemies.forEach(e=>ENEMY_TYPES[e.type].draw(e));drawFish(fishY);drawParticles();drawBoostBar();
}

let _fdLastTs=0;
function gameLoop(ts=0){if(gameState!=='playing')return;if(_fdLastTs&&ts-_fdLastTs<14){gameRaf=requestAnimationFrame(gameLoop);return;}_fdLastTs=ts;gameUpdate();gameRender();gameRaf=requestAnimationFrame(gameLoop);}

function gameDie(msg){
  burst(FISH_X,fishY);showKillMsg(msg);gameState='dead';cancelAnimationFrame(gameRaf);gameRender();
  recordGameEnd(score,level);
  setTimeout(()=>showGameOverlay(true),700);
}

// Controls
document.addEventListener('keydown',e=>{if(currentPage!=='game')return;if(e.key==='ArrowUp'){e.preventDefault();upHeld=true;}if(e.key==='ArrowDown'){e.preventDefault();downHeld=true;}if(e.key==='ArrowRight'){e.preventDefault();boostHeld=true;}});
document.addEventListener('keyup',e=>{if(e.key==='ArrowUp')upHeld=false;if(e.key==='ArrowDown')downHeld=false;if(e.key==='ArrowRight')boostHeld=false;});

let touchStartY=null;
const gc=document.getElementById('gameContainer');
gc.addEventListener('touchstart',e=>{touchStartY=e.touches[0].clientY;},{passive:true});
gc.addEventListener('touchmove',e=>{if(touchStartY===null)return;const dy=e.touches[0].clientY-touchStartY;upHeld=dy<-8;downHeld=dy>8;},{passive:true});
gc.addEventListener('touchend',()=>{upHeld=false;downHeld=false;touchStartY=null;},{passive:true});

document.getElementById('gamePlayBtn').addEventListener('click',startGame);

// Mobile boost button
const boostBtn=document.getElementById('boostBtn');
boostBtn.addEventListener('touchstart',e=>{e.preventDefault();boostHeld=true;boostBtn.classList.add('active');},{passive:false});
boostBtn.addEventListener('touchend',e=>{e.preventDefault();boostHeld=false;boostBtn.classList.remove('active');},{passive:false});
boostBtn.addEventListener('touchcancel',()=>{boostHeld=false;boostBtn.classList.remove('active');});

// Draw idle frame
(function(){const grd=ctx.createLinearGradient(0,0,0,H);grd.addColorStop(0,'#003d6b');grd.addColorStop(1,'#001529');ctx.fillStyle=grd;ctx.fillRect(0,0,W,H);const sg=ctx.createLinearGradient(0,H-28,0,H);sg.addColorStop(0,'#8b6914');sg.addColorStop(1,'#5a4010');ctx.fillStyle=sg;ctx.fillRect(0,H-28,W,28);})();

function exitGame(){
  if(gameState==='playing'){cancelAnimationFrame(gameRaf);gameState='idle';}
  navigate('home');
}
