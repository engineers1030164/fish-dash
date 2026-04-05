// ══════════════════════════════════════════════════════════════════════════
// CITY STARS — localStorage (preserved)
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
// CITY STARS — Constants & Setup
// ══════════════════════════════════════════════════════════════════════════
const cc=document.getElementById('cityCanvas');
const cx2=cc.getContext('2d');
const CW=520, CH=380;
cc.width=CW; cc.height=CH;

const COLS=8, ROWS=6;
const TW=40, TH=20; // iso tile size
const TOTAL_FLOORS=16;
const FLOOR_HEIGHT=24; // vertical spacing for ghost floors

// tile types
const T={EMPTY:0,WALL:1,FURN:2,ELEV:3,STAIRS_UP:4,STAIRS_DOWN:5,CAR:6,PARK_MARK:7};

const STAR_TYPES=[
  {type:'bronze',emoji:'⭐',value:10,color:'#cd7f32',r:8},
  {type:'silver',emoji:'🌟',value:20,color:'#c0c0c0',r:9},
  {type:'gold',emoji:'💫',value:50,color:'#ffd700',r:10},
  {type:'diamond',emoji:'💎',value:100,color:'#a0f0ff',r:11},
];

const FLOOR_THEMES=[
  {name:'Parking',floor:'#555','wall':'#444',accent:'#ffd700',furn:'#666'},
  {name:'Lobby',floor:'#c4a882','wall':'#8b7355',accent:'#d4a574',furn:'#6b4226'},
  {name:'Office',floor:'#c9b896','wall':'#8b7355',accent:'#b8956a',furn:'#5c3a1e'},
  {name:'Office',floor:'#bfae8e','wall':'#8b6f47',accent:'#a0845a',furn:'#654321'},
  {name:'Office',floor:'#c0aa84','wall':'#8b7355',accent:'#b89060',furn:'#5a3a20'},
  {name:'Corp',floor:'#7ab0c4','wall':'#3a7a8a',accent:'#00bcd4',furn:'#2a5a6a'},
  {name:'Corp',floor:'#6ca0b8','wall':'#357080',accent:'#0097a7',furn:'#255060'},
  {name:'Corp',floor:'#5e94ae','wall':'#306878',accent:'#00838f',furn:'#204858'},
  {name:'Corp',floor:'#5088a4','wall':'#2b6070',accent:'#006978',furn:'#1c4050'},
  {name:'Suite',floor:'#8bc4a0','wall':'#4a8a60',accent:'#66bb6a',furn:'#3a6a48'},
  {name:'Suite',floor:'#7eb894','wall':'#448058',accent:'#4caf50',furn:'#346040'},
  {name:'Suite',floor:'#72ac88','wall':'#3e7650',accent:'#43a047',furn:'#2e5638'},
  {name:'Suite',floor:'#68a27e','wall':'#386c48',accent:'#388e3c',furn:'#284c30'},
  {name:'Pent.',floor:'#c4a0d4','wall':'#7a4a9a',accent:'#ab47bc',furn:'#6a3a8a'},
  {name:'Pent.',floor:'#d4b080','wall':'#a07030',accent:'#ffd700',furn:'#806020'},
  {name:'Pent.',floor:'#e0c090','wall':'#b08040',accent:'#ffd700',furn:'#907030'},
];

let cityState='idle', cityRaf;
let cityMoney=0, cityStarCount=0, cityTimeLeft=60, cityTimerInterval=null;
let cityFrame=0;
let floors=[]; // array of 16 grids
let allStars=[]; // {floor,tx,ty,type,collected}
let cPlayer; // {floor,tx,ty,worldX,worldY,path,moving,dir,animFrame}
let currentFloor=0;
let elevatorOpen=false;
let transAnim=null; // {fromFloor,toFloor,progress,duration,type}
let cityParticles=[];
let goldenStar=null; // {floor,tx,ty,timer}
let goldenBanner=0; // frames remaining for banner
let goldenBannerFloor=-1;
let goldenSpawnTimer=0;

// ══════════════════════════════════════════════════════════════════════════
// Isometric Math
// ══════════════════════════════════════════════════════════════════════════
function isoOrigin(){
  return {x:CW/2, y:90};
}
function toScreen(tx,ty){
  const o=isoOrigin();
  return {
    x: o.x+(tx-ty)*(TW/2),
    y: o.y+(tx+ty)*(TH/2)
  };
}
function toTile(sx,sy){
  const o=isoOrigin();
  const rx=sx-o.x, ry=sy-o.y;
  const tx=(rx/(TW/2)+ry/(TH/2))/2;
  const ty=(ry/(TH/2)-rx/(TW/2))/2;
  return {tx:Math.round(tx), ty:Math.round(ty)};
}

// ══════════════════════════════════════════════════════════════════════════
// Floor Generation
// ══════════════════════════════════════════════════════════════════════════
function generateFloor(fi){
  const grid=[];
  for(let y=0;y<ROWS;y++){
    grid[y]=[];
    for(let x=0;x<COLS;x++){
      // perimeter walls
      if(y===0||y===ROWS-1||x===0||x===COLS-1){
        grid[y][x]=T.WALL;
      } else {
        grid[y][x]=T.EMPTY;
      }
    }
  }
  // elevator at left (col 1, rows 2-3) — carve into wall
  grid[2][0]=T.ELEV;
  grid[3][0]=T.ELEV;
  grid[2][1]=T.EMPTY;
  grid[3][1]=T.EMPTY;

  // stairs at right (col 6, rows 2-3)
  if(fi<TOTAL_FLOORS-1) grid[2][COLS-1]=T.STAIRS_UP;
  if(fi>0) grid[3][COLS-1]=T.STAIRS_DOWN;

  // open the stair wall tiles
  grid[2][COLS-2]=T.EMPTY;
  grid[3][COLS-2]=T.EMPTY;

  // parking level special
  if(fi===0){
    for(let y=1;y<ROWS-1;y++){
      for(let x=2;x<COLS-2;x++){
        if(Math.random()<0.3) grid[y][x]=T.CAR;
        else if(Math.random()<0.2) grid[y][x]=T.PARK_MARK;
      }
    }
    // ensure walkable path
    grid[2][2]=T.EMPTY;grid[3][2]=T.EMPTY;
    grid[2][3]=T.EMPTY;grid[3][3]=T.EMPTY;
    grid[2][4]=T.EMPTY;grid[3][4]=T.EMPTY;
    grid[2][5]=T.EMPTY;grid[3][5]=T.EMPTY;
  } else {
    // add 1-2 interior walls for room partition
    if(fi%3===0){
      grid[2][3]=T.WALL; grid[3][3]=T.WALL;
    }
    if(fi%4===1){
      grid[1][5]=T.WALL; grid[2][5]=T.WALL;
    }
    // furniture
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
    const count=2+Math.floor(Math.random()*2); // 2-3 per floor
    const grid=floors[fi];
    for(let s=0;s<count;s++){
      // pick type based on floor
      let type;
      if(fi<4) type=Math.random()<0.7?STAR_TYPES[0]:STAR_TYPES[1];
      else if(fi<8) type=Math.random()<0.5?STAR_TYPES[1]:(Math.random()<0.6?STAR_TYPES[0]:STAR_TYPES[2]);
      else if(fi<12) type=Math.random()<0.5?STAR_TYPES[2]:(Math.random()<0.6?STAR_TYPES[1]:STAR_TYPES[3]);
      else type=Math.random()<0.5?STAR_TYPES[3]:(Math.random()<0.6?STAR_TYPES[2]:STAR_TYPES[1]);

      // find empty tile
      let placed=false;
      for(let att=0;att<20&&!placed;att++){
        const tx=1+Math.floor(Math.random()*(COLS-2));
        const ty=1+Math.floor(Math.random()*(ROWS-2));
        if(grid[ty][tx]===T.EMPTY){
          // not adjacent to elevator/stairs
          const nearSpecial=(tx<=1&&(ty===2||ty===3))||(tx>=COLS-2&&(ty===2||ty===3));
          if(!nearSpecial){
            allStars.push({floor:fi,tx,ty,type,collected:false,bob:Math.random()*6.28});
            placed=true;
          }
        }
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// A* Pathfinding (simple for 8x6 grid)
// ══════════════════════════════════════════════════════════════════════════
function findPath(grid,sx,sy,ex,ey){
  if(!isWalkable(grid,ex,ey)) return null;
  const key=(x,y)=>x+','+y;
  const open=[{x:sx,y:sy,g:0,h:Math.abs(ex-sx)+Math.abs(ey-sy),parent:null}];
  const closed=new Set();
  closed.add(key(sx,sy));
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  while(open.length>0){
    open.sort((a,b)=>(a.g+a.h)-(b.g+b.h));
    const cur=open.shift();
    if(cur.x===ex&&cur.y===ey){
      const path=[];
      let n=cur;
      while(n){path.unshift({x:n.x,y:n.y});n=n.parent;}
      return path;
    }
    for(const[dx,dy] of dirs){
      const nx=cur.x+dx, ny=cur.y+dy;
      const k=key(nx,ny);
      if(!closed.has(k)&&isWalkable(grid,nx,ny)){
        closed.add(k);
        open.push({x:nx,y:ny,g:cur.g+1,h:Math.abs(ex-nx)+Math.abs(ey-ny),parent:cur});
      }
    }
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════
// Player Drawing (preserved character, scaled for iso)
// ══════════════════════════════════════════════════════════════════════════
function drawCityPlayer(ctx,px,py,dir,frame,moving){
  ctx.save();
  ctx.translate(px,py);
  const sc=0.45;
  ctx.scale(sc*dir,sc);
  ctx.translate(0,-38);

  const leg=moving?Math.sin(frame*0.28)*12:0;
  const arm=moving?Math.sin(frame*0.28+Math.PI)*10:0;
  const bob=moving?Math.abs(Math.sin(frame*0.28))*2:0;

  // shoes
  ctx.fillStyle='#fff';
  ctx.save();ctx.translate(-5,72+leg);ctx.fillRect(-6,0,12,5);ctx.fillStyle='#e53935';ctx.fillRect(-6,0,12,2);ctx.restore();
  ctx.save();ctx.translate(5,72-leg);ctx.fillRect(-6,0,12,5);ctx.fillStyle='#e53935';ctx.fillRect(-6,0,12,2);ctx.restore();

  // pants
  ctx.fillStyle='#1a1a2e';
  ctx.save();ctx.translate(-5,52);ctx.rotate(leg*0.015);ctx.fillRect(-4,0,8,22);ctx.restore();
  ctx.save();ctx.translate(5,52);ctx.rotate(-leg*0.015);ctx.fillRect(-4,0,8,22);ctx.restore();

  // body
  ctx.fillStyle='#e65100';
  ctx.fillRect(-11,24-bob,22,30);
  ctx.fillStyle='#bf360c';
  ctx.fillRect(-2,34-bob,4,16);
  ctx.fillStyle='#e65100';
  ctx.fillRect(-6,42-bob,12,3);

  // arms
  ctx.strokeStyle='#e65100';ctx.lineWidth=5;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(-11,28-bob);ctx.lineTo(-16,48-bob+arm);ctx.stroke();
  ctx.beginPath();ctx.moveTo(11,28-bob);ctx.lineTo(16,48-bob-arm);ctx.stroke();
  ctx.fillStyle='#ffcc80';
  ctx.beginPath();ctx.arc(-16,50-bob+arm,4,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(16,50-bob-arm,4,0,Math.PI*2);ctx.fill();

  // neck
  ctx.fillStyle='#ffcc80';ctx.fillRect(-3,18-bob,6,8);

  // head
  ctx.beginPath();ctx.arc(0,10-bob,13,0,Math.PI*2);ctx.fillStyle='#ffcc80';ctx.fill();
  ctx.beginPath();ctx.ellipse(0,18-bob,10,4,0,0,Math.PI);ctx.fillStyle='#e8b870';ctx.fill();

  // eyes
  ctx.fillStyle='#1a1a2e';
  ctx.beginPath();ctx.arc(-4,8-bob,2.5,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(4,8-bob,2.5,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#fff';
  ctx.beginPath();ctx.arc(-3.5,7.5-bob,1,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(4.5,7.5-bob,1,0,Math.PI*2);ctx.fill();

  // eyebrows
  ctx.strokeStyle='#5d4037';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(-6,4-bob);ctx.lineTo(-2,5-bob);ctx.stroke();
  ctx.beginPath();ctx.moveTo(6,4-bob);ctx.lineTo(2,5-bob);ctx.stroke();

  // smile
  ctx.strokeStyle='#e53935';ctx.lineWidth=1.2;
  ctx.beginPath();ctx.arc(0,12-bob,4,0.2,Math.PI-0.2);ctx.stroke();

  // cap
  ctx.fillStyle='#1565c0';
  ctx.beginPath();ctx.ellipse(0,2-bob,14,6,0,Math.PI,0);ctx.fill();
  ctx.fillRect(-14,0-bob,28,3);
  ctx.fillStyle='#0d47a1';ctx.fillRect(-14,0-bob,28,2);
  ctx.fillStyle='#fff';
  ctx.beginPath();ctx.arc(0,-4-bob,2,0,Math.PI*2);ctx.fill();
  // brim
  ctx.fillStyle='#0d47a1';
  ctx.beginPath();ctx.ellipse(8,2-bob,10,3,0.1,-Math.PI/2,Math.PI/2);ctx.fill();

  // hair
  ctx.fillStyle='#5d4037';
  ctx.beginPath();ctx.ellipse(-10,6-bob,4,6,0.3,0.5,2.5);ctx.fill();

  ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════════
// Rendering
// ══════════════════════════════════════════════════════════════════════════
function drawIsoDiamond(ctx,sx,sy,color,outline){
  ctx.beginPath();
  ctx.moveTo(sx,sy-TH/2);
  ctx.lineTo(sx+TW/2,sy);
  ctx.lineTo(sx,sy+TH/2);
  ctx.lineTo(sx-TW/2,sy);
  ctx.closePath();
  ctx.fillStyle=color;
  ctx.fill();
  if(outline){
    ctx.strokeStyle=outline;
    ctx.lineWidth=0.5;
    ctx.stroke();
  }
}

function drawIsoBox(ctx,sx,sy,h,topColor,sideColor){
  // top face
  drawIsoDiamond(ctx,sx,sy-h,topColor,null);
  // left face
  ctx.beginPath();
  ctx.moveTo(sx-TW/2,sy-h);
  ctx.lineTo(sx,sy+TH/2-h);
  ctx.lineTo(sx,sy+TH/2);
  ctx.lineTo(sx-TW/2,sy);
  ctx.closePath();
  ctx.fillStyle=sideColor;
  ctx.fill();
  // right face
  ctx.beginPath();
  ctx.moveTo(sx+TW/2,sy-h);
  ctx.lineTo(sx,sy+TH/2-h);
  ctx.lineTo(sx,sy+TH/2);
  ctx.lineTo(sx+TW/2,sy);
  ctx.closePath();
  const c2=sideColor.replace(')',',0.7)').replace('rgb','rgba');
  ctx.fillStyle=c2||sideColor;
  ctx.fill();
}

function renderFloor(fi,alpha,offsetY){
  const grid=floors[fi];
  if(!grid) return;
  const theme=FLOOR_THEMES[fi];
  cx2.save();
  cx2.globalAlpha=alpha;
  cx2.translate(0,offsetY);

  // draw tiles back to front
  for(let ty=0;ty<ROWS;ty++){
    for(let tx=0;tx<COLS;tx++){
      const s=toScreen(tx,ty);
      const tile=grid[ty][tx];

      if(tile===T.WALL){
        drawIsoBox(cx2,s.x,s.y,16,theme.wall,'rgba(30,30,40,0.8)');
      } else if(tile===T.FURN){
        drawIsoDiamond(cx2,s.x,s.y,theme.floor,'rgba(255,255,255,0.08)');
        drawIsoBox(cx2,s.x,s.y,10,theme.furn,'rgba(40,30,20,0.7)');
      } else if(tile===T.ELEV){
        drawIsoDiamond(cx2,s.x,s.y,'#8a8a9a','rgba(255,255,255,0.15)');
        // elevator doors
        cx2.fillStyle='#aaa';
        cx2.fillRect(s.x-6,s.y-18,5,16);
        cx2.fillRect(s.x+1,s.y-18,5,16);
        // label
        cx2.fillStyle='#ffd700';
        cx2.font='bold 7px sans-serif';
        cx2.textAlign='center';
        cx2.fillText('LIFT',s.x,s.y-20);
        // pulsing glow
        if(alpha>0.5){
          const pulse=0.3+Math.sin(cityFrame*0.08)*0.15;
          cx2.beginPath();cx2.arc(s.x,s.y-10,12,0,Math.PI*2);
          cx2.fillStyle='rgba(255,215,0,'+pulse+')';cx2.fill();
        }
      } else if(tile===T.STAIRS_UP){
        drawIsoDiamond(cx2,s.x,s.y,'#6a6a8a','rgba(255,255,255,0.12)');
        cx2.fillStyle='#80ff80';
        cx2.font='bold 10px sans-serif';cx2.textAlign='center';
        cx2.fillText('▲UP',s.x,s.y+4);
      } else if(tile===T.STAIRS_DOWN){
        drawIsoDiamond(cx2,s.x,s.y,'#6a6a8a','rgba(255,255,255,0.12)');
        cx2.fillStyle='#ff8080';
        cx2.font='bold 10px sans-serif';cx2.textAlign='center';
        cx2.fillText('▼DN',s.x,s.y+4);
      } else if(tile===T.CAR){
        drawIsoDiamond(cx2,s.x,s.y,'#555','rgba(255,255,255,0.05)');
        const carColors=['#e53935','#1e88e5','#43a047','#fdd835','#8e24aa'];
        const cc2=carColors[(tx*3+ty*7)%carColors.length];
        drawIsoBox(cx2,s.x,s.y,8,cc2,'rgba(0,0,0,0.5)');
        // windshield
        cx2.fillStyle='rgba(150,200,255,0.5)';
        cx2.fillRect(s.x-4,s.y-10,8,3);
      } else if(tile===T.PARK_MARK){
        drawIsoDiamond(cx2,s.x,s.y,'#555','rgba(255,255,255,0.05)');
        cx2.strokeStyle='#ffd700';cx2.lineWidth=1;
        cx2.beginPath();cx2.moveTo(s.x-6,s.y);cx2.lineTo(s.x+6,s.y);cx2.stroke();
      } else {
        // empty floor
        drawIsoDiamond(cx2,s.x,s.y,theme.floor,'rgba(255,255,255,0.08)');
      }
    }

    // draw player in correct depth row
    if(alpha>0.5 && cPlayer && cPlayer.floor===fi && Math.round(cPlayer.worldY)===ty){
      const ps=toScreen(cPlayer.worldX,cPlayer.worldY);
      drawCityPlayer(cx2,ps.x,ps.y-6,cPlayer.dir,cPlayer.animFrame,cPlayer.moving);
    }
  }

  // draw stars on this floor
  for(const star of allStars){
    if(star.floor!==fi||star.collected) continue;
    const ss=toScreen(star.tx,star.ty);
    const bob=Math.sin(cityFrame*0.06+star.bob)*4;
    // glow
    cx2.save();
    cx2.shadowColor=star.type.color;
    cx2.shadowBlur=8;
    cx2.beginPath();cx2.arc(ss.x,ss.y-8+bob,star.type.r,0,Math.PI*2);
    cx2.fillStyle=star.type.color;cx2.globalAlpha=alpha*0.5;cx2.fill();
    cx2.restore();
    // emoji
    cx2.font=(star.type.r+4)+'px sans-serif';
    cx2.textAlign='center';cx2.textBaseline='middle';
    cx2.fillText(star.type.emoji,ss.x,ss.y-8+bob);
  }

  // draw golden star if on this floor
  if(goldenStar && goldenStar.floor===fi){
    const gs=toScreen(goldenStar.tx,goldenStar.ty);
    const bob=Math.sin(cityFrame*0.1)*5;
    const pulse=0.7+Math.sin(cityFrame*0.15)*0.3;
    cx2.save();
    cx2.shadowColor='#ffd700';cx2.shadowBlur=20;
    cx2.beginPath();cx2.arc(gs.x,gs.y-10+bob,14,0,Math.PI*2);
    cx2.fillStyle='rgba(255,215,0,'+pulse*0.4+')';cx2.fill();
    cx2.restore();
    // sparkle ring
    for(let i=0;i<6;i++){
      const a=cityFrame*0.05+i*Math.PI/3;
      const sr=18+Math.sin(cityFrame*0.08+i)*4;
      cx2.fillStyle='rgba(255,255,200,'+(0.5+Math.sin(a*3)*0.3)+')';
      cx2.beginPath();cx2.arc(gs.x+Math.cos(a)*sr,gs.y-10+bob+Math.sin(a)*sr*0.5,2,0,Math.PI*2);cx2.fill();
    }
    cx2.font='18px sans-serif';cx2.textAlign='center';cx2.textBaseline='middle';
    cx2.fillText('🌟',gs.x,gs.y-10+bob);
  }

  cx2.restore();
}

function cityRender(){
  cx2.clearRect(0,0,CW,CH);

  // background - building exterior
  const bgGrad=cx2.createLinearGradient(0,0,0,CH);
  bgGrad.addColorStop(0,'#06001f');
  bgGrad.addColorStop(0.5,'#130540');
  bgGrad.addColorStop(1,'#1a0a3a');
  cx2.fillStyle=bgGrad;
  cx2.fillRect(0,0,CW,CH);

  // small stars in sky
  cx2.fillStyle='#fff';
  for(let i=0;i<20;i++){
    const sx2=(i*73+17)%CW, sy2=(i*41+5)%60;
    const twinkle=0.3+Math.sin(cityFrame*0.03+i)*0.3;
    cx2.globalAlpha=twinkle;
    cx2.beginPath();cx2.arc(sx2,sy2,1,0,Math.PI*2);cx2.fill();
  }
  cx2.globalAlpha=1;

  // building frame
  const bx=60, bw=CW-120, by2=20, bh=CH-50;
  cx2.fillStyle='rgba(20,15,40,0.6)';
  cx2.fillRect(bx,by2,bw,bh);
  cx2.strokeStyle='rgba(100,80,160,0.4)';
  cx2.lineWidth=2;
  cx2.strokeRect(bx,by2,bw,bh);

  // floor labels on left
  cx2.font='bold 8px sans-serif';
  cx2.textAlign='right';
  for(let i=0;i<TOTAL_FLOORS;i++){
    const fy=CH-50-(i*20)-10;
    if(fy<20) break;
    cx2.fillStyle=i===currentFloor?'#ffd700':'rgba(150,130,200,0.5)';
    cx2.fillText(i===0?'P':(''+i),bx-4,fy+3);
    if(i===currentFloor){
      cx2.fillStyle='rgba(255,215,0,0.15)';
      cx2.fillRect(bx,fy-8,bw,16);
    }
  }

  // transition animation
  if(transAnim){
    const p=transAnim.progress/transAnim.duration;
    const slideFrom=(transAnim.toFloor>transAnim.fromFloor)?-1:1;
    const offset1=slideFrom*p*CH*0.3;
    const offset2=-slideFrom*(1-p)*CH*0.3;
    renderFloor(transAnim.fromFloor,1-p,offset1);
    renderFloor(transAnim.toFloor,p,offset2);
  } else {
    // ghost floors
    if(currentFloor<TOTAL_FLOORS-1) renderFloor(currentFloor+1,0.12,-FLOOR_HEIGHT);
    if(currentFloor>0) renderFloor(currentFloor-1,0.1,FLOOR_HEIGHT);
    // current floor
    renderFloor(currentFloor,1,0);
  }

  // particles
  cx2.save();
  for(const p2 of cityParticles){
    cx2.globalAlpha=p2.life;
    cx2.fillStyle=p2.color;
    cx2.beginPath();cx2.arc(p2.x,p2.y,p2.r*p2.life,0,Math.PI*2);cx2.fill();
  }
  cx2.restore();

  // elevator menu
  if(elevatorOpen){
    cx2.fillStyle='rgba(0,0,20,0.85)';
    cx2.fillRect(0,0,CW,CH);
    cx2.fillStyle='rgba(40,30,80,0.95)';
    const mw=200, mh=300, mx=(CW-mw)/2, my=(CH-mh)/2;
    cx2.fillRect(mx,my,mw,mh);
    cx2.strokeStyle='#ffd700';cx2.lineWidth=2;cx2.strokeRect(mx,my,mw,mh);
    cx2.fillStyle='#ffd700';cx2.font='bold 14px sans-serif';cx2.textAlign='center';
    cx2.fillText('🛗 ELEVATOR',CW/2,my+20);
    // floor buttons 4x4 grid
    for(let i=0;i<TOTAL_FLOORS;i++){
      const col=i%4, row=Math.floor(i/4);
      const bx2=mx+15+col*46, by3=my+35+row*62;
      const isCur=i===currentFloor;
      // check if floor has uncollected stars
      const hasStars=allStars.some(s=>s.floor===i&&!s.collected);
      cx2.fillStyle=isCur?'rgba(255,215,0,0.3)':'rgba(255,255,255,0.08)';
      cx2.fillRect(bx2,by3,40,55);
      cx2.strokeStyle=isCur?'#ffd700':'rgba(255,255,255,0.2)';
      cx2.lineWidth=1;cx2.strokeRect(bx2,by3,40,55);
      cx2.fillStyle=isCur?'#ffd700':'#fff';
      cx2.font='bold 16px sans-serif';cx2.textAlign='center';
      cx2.fillText(i===0?'P':''+i,bx2+20,by3+22);
      cx2.font='8px sans-serif';
      cx2.fillStyle='rgba(200,200,255,0.7)';
      cx2.fillText(FLOOR_THEMES[i].name,bx2+20,by3+35);
      if(hasStars){
        cx2.fillText('⭐',bx2+20,by3+48);
      }
    }
    // close hint
    cx2.fillStyle='rgba(200,200,255,0.5)';cx2.font='10px sans-serif';
    cx2.fillText('Tap a floor to go there | Tap outside to close',CW/2,my+mh-8);
  }

  // golden star banner
  if(goldenBanner>0 && !elevatorOpen){
    const banAlpha=0.6+Math.sin(cityFrame*0.15)*0.3;
    cx2.save();
    cx2.globalAlpha=banAlpha;
    cx2.fillStyle='rgba(255,215,0,0.2)';
    cx2.fillRect(0,CH-75,CW,28);
    cx2.globalAlpha=1;
    cx2.fillStyle='#ffd700';
    cx2.font='bold 12px sans-serif';cx2.textAlign='center';
    const flLabel=goldenBannerFloor===0?'Parking':'Floor '+goldenBannerFloor;
    cx2.fillText('⚡ GOLDEN STAR appeared on '+flLabel+'! ⚡',CW/2,CH-58);
    cx2.restore();
  }

  // floor indicator
  if(!elevatorOpen){
    cx2.fillStyle='rgba(0,0,0,0.5)';
    cx2.fillRect(CW/2-40,CH-42,80,18);
    cx2.fillStyle='#fff';cx2.font='bold 11px sans-serif';cx2.textAlign='center';
    const flName=currentFloor===0?'Parking':'Floor '+currentFloor;
    cx2.fillText(flName,CW/2,CH-29);
  }

  // time bar at bottom
  const barW=(CW-16)*(cityTimeLeft/60);
  const barColor=cityTimeLeft>20?'#00bcd4':(cityTimeLeft>10?'#ffd700':'#e53935');
  cx2.fillStyle='rgba(0,0,0,0.4)';
  cx2.fillRect(8,CH-10,CW-16,8);
  cx2.fillStyle=barColor;
  cx2.fillRect(8,CH-10,barW,8);
}

// ══════════════════════════════════════════════════════════════════════════
// Game Update
// ══════════════════════════════════════════════════════════════════════════
function cityUpdate(){
  if(cityState!=='playing') return;
  cityFrame++;

  // transition
  if(transAnim){
    transAnim.progress++;
    if(transAnim.progress>=transAnim.duration){
      currentFloor=transAnim.toFloor;
      cPlayer.floor=currentFloor;
      transAnim=null;
    }
    return; // no player movement during transition
  }

  // player movement along path
  if(cPlayer.path&&cPlayer.path.length>0){
    const next=cPlayer.path[0];
    const dx=next.x-cPlayer.worldX, dy=next.y-cPlayer.worldY;
    const dist=Math.sqrt(dx*dx+dy*dy);
    const speed=0.08;
    if(dist<speed){
      cPlayer.worldX=next.x;cPlayer.worldY=next.y;
      cPlayer.tx=next.x;cPlayer.ty=next.y;
      cPlayer.path.shift();
      if(cPlayer.path.length===0){
        cPlayer.moving=false;
        // check tile arrival
        const grid=floors[currentFloor];
        const tile=grid[cPlayer.ty][cPlayer.tx];
        if(tile===T.ELEV){
          elevatorOpen=true;
        } else if(tile===T.STAIRS_UP&&currentFloor<TOTAL_FLOORS-1){
          startTransition(currentFloor,currentFloor+1,'stairs');
        } else if(tile===T.STAIRS_DOWN&&currentFloor>0){
          startTransition(currentFloor,currentFloor-1,'stairs');
        }
      }
    } else {
      cPlayer.worldX+=dx/dist*speed;
      cPlayer.worldY+=dy/dist*speed;
      cPlayer.dir=dx>0.01?1:(dx<-0.01?-1:cPlayer.dir);
      cPlayer.moving=true;
      cPlayer.animFrame++;
    }
  }

  // star collection
  for(const star of allStars){
    if(star.collected||star.floor!==currentFloor) continue;
    if(Math.abs(star.tx-Math.round(cPlayer.worldX))<1&&Math.abs(star.ty-Math.round(cPlayer.worldY))<1){
      collectStar(star);
    }
  }

  // golden star collection
  if(goldenStar&&goldenStar.floor===currentFloor){
    if(Math.abs(goldenStar.tx-Math.round(cPlayer.worldX))<1&&Math.abs(goldenStar.ty-Math.round(cPlayer.worldY))<1){
      collectGoldenStar();
    }
  }

  // golden star spawn timer
  goldenSpawnTimer++;
  if(!goldenStar && goldenSpawnTimer>900+Math.random()*600){ // ~15-25 seconds
    spawnGoldenStar();
    goldenSpawnTimer=0;
  }
  // golden star despawn
  if(goldenStar){
    goldenStar.timer--;
    if(goldenStar.timer<=0){
      goldenStar=null;
      goldenBanner=0;
    }
  }
  if(goldenBanner>0) goldenBanner--;

  // particles
  for(let i=cityParticles.length-1;i>=0;i--){
    const p=cityParticles[i];
    p.x+=p.vx;p.y+=p.vy;p.vy+=0.1;p.life-=0.03;
    if(p.life<=0) cityParticles.splice(i,1);
  }
}

function collectStar(star){
  star.collected=true;
  cityMoney+=star.type.value;
  cityStarCount++;
  document.getElementById('cityMoney').textContent='₹'+cityMoney;
  document.getElementById('cityStars').textContent=cityStarCount;
  showFloatScore(star.tx,star.ty,'+₹'+star.type.value,star.type.color);
  spawnParticles(star.tx,star.ty,star.type.color);
}

function showFloatScore(tx,ty,text,color){
  const s=toScreen(tx,ty);
  const el=document.getElementById('cityScoreFloat');
  el.style.color=color;
  el.textContent=text;
  el.style.left=(s.x/CW*100)+'%';
  el.style.top=(s.y/CH*100-5)+'%';
  el.style.opacity='1';
  el.style.transform='translateY(0)';
  setTimeout(()=>{el.style.opacity='0';el.style.transform='translateY(-30px)';},50);
}

function spawnParticles(tx,ty,color){
  const s=toScreen(tx,ty);
  for(let i=0;i<8;i++){
    const a=Math.random()*Math.PI*2;
    const sp=1.5+Math.random()*3;
    cityParticles.push({x:s.x,y:s.y-8,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-2,r:2+Math.random()*3,life:1,color});
  }
}

function startTransition(from,to,type){
  cPlayer.moving=false;cPlayer.path=[];
  transAnim={fromFloor:from,toFloor:to,progress:0,duration:type==='elevator'?40:25};
  // place player at corresponding tile on target floor
  if(type==='stairs'){
    // arriving from stairs up → appear at stairs down, and vice versa
    if(to>from){cPlayer.tx=COLS-1;cPlayer.ty=3;} // stairs down on target
    else{cPlayer.tx=COLS-1;cPlayer.ty=2;} // stairs up on target
  } else {
    cPlayer.tx=0;cPlayer.ty=2; // elevator on target
  }
  cPlayer.worldX=cPlayer.tx;cPlayer.worldY=cPlayer.ty;
}

// ══════════════════════════════════════════════════════════════════════════
// Golden Star Power-Up
// ══════════════════════════════════════════════════════════════════════════
function spawnGoldenStar(){
  // pick random floor and empty tile
  const fi=Math.floor(Math.random()*TOTAL_FLOORS);
  const grid=floors[fi];
  for(let att=0;att<30;att++){
    const tx=1+Math.floor(Math.random()*(COLS-2));
    const ty=1+Math.floor(Math.random()*(ROWS-2));
    if(isWalkable(grid,tx,ty)){
      goldenStar={floor:fi,tx,ty,timer:600}; // ~10 seconds
      goldenBanner=600;
      goldenBannerFloor=fi;
      return;
    }
  }
}

function collectGoldenStar(){
  if(!goldenStar) return;
  goldenStar=null;
  goldenBanner=0;
  // collect all stars on 5 surrounding floors
  const pf=cPlayer.floor;
  const minF=Math.max(0,pf-2), maxF=Math.min(TOTAL_FLOORS-1,pf+2);
  let bonus=0;
  for(const star of allStars){
    if(!star.collected&&star.floor>=minF&&star.floor<=maxF){
      star.collected=true;
      bonus+=star.type.value;
      cityStarCount++;
    }
  }
  cityMoney+=bonus;
  document.getElementById('cityMoney').textContent='₹'+cityMoney;
  document.getElementById('cityStars').textContent=cityStarCount;
  showFloatScore(cPlayer.tx,cPlayer.ty,'⚡+₹'+bonus,'#ffd700');
  // big particle burst
  for(let i=0;i<20;i++){
    const a=Math.random()*Math.PI*2;
    const sp=2+Math.random()*4;
    const s=toScreen(cPlayer.worldX,cPlayer.worldY);
    cityParticles.push({x:s.x,y:s.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-3,r:3+Math.random()*4,life:1,color:'#ffd700'});
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Input Handling
// ══════════════════════════════════════════════════════════════════════════
function cityHandleTap(sx,sy){
  if(cityState!=='playing'||transAnim) return;

  // elevator menu
  if(elevatorOpen){
    const mw=200, mh=300, mx=(CW-mw)/2, my=(CH-mh)/2;
    // check floor buttons
    for(let i=0;i<TOTAL_FLOORS;i++){
      const col=i%4, row=Math.floor(i/4);
      const bx2=mx+15+col*46, by3=my+35+row*62;
      if(sx>=bx2&&sx<=bx2+40&&sy>=by3&&sy<=by3+55){
        elevatorOpen=false;
        if(i!==currentFloor){
          startTransition(currentFloor,i,'elevator');
        }
        return;
      }
    }
    // click outside closes
    elevatorOpen=false;
    return;
  }

  // convert to tile
  const t=toTile(sx,sy);
  if(t.tx<0||t.tx>=COLS||t.ty<0||t.ty>=ROWS) return;
  const grid=floors[currentFloor];
  if(!isWalkable(grid,t.tx,t.ty)){
    // find nearest walkable
    let best=null,bestD=999;
    for(let ty2=0;ty2<ROWS;ty2++){
      for(let tx2=0;tx2<COLS;tx2++){
        if(isWalkable(grid,tx2,ty2)){
          const d=Math.abs(tx2-t.tx)+Math.abs(ty2-t.ty);
          if(d<bestD){bestD=d;best={x:tx2,y:ty2};}
        }
      }
    }
    if(best) {
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
  return {
    x:(e.clientX-rect.left)*(CW/rect.width),
    y:(e.clientY-rect.top)*(CH/rect.height)
  };
}

(function setupInput(){
  const cont=document.getElementById('cityContainer');
  cont.addEventListener('click',(e)=>{
    if(cityState!=='playing') return;
    const c=getCanvasCoords(e);
    cityHandleTap(c.x,c.y);
  });
  cont.addEventListener('touchstart',(e)=>{
    if(cityState!=='playing') return;
    e.preventDefault();
    const c=getCanvasCoords(e.touches[0]);
    cityHandleTap(c.x,c.y);
  },{passive:false});

  document.addEventListener('keydown',(e)=>{
    if(currentPage!=='city'||cityState!=='playing'||transAnim) return;
    if(elevatorOpen){
      if(e.key==='Escape') elevatorOpen=false;
      return;
    }
    const grid=floors[currentFloor];
    let nx=Math.round(cPlayer.worldX),ny=Math.round(cPlayer.worldY);
    if(e.key==='ArrowRight') nx++;
    else if(e.key==='ArrowLeft') nx--;
    else if(e.key==='ArrowUp') ny--;
    else if(e.key==='ArrowDown') ny++;
    else if(e.key==='e'||e.key==='E'){
      const tile=grid[Math.round(cPlayer.worldY)][Math.round(cPlayer.worldX)];
      if(tile===T.ELEV) elevatorOpen=true;
      return;
    } else return;
    if(isWalkable(grid,nx,ny)){
      cPlayer.path=[{x:nx,y:ny}];cPlayer.moving=true;
    }
  });
})();

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
    result.style.display='block';result.textContent=cityStarCount+' stars collected across '+TOTAL_FLOORS+' floors';
    banner.style.display='block';
    document.getElementById('cityPlayBtn').textContent='▶ Play Again';
  } else {
    earned.style.display='none';result.style.display='none';
    banner.style.display='block';
    document.getElementById('cityPlayBtn').textContent='▶ Play';
  }
}

function initCityGame(){
  cityState='playing';
  cityMoney=0;cityStarCount=0;cityTimeLeft=60;cityFrame=0;
  currentFloor=0;elevatorOpen=false;transAnim=null;
  cityParticles=[];goldenStar=null;goldenBanner=0;goldenSpawnTimer=0;

  // generate floors
  floors=[];
  for(let i=0;i<TOTAL_FLOORS;i++) floors.push(generateFloor(i));
  placeStars();

  // player starts in parking
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
  recordCityRun(cityMoney);
  recordGameEnd(cityMoney,cityStarCount);
  cityRender(); // final frame
  setTimeout(()=>showCityOverlay(true),400);
}

function exitCityGame(){
  cityState='idle';
  if(cityTimerInterval){clearInterval(cityTimerInterval);cityTimerInterval=null;}
  if(cityRaf){cancelAnimationFrame(cityRaf);cityRaf=null;}
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-home').classList.add('active');
  document.getElementById('bottomNav').style.display='flex';
  currentPage='home';
  refreshHome();
}

function cityLoop(){
  if(cityState!=='playing'){if(cityRaf)cancelAnimationFrame(cityRaf);cityRaf=null;return;}
  cityUpdate();
  cityRender();
  cityRaf=requestAnimationFrame(cityLoop);
}

// ══════════════════════════════════════════════════════════════════════════
// Idle Frame & Init
// ══════════════════════════════════════════════════════════════════════════
(function(){
  document.getElementById('cityPlayBtn').addEventListener('click',(e)=>{
    e.stopPropagation();
    initCityGame();
  });

  // idle frame
  cx2.fillStyle='#0a0e1a';cx2.fillRect(0,0,CW,CH);
  cx2.font='bold 28px sans-serif';cx2.textAlign='center';cx2.fillStyle='#ffd700';
  cx2.fillText('⭐ City Stars',CW/2,CH/2-20);
  cx2.font='13px sans-serif';cx2.fillStyle='#aac';
  cx2.fillText('Explore 16 floors, collect stars!',CW/2,CH/2+10);
})();
