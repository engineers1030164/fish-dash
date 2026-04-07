// ══════════════════════════════════════════════════════════════════════════
// CITY STARS — responsive, phone-optimised, engaging
// ══════════════════════════════════════════════════════════════════════════
const CITY_KEY='siddhArcade_cityStats';
function loadCityStats(){try{return JSON.parse(localStorage.getItem(CITY_KEY))||defaultCityStats();}catch(e){return defaultCityStats();}}
function defaultCityStats(){return{totalMoney:0,weeklyMoney:0,bestRun:0,gamesPlayed:0,weekStart:getWeekStart()};}
function saveCityStats(s){localStorage.setItem(CITY_KEY,JSON.stringify(s));}
function getWeekStart(){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-d.getDay());return d.toISOString();}
function recordCityRun(earned){
  const s=loadCityStats();const ws=getWeekStart();
  if(s.weekStart!==ws){s.weeklyMoney=0;s.weekStart=ws;}
  s.totalMoney+=earned;s.weeklyMoney+=earned;s.gamesPlayed++;
  if(earned>s.bestRun)s.bestRun=earned;saveCityStats(s);
}

// ══════════════════════════════════════════════════════════════════════════
// Setup — responsive canvas
// ══════════════════════════════════════════════════════════════════════════
const cc=document.getElementById('cityCanvas');
const cx2=cc.getContext('2d');
let CW=520,CH=380,TW=40,TH=20,FLOOR_HEIGHT=24;

function cityResize(){
  const cont=document.getElementById('cityContainer');
  CW=Math.max(280,cont.clientWidth||520);
  CH=Math.max(300,cont.clientHeight||380);
  cc.width=CW; cc.height=CH;
  // Scale tiles to fill canvas: grid spans 6*TW wide, 3*TW tall
  TW=Math.max(28,Math.floor(Math.min(CW/6, (CH-60)/3.2)));
  TH=Math.floor(TW/2);
  FLOOR_HEIGHT=TH*2;
}

const COLS=8,ROWS=6;
const TOTAL_FLOORS=16;
const T={EMPTY:0,WALL:1,FURN:2,ELEV:3,STAIRS_UP:4,STAIRS_DOWN:5,CAR:6,PARK_MARK:7};

const STAR_TYPES=[
  {type:'bronze',emoji:'⭐',value:10,color:'#cd7f32',r:8},
  {type:'silver',emoji:'🌟',value:20,color:'#c0c0c0',r:9},
  {type:'gold',  emoji:'💫',value:50,color:'#ffd700',r:10},
  {type:'diamond',emoji:'💎',value:100,color:'#a0f0ff',r:11},
];

const FLOOR_THEMES=[
  {name:'Parking',floor:'#555',wall:'#444',accent:'#ffd700',furn:'#666'},
  {name:'Lobby',  floor:'#c4a882',wall:'#8b7355',accent:'#d4a574',furn:'#6b4226'},
  {name:'Office', floor:'#c9b896',wall:'#8b7355',accent:'#b8956a',furn:'#5c3a1e'},
  {name:'Office', floor:'#bfae8e',wall:'#8b6f47',accent:'#a0845a',furn:'#654321'},
  {name:'Office', floor:'#c0aa84',wall:'#8b7355',accent:'#b89060',furn:'#5a3a20'},
  {name:'Corp',   floor:'#7ab0c4',wall:'#3a7a8a',accent:'#00bcd4',furn:'#2a5a6a'},
  {name:'Corp',   floor:'#6ca0b8',wall:'#357080',accent:'#0097a7',furn:'#255060'},
  {name:'Corp',   floor:'#5e94ae',wall:'#306878',accent:'#00838f',furn:'#204858'},
  {name:'Corp',   floor:'#5088a4',wall:'#2b6070',accent:'#006978',furn:'#1c4050'},
  {name:'Suite',  floor:'#8bc4a0',wall:'#4a8a60',accent:'#66bb6a',furn:'#3a6a48'},
  {name:'Suite',  floor:'#7eb894',wall:'#448058',accent:'#4caf50',furn:'#346040'},
  {name:'Suite',  floor:'#72ac88',wall:'#3e7650',accent:'#43a047',furn:'#2e5638'},
  {name:'Suite',  floor:'#68a27e',wall:'#386c48',accent:'#388e3c',furn:'#284c30'},
  {name:'Pent.',  floor:'#c4a0d4',wall:'#7a4a9a',accent:'#ab47bc',furn:'#6a3a8a'},
  {name:'Pent.',  floor:'#d4b080',wall:'#a07030',accent:'#ffd700',furn:'#806020'},
  {name:'Pent.',  floor:'#e0c090',wall:'#b08040',accent:'#ffd700',furn:'#907030'},
];

let cityState='idle',cityRaf;
let cityMoney=0,cityStarCount=0,cityTimeLeft=60,cityTimerInterval=null;
let cityFrame=0;
let floors=[];
let allStars=[];
let cPlayer;
let currentFloor=0;
let elevatorOpen=false;
let transAnim=null;
let cityParticles=[];
let goldenStar=null;
let goldenBanner=0,goldenBannerFloor=-1,goldenSpawnTimer=0;
// Engagement additions
let cityCombo=0,cityComboTimer=0;
let cityFlashTimer=0,cityFlashColor='#fff';
let cityRushMode=false;

// ══════════════════════════════════════════════════════════════════════════
// Isometric Math (uses dynamic TW/TH)
// ══════════════════════════════════════════════════════════════════════════
function isoOrigin(){
  // Center grid vertically: grid goes from originY down to originY+3*TW
  return{x:CW/2, y:Math.round(Math.max(TW*0.5+10, (CH-3*TW)/2))};
}
function toScreen(tx,ty){
  const o=isoOrigin();
  return{x:o.x+(tx-ty)*(TW/2), y:o.y+(tx+ty)*(TH/2)};
}
function toTile(sx,sy){
  const o=isoOrigin();
  const rx=sx-o.x,ry=sy-o.y;
  const tx=(rx/(TW/2)+ry/(TH/2))/2;
  const ty=(ry/(TH/2)-rx/(TW/2))/2;
  return{tx:Math.round(tx),ty:Math.round(ty)};
}

// ══════════════════════════════════════════════════════════════════════════
// Floor Generation
// ══════════════════════════════════════════════════════════════════════════
function generateFloor(fi){
  const grid=[];
  for(let y=0;y<ROWS;y++){
    grid[y]=[];
    for(let x=0;x<COLS;x++) grid[y][x]=(y===0||y===ROWS-1||x===0||x===COLS-1)?T.WALL:T.EMPTY;
  }
  grid[2][0]=T.ELEV;grid[3][0]=T.ELEV;grid[2][1]=T.EMPTY;grid[3][1]=T.EMPTY;
  if(fi<TOTAL_FLOORS-1) grid[2][COLS-1]=T.STAIRS_UP;
  if(fi>0) grid[3][COLS-1]=T.STAIRS_DOWN;
  grid[2][COLS-2]=T.EMPTY;grid[3][COLS-2]=T.EMPTY;
  if(fi===0){
    for(let y=1;y<ROWS-1;y++) for(let x=2;x<COLS-2;x++){
      if(Math.random()<0.3) grid[y][x]=T.CAR;
      else if(Math.random()<0.2) grid[y][x]=T.PARK_MARK;
    }
    [2,3].forEach(y=>{for(let x=2;x<6;x++) grid[y][x]=T.EMPTY;});
  } else {
    if(fi%3===0){grid[2][3]=T.WALL;grid[3][3]=T.WALL;}
    if(fi%4===1){grid[1][5]=T.WALL;grid[2][5]=T.WALL;}
    const furnCount=2+Math.floor(Math.random()*3);
    for(let f=0;f<furnCount;f++){
      const fx=2+Math.floor(Math.random()*(COLS-4));
      const fy=1+Math.floor(Math.random()*(ROWS-2));
      if(grid[fy][fx]===T.EMPTY) grid[fy][fx]=T.FURN;
    }
  }
  return grid;
}

function isWalkable(grid,tx,ty){
  if(tx<0||tx>=COLS||ty<0||ty>=ROWS) return false;
  const t=grid[ty][tx];
  return t===T.EMPTY||t===T.ELEV||t===T.STAIRS_UP||t===T.STAIRS_DOWN||t===T.PARK_MARK;
}

// ══════════════════════════════════════════════════════════════════════════
// Star Placement
// ══════════════════════════════════════════════════════════════════════════
function placeStars(){
  allStars=[];
  for(let fi=0;fi<TOTAL_FLOORS;fi++){
    const count=2+Math.floor(Math.random()*2);
    const grid=floors[fi];
    for(let s=0;s<count;s++){
      let type;
      if(fi<4) type=Math.random()<0.7?STAR_TYPES[0]:STAR_TYPES[1];
      else if(fi<8) type=Math.random()<0.5?STAR_TYPES[1]:(Math.random()<0.6?STAR_TYPES[0]:STAR_TYPES[2]);
      else if(fi<12) type=Math.random()<0.5?STAR_TYPES[2]:(Math.random()<0.6?STAR_TYPES[1]:STAR_TYPES[3]);
      else type=Math.random()<0.5?STAR_TYPES[3]:(Math.random()<0.6?STAR_TYPES[2]:STAR_TYPES[1]);
      let placed=false;
      for(let att=0;att<20&&!placed;att++){
        const tx=1+Math.floor(Math.random()*(COLS-2));
        const ty=1+Math.floor(Math.random()*(ROWS-2));
        if(grid[ty][tx]===T.EMPTY){
          const nearSpecial=(tx<=1&&(ty===2||ty===3))||(tx>=COLS-2&&(ty===2||ty===3));
          if(!nearSpecial){allStars.push({floor:fi,tx,ty,type,collected:false,bob:Math.random()*6.28});placed=true;}
        }
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// A* Pathfinding
// ══════════════════════════════════════════════════════════════════════════
function findPath(grid,sx,sy,ex,ey){
  if(!isWalkable(grid,ex,ey)) return null;
  const key=(x,y)=>x+','+y;
  const open=[{x:sx,y:sy,g:0,h:Math.abs(ex-sx)+Math.abs(ey-sy),parent:null}];
  const closed=new Set();closed.add(key(sx,sy));
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  while(open.length>0){
    open.sort((a,b)=>(a.g+a.h)-(b.g+b.h));
    const cur=open.shift();
    if(cur.x===ex&&cur.y===ey){
      const path=[];let n=cur;
      while(n){path.unshift({x:n.x,y:n.y});n=n.parent;}
      return path;
    }
    for(const[dx,dy] of dirs){
      const nx=cur.x+dx,ny=cur.y+dy,k=key(nx,ny);
      if(!closed.has(k)&&isWalkable(grid,nx,ny)){
        closed.add(k);
        open.push({x:nx,y:ny,g:cur.g+1,h:Math.abs(ex-nx)+Math.abs(ey-ny),parent:cur});
      }
    }
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════
// Player Drawing (scaled with TW)
// ══════════════════════════════════════════════════════════════════════════
function drawCityPlayer(ctx,px,py,dir,frame,moving){
  ctx.save();ctx.translate(px,py);
  const sc=(TW/40)*0.45;
  ctx.scale(sc*dir,sc);ctx.translate(0,-38);
  const leg=moving?Math.sin(frame*0.28)*12:0;
  const arm=moving?Math.sin(frame*0.28+Math.PI)*10:0;
  const bob=moving?Math.abs(Math.sin(frame*0.28))*2:0;
  ctx.fillStyle='#fff';
  ctx.save();ctx.translate(-5,72+leg);ctx.fillRect(-6,0,12,5);ctx.fillStyle='#e53935';ctx.fillRect(-6,0,12,2);ctx.restore();
  ctx.save();ctx.translate(5,72-leg);ctx.fillRect(-6,0,12,5);ctx.fillStyle='#e53935';ctx.fillRect(-6,0,12,2);ctx.restore();
  ctx.fillStyle='#1a1a2e';
  ctx.save();ctx.translate(-5,52);ctx.rotate(leg*0.015);ctx.fillRect(-4,0,8,22);ctx.restore();
  ctx.save();ctx.translate(5,52);ctx.rotate(-leg*0.015);ctx.fillRect(-4,0,8,22);ctx.restore();
  ctx.fillStyle='#e65100';ctx.fillRect(-11,24-bob,22,30);
  ctx.fillStyle='#bf360c';ctx.fillRect(-2,34-bob,4,16);
  ctx.fillStyle='#e65100';ctx.fillRect(-6,42-bob,12,3);
  ctx.strokeStyle='#e65100';ctx.lineWidth=5;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(-11,28-bob);ctx.lineTo(-16,48-bob+arm);ctx.stroke();
  ctx.beginPath();ctx.moveTo(11,28-bob);ctx.lineTo(16,48-bob-arm);ctx.stroke();
  ctx.fillStyle='#ffcc80';
  ctx.beginPath();ctx.arc(-16,50-bob+arm,4,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(16,50-bob-arm,4,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#ffcc80';ctx.fillRect(-3,18-bob,6,8);
  ctx.beginPath();ctx.arc(0,10-bob,13,0,Math.PI*2);ctx.fillStyle='#ffcc80';ctx.fill();
  ctx.beginPath();ctx.ellipse(0,18-bob,10,4,0,0,Math.PI);ctx.fillStyle='#e8b870';ctx.fill();
  ctx.fillStyle='#1a1a2e';
  ctx.beginPath();ctx.arc(-4,8-bob,2.5,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(4,8-bob,2.5,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#fff';
  ctx.beginPath();ctx.arc(-3.5,7.5-bob,1,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(4.5,7.5-bob,1,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#5d4037';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(-6,4-bob);ctx.lineTo(-2,5-bob);ctx.stroke();
  ctx.beginPath();ctx.moveTo(6,4-bob);ctx.lineTo(2,5-bob);ctx.stroke();
  ctx.strokeStyle='#e53935';ctx.lineWidth=1.2;
  ctx.beginPath();ctx.arc(0,12-bob,4,0.2,Math.PI-0.2);ctx.stroke();
  ctx.fillStyle='#1565c0';
  ctx.beginPath();ctx.ellipse(0,2-bob,14,6,0,Math.PI,0);ctx.fill();
  ctx.fillRect(-14,0-bob,28,3);ctx.fillStyle='#0d47a1';ctx.fillRect(-14,0-bob,28,2);
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,-4-bob,2,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#0d47a1';ctx.beginPath();ctx.ellipse(8,2-bob,10,3,0.1,-Math.PI/2,Math.PI/2);ctx.fill();
  ctx.fillStyle='#5d4037';ctx.beginPath();ctx.ellipse(-10,6-bob,4,6,0.3,0.5,2.5);ctx.fill();
  ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════════
// Rendering
// ══════════════════════════════════════════════════════════════════════════
function drawIsoDiamond(ctx,sx,sy,color,outline){
  ctx.beginPath();
  ctx.moveTo(sx,sy-TH/2);ctx.lineTo(sx+TW/2,sy);ctx.lineTo(sx,sy+TH/2);ctx.lineTo(sx-TW/2,sy);
  ctx.closePath();ctx.fillStyle=color;ctx.fill();
  if(outline){ctx.strokeStyle=outline;ctx.lineWidth=0.5;ctx.stroke();}
}

function drawIsoBox(ctx,sx,sy,h,topColor,sideColor){
  drawIsoDiamond(ctx,sx,sy-h,topColor,null);
  ctx.beginPath();
  ctx.moveTo(sx-TW/2,sy-h);ctx.lineTo(sx,sy+TH/2-h);ctx.lineTo(sx,sy+TH/2);ctx.lineTo(sx-TW/2,sy);
  ctx.closePath();ctx.fillStyle=sideColor;ctx.fill();
  ctx.beginPath();
  ctx.moveTo(sx+TW/2,sy-h);ctx.lineTo(sx,sy+TH/2-h);ctx.lineTo(sx,sy+TH/2);ctx.lineTo(sx+TW/2,sy);
  ctx.closePath();
  const c2=sideColor.replace(')',',0.7)').replace('rgb','rgba');
  ctx.fillStyle=c2||sideColor;ctx.fill();
}

function renderFloor(fi,alpha,offsetY){
  const grid=floors[fi];if(!grid)return;
  const theme=FLOOR_THEMES[fi];
  cx2.save();cx2.globalAlpha=alpha;cx2.translate(0,offsetY);
  const wallH=Math.round(TW*0.4);
  const furnH=Math.round(TW*0.25);
  const tinyFont=Math.max(7,Math.round(TW*0.175))+'px sans-serif';
  const smFont=Math.max(8,Math.round(TW*0.2))+'px sans-serif';

  for(let ty=0;ty<ROWS;ty++){
    for(let tx=0;tx<COLS;tx++){
      const s=toScreen(tx,ty);
      const tile=grid[ty][tx];
      if(tile===T.WALL){
        drawIsoBox(cx2,s.x,s.y,wallH,theme.wall,'rgba(30,30,40,0.8)');
      } else if(tile===T.FURN){
        drawIsoDiamond(cx2,s.x,s.y,theme.floor,'rgba(255,255,255,0.08)');
        drawIsoBox(cx2,s.x,s.y,furnH,theme.furn,'rgba(40,30,20,0.7)');
      } else if(tile===T.ELEV){
        drawIsoDiamond(cx2,s.x,s.y,'#8a8a9a','rgba(255,255,255,0.15)');
        cx2.fillStyle='#aaa';
        cx2.fillRect(s.x-TW*0.15,s.y-wallH,TW*0.125,TH*0.8);
        cx2.fillRect(s.x+TW*0.025,s.y-wallH,TW*0.125,TH*0.8);
        cx2.fillStyle='#ffd700';cx2.font='bold '+tinyFont;cx2.textAlign='center';
        cx2.fillText('LIFT',s.x,s.y-wallH-4);
        if(alpha>0.5){
          const pulse=0.3+Math.sin(cityFrame*0.08)*0.15;
          cx2.beginPath();cx2.arc(s.x,s.y-TH,TW*0.3,0,Math.PI*2);
          cx2.fillStyle='rgba(255,215,0,'+pulse+')';cx2.fill();
        }
      } else if(tile===T.STAIRS_UP){
        drawIsoDiamond(cx2,s.x,s.y,'#6a6a8a','rgba(255,255,255,0.12)');
        cx2.fillStyle='#80ff80';cx2.font='bold '+smFont;cx2.textAlign='center';
        cx2.fillText('▲UP',s.x,s.y+TH*0.3);
      } else if(tile===T.STAIRS_DOWN){
        drawIsoDiamond(cx2,s.x,s.y,'#6a6a8a','rgba(255,255,255,0.12)');
        cx2.fillStyle='#ff8080';cx2.font='bold '+smFont;cx2.textAlign='center';
        cx2.fillText('▼DN',s.x,s.y+TH*0.3);
      } else if(tile===T.CAR){
        drawIsoDiamond(cx2,s.x,s.y,'#555','rgba(255,255,255,0.05)');
        const carColors=['#e53935','#1e88e5','#43a047','#fdd835','#8e24aa'];
        drawIsoBox(cx2,s.x,s.y,Math.round(TW*0.2),carColors[(tx*3+ty*7)%carColors.length],'rgba(0,0,0,0.5)');
        cx2.fillStyle='rgba(150,200,255,0.5)';
        cx2.fillRect(s.x-TW*0.1,s.y-TW*0.25,TW*0.2,TH*0.15);
      } else if(tile===T.PARK_MARK){
        drawIsoDiamond(cx2,s.x,s.y,'#555','rgba(255,255,255,0.05)');
        cx2.strokeStyle='#ffd700';cx2.lineWidth=1;
        cx2.beginPath();cx2.moveTo(s.x-TW*0.15,s.y);cx2.lineTo(s.x+TW*0.15,s.y);cx2.stroke();
      } else {
        drawIsoDiamond(cx2,s.x,s.y,theme.floor,'rgba(255,255,255,0.08)');
      }
    }
    // draw player in correct row depth
    if(alpha>0.5&&cPlayer&&cPlayer.floor===fi&&Math.round(cPlayer.worldY)===ty){
      const ps=toScreen(cPlayer.worldX,cPlayer.worldY);
      drawCityPlayer(cx2,ps.x,ps.y-TH*0.3,cPlayer.dir,cPlayer.animFrame,cPlayer.moving);
    }
  }

  // stars
  const rushMult=cityRushMode?1.5:1;
  const starR=Math.max(6,TW*0.22);
  for(const star of allStars){
    if(star.floor!==fi||star.collected) continue;
    const ss=toScreen(star.tx,star.ty);
    const bob=Math.sin(cityFrame*0.06+star.bob)*4;
    const r=star.type.r*(TW/40)*rushMult;
    cx2.save();
    cx2.shadowColor=star.type.color;cx2.shadowBlur=starR;
    cx2.beginPath();cx2.arc(ss.x,ss.y-TH*0.5+bob,r,0,Math.PI*2);
    cx2.fillStyle=star.type.color;cx2.globalAlpha=alpha*(cityRushMode?0.7:0.5);cx2.fill();
    cx2.restore();
    cx2.font=Math.round((star.type.r+4)*(TW/40))+'px sans-serif';
    cx2.textAlign='center';cx2.textBaseline='middle';
    cx2.fillText(star.type.emoji,ss.x,ss.y-TH*0.5+bob);
    // rush glow ring
    if(cityRushMode&&alpha>0.5){
      const pr=0.4+Math.sin(cityFrame*0.25+star.bob)*0.4;
      cx2.strokeStyle='rgba(255,80,80,'+pr+')';cx2.lineWidth=2;
      cx2.beginPath();cx2.arc(ss.x,ss.y-TH*0.5+bob,r+4,0,Math.PI*2);cx2.stroke();
    }
  }

  // golden star
  if(goldenStar&&goldenStar.floor===fi){
    const gs=toScreen(goldenStar.tx,goldenStar.ty);
    const bob=Math.sin(cityFrame*0.1)*5;
    const pulse=0.7+Math.sin(cityFrame*0.15)*0.3;
    cx2.save();cx2.shadowColor='#ffd700';cx2.shadowBlur=20;
    cx2.beginPath();cx2.arc(gs.x,gs.y-TH*0.6+bob,TW*0.35,0,Math.PI*2);
    cx2.fillStyle='rgba(255,215,0,'+pulse*0.4+')';cx2.fill();cx2.restore();
    for(let i=0;i<6;i++){
      const a=cityFrame*0.05+i*Math.PI/3;
      const sr=(TW*0.45)+Math.sin(cityFrame*0.08+i)*TW*0.1;
      cx2.fillStyle='rgba(255,255,200,'+(0.5+Math.sin(a*3)*0.3)+')';
      cx2.beginPath();cx2.arc(gs.x+Math.cos(a)*sr,gs.y-TH*0.6+bob+Math.sin(a)*sr*0.5,2,0,Math.PI*2);cx2.fill();
    }
    cx2.font=Math.round(TW*0.45)+'px sans-serif';cx2.textAlign='center';cx2.textBaseline='middle';
    cx2.fillText('🌟',gs.x,gs.y-TH*0.6+bob);
    // timer ring
    const tProg=goldenStar.timer/600;
    cx2.strokeStyle='rgba(255,215,0,0.8)';cx2.lineWidth=3;
    cx2.beginPath();cx2.arc(gs.x,gs.y-TH*0.6+bob,TW*0.5,-Math.PI/2,-Math.PI/2+tProg*Math.PI*2);cx2.stroke();
  }

  cx2.restore();
}

function cityRender(){
  cx2.clearRect(0,0,CW,CH);

  // background
  const bgGrad=cx2.createLinearGradient(0,0,0,CH);
  bgGrad.addColorStop(0,cityRushMode?'#2a0010':'#06001f');
  bgGrad.addColorStop(0.5,cityRushMode?'#4a0020':'#130540');
  bgGrad.addColorStop(1,cityRushMode?'#3a0030':'#1a0a3a');
  cx2.fillStyle=bgGrad;cx2.fillRect(0,0,CW,CH);

  // sky stars
  cx2.fillStyle='#fff';
  for(let i=0;i<20;i++){
    const sx2=(i*73+17)%CW,sy2=(i*41+5)%60;
    const twinkle=0.3+Math.sin(cityFrame*0.03+i)*0.3;
    cx2.globalAlpha=twinkle;cx2.beginPath();cx2.arc(sx2,sy2,1,0,Math.PI*2);cx2.fill();
  }
  cx2.globalAlpha=1;

  // building frame
  const bx=Math.round(CW*0.115),bw=Math.round(CW*0.77),by2=20,bh=CH-50;
  cx2.fillStyle='rgba(20,15,40,0.6)';cx2.fillRect(bx,by2,bw,bh);
  cx2.strokeStyle=cityRushMode?'rgba(255,80,80,0.6)':'rgba(100,80,160,0.4)';
  cx2.lineWidth=2;cx2.strokeRect(bx,by2,bw,bh);

  // floor labels
  cx2.font='bold '+Math.max(7,Math.round(CW*0.016))+'px sans-serif';
  cx2.textAlign='right';
  for(let i=0;i<TOTAL_FLOORS;i++){
    const fy=CH-50-(i*Math.round((CH-70)/TOTAL_FLOORS))-8;
    if(fy<20) break;
    const floorCleared=!allStars.some(s=>s.floor===i&&!s.collected);
    cx2.fillStyle=i===currentFloor?'#ffd700':floorCleared?'#80ff80':'rgba(150,130,200,0.5)';
    cx2.fillText(i===0?'P':(''+i),bx-4,fy+3);
    if(i===currentFloor){
      cx2.fillStyle='rgba(255,215,0,0.15)';
      cx2.fillRect(bx,fy-7,bw,14);
    } else if(floorCleared){
      cx2.fillStyle='rgba(0,255,100,0.06)';
      cx2.fillRect(bx,fy-7,bw,14);
    }
  }

  // transition or floor render
  if(transAnim){
    const p=transAnim.progress/transAnim.duration;
    const slideFrom=(transAnim.toFloor>transAnim.fromFloor)?-1:1;
    renderFloor(transAnim.fromFloor,1-p,slideFrom*p*CH*0.3);
    renderFloor(transAnim.toFloor,p,-slideFrom*(1-p)*CH*0.3);
  } else {
    if(currentFloor<TOTAL_FLOORS-1) renderFloor(currentFloor+1,0.12,-FLOOR_HEIGHT);
    if(currentFloor>0) renderFloor(currentFloor-1,0.1,FLOOR_HEIGHT);
    renderFloor(currentFloor,1,0);
  }

  // particles
  cx2.save();
  for(const p2 of cityParticles){
    cx2.globalAlpha=p2.life;cx2.fillStyle=p2.color;
    cx2.beginPath();cx2.arc(p2.x,p2.y,p2.r*p2.life,0,Math.PI*2);cx2.fill();
  }
  cx2.restore();

  // screen flash (on star collect/golden star)
  if(cityFlashTimer>0){
    cx2.save();cx2.globalAlpha=cityFlashTimer/10*0.35;
    cx2.fillStyle=cityFlashColor;cx2.fillRect(0,0,CW,CH);
    cx2.restore();
    cityFlashTimer--;
  }

  // combo display
  if(cityCombo>=3&&!elevatorOpen){
    const mult=Math.min(5,1+Math.floor(cityCombo/3));
    const pulse=0.8+Math.sin(cityFrame*0.25)*0.2;
    cx2.save();cx2.globalAlpha=pulse;
    cx2.font=`bold ${Math.round(Math.max(16,CW*0.04))}px sans-serif`;
    cx2.textAlign='center';
    cx2.fillStyle=mult>=4?'#ff6b6b':mult>=3?'#ffd700':'#00e5ff';
    cx2.shadowColor=cx2.fillStyle;cx2.shadowBlur=12;
    cx2.fillText(mult+'x COMBO!',CW/2,Math.round(CH*0.88));
    cx2.restore();
  }

  // rush mode indicator
  if(cityRushMode&&!elevatorOpen){
    const pulse=0.6+Math.sin(cityFrame*0.3)*0.4;
    cx2.save();cx2.globalAlpha=pulse;
    cx2.font=`bold ${Math.round(Math.max(14,CW*0.035))}px sans-serif`;
    cx2.textAlign='center';cx2.fillStyle='#ff4444';cx2.shadowColor='#ff0000';cx2.shadowBlur=15;
    cx2.fillText('🔥 RUSH MODE! Stars 1.5x value! 🔥',CW/2,Math.round(CH*0.1));
    cx2.restore();
  }

  // elevator menu
  if(elevatorOpen){
    cx2.fillStyle='rgba(0,0,20,0.88)';cx2.fillRect(0,0,CW,CH);
    const mw=Math.min(300,CW*0.82),mh=Math.min(360,CH*0.88);
    const mx=(CW-mw)/2,my=(CH-mh)/2;
    cx2.fillStyle='rgba(30,20,70,0.97)';
    cx2.beginPath();cx2.roundRect(mx,my,mw,mh,12);cx2.fill();
    cx2.strokeStyle='#ffd700';cx2.lineWidth=2;cx2.stroke();
    cx2.fillStyle='#ffd700';
    cx2.font=`bold ${Math.round(mw*0.055)}px sans-serif`;
    cx2.textAlign='center';cx2.fillText('🛗 ELEVATOR',CW/2,my+Math.round(mh*0.07));
    const pad=Math.round(mw*0.05);
    const btnArea=mw-pad*2;
    const btnW=Math.floor((btnArea-pad*3)/4);
    const btnH=Math.max(48,Math.floor((mh*0.82-pad*5)/4));
    for(let i=0;i<TOTAL_FLOORS;i++){
      const col=i%4,row=Math.floor(i/4);
      const bx2=mx+pad+col*(btnW+pad);
      const by3=my+Math.round(mh*0.1)+row*(btnH+pad);
      const isCur=i===currentFloor;
      const hasStars=allStars.some(s=>s.floor===i&&!s.collected);
      const cleared=!hasStars;
      cx2.fillStyle=isCur?'rgba(255,215,0,0.3)':cleared?'rgba(0,255,80,0.1)':'rgba(255,255,255,0.07)';
      cx2.beginPath();cx2.roundRect(bx2,by3,btnW,btnH,6);cx2.fill();
      cx2.strokeStyle=isCur?'#ffd700':cleared?'#80ff80':'rgba(255,255,255,0.2)';
      cx2.lineWidth=isCur?2:1;cx2.stroke();
      cx2.fillStyle=isCur?'#ffd700':cleared?'#80ff80':'#fff';
      cx2.font=`bold ${Math.round(btnW*0.38)}px sans-serif`;
      cx2.textAlign='center';cx2.fillText(i===0?'P':''+i,bx2+btnW/2,by3+btnH*0.48);
      cx2.font=`${Math.round(btnW*0.2)}px sans-serif`;
      cx2.fillStyle='rgba(200,200,255,0.6)';
      cx2.fillText(FLOOR_THEMES[i].name,bx2+btnW/2,by3+btnH*0.7);
      if(hasStars){
        cx2.font=`${Math.round(btnW*0.25)}px sans-serif`;
        cx2.fillText('⭐',bx2+btnW/2,by3+btnH*0.9);
      }
    }
    cx2.fillStyle='rgba(200,200,255,0.4)';
    cx2.font=`${Math.round(mw*0.04)}px sans-serif`;cx2.textAlign='center';
    cx2.fillText('Tap floor to travel • Tap outside to close',CW/2,my+mh-10);
  }

  // golden star banner
  if(goldenBanner>0&&!elevatorOpen){
    const banAlpha=0.6+Math.sin(cityFrame*0.15)*0.3;
    const banY=Math.round(CH*0.82);
    cx2.save();cx2.globalAlpha=banAlpha;
    cx2.fillStyle='rgba(255,215,0,0.2)';cx2.fillRect(0,banY,CW,30);
    cx2.globalAlpha=1;cx2.fillStyle='#ffd700';
    cx2.font=`bold ${Math.round(Math.max(10,CW*0.025))}px sans-serif`;cx2.textAlign='center';
    const flLabel=goldenBannerFloor===0?'Parking':'Floor '+goldenBannerFloor;
    cx2.fillText('⚡ GOLDEN STAR on '+flLabel+'! ⚡',CW/2,banY+20);
    cx2.restore();
  }

  // floor indicator
  if(!elevatorOpen){
    const indW=Math.round(CW*0.31),indH=20;
    const indX=(CW-indW)/2,indY=CH-42;
    cx2.fillStyle='rgba(0,0,0,0.5)';
    cx2.beginPath();cx2.roundRect(indX,indY,indW,indH,5);cx2.fill();
    cx2.fillStyle='#fff';
    cx2.font=`bold ${Math.round(indH*0.65)}px sans-serif`;cx2.textAlign='center';
    cx2.fillText(currentFloor===0?'Parking':'Floor '+currentFloor,CW/2,indY+indH-4);
  }

  // time bar
  const barW=(CW-16)*(cityTimeLeft/60);
  const barColor=cityTimeLeft>20?'#00bcd4':cityTimeLeft>10?'#ffd700':'#e53935';
  cx2.fillStyle='rgba(0,0,0,0.4)';cx2.fillRect(8,CH-10,CW-16,8);
  cx2.fillStyle=barColor;cx2.fillRect(8,CH-10,barW,8);
  // rush pulse on bar
  if(cityRushMode){
    const pulse=0.4+Math.sin(cityFrame*0.3)*0.4;
    cx2.strokeStyle='rgba(255,80,80,'+pulse+')';cx2.lineWidth=2;
    cx2.strokeRect(8,CH-10,CW-16,8);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Game Update
// ══════════════════════════════════════════════════════════════════════════
function cityUpdate(){
  if(cityState!=='playing') return;
  cityFrame++;

  // rush mode: last 15 seconds
  cityRushMode=cityTimeLeft<=15;

  // combo decay
  if(cityComboTimer>0){cityComboTimer--;if(cityComboTimer===0)cityCombo=0;}

  // transition
  if(transAnim){
    transAnim.progress++;
    if(transAnim.progress>=transAnim.duration){
      currentFloor=transAnim.toFloor;cPlayer.floor=currentFloor;transAnim=null;
    }
    return;
  }

  // player movement
  if(cPlayer.path&&cPlayer.path.length>0){
    const next=cPlayer.path[0];
    const dx=next.x-cPlayer.worldX,dy=next.y-cPlayer.worldY;
    const dist=Math.sqrt(dx*dx+dy*dy);
    const speed=0.08+(cityCombo>=6?0.025:cityCombo>=3?0.015:0);
    if(dist<speed){
      cPlayer.worldX=next.x;cPlayer.worldY=next.y;
      cPlayer.tx=next.x;cPlayer.ty=next.y;
      cPlayer.path.shift();
      if(cPlayer.path.length===0){
        cPlayer.moving=false;
        const grid=floors[currentFloor];
        const tile=grid[cPlayer.ty][cPlayer.tx];
        if(tile===T.ELEV) elevatorOpen=true;
        else if(tile===T.STAIRS_UP&&currentFloor<TOTAL_FLOORS-1) startTransition(currentFloor,currentFloor+1,'stairs');
        else if(tile===T.STAIRS_DOWN&&currentFloor>0) startTransition(currentFloor,currentFloor-1,'stairs');
      }
    } else {
      cPlayer.worldX+=dx/dist*speed;cPlayer.worldY+=dy/dist*speed;
      cPlayer.dir=dx>0.01?1:(dx<-0.01?-1:cPlayer.dir);
      cPlayer.moving=true;cPlayer.animFrame++;
    }
  }

  // star collection
  for(const star of allStars){
    if(star.collected||star.floor!==currentFloor) continue;
    if(Math.abs(star.tx-Math.round(cPlayer.worldX))<1&&Math.abs(star.ty-Math.round(cPlayer.worldY))<1)
      collectStar(star);
  }
  // golden star collection
  if(goldenStar&&goldenStar.floor===currentFloor){
    if(Math.abs(goldenStar.tx-Math.round(cPlayer.worldX))<1&&Math.abs(goldenStar.ty-Math.round(cPlayer.worldY))<1)
      collectGoldenStar();
  }

  // check floor cleared bonus
  checkFloorCleared();

  // golden star spawn/despawn
  goldenSpawnTimer++;
  if(!goldenStar&&goldenSpawnTimer>900+Math.random()*600){spawnGoldenStar();goldenSpawnTimer=0;}
  if(goldenStar){goldenStar.timer--;if(goldenStar.timer<=0){goldenStar=null;goldenBanner=0;}}
  if(goldenBanner>0) goldenBanner--;

  // particles
  for(let i=cityParticles.length-1;i>=0;i--){
    const p=cityParticles[i];
    p.x+=p.vx;p.y+=p.vy;p.vy+=0.1;p.life-=0.025;
    if(p.life<=0) cityParticles.splice(i,1);
  }
}

let _floorClearedSet=new Set();
function checkFloorCleared(){
  if(_floorClearedSet.has(currentFloor)) return;
  const remaining=allStars.filter(s=>s.floor===currentFloor&&!s.collected);
  if(remaining.length===0){
    _floorClearedSet.add(currentFloor);
    const bonus=50+currentFloor*10;
    cityMoney+=bonus;
    document.getElementById('cityMoney').textContent='₹'+cityMoney;
    showFloatScore(Math.round(cPlayer.worldX),Math.round(cPlayer.worldY),'⭐ Floor Clear! +₹'+bonus,'#00ff88');
    cityFlashColor='#00ff88';cityFlashTimer=8;
    // big burst
    const s=toScreen(cPlayer.worldX,cPlayer.worldY);
    for(let i=0;i<30;i++){
      const a=Math.random()*Math.PI*2,sp=2+Math.random()*5;
      cityParticles.push({x:s.x,y:s.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-3,r:3+Math.random()*4,life:1,color:'#00ff88'});
    }
  }
}

function collectStar(star){
  star.collected=true;
  cityCombo++;cityComboTimer=180;
  const mult=cityRushMode?1.5:1;
  const comboMult=Math.min(5,1+Math.floor(cityCombo/3));
  const earned=Math.round(star.type.value*mult*comboMult);
  cityMoney+=earned;cityStarCount++;
  document.getElementById('cityMoney').textContent='₹'+cityMoney;
  document.getElementById('cityStars').textContent=cityStarCount;
  const label=comboMult>1?'+₹'+earned+' ('+comboMult+'x!)':'+₹'+earned;
  showFloatScore(star.tx,star.ty,label,star.type.color);
  spawnCityParticles(star.tx,star.ty,star.type.color,comboMult>=3?16:10);
  if(comboMult>=3){cityFlashColor=star.type.color;cityFlashTimer=5;}
}

function showFloatScore(tx,ty,text,color){
  const s=toScreen(tx,ty);
  const el=document.getElementById('cityScoreFloat');
  el.style.color=color;el.textContent=text;
  el.style.left=(s.x/CW*100)+'%';el.style.top=(s.y/CH*100-5)+'%';
  el.style.opacity='1';el.style.transform='translateY(0)';
  setTimeout(()=>{el.style.opacity='0';el.style.transform='translateY(-30px)';},50);
}

function spawnCityParticles(tx,ty,color,count){
  const s=toScreen(tx,ty);
  for(let i=0;i<count;i++){
    const a=Math.random()*Math.PI*2,sp=1.5+Math.random()*4;
    cityParticles.push({x:s.x,y:s.y-TH*0.5,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-2.5,r:2+Math.random()*4,life:1,color});
  }
}

function startTransition(from,to,type){
  cPlayer.moving=false;cPlayer.path=[];
  transAnim={fromFloor:from,toFloor:to,progress:0,duration:type==='elevator'?40:25};
  if(type==='stairs'){
    if(to>from){cPlayer.tx=COLS-1;cPlayer.ty=3;}
    else{cPlayer.tx=COLS-1;cPlayer.ty=2;}
  } else {cPlayer.tx=0;cPlayer.ty=2;}
  cPlayer.worldX=cPlayer.tx;cPlayer.worldY=cPlayer.ty;
}

// ══════════════════════════════════════════════════════════════════════════
// Golden Star
// ══════════════════════════════════════════════════════════════════════════
function spawnGoldenStar(){
  const fi=Math.floor(Math.random()*TOTAL_FLOORS);
  const grid=floors[fi];
  for(let att=0;att<30;att++){
    const tx=1+Math.floor(Math.random()*(COLS-2));
    const ty=1+Math.floor(Math.random()*(ROWS-2));
    if(isWalkable(grid,tx,ty)){
      goldenStar={floor:fi,tx,ty,timer:600};
      goldenBanner=600;goldenBannerFloor=fi;return;
    }
  }
}

function collectGoldenStar(){
  if(!goldenStar) return;
  goldenStar=null;goldenBanner=0;
  const pf=cPlayer.floor;
  const minF=Math.max(0,pf-2),maxF=Math.min(TOTAL_FLOORS-1,pf+2);
  let bonus=0;
  for(const star of allStars){
    if(!star.collected&&star.floor>=minF&&star.floor<=maxF){
      star.collected=true;bonus+=star.type.value;cityStarCount++;
    }
  }
  cityMoney+=bonus;
  document.getElementById('cityMoney').textContent='₹'+cityMoney;
  document.getElementById('cityStars').textContent=cityStarCount;
  showFloatScore(cPlayer.tx,cPlayer.ty,'⚡ GOLDEN +₹'+bonus,'#ffd700');
  cityFlashColor='#ffd700';cityFlashTimer=12;
  cityCombo+=5;cityComboTimer=300;
  const s=toScreen(cPlayer.worldX,cPlayer.worldY);
  for(let i=0;i<30;i++){
    const a=Math.random()*Math.PI*2,sp=2+Math.random()*5;
    cityParticles.push({x:s.x,y:s.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-3,r:3+Math.random()*5,life:1,color:'#ffd700'});
  }
  for(let i=0;i<15;i++){
    const a=Math.random()*Math.PI*2,sp=1+Math.random()*3;
    cityParticles.push({x:s.x,y:s.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-2,r:2+Math.random()*3,life:1,color:'#fff'});
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Input
// ══════════════════════════════════════════════════════════════════════════
function cityHandleTap(sx,sy){
  if(cityState!=='playing'||transAnim) return;
  if(elevatorOpen){
    const mw=Math.min(300,CW*0.82),mh=Math.min(360,CH*0.88);
    const mx=(CW-mw)/2,my=(CH-mh)/2;
    const pad=Math.round(mw*0.05);
    const btnW=Math.floor((mw-pad*2-pad*3)/4);
    const btnH=Math.max(48,Math.floor((mh*0.82-pad*5)/4));
    for(let i=0;i<TOTAL_FLOORS;i++){
      const col=i%4,row=Math.floor(i/4);
      const bx2=mx+pad+col*(btnW+pad);
      const by3=my+Math.round(mh*0.1)+row*(btnH+pad);
      if(sx>=bx2&&sx<=bx2+btnW&&sy>=by3&&sy<=by3+btnH){
        elevatorOpen=false;
        if(i!==currentFloor) startTransition(currentFloor,i,'elevator');
        return;
      }
    }
    elevatorOpen=false;return;
  }
  const t=toTile(sx,sy);
  if(t.tx<0||t.tx>=COLS||t.ty<0||t.ty>=ROWS) return;
  const grid=floors[currentFloor];
  if(!isWalkable(grid,t.tx,t.ty)){
    let best=null,bestD=999;
    for(let ty2=0;ty2<ROWS;ty2++) for(let tx2=0;tx2<COLS;tx2++){
      if(isWalkable(grid,tx2,ty2)){
        const d=Math.abs(tx2-t.tx)+Math.abs(ty2-t.ty);
        if(d<bestD){bestD=d;best={x:tx2,y:ty2};}
      }
    }
    if(best){
      const path=findPath(grid,Math.round(cPlayer.worldX),Math.round(cPlayer.worldY),best.x,best.y);
      if(path&&path.length>1){cPlayer.path=path.slice(1);cPlayer.moving=true;}
    }
    return;
  }
  const path=findPath(grid,Math.round(cPlayer.worldX),Math.round(cPlayer.worldY),t.tx,t.ty);
  if(path&&path.length>1){cPlayer.path=path.slice(1);cPlayer.moving=true;}
}

function getCanvasCoords(e){
  const rect=cc.getBoundingClientRect();
  return{x:(e.clientX-rect.left)*(CW/rect.width),y:(e.clientY-rect.top)*(CH/rect.height)};
}

(function setupInput(){
  const cont=document.getElementById('cityContainer');
  cont.addEventListener('click',e=>{
    if(cityState!=='playing') return;
    const c=getCanvasCoords(e);cityHandleTap(c.x,c.y);
  });
  cont.addEventListener('touchstart',e=>{
    if(cityState!=='playing') return;
    e.preventDefault();
    const c=getCanvasCoords(e.touches[0]);cityHandleTap(c.x,c.y);
  },{passive:false});
  document.addEventListener('keydown',e=>{
    if(currentPage!=='city'||cityState!=='playing'||transAnim) return;
    if(elevatorOpen){if(e.key==='Escape')elevatorOpen=false;return;}
    const grid=floors[currentFloor];
    let nx=Math.round(cPlayer.worldX),ny=Math.round(cPlayer.worldY);
    if(e.key==='ArrowRight') nx++;
    else if(e.key==='ArrowLeft') nx--;
    else if(e.key==='ArrowUp') ny--;
    else if(e.key==='ArrowDown') ny++;
    else if(e.key==='e'||e.key==='E'){
      if(grid[Math.round(cPlayer.worldY)][Math.round(cPlayer.worldX)]===T.ELEV) elevatorOpen=true;return;
    } else return;
    if(isWalkable(grid,nx,ny)){cPlayer.path=[{x:nx,y:ny}];cPlayer.moving=true;}
  });
})();

window.addEventListener('resize',()=>{
  if(typeof currentPage!=='undefined'&&currentPage==='city'){
    cityResize();
    if(cityState!=='playing'){cx2.clearRect(0,0,CW,CH);drawCityIdle();}
  }
});

// ══════════════════════════════════════════════════════════════════════════
// Game Lifecycle
// ══════════════════════════════════════════════════════════════════════════
function showCityOverlay(ended){
  const ov=document.getElementById('cityOverlay');
  ov.style.display='flex';
  const earned=document.getElementById('cityEarned');
  const result=document.getElementById('cityResult');
  const banner=document.getElementById('treasureBanner');
  if(ended){
    earned.style.display='block';earned.textContent='₹'+cityMoney+' earned!';
    result.style.display='block';result.textContent=cityStarCount+' stars across '+TOTAL_FLOORS+' floors';
    banner.style.display='block';
    document.getElementById('cityPlayBtn').textContent='▶ Play Again';
  } else {
    earned.style.display='none';result.style.display='none';banner.style.display='block';
    document.getElementById('cityPlayBtn').textContent='▶ Play';
  }
}

function initCityGame(){
  cityResize();
  cityState='playing';
  cityMoney=0;cityStarCount=0;cityTimeLeft=60;cityFrame=0;
  currentFloor=0;elevatorOpen=false;transAnim=null;
  cityParticles=[];goldenStar=null;goldenBanner=0;goldenSpawnTimer=0;
  cityCombo=0;cityComboTimer=0;cityFlashTimer=0;cityRushMode=false;
  _floorClearedSet=new Set();
  floors=[];
  for(let i=0;i<TOTAL_FLOORS;i++) floors.push(generateFloor(i));
  placeStars();
  cPlayer={floor:0,tx:2,ty:3,worldX:2,worldY:3,path:[],moving:false,dir:1,animFrame:0};
  document.getElementById('cityMoney').textContent='₹0';
  document.getElementById('cityStars').textContent='0';
  document.getElementById('cityTimer').textContent='60s';
  document.getElementById('cityOverlay').style.display='none';
  if(cityTimerInterval) clearInterval(cityTimerInterval);
  cityTimerInterval=setInterval(()=>{
    if(cityState!=='playing') return;
    cityTimeLeft--;
    document.getElementById('cityTimer').textContent=cityTimeLeft+'s';
    if(cityTimeLeft<=0) endCityGame();
  },1000);
  cityLoop();
}

function endCityGame(){
  cityState='ended';
  if(cityTimerInterval){clearInterval(cityTimerInterval);cityTimerInterval=null;}
  if(cityRaf){cancelAnimationFrame(cityRaf);cityRaf=null;}
  recordCityRun(cityMoney);recordGameEnd(cityMoney,cityStarCount);
  cityRender();
  setTimeout(()=>showCityOverlay(true),400);
}

function exitCityGame(){
  cityState='idle';
  if(cityTimerInterval){clearInterval(cityTimerInterval);cityTimerInterval=null;}
  if(cityRaf){cancelAnimationFrame(cityRaf);cityRaf=null;}
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-home').classList.add('active');
  document.getElementById('bottomNav').style.display='flex';
  currentPage='home';refreshHome();
}

function cityLoop(){
  if(cityState!=='playing'){if(cityRaf)cancelAnimationFrame(cityRaf);cityRaf=null;return;}
  cityUpdate();cityRender();
  cityRaf=requestAnimationFrame(cityLoop);
}

function drawCityIdle(){
  cx2.fillStyle='#0a0e1a';cx2.fillRect(0,0,CW,CH);
  cx2.font=`bold ${Math.round(Math.max(20,CW*0.054))}px sans-serif`;
  cx2.textAlign='center';cx2.fillStyle='#ffd700';
  cx2.fillText('⭐ City Stars',CW/2,CH/2-20);
  cx2.font=`${Math.round(Math.max(11,CW*0.025))}px sans-serif`;cx2.fillStyle='#aac';
  cx2.fillText('Explore 16 floors, collect stars!',CW/2,CH/2+12);
  cx2.font=`${Math.round(Math.max(9,CW*0.02))}px sans-serif`;cx2.fillStyle='rgba(255,215,0,0.6)';
  cx2.fillText('Combo multipliers • Floor clear bonus • Rush mode',CW/2,CH/2+32);
}

(function(){
  cityResize();
  document.getElementById('cityPlayBtn').addEventListener('click',e=>{e.stopPropagation();initCityGame();});
  drawCityIdle();
})();
