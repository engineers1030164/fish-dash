// ══════════════════════════════════════════════════════════════════════════
// CITY STARS — localStorage
// ══════════════════════════════════════════════════════════════════════════
const CITY_KEY='siddhArcade_cityStats';
function loadCityStats(){
  try{return JSON.parse(localStorage.getItem(CITY_KEY))||defaultCityStats();}catch(e){return defaultCityStats();}
}
function defaultCityStats(){
  return{totalMoney:0,weeklyMoney:0,bestRun:0,gamesPlayed:0,weekStart:getWeekStart()};
}
function saveCityStats(s){localStorage.setItem(CITY_KEY,JSON.stringify(s));}
function getWeekStart(){
  const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-d.getDay());return d.toISOString();
}
function recordCityRun(earned){
  const s=loadCityStats();
  const ws=getWeekStart();
  if(s.weekStart!==ws){s.weeklyMoney=0;s.weekStart=ws;}
  s.totalMoney+=earned;
  s.weeklyMoney+=earned;
  s.gamesPlayed++;
  if(earned>s.bestRun) s.bestRun=earned;
  saveCityStats(s);
}

// ══════════════════════════════════════════════════════════════════════════
// CITY STARS — Game Engine
// ══════════════════════════════════════════════════════════════════════════
const cc=document.getElementById('cityCanvas');
const cx2=cc.getContext('2d');
const CW=520, CH=380;
cc.width=CW; cc.height=CH;

let cityState='idle', cityRaf;
let cityMoney=0, cityStarCount=0, cityTimeLeft=60, cityTimerInterval=null;
let player, cityStars=[], cityObstacles=[], cityParticles=[];
let cityPlatforms=[], cityBgLayers=[], cityLights=[];
let cityScrollX=0, cityTapTarget=null, cityFrame=0;

const GROUND=CH-50;
const STAR_TYPES=[
  {type:'bronze',emoji:'⭐',value:10,color:'#cd7f32',r:12,weight:50},
  {type:'silver',emoji:'🌟',value:20,color:'#c0c0c0',r:13,weight:30},
  {type:'gold',  emoji:'💫',value:50,color:'#ffd700',r:14,weight:15},
  {type:'diamond',emoji:'💎',value:100,color:'#a0f0ff',r:15,weight:5},
];

function cityRnd(a,b){return a+Math.random()*(b-a);}
function cityRndInt(a,b){return Math.floor(cityRnd(a,b+1));}
function pickStarType(){
  const total=STAR_TYPES.reduce((s,t)=>s+t.weight,0);
  let r=Math.random()*total;
  for(const t of STAR_TYPES){r-=t.weight;if(r<=0)return t;}
  return STAR_TYPES[0];
}

function initCityGame(){
  cityMoney=0; cityStarCount=0; cityTimeLeft=60; cityFrame=0;
  cityScrollX=0; cityTapTarget=null; cityStars=[]; cityObstacles=[]; cityParticles=[];
  cityPlatforms=[];

  // Three layers of buildings for parallax
  cityBgLayers=[
    Array.from({length:16},(_,i)=>({x:i*85+cityRnd(0,30),w:cityRnd(30,70),h:cityRnd(80,220),color:'#0d0826',windows:cityRndInt(1,3)})),
    Array.from({length:14},(_,i)=>({x:i*100+cityRnd(0,40),w:cityRnd(40,85),h:cityRnd(60,180),color:'#1a1040',neon:cityRndInt(0,1),neonColor:['#ff0080','#00ffff','#ff6600','#7700ff','#00ff88'][cityRndInt(0,4)],windows:cityRndInt(2,5)})),
    Array.from({length:12},(_,i)=>({x:i*120+cityRnd(0,50),w:cityRnd(50,100),h:cityRnd(50,140),color:'#261555',neon:1,neonColor:['#ff0080','#00ffff','#ffaa00','#aa00ff'][cityRndInt(0,3)],windows:cityRndInt(3,6)})),
  ];

  // Streetlights (static relative to scroll)
  cityLights=Array.from({length:9},(_,i)=>({x:i*130+40}));

  player={x:80,y:GROUND,vy:0,vx:0,w:24,h:40,onGround:true,running:false,dir:1};

  // Spawn platforms at different heights
  for(let i=0;i<5;i++) spawnPlatform(CW+i*200+cityRnd(60,100));
  // Spawn initial stars in all 4 corner zones
  spawnStarInZone('bottom-left'); spawnStarInZone('bottom-right');
  spawnStarInZone('top-left');    spawnStarInZone('top-right');
  for(let i=0;i<4;i++) spawnStarInZone(['bottom-left','bottom-right','top-left','top-right'][i%4],CW+i*130+60);
  for(let i=0;i<3;i++) spawnObstacle(CW+i*240+180);

  document.getElementById('cityOverlay').style.display='none';
  document.getElementById('cityMoney').textContent='₹0';
  document.getElementById('cityTimer').textContent='60s';
  document.getElementById('cityStars').textContent='0';
  cityState='playing';

  if(cityTimerInterval) clearInterval(cityTimerInterval);
  cityTimerInterval=setInterval(()=>{
    if(cityState!=='playing') return;
    cityTimeLeft--;
    document.getElementById('cityTimer').textContent=cityTimeLeft+'s';
    if(cityTimeLeft<=0) endCityGame();
  },1000);

  cityLoop();
}

// Zone-based star spawning — 4 corners of the city
function spawnStarInZone(zone, forceX){
  const zones={
    'bottom-left': {xMin:0,   xMax:180, yMin:GROUND-35, yMax:GROUND-12, types:['bronze','silver']},
    'bottom-right':{xMin:340, xMax:CW,  yMin:GROUND-35, yMax:GROUND-12, types:['bronze','silver']},
    'top-left':    {xMin:0,   xMax:200, yMin:GROUND-185,yMax:GROUND-110,types:['gold','silver']},
    'top-right':   {xMin:320, xMax:CW,  yMin:GROUND-185,yMax:GROUND-110,types:['gold','diamond']},
  };
  const z=zones[zone]||zones['bottom-left'];
  const typePool=z.types;
  const typeName=typePool[cityRndInt(0,typePool.length-1)];
  const t=STAR_TYPES.find(s=>s.type===typeName)||STAR_TYPES[0];
  const x=forceX!==undefined?forceX:CW+cityRnd(z.xMin,z.xMax);
  const y=cityRnd(z.yMin,z.yMax);
  cityStars.push({x,y,t,collected:false,bobPhase:Math.random()*Math.PI*2,zone});
}

function spawnStar(x){ // fallback for legacy calls
  const zones=['bottom-left','bottom-right','top-left','top-right'];
  spawnStarInZone(zones[cityRndInt(0,3)],x);
}

function spawnPlatform(x){
  const heights=[GROUND-90, GROUND-130, GROUND-170];
  const h=heights[cityRndInt(0,heights.length-1)];
  const w=cityRnd(70,120);
  cityPlatforms.push({x,y:h,w,h:12,color:'#3d2b8a',neonColor:['#ff0080','#00ffff','#ffaa00'][cityRndInt(0,2)]});
}

function spawnObstacle(x){
  const types=[
    {w:22,h:44,color:'#e53935',label:'🚧'},
    {w:18,h:30,color:'#f57c00',label:'🪨'},
    {w:26,h:38,color:'#795548',label:'🗑'},
  ];
  const o=types[cityRndInt(0,types.length-1)];
  cityObstacles.push({x, y:GROUND, w:o.w, h:o.h, color:o.color, label:o.label});
}

function showCityOverlay(ended){
  const ov=document.getElementById('cityOverlay');
  ov.style.display='flex';
  const earned=document.getElementById('cityEarned');
  const result=document.getElementById('cityResult');
  const banner=document.getElementById('treasureBanner');
  const btn=document.getElementById('cityPlayBtn');
  if(ended){
    const cs=loadCityStats();
    ov.querySelector('h2').textContent='🏁 Time\'s Up!';
    ov.querySelector('.co-sub').textContent='Great run through the city!';
    earned.style.display='block';
    earned.textContent=`You earned ₹${cityMoney} this run`;
    result.style.display='block';
    result.textContent=`Weekly total: ₹${cs.weeklyMoney} | Best run: ₹${cs.bestRun}`;
    banner.style.display='block';
    btn.textContent='🔄 Play Again';
  } else {
    ov.querySelector('h2').textContent='⭐ City Stars';
    ov.querySelector('.co-sub').textContent='Run through the city, collect stars & earn money!';
    earned.style.display='none';
    result.style.display='none';
    banner.style.display='block';
    btn.textContent='▶ Play';
  }
}

function endCityGame(){
  cityState='ended';
  clearInterval(cityTimerInterval);
  cancelAnimationFrame(cityRaf);
  recordCityRun(cityMoney);
  cityRender();
  setTimeout(()=>showCityOverlay(true),600);
}

function showFloatScore(x,y,text,color){
  const el=document.getElementById('cityScoreFloat');
  const rect=cc.getBoundingClientRect();
  const scaleX=rect.width/CW, scaleY=rect.height/CH;
  el.textContent=text;
  el.style.color=color;
  el.style.left=(rect.left+x*scaleX)+'px';
  el.style.top=(rect.top+y*scaleY)+'px';
  el.style.transform='translateY(0px)';
  el.style.opacity='1';
  el.style.fontSize='18px';
  el.style.fontWeight='bold';
  setTimeout(()=>{el.style.transform='translateY(-40px)';el.style.opacity='0';},50);
}

function cityUpdate(){
  cityFrame++;
  const spd=3.5;

  // Move player toward tap target
  if(cityTapTarget!==null){
    const dx=cityTapTarget-player.x;
    if(Math.abs(dx)>4){player.vx=Math.sign(dx)*spd;player.running=true;player.dir=Math.sign(dx);}
    else{player.vx=0;player.running=false;cityTapTarget=null;}
  } else {
    player.vx*=0.8;
    if(Math.abs(player.vx)<0.3){player.running=false;}
  }

  // Gravity
  if(!player.onGround) player.vy+=0.65;
  player.y+=player.vy;
  player.x=Math.max(18,Math.min(CW-18,player.x+player.vx));

  // Ground collision
  if(player.y>=GROUND){player.y=GROUND;player.vy=0;player.onGround=true;}

  // Platform collision
  player.onGround=player.onGround||(player.y>=GROUND);
  for(const pl of cityPlatforms){
    const onTop=player.vy>=0&&player.y-4<=pl.y&&player.y+4>=pl.y&&player.x>pl.x-pl.w/2-8&&player.x<pl.x+pl.w/2+8;
    if(onTop){player.y=pl.y;player.vy=0;player.onGround=true;}
  }

  // Scroll world
  cityScrollX+=spd;

  // Scroll everything
  cityStars.forEach(s=>s.x-=spd);
  cityObstacles.forEach(o=>o.x-=spd);
  cityPlatforms.forEach(p=>p.x-=spd);

  // Remove off-screen platforms, spawn new
  cityPlatforms=cityPlatforms.filter(p=>{
    if(p.x+p.w/2<-20){spawnPlatform(CW+cityRnd(80,160));return false;}
    return true;
  });

  // Remove off-screen stars, spawn in balanced zones
  const zones=['bottom-left','bottom-right','top-left','top-right'];
  cityStars=cityStars.filter(s=>{
    if(s.x<-30){spawnStarInZone(zones[cityRndInt(0,3)],CW+cityRnd(60,140));return false;}
    return true;
  });
  cityObstacles=cityObstacles.filter(o=>{
    if(o.x<-40){spawnObstacle(CW+cityRnd(100,220));return false;}
    return true;
  });

  // Collect stars
  cityStars.forEach(s=>{
    if(s.collected) return;
    const dx=player.x-s.x, dy=(player.y-20)-s.y;
    if(Math.sqrt(dx*dx+dy*dy)<s.t.r+18){
      s.collected=true;
      cityMoney+=s.t.value; cityStarCount++;
      document.getElementById('cityMoney').textContent='₹'+cityMoney;
      document.getElementById('cityStars').textContent=cityStarCount;
      showFloatScore(s.x,s.y,'+₹'+s.t.value,s.t.color);
      for(let i=0;i<10;i++){
        const a=Math.random()*Math.PI*2,sp=cityRnd(1.5,4);
        cityParticles.push({x:s.x,y:s.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-1.5,life:1,color:s.t.color,r:cityRnd(2,5)});
      }
    }
  });
  cityStars=cityStars.filter(s=>!s.collected);

  // Obstacle collision
  cityObstacles.forEach(o=>{
    const px=player.x,py=player.y;
    if(px+10>o.x-o.w/2&&px-10<o.x+o.w/2&&py>o.y-o.h&&py<=o.y+4){
      player.vx=-player.vx*1.4; player.vy=-6; player.onGround=false; cityTapTarget=null;
    }
  });

  // Particles
  cityParticles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=0.1;p.life-=0.035;});
  cityParticles=cityParticles.filter(p=>p.life>0);

  // Periodic bonus star in all 4 corners
  if(cityFrame%(60*4)===0){
    zones.forEach(z=>spawnStarInZone(z,CW+cityRnd(40,100)));
  }
}

function cityRender(){
  cx2.clearRect(0,0,CW,CH);

  // ── SKY: deep purple/indigo neon night ──
  const skyG=cx2.createLinearGradient(0,0,0,GROUND);
  skyG.addColorStop(0,'#06001f');
  skyG.addColorStop(0.5,'#130540');
  skyG.addColorStop(1,'#2a0e6e');
  cx2.fillStyle=skyG; cx2.fillRect(0,0,CW,GROUND);

  // City glow on horizon
  const horizG=cx2.createLinearGradient(0,GROUND-70,0,GROUND);
  horizG.addColorStop(0,'transparent');
  horizG.addColorStop(1,'rgba(120,40,255,0.18)');
  cx2.fillStyle=horizG; cx2.fillRect(0,GROUND-70,CW,70);

  // Moon with glow halo
  cx2.save();
  const mg=cx2.createRadialGradient(CW-70,38,6,CW-70,38,48);
  mg.addColorStop(0,'rgba(220,210,255,0.25)'); mg.addColorStop(1,'transparent');
  cx2.fillStyle=mg; cx2.beginPath(); cx2.arc(CW-70,38,48,0,Math.PI*2); cx2.fill();
  cx2.fillStyle='#e8e0ff'; cx2.beginPath(); cx2.arc(CW-70,38,20,0,Math.PI*2); cx2.fill();
  cx2.fillStyle='rgba(200,180,255,0.4)'; cx2.beginPath(); cx2.arc(CW-70,38,24,0,Math.PI*2); cx2.fill();
  cx2.restore();

  // Sky twinkle stars
  cx2.save();
  const skyStarSeeds=[[22,14],[68,8],[115,22],[180,6],[240,18],[310,12],[375,28],[440,7],[490,20],[145,35],[285,9],[420,32],[55,40],[340,5]];
  skyStarSeeds.forEach(([bx,by],i)=>{
    const sx=((bx+cityScrollX*(0.01+i%3*0.005))%(CW)+CW)%CW;
    const twinkle=0.3+Math.sin(cityFrame*0.04+i*1.3)*0.5;
    cx2.globalAlpha=Math.max(0,twinkle)*0.8;
    cx2.fillStyle='#fff';
    cx2.beginPath(); cx2.arc(sx,by,i%3===0?1.5:0.8,0,Math.PI*2); cx2.fill();
  });
  cx2.restore();

  // ── LAYER 1: far silhouette buildings (parallax 0.12x) ──
  cx2.save();
  cityBgLayers[0].forEach(b=>{
    const bx=((b.x-cityScrollX*0.12)%(CW+200)+CW+200)%(CW+200)-80;
    cx2.fillStyle='#0c0526';
    cx2.fillRect(bx,GROUND-b.h,b.w,b.h);
    // Subtle lit windows
    cx2.fillStyle='rgba(180,160,255,0.12)';
    for(let wy=GROUND-b.h+8;wy<GROUND-8;wy+=16)
      for(let wx=bx+5;wx<bx+b.w-5;wx+=12)
        if((wx*7+wy*3)%11>4) cx2.fillRect(wx,wy,6,8);
  });
  cx2.restore();

  // ── LAYER 2: mid buildings with neon signs (parallax 0.35x) ──
  cx2.save();
  cityBgLayers[1].forEach(b=>{
    const bx=((b.x-cityScrollX*0.35)%(CW+200)+CW+200)%(CW+200)-80;
    cx2.fillStyle=b.color;
    cx2.fillRect(bx,GROUND-b.h,b.w,b.h);
    // Windows
    cx2.fillStyle='rgba(255,240,120,0.2)';
    for(let wy=GROUND-b.h+10;wy<GROUND-10;wy+=16)
      for(let wx=bx+5;wx<bx+b.w-5;wx+=13)
        if((wx+wy)%7>2) cx2.fillRect(wx,wy,7,9);
    // Neon sign strip
    if(b.neon){
      cx2.save();
      cx2.shadowColor=b.neonColor; cx2.shadowBlur=10;
      cx2.fillStyle=b.neonColor+'aa';
      cx2.fillRect(bx+4,GROUND-b.h-4,b.w-8,5);
      cx2.fillStyle=b.neonColor;
      cx2.fillRect(bx+4,GROUND-b.h-4,b.w-8,3);
      cx2.restore();
    }
  });
  cx2.restore();

  // ── LAYER 3: near buildings with bright neon (parallax 0.65x) ──
  cx2.save();
  cityBgLayers[2].forEach(b=>{
    const bx=((b.x-cityScrollX*0.65)%(CW+200)+CW+200)%(CW+200)-80;
    cx2.fillStyle=b.color;
    cx2.beginPath(); cx2.roundRect(bx,GROUND-b.h,b.w,b.h,3); cx2.fill();
    // Bright windows
    cx2.fillStyle='rgba(255,230,80,0.35)';
    for(let wy=GROUND-b.h+8;wy<GROUND-8;wy+=15)
      for(let wx=bx+5;wx<bx+b.w-5;wx+=12)
        if((wx*3+wy)%9>3) cx2.fillRect(wx,wy,6,8);
    // Neon sign
    cx2.save();
    cx2.shadowColor=b.neonColor; cx2.shadowBlur=14;
    cx2.fillStyle=b.neonColor;
    cx2.fillRect(bx+6,GROUND-b.h-2,b.w-12,4);
    // Vertical neon edge
    cx2.fillRect(bx+2,GROUND-b.h-2,3,b.h*0.3);
    cx2.restore();
    // Rooftop antenna
    cx2.strokeStyle='#444'; cx2.lineWidth=2;
    cx2.beginPath(); cx2.moveTo(bx+b.w/2,GROUND-b.h); cx2.lineTo(bx+b.w/2,GROUND-b.h-14); cx2.stroke();
    cx2.fillStyle='#ff3333'; cx2.beginPath(); cx2.arc(bx+b.w/2,GROUND-b.h-15,2.5,0,Math.PI*2); cx2.fill();
  });
  cx2.restore();

  // ── STREETLIGHTS ──
  cityLights.forEach(l=>{
    const lx=((l.x-cityScrollX*1.0)%(CW+130)+CW+130)%(CW+130)-30;
    // Pole
    cx2.strokeStyle='#4a4a6a'; cx2.lineWidth=3;
    cx2.beginPath(); cx2.moveTo(lx,GROUND); cx2.lineTo(lx,GROUND-80); cx2.stroke();
    // Arm
    cx2.beginPath(); cx2.moveTo(lx,GROUND-78); cx2.lineTo(lx+18,GROUND-78); cx2.stroke();
    // Lamp glow
    cx2.save();
    cx2.shadowColor='#ffe066'; cx2.shadowBlur=20;
    cx2.fillStyle='#ffe066';
    cx2.beginPath(); cx2.arc(lx+18,GROUND-78,5,0,Math.PI*2); cx2.fill();
    cx2.restore();
    // Cone of light on ground
    cx2.save(); cx2.globalAlpha=0.07;
    const coneG=cx2.createRadialGradient(lx+18,GROUND-78,0,lx+18,GROUND,40);
    coneG.addColorStop(0,'#ffe066'); coneG.addColorStop(1,'transparent');
    cx2.fillStyle=coneG;
    cx2.beginPath(); cx2.moveTo(lx+18,GROUND-78); cx2.lineTo(lx-22,GROUND); cx2.lineTo(lx+58,GROUND); cx2.closePath(); cx2.fill();
    cx2.restore();
  });

  // ── GROUND: sidewalk + road ──
  // Sidewalk
  cx2.fillStyle='#2e2e3a'; cx2.fillRect(0,GROUND,CW,14);
  cx2.fillStyle='rgba(255,255,255,0.04)';
  for(let sx=((cityScrollX*0.5)%60|0);sx<CW;sx+=60) cx2.fillRect(sx,GROUND,28,14);
  // Road
  const rdG=cx2.createLinearGradient(0,GROUND+14,0,CH);
  rdG.addColorStop(0,'#161616'); rdG.addColorStop(1,'#0a0a0a');
  cx2.fillStyle=rdG; cx2.fillRect(0,GROUND+14,CW,CH-GROUND-14);
  // Road edge line
  cx2.strokeStyle='rgba(255,220,0,0.35)'; cx2.lineWidth=2; cx2.setLineDash([]);
  cx2.beginPath(); cx2.moveTo(0,GROUND+14); cx2.lineTo(CW,GROUND+14); cx2.stroke();
  // Center dashes
  cx2.strokeStyle='rgba(255,255,255,0.18)'; cx2.lineWidth=2.5; cx2.setLineDash([22,18]);
  const doff=(cityScrollX*0.9)%40;
  cx2.beginPath(); cx2.moveTo(-doff,GROUND+32); cx2.lineTo(CW,GROUND+32); cx2.stroke();
  cx2.setLineDash([]);

  // ── PLATFORMS (rooftop ledges) ──
  cityPlatforms.forEach(pl=>{
    // Platform body
    cx2.save();
    cx2.shadowColor=pl.neonColor; cx2.shadowBlur=12;
    cx2.fillStyle='#2a1a5e';
    cx2.beginPath(); cx2.roundRect(pl.x-pl.w/2,pl.y,pl.w,pl.h,3); cx2.fill();
    // Neon edge on top
    cx2.fillStyle=pl.neonColor;
    cx2.fillRect(pl.x-pl.w/2+2,pl.y,pl.w-4,2);
    cx2.restore();
    // Corner indicator arrows
    cx2.save(); cx2.globalAlpha=0.5+Math.sin(cityFrame*0.12)*0.3;
    cx2.fillStyle='#fff'; cx2.font='10px serif'; cx2.textAlign='center';
    cx2.fillText('▲',pl.x,pl.y-4);
    cx2.restore();
  });

  // ── OBSTACLES ──
  cityObstacles.forEach(o=>{
    cx2.fillStyle=o.color;
    cx2.beginPath(); cx2.roundRect(o.x-o.w/2,o.y-o.h,o.w,o.h,4); cx2.fill();
    cx2.font=`${Math.min(o.w,o.h)*0.85}px serif`;
    cx2.textAlign='center'; cx2.textBaseline='middle';
    cx2.fillText(o.label,o.x,o.y-o.h*0.5);
  });

  // ── STARS ──
  cityStars.forEach(s=>{
    const bob=Math.sin(cityFrame*0.09+s.bobPhase)*5;
    cx2.save(); cx2.translate(s.x,s.y+bob);
    // Outer glow
    const gl=cx2.createRadialGradient(0,0,1,0,0,s.t.r*2.5);
    gl.addColorStop(0,s.t.color+'99'); gl.addColorStop(1,'transparent');
    cx2.fillStyle=gl; cx2.beginPath(); cx2.arc(0,0,s.t.r*2.5,0,Math.PI*2); cx2.fill();
    // Pulsing ring
    cx2.save(); cx2.globalAlpha=0.25+Math.sin(cityFrame*0.12+s.bobPhase)*0.2;
    cx2.strokeStyle=s.t.color; cx2.lineWidth=1.5;
    cx2.beginPath(); cx2.arc(0,0,s.t.r*1.8,0,Math.PI*2); cx2.stroke();
    cx2.restore();
    // Emoji
    cx2.font=`${s.t.r*2.2}px serif`; cx2.textAlign='center'; cx2.textBaseline='middle';
    cx2.fillText(s.t.emoji,0,0);
    cx2.restore();
  });

  // ── PARTICLES ──
  cityParticles.forEach(p=>{
    cx2.save(); cx2.globalAlpha=p.life; cx2.fillStyle=p.color;
    cx2.beginPath(); cx2.arc(p.x,p.y,p.r*p.life,0,Math.PI*2); cx2.fill(); cx2.restore();
  });

  // ── PLAYER: cartoon character ──
  drawCityPlayer();

  // ── HUD time bar ──
  cx2.fillStyle='rgba(0,0,0,0.4)'; cx2.fillRect(8,CH-10,CW-16,6);
  const pct=cityTimeLeft/60;
  const barC=pct>0.5?'#00e5ff':pct>0.25?'#ffd700':'#ff5252';
  cx2.save(); cx2.shadowColor=barC; cx2.shadowBlur=8;
  cx2.fillStyle=barC; cx2.fillRect(8,CH-10,(CW-16)*pct,6);
  cx2.restore();
}

function drawCityPlayer(){
  const p=player;
  const run=p.running;
  const leg=run?Math.sin(cityFrame*0.28)*12:0;
  const arm=run?Math.sin(cityFrame*0.28+Math.PI)*10:0;
  const bob=run?Math.abs(Math.sin(cityFrame*0.28))*2:0;
  const flip=p.dir<0;

  cx2.save();
  cx2.translate(p.x, p.y-bob);
  if(flip) cx2.scale(-1,1);

  // ── Shoes ──
  cx2.fillStyle='#f0f0f0';
  cx2.beginPath(); cx2.roundRect(-13+leg*0.4,0,14,7,3); cx2.fill();
  cx2.beginPath(); cx2.roundRect(2-leg*0.4,0,14,7,3); cx2.fill();
  cx2.fillStyle='#cc2200';
  cx2.fillRect(-13+leg*0.4,0,14,3);
  cx2.fillRect(2-leg*0.4,0,14,3);

  // ── Pants (dark) ──
  cx2.fillStyle='#1a1a2e';
  cx2.beginPath(); cx2.moveTo(-4,-2); cx2.lineTo(-4+leg*0.5,-22); cx2.lineTo(4+leg*0.5,-22); cx2.lineTo(4,-2); cx2.closePath(); cx2.fill();
  // Left leg
  cx2.fillStyle='#1a1a2e';
  cx2.save(); cx2.translate(-6,-12); cx2.rotate(leg*0.04);
  cx2.fillRect(-4,0,8,14); cx2.restore();
  // Right leg
  cx2.save(); cx2.translate(6,-12); cx2.rotate(-leg*0.04);
  cx2.fillRect(-4,0,8,14); cx2.restore();

  // ── Hoodie body ──
  cx2.fillStyle='#e65100';
  cx2.beginPath(); cx2.roundRect(-12,-38,24,18,4); cx2.fill();
  // Hoodie pocket
  cx2.fillStyle='rgba(0,0,0,0.2)';
  cx2.beginPath(); cx2.roundRect(-5,-32,10,8,3); cx2.fill();
  // Zip line
  cx2.strokeStyle='rgba(0,0,0,0.3)'; cx2.lineWidth=1.5;
  cx2.beginPath(); cx2.moveTo(0,-38); cx2.lineTo(0,-22); cx2.stroke();

  // ── Arms ──
  cx2.strokeStyle='#e65100'; cx2.lineWidth=7; cx2.lineCap='round';
  // Left arm
  cx2.beginPath(); cx2.moveTo(-10,-34); cx2.lineTo(-18,-26+arm); cx2.stroke();
  // Right arm
  cx2.beginPath(); cx2.moveTo(10,-34); cx2.lineTo(18,-26-arm); cx2.stroke();
  // Hands
  cx2.fillStyle='#ffcc80';
  cx2.beginPath(); cx2.arc(-18,-26+arm,4,0,Math.PI*2); cx2.fill();
  cx2.beginPath(); cx2.arc(18,-26-arm,4,0,Math.PI*2); cx2.fill();

  // ── Neck ──
  cx2.fillStyle='#ffcc80';
  cx2.fillRect(-4,-42,8,6);

  // ── Head ──
  cx2.fillStyle='#ffcc80';
  cx2.beginPath(); cx2.arc(0,-52,13,0,Math.PI*2); cx2.fill();
  // Jawline shade
  cx2.fillStyle='rgba(180,100,50,0.12)';
  cx2.beginPath(); cx2.arc(0,-48,10,0,Math.PI); cx2.fill();

  // ── Eyes ──
  cx2.fillStyle='#1a1a1a';
  cx2.beginPath(); cx2.arc(-5,-53,2.2,0,Math.PI*2); cx2.fill();
  cx2.beginPath(); cx2.arc(5,-53,2.2,0,Math.PI*2); cx2.fill();
  cx2.fillStyle='#fff';
  cx2.beginPath(); cx2.arc(-4.2,-53.8,0.9,0,Math.PI*2); cx2.fill();
  cx2.beginPath(); cx2.arc(5.8,-53.8,0.9,0,Math.PI*2); cx2.fill();
  // Eyebrows
  cx2.strokeStyle='#5d3a1a'; cx2.lineWidth=1.5;
  cx2.beginPath(); cx2.moveTo(-8,-56); cx2.lineTo(-2,-55); cx2.stroke();
  cx2.beginPath(); cx2.moveTo(8,-56); cx2.lineTo(2,-55); cx2.stroke();

  // ── Smile ──
  cx2.strokeStyle='#c0392b'; cx2.lineWidth=1.5;
  cx2.beginPath(); cx2.arc(0,-50,4,0.2,Math.PI-0.2); cx2.stroke();

  // ── Baseball cap ──
  cx2.fillStyle='#1565c0';
  cx2.beginPath(); cx2.arc(0,-60,13,Math.PI,2*Math.PI); cx2.fill();
  cx2.fillRect(-13,-62,26,6);
  // Cap brim
  cx2.fillStyle='#0d47a1';
  cx2.beginPath(); cx2.roundRect(-4,-64,22,5,2); cx2.fill();
  // Cap button
  cx2.fillStyle='#fff'; cx2.beginPath(); cx2.arc(0,-73,2.5,0,Math.PI*2); cx2.fill();

  // ── Hair peeking under cap ──
  cx2.fillStyle='#3e2000';
  cx2.beginPath(); cx2.arc(-10,-62,4,Math.PI,2*Math.PI); cx2.fill();

  cx2.restore();
}

function cityLoop(){
  if(cityState!=='playing') return;
  cityUpdate(); cityRender();
  cityRaf=requestAnimationFrame(cityLoop);
}

// City controls — tap to move, tap above player to jump
const cityContainer=document.getElementById('cityContainer');
cityContainer.addEventListener('click',e=>{
  if(cityState!=='playing') return;
  const rect=cc.getBoundingClientRect();
  const tapX=(e.clientX-rect.left)*(CW/rect.width);
  const tapY=(e.clientY-rect.top)*(CH/rect.height);
  // If tap is above player head, jump
  if(tapY<player.y-player.h-10&&player.onGround){
    player.vy=-12; player.onGround=false;
  }
  cityTapTarget=tapX;
});

// Swipe to jump on mobile
let cityTouchStartX=null, cityTouchStartY2=null;
cityContainer.addEventListener('touchstart',e=>{
  if(cityState!=='playing') return;
  cityTouchStartX=e.touches[0].clientX;
  cityTouchStartY2=e.touches[0].clientY;
},{passive:true});
cityContainer.addEventListener('touchend',e=>{
  if(cityState!=='playing') return;
  const dx=e.changedTouches[0].clientX-cityTouchStartX;
  const dy=e.changedTouches[0].clientY-cityTouchStartY2;
  if(dy<-30&&Math.abs(dy)>Math.abs(dx)&&player.onGround){
    // Swipe up = jump
    player.vy=-12; player.onGround=false;
  } else {
    // Tap = move
    const rect=cc.getBoundingClientRect();
    const tapX=(e.changedTouches[0].clientX-rect.left)*(CW/rect.width);
    cityTapTarget=tapX;
  }
},{passive:true});

// Keyboard for desktop
document.addEventListener('keydown',e=>{
  if(currentPage!=='city') return;
  if((e.key==='ArrowUp'||e.key===' ')&&player.onGround){e.preventDefault();player.vy=-12;player.onGround=false;}
  if(e.key==='ArrowLeft'){e.preventDefault();cityTapTarget=player.x-100;}
  if(e.key==='ArrowRight'){e.preventDefault();cityTapTarget=player.x+100;}
});

document.getElementById('cityPlayBtn').addEventListener('click',initCityGame);

// Draw idle frame for city canvas
(function(){
  const g=cx2.createLinearGradient(0,0,0,CH);
  g.addColorStop(0,'#0d1b3e'); g.addColorStop(1,'#0d0d2b');
  cx2.fillStyle=g; cx2.fillRect(0,0,CW,CH);
  cx2.fillStyle='rgba(255,215,0,0.6)'; cx2.font='48px serif';
  cx2.textAlign='center'; cx2.fillText('⭐',CW/2,CH/2-10);
  cx2.fillStyle='rgba(255,255,255,0.4)'; cx2.font='14px Segoe UI';
  cx2.fillText('City Stars',CW/2,CH/2+28);
})();

function exitCityGame(){
  if(cityState==='playing'){cancelAnimationFrame(cityRaf);cityState='idle';}
  navigate('home');
}
