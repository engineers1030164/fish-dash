// ══════════════════════════════════════════════════════════════════════════
// URBAN HUNT 3D — First-person raycaster shooter
// ══════════════════════════════════════════════════════════════════════════
(function(){
'use strict';

const uhc=document.getElementById('uhCanvas');
const uctx=uhc.getContext('2d');
let UW=520,UH=400;

function uhResize(){
  const c=document.getElementById('uhContainer');
  UW=Math.max(280,c.clientWidth||520);
  UH=Math.max(320,c.clientHeight||400);
  uhc.width=UW; uhc.height=UH;
}

// ── Map (26×26 tile grid) ──────────────────────────────────────────────────
const COLS=26,ROWS=26,T_ROAD=0,T_WALL=1;
let tileMap=[],spawnPoints=[];

function uhGenMap(){
  tileMap=[];spawnPoints=[];
  for(let r=0;r<ROWS;r++){
    tileMap[r]=[];
    for(let c=0;c<COLS;c++){
      if(r===0||r===ROWS-1||c===0||c===COLS-1){tileMap[r][c]=T_WALL;continue;}
      tileMap[r][c]=(r%5===0||c%5===0)?T_ROAD:T_WALL;
    }
  }
  for(let r=1;r<ROWS-1;r++) for(let c=1;c<COLS-1;c++){
    if(tileMap[r][c]===T_ROAD&&(r>3||c>3)) spawnPoints.push({x:c+0.5,y:r+0.5});
  }
}

function mapAt(x,y){
  const c=Math.floor(x),r=Math.floor(y);
  if(r<0||r>=ROWS||c<0||c>=COLS) return T_WALL;
  return tileMap[r][c];
}
function walkable(x,y,m=0.22){
  return mapAt(x-m,y-m)===T_ROAD&&mapAt(x+m,y-m)===T_ROAD&&
         mapAt(x-m,y+m)===T_ROAD&&mapAt(x+m,y+m)===T_ROAD;
}

// ── Constants ──────────────────────────────────────────────────────────────
const MOVE=0.07,ROT=0.038,PLANE=0.66,HRES=2;

// ── Weapons ────────────────────────────────────────────────────────────────
const WEAPONS=[
  {name:'Pistol',dmg:18,rate:18,range:8, hitR:0.38,color:'#4dd0e1'},
  {name:'Sniper',dmg:85,rate:55,range:18,hitR:0.18,color:'#ffeb3b'},
];
const UPG_DEFS=[
  {id:'pDmg', name:'Pistol Damage', desc:'+10 dmg',     icon:'🔫',cost:[2,3,4,5],apply:()=>{WEAPONS[0].dmg+=10;}},
  {id:'pRate',name:'Pistol Speed',  desc:'-3 cooldown', icon:'⚡',cost:[2,3,4],  apply:()=>{WEAPONS[0].rate=Math.max(6,WEAPONS[0].rate-3);}},
  {id:'sDmg', name:'Sniper Power',  desc:'+25 dmg',     icon:'🎯',cost:[3,4,5,6],apply:()=>{WEAPONS[1].dmg+=25;}},
  {id:'sZoom',name:'Sniper Zoom',   desc:'wider scope', icon:'🔭',cost:[3,4],    apply:()=>{uhScopeR=Math.min(140,uhScopeR+20);}},
  {id:'spd',  name:'Agility',       desc:'+speed',      icon:'👟',cost:[2,3,4],  apply:()=>{uhSpd+=0.008;}},
  {id:'hp',   name:'Armour',        desc:'+25 max HP',  icon:'🛡️',cost:[3,4,5],  apply:()=>{uhHPMax+=25;pHP=Math.min(pHP+25,uhHPMax);}},
];
let uhUpgLvl={};

// ── State ──────────────────────────────────────────────────────────────────
let uhRunning=false,uhWave=1,uhUpgPts=0,uhAnimId=null;
let uhSpd=MOVE,uhHPMax=100,uhScopeR=80;

// ── Player ─────────────────────────────────────────────────────────────────
let px,py,pdx,pdy,ppx,ppy,pAngle=0;
let pHP,pInv=0,pFire=0,pWep=0,pScope=false;
let pBob=0,pBobV=0,pMuzzle=0,pHit=0;

// ── Enemies ────────────────────────────────────────────────────────────────
const ET=[
  {hp:50, dmg:8, pts:15,spd:0.025,rate:90, range:5, color:'#ef5350',emoji:'👊'},
  {hp:100,dmg:14,pts:30,spd:0.022,rate:70, range:7, color:'#ab47bc',emoji:'💂'},
  {hp:75, dmg:30,pts:50,spd:0.018,rate:120,range:10,color:'#ffa726',emoji:'🎯'},
];
let enemies=[],uhParts=[];
let uhKF=0,uhDF=0,uhWCT=0;

// ── Input ──────────────────────────────────────────────────────────────────
let vjOn=false,vjId=-1,vjBX=0,vjBY=0,vjDX=0,vjDY=0;
let aimOn=false,aimId=-1,aimLX=0;
let shootHeld=false;
const keys={};
let ptick=0;

// ── Map helpers ────────────────────────────────────────────────────────────
function uhGenSpawn(){
  const count=4+uhWave*2;
  enemies=[];
  const pts=[...spawnPoints].sort(()=>Math.random()-0.5);
  for(let i=0;i<count&&i<pts.length;i++){
    const sp=pts[i];
    const ti=uhWave<=1?0:uhWave<=3?Math.floor(Math.random()*2):Math.floor(Math.random()*3);
    const t=ET[Math.min(ti,2)];
    enemies.push({
      x:sp.x,y:sp.y,
      hp:t.hp+uhWave*8,maxHp:t.hp+uhWave*8,
      dmg:t.dmg,pts:t.pts,spd:t.spd,
      rate:t.rate,fcd:Math.floor(Math.random()*t.rate),
      range:t.range,color:t.color,emoji:t.emoji,
      state:'patrol',ptimer:60+Math.random()*120,
      pdx:(Math.random()-0.5)*0.05,pdy:(Math.random()-0.5)*0.05,
      atimer:0,_pt:null,dead:false,
    });
  }
}

function hasLOS(ax,ay,bx,by){
  const dx=bx-ax,dy=by-ay,d=Math.sqrt(dx*dx+dy*dy);
  const steps=Math.ceil(d*5);
  for(let i=1;i<steps;i++){
    const t=i/steps;
    const tc=Math.floor(ax+dx*t),tr=Math.floor(ay+dy*t);
    if(tr>=0&&tr<ROWS&&tc>=0&&tc<COLS&&tileMap[tr][tc]===T_WALL) return false;
  }
  return true;
}

function astar(sx,sy,tx,ty){
  const sc=Math.floor(sx),sr=Math.floor(sy),tc2=Math.floor(tx),tr=Math.floor(ty);
  if(sc===tc2&&sr===tr) return null;
  const K=(c,r)=>r*COLS+c;
  const open=[],closed=new Set(),g={},par={};
  const h=(c,r)=>Math.abs(c-tc2)+Math.abs(r-tr);
  g[K(sc,sr)]=0; open.push({c:sc,r:sr,f:h(sc,sr)});
  const D=[[-1,0],[1,0],[0,-1],[0,1]];
  let found=null,it=0;
  while(open.length&&it++<200){
    open.sort((a,b)=>a.f-b.f);
    const cur=open.shift(),ck=K(cur.c,cur.r);
    if(closed.has(ck)) continue; closed.add(ck);
    if(cur.c===tc2&&cur.r===tr){found=cur;break;}
    for(const [dc,dr] of D){
      const nc=cur.c+dc,nr=cur.r+dr;
      if(nc<0||nc>=COLS||nr<0||nr>=ROWS||tileMap[nr][nc]===T_WALL) continue;
      const nk=K(nc,nr);
      if(closed.has(nk)) continue;
      const ng=(g[ck]||0)+1;
      if(g[nk]===undefined||ng<g[nk]){g[nk]=ng;par[nk]={c:cur.c,r:cur.r};open.push({c:nc,r:nr,f:ng+h(nc,nr)});}
    }
  }
  if(!found) return null;
  let cur={c:tc2,r:tr};
  while(true){const ck=K(cur.c,cur.r),p=par[ck];if(!p) break;if(p.c===sc&&p.r===sr) return{x:cur.c+0.5,y:cur.r+0.5};cur=p;}
  return null;
}

// ── Player init ────────────────────────────────────────────────────────────
function initPlayer(){
  px=2.5;py=2.5;
  let t=0; while(!walkable(px,py)&&t++<50){px+=1;if(px>8){px=1.5;py+=1;}}
  pAngle=0;pdx=1;pdy=0;ppx=0;ppy=PLANE;
  pHP=uhHPMax;pInv=0;pFire=0;pScope=false;pBob=0;pBobV=0;
}

function rotP(a){
  const cs=Math.cos(a),sn=Math.sin(a);
  const ox=pdx,op=ppx;
  pdx=pdx*cs-pdy*sn;pdy=ox*sn+pdy*cs;
  ppx=ppx*cs-ppy*sn;ppy=op*sn+ppy*cs;
  pAngle=Math.atan2(pdy,pdx);
}

// ── Hitscan ────────────────────────────────────────────────────────────────
function playerFire(){
  const w=WEAPONS[pWep];
  if(pFire>0) return;
  pFire=w.rate; pMuzzle=8;
  let best=w.range,hitE=null;
  for(const e of enemies){
    if(e.dead) continue;
    const dx=e.x-px,dy=e.y-py;
    const t=dx*pdx+dy*pdy;
    if(t<=0||t>w.range) continue;
    const px2=dx-t*pdx,py2=dy-t*pdy;
    if(Math.sqrt(px2*px2+py2*py2)<w.hitR&&t<best&&hasLOS(px,py,e.x,e.y)){best=t;hitE=e;}
  }
  if(hitE){hitE.hp-=w.dmg;pHit=12;if(hitE.hp<=0){hitE.dead=true;uhUpgPts+=hitE.pts;uhKF=20;uhUpdateHUD();}}
}

// ── Update ─────────────────────────────────────────────────────────────────
function uhUpdate(){
  if(pFire>0) pFire--;if(pInv>0) pInv--;if(pMuzzle>0) pMuzzle--;if(pHit>0) pHit--;

  // Keyboard
  let fwd=0,rot=0,str=0;
  if(keys['w']||keys['W']||keys['ArrowUp']) fwd=uhSpd;
  if(keys['s']||keys['S']||keys['ArrowDown']) fwd=-uhSpd*0.6;
  if(keys['a']||keys['A']||keys['ArrowLeft']) rot=-ROT;
  if(keys['d']||keys['D']||keys['ArrowRight']) rot=ROT;
  if(keys['q']||keys['Q']) str=-uhSpd*0.7;
  if(keys['e']||keys['E']) str=uhSpd*0.7;
  if(keys[' ']||keys['f']||keys['F']) playerFire();
  if(keys['Tab']){keys['Tab']=false;pWep=(pWep+1)%2;uhUpdateHUD();}
  if(rot) rotP(rot);

  // Joystick
  if(vjOn){
    const mag=Math.sqrt(vjDX*vjDX+vjDY*vjDY)||1;
    const ns=Math.min(1,Math.sqrt(vjDX*vjDX+vjDY*vjDY)/50);
    fwd+=-vjDY/mag*uhSpd*ns;
    str+=vjDX/mag*uhSpd*ns*0.7;
  }
  if(shootHeld&&pWep===0) playerFire();

  // Move forward/back
  if(fwd){
    const nx=px+pdx*fwd,ny=py+pdy*fwd;
    if(walkable(nx,py)) px=nx;
    if(walkable(px,ny)) py=ny;
  }
  // Strafe
  if(str){
    const sx=ppx/PLANE,sy=ppy/PLANE;
    const nx=px+sx*str,ny=py+sy*str;
    if(walkable(nx,py)) px=nx;
    if(walkable(px,ny)) py=ny;
  }
  // Walk bob
  if(fwd||str){pBob+=0.15;pBobV=Math.sin(pBob)*3;}
  else{pBobV*=0.88;}

  px=Math.max(0.3,Math.min(COLS-0.3,px));
  py=Math.max(0.3,Math.min(ROWS-0.3,py));

  // Enemies
  ptick++;
  for(const e of enemies){
    if(e.dead) continue;
    const dx=px-e.x,dy=py-e.y,dist=Math.sqrt(dx*dx+dy*dy)||1;
    if(dist<e.range&&hasLOS(e.x,e.y,px,py)){e.state='chase';e.atimer=180;}
    else if(e.atimer>0&&--e.atimer===0) e.state='patrol';

    if(e.state==='chase'){
      if(dist>0.5){
        if(ptick%30===0){const n=astar(e.x,e.y,px,py);if(n) e._pt=n;}
        if(e._pt){
          const pdx2=e._pt.x-e.x,pdy2=e._pt.y-e.y,pm=Math.sqrt(pdx2*pdx2+pdy2*pdy2)||1;
          const nx=e.x+pdx2/pm*e.spd,ny=e.y+pdy2/pm*e.spd;
          if(walkable(nx,e.y)) e.x=nx; if(walkable(e.x,ny)) e.y=ny;
          if(pm<0.3) e._pt=null;
        } else {
          if(walkable(e.x+dx/dist*e.spd,e.y)) e.x+=dx/dist*e.spd;
          if(walkable(e.x,e.y+dy/dist*e.spd)) e.y+=dy/dist*e.spd;
        }
      }
      if(dist<e.range&&hasLOS(e.x,e.y,px,py)){
        if(e.fcd>0) e.fcd--;
        else{e.fcd=e.rate;if(pInv===0){pHP-=e.dmg;pInv=45;uhDF=15;if(pHP<=0){uhGameOver();return;}}}
      }
    } else {
      if(--e.ptimer<=0){e.ptimer=60+Math.random()*120;e.pdx=(Math.random()-0.5)*0.05;e.pdy=(Math.random()-0.5)*0.05;}
      const nx=e.x+e.pdx,ny=e.y+e.pdy;
      if(walkable(nx,e.y)) e.x=nx; else e.pdx*=-1;
      if(walkable(e.x,ny)) e.y=ny; else e.pdy*=-1;
    }
  }

  for(const p of uhParts){p.x+=p.vx;p.y+=p.vy;p.life--;}
  uhParts=uhParts.filter(p=>p.life>0);
  if(uhKF>0) uhKF--;if(uhDF>0) uhDF--;if(uhWCT>0) uhWCT--;
  if(enemies.length>0&&enemies.every(e=>e.dead)){uhWCT=120;uhRunning=false;setTimeout(()=>uhShowUpgrades(),1400);}
}

// ── RAYCASTER ──────────────────────────────────────────────────────────────
function uhRayCast(){
  const img=uctx.createImageData(UW,UH);
  const d=img.data;
  const HH=UH/2;

  // Sky + floor gradient fill
  for(let y=0;y<UH;y++){
    let r,g,b;
    if(y<HH){
      const t=(HH-y)/HH;
      r=Math.floor(8+t*16);g=Math.floor(10+t*22);b=Math.floor(22+t*45);
    } else {
      const t=(y-HH)/HH;
      r=Math.floor(16+t*10);g=Math.floor(16+t*6);b=Math.floor(22+t*6);
    }
    for(let x=0;x<UW;x++){const i=(y*UW+x)*4;d[i]=r;d[i+1]=g;d[i+2]=b;d[i+3]=255;}
  }

  const zBuf=new Float32Array(UW);
  // Effective plane (scaled for sniper zoom)
  const zoom=(pScope&&pWep===1)?0.28:1.0;
  const epx=ppx*zoom, epy=ppy*zoom;

  for(let x=0;x<UW;x+=HRES){
    const camX=2*x/UW-1;
    const rdx=pdx+epx*camX, rdy=pdy+epy*camX;
    let mx=Math.floor(px),my=Math.floor(py);
    const ddx=Math.abs(rdx)<1e-10?1e30:Math.abs(1/rdx);
    const ddy=Math.abs(rdy)<1e-10?1e30:Math.abs(1/rdy);
    let sx,sy,stx,sty;
    if(rdx<0){sx=-1;stx=(px-mx)*ddx;}else{sx=1;stx=(mx+1-px)*ddx;}
    if(rdy<0){sy=-1;sty=(py-my)*ddy;}else{sy=1;sty=(my+1-py)*ddy;}
    let hit=false,side=0,it=0;
    while(!hit&&it++<32){
      if(stx<sty){stx+=ddx;mx+=sx;side=0;}else{sty+=ddy;my+=sy;side=1;}
      if(mx<0||mx>=COLS||my<0||my>=ROWS){hit=true;break;}
      if(tileMap[my][mx]===T_WALL) hit=true;
    }
    const perp=Math.max(0.01,side===0?stx-ddx:sty-ddy);
    const lh=Math.min(UH*3,Math.floor(UH/perp));
    const bob=Math.floor(pBobV);
    const ds=Math.max(0,Math.floor(HH-lh/2+bob));
    const de=Math.min(UH-1,Math.floor(HH+lh/2+bob));

    // Wall color (hash-based palette + side shading + distance fade)
    const hash=((mx*1619+my*31337)&0xFFFF)%6;
    const WP=[[40,45,80],[35,42,70],[46,38,72],[30,52,76],[38,44,84],[44,48,72]];
    let[wr,wg,wb]=WP[hash];
    if(side===1){wr=Math.floor(wr*.65);wg=Math.floor(wg*.65);wb=Math.floor(wb*.65);}

    // Texture: wall position for window pattern
    let wallX=side===0?(py+perp*rdy)%(1):(px+perp*rdx)%(1);
    if(wallX<0) wallX+=1;

    const fade=Math.max(0,1-perp/13);

    for(let y=ds;y<=de;y++){
      const texY=(y-ds)/Math.max(1,de-ds);
      // Window grid (3×4 windows per tile face)
      const wx=wallX*3,wy=texY*4;
      const isWin=(wx%1>0.2&&wx%1<0.8)&&(wy%1>0.18&&wy%1<0.72);
      let fr,fg,fb;
      if(isWin){
        // Lit window: warm yellow
        fr=Math.floor((wr+50)*fade);fg=Math.floor((wg+42)*fade);fb=Math.floor((wb+10)*fade);
      } else {
        fr=Math.floor(wr*fade);fg=Math.floor(wg*fade);fb=Math.floor(wb*fade);
      }
      for(let xx=x;xx<Math.min(x+HRES,UW);xx++){
        const i=(y*UW+xx)*4;d[i]=fr;d[i+1]=fg;d[i+2]=fb;d[i+3]=255;
      }
    }
    for(let xx=x;xx<Math.min(x+HRES,UW);xx++) zBuf[xx]=perp;
  }
  uctx.putImageData(img,0,0);
  return zBuf;
}

// ── Sprites ────────────────────────────────────────────────────────────────
function hexRGB(h){return{r:parseInt(h.slice(1,3),16),g:parseInt(h.slice(3,5),16),b:parseInt(h.slice(5,7),16)};}

function renderSprites(zBuf){
  const zoom=(pScope&&pWep===1)?0.28:1.0;
  const epx=ppx*zoom,epy=ppy*zoom;
  const inv=1/(epx*pdy-pdx*epy);
  const spr=enemies.filter(e=>!e.dead)
    .map(e=>({...e,sq:(e.x-px)**2+(e.y-py)**2}))
    .sort((a,b)=>b.sq-a.sq);

  for(const sp of spr){
    const rx=sp.x-px,ry=sp.y-py;
    const tx=inv*(pdy*rx-pdx*ry);
    const ty=inv*(-epy*rx+epx*ry);
    if(ty<=0.1) continue;
    const sx=Math.floor(UW/2*(1+tx/ty));
    const h=Math.min(UH,Math.abs(Math.floor(UH/ty)));
    const w=Math.floor(h*0.55);
    const x0=sx-Math.floor(w/2),x1=sx+Math.floor(w/2);
    const y0=Math.max(0,Math.floor(UH/2-h/2+pBobV));
    const y1=Math.min(UH-1,Math.floor(UH/2+h/2+pBobV));
    if(x1<0||x0>=UW||y0>=y1) continue;
    const col=hexRGB(sp.color);
    const fade=Math.max(0.1,1-Math.sqrt(sp.sq)/10);

    for(let xx=Math.max(0,x0);xx<Math.min(UW,x1);xx+=HRES){
      if(ty>=zBuf[xx]) continue;
      const fr=Math.floor(col.r*fade),fg=Math.floor(col.g*fade),fb=Math.floor(col.b*fade);
      // Head (top 30%) skin, body (bottom 70%) enemy color
      const headEnd=Math.floor(y0+(y1-y0)*0.3);
      uctx.fillStyle=`rgb(200,150,110)`;
      uctx.fillRect(xx,y0,HRES,headEnd-y0);
      uctx.fillStyle=`rgb(${fr},${fg},${fb})`;
      uctx.fillRect(xx,headEnd,HRES,y1-headEnd);
    }
    // HP bar + emoji (only if not too far)
    if(ty<7){
      const bw=Math.max(18,w*0.85),bx=sx-bw/2,by=Math.max(4,y0-9);
      uctx.fillStyle='rgba(0,0,0,0.65)';uctx.fillRect(bx-1,by-1,bw+2,6);
      uctx.fillStyle='#333';uctx.fillRect(bx,by,bw,4);
      uctx.fillStyle=sp.hp/sp.maxHp>.5?'#4caf50':'#f44336';
      uctx.fillRect(bx,by,bw*(sp.hp/sp.maxHp),4);
      const fs=Math.max(10,Math.min(26,h*0.32));
      uctx.font=fs+'px sans-serif';uctx.textAlign='center';
      uctx.fillText(sp.emoji,sx,Math.min(y1-2,UH/2+h*0.12));
    }
  }
}

// ── Gun overlay ────────────────────────────────────────────────────────────
function renderGun(){
  const bob=pBobV*0.4;
  const sc=Math.min(UW,UH)/380;
  const rx=muzzleFlash>0?(muzzleFlash/8)*6*sc:0;
  uctx.save();
  uctx.translate(UW*0.68,UH*0.78+bob+rx);
  uctx.scale(sc,sc);
  if(pWep===0){
    uctx.fillStyle='#2a2a2a';
    uctx.fillRect(-15,-8,75,13);   // barrel
    uctx.fillRect(10,5,20,38);     // grip
    uctx.fillRect(-4,5,16,8);      // guard
    uctx.fillStyle='#444';uctx.fillRect(13,13,8,12); // trigger
    uctx.fillStyle='rgba(255,255,255,0.12)';uctx.fillRect(-5,-6,45,4);
  } else {
    uctx.fillStyle='#1e1e1e';
    uctx.fillRect(-65,-5,130,10);  // long barrel
    uctx.fillRect(35,5,28,18);     // stock
    uctx.fillRect(18,5,18,30);     // grip
    uctx.fillStyle='#111';uctx.fillRect(-2,-15,38,8);  // scope body
    uctx.fillStyle='rgba(77,208,225,0.5)';uctx.fillRect(0,-14,35,6);
    uctx.fillStyle='rgba(255,255,255,0.08)';uctx.fillRect(-55,-3,70,3);
  }
  uctx.restore();
  // Muzzle flash
  if(pMuzzle>0){
    const gx=UW*0.58,gy=UH*0.74+bob;
    uctx.save();
    uctx.globalAlpha=pMuzzle/8*0.9;
    uctx.fillStyle='#ffe082';
    uctx.beginPath();uctx.arc(gx,gy,14*sc,0,Math.PI*2);uctx.fill();
    uctx.globalAlpha=pMuzzle/8*0.5;
    uctx.fillStyle='#fff';
    uctx.beginPath();uctx.arc(gx,gy,6*sc,0,Math.PI*2);uctx.fill();
    uctx.restore();
  }
}

// ── HUD ────────────────────────────────────────────────────────────────────
function renderHUD(){
  // Crosshair
  const cx=UW/2,cy=UH/2;
  uctx.strokeStyle=pHit>0?'#ff4444':'rgba(255,255,255,0.85)';
  uctx.lineWidth=1.5;
  const g=5,l=8;
  uctx.beginPath();
  uctx.moveTo(cx-g-l,cy);uctx.lineTo(cx-g,cy);
  uctx.moveTo(cx+g,cy);uctx.lineTo(cx+g+l,cy);
  uctx.moveTo(cx,cy-g-l);uctx.lineTo(cx,cy-g);
  uctx.moveTo(cx,cy+g);uctx.lineTo(cx,cy+g+l);
  uctx.stroke();
  if(pHit>0){
    uctx.strokeStyle='#ff3333';uctx.lineWidth=2;
    uctx.beginPath();uctx.moveTo(cx-5,cy-5);uctx.lineTo(cx+5,cy+5);uctx.moveTo(cx+5,cy-5);uctx.lineTo(cx-5,cy+5);uctx.stroke();
  }

  // HP bar
  const hpW=Math.min(UW*.35,145),hpH=10,hpX=10,hpY=UH-30;
  uctx.fillStyle='rgba(0,0,0,.6)';uctx.fillRect(hpX-2,hpY-2,hpW+4,hpH+4);
  uctx.fillStyle='#333';uctx.fillRect(hpX,hpY,hpW,hpH);
  const hr=Math.max(0,pHP/uhHPMax);
  uctx.fillStyle=hr>.5?'#4caf50':hr>.25?'#ff9800':'#f44336';
  uctx.fillRect(hpX,hpY,hpW*hr,hpH);
  uctx.fillStyle='#ddd';uctx.font='bold 10px sans-serif';uctx.textAlign='left';
  uctx.fillText('HP '+Math.ceil(pHP)+'/'+uhHPMax,hpX,hpY-3);

  // Wave banner
  const alive=enemies.filter(e=>!e.dead).length;
  uctx.fillStyle='rgba(0,0,0,.55)';uctx.fillRect(UW/2-70,4,140,24);
  uctx.fillStyle='#fff';uctx.font='bold 12px sans-serif';uctx.textAlign='center';
  uctx.fillText('Wave '+uhWave+' · Enemies: '+alive,UW/2,19);

  // Pts
  uctx.fillStyle='rgba(255,215,0,.9)';uctx.font='bold 11px sans-serif';uctx.textAlign='left';
  uctx.fillText('⬆ '+uhUpgPts+' pts',8,20);

  // Weapon
  const w=WEAPONS[pWep];
  uctx.fillStyle='rgba(0,0,0,.5)';uctx.fillRect(UW/2-52,UH-42,104,22);
  uctx.fillStyle=w.color;uctx.font='bold 11px sans-serif';uctx.textAlign='center';
  uctx.fillText((pWep===0?'🔫':'🎯')+' '+w.name,UW/2,UH-27);

  // Ammo indicator (cooldown bar)
  if(pFire>0){
    const bw=60,bh=4;
    uctx.fillStyle='rgba(0,0,0,.5)';uctx.fillRect(UW/2-bw/2,UH-48,bw,bh);
    uctx.fillStyle=w.color;uctx.fillRect(UW/2-bw/2,UH-48,bw*(1-pFire/w.rate),bh);
  }

  // Screen flashes
  if(uhDF>0){uctx.fillStyle='rgba(255,0,0,'+(uhDF/15*.4)+')';uctx.fillRect(0,0,UW,UH);}
  if(uhKF>0){uctx.fillStyle='rgba(0,255,80,'+(uhKF/20*.18)+')';uctx.fillRect(0,0,UW,UH);}

  // Wave clear
  if(uhWCT>0){
    uctx.globalAlpha=Math.min(1,uhWCT/30);
    uctx.fillStyle='#ffd700';uctx.font='bold '+Math.round(UW*.08)+'px sans-serif';uctx.textAlign='center';
    uctx.fillText('WAVE CLEAR! 🎉',UW/2,UH/2-18);
    uctx.fillStyle='#fff';uctx.font='bold '+Math.round(UW*.05)+'px sans-serif';
    uctx.fillText('Choose upgrades →',UW/2,UH/2+20);
    uctx.globalAlpha=1;
  }

  // Sniper scope overlay
  if(pScope&&pWep===1){
    uctx.save();
    const sx=UW/2,sy=UH/2;
    uctx.fillStyle='rgba(0,0,10,.92)';uctx.fillRect(0,0,UW,UH);
    uctx.globalCompositeOperation='destination-out';
    uctx.beginPath();uctx.arc(sx,sy,uhScopeR,0,Math.PI*2);uctx.fill();
    uctx.globalCompositeOperation='source-over';
    uctx.strokeStyle='#4dd0e1';uctx.lineWidth=2;
    uctx.beginPath();uctx.arc(sx,sy,uhScopeR,0,Math.PI*2);uctx.stroke();
    uctx.strokeStyle='rgba(77,208,225,.55)';uctx.lineWidth=1;
    uctx.beginPath();uctx.moveTo(sx-uhScopeR,sy);uctx.lineTo(sx+uhScopeR,sy);
    uctx.moveTo(sx,sy-uhScopeR);uctx.lineTo(sx,sy+uhScopeR);uctx.stroke();
    uctx.restore();
  }

  // Virtual joystick
  if(vjOn){
    uctx.globalAlpha=.32;uctx.fillStyle='#fff';
    uctx.beginPath();uctx.arc(vjBX,vjBY,50,0,Math.PI*2);uctx.fill();
    uctx.globalAlpha=.65;uctx.fillStyle='#00b4d8';
    uctx.beginPath();uctx.arc(vjBX+Math.max(-50,Math.min(50,vjDX)),vjBY+Math.max(-50,Math.min(50,vjDY)),22,0,Math.PI*2);uctx.fill();
    uctx.globalAlpha=1;
  }

  // Minimap
  const mmW=68,mmH=68,mmX=UW-mmW-6,mmY=30;
  uctx.fillStyle='rgba(0,0,0,.55)';uctx.fillRect(mmX,mmY,mmW,mmH);
  const msx=mmW/COLS,msy=mmH/ROWS;
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    if(tileMap[r][c]===T_WALL){uctx.fillStyle='#1e2040';uctx.fillRect(mmX+c*msx,mmY+r*msy,msx+.5,msy+.5);}
  }
  for(const e of enemies){if(!e.dead){uctx.fillStyle=e.color;uctx.fillRect(mmX+e.x*msx-1,mmY+e.y*msy-1,2.5,2.5);}}
  uctx.fillStyle='#00e5ff';uctx.beginPath();uctx.arc(mmX+px*msx,mmY+py*msy,2.5,0,Math.PI*2);uctx.fill();
  uctx.strokeStyle='#00e5ff';uctx.lineWidth=1;uctx.beginPath();
  uctx.moveTo(mmX+px*msx,mmY+py*msy);uctx.lineTo(mmX+(px+pdx*2)*msx,mmY+(py+pdy*2)*msy);uctx.stroke();
  uctx.strokeStyle='rgba(0,180,255,.4)';uctx.strokeRect(mmX,mmY,mmW,mmH);
}

// ── Game loop ──────────────────────────────────────────────────────────────
let _uhLastTs=0;
function uhLoop(ts=0){
  if(!uhRunning){uhAnimId=null;return;}
  if(_uhLastTs&&ts-_uhLastTs<14){uhAnimId=requestAnimationFrame(uhLoop);return;}
  _uhLastTs=ts;
  uhUpdate();
  const zBuf=uhRayCast();
  renderSprites(zBuf);
  renderGun();
  renderHUD();
  uhAnimId=requestAnimationFrame(uhLoop);
}

// ── Overlays ───────────────────────────────────────────────────────────────
function showUhOverlay(s){document.getElementById('uhOverlay').style.display=s?'flex':'none';}
window.showUhOverlay=showUhOverlay;

function uhUpdateHUD(){
  const b=document.getElementById('uhUpgBtn');if(b) b.textContent='⬆ '+uhUpgPts+' pts';
  const wb=document.getElementById('uhWeaponBtn');if(wb) wb.textContent=WEAPONS[pWep].name;
}
function uhShowGameBtns(s){['uhShootBtn','uhScopeBtn','uhWeaponBtn','uhUpgBtn'].forEach(id=>{const el=document.getElementById(id);if(el) el.style.display=s?'':'none';});}

function uhShowUpgrades(){document.getElementById('uhUpgPanel').style.display='flex';uhRenderUpg();}
function uhRenderUpg(){
  document.getElementById('uhUpgContent').innerHTML=UPG_DEFS.map(u=>{
    const lv=uhUpgLvl[u.id]||0,ml=u.cost.length,cost=lv<ml?u.cost[lv]:null;
    const ok=cost!==null&&uhUpgPts>=cost,mx=cost===null;
    return`<div class="uh-upg-row"><span class="uh-upg-name">${u.icon} ${u.name}</span><span class="uh-upg-desc">${u.desc}</span><span class="uh-upg-lv">Lv ${lv}/${ml}</span>${mx?'<span class="uh-upg-max">MAX</span>':`<button class="uh-upg-btn"${ok?'':' disabled'} onclick="uhBuyUpg('${u.id}')">${cost} pts</button>`}</div>`;
  }).join('');
}
window.uhBuyUpg=function(id){
  const u=UPG_DEFS.find(d=>d.id===id);if(!u) return;
  const lv=uhUpgLvl[u.id]||0,cost=u.cost[lv];
  if(uhUpgPts<cost) return;
  uhUpgPts-=cost;uhUpgLvl[u.id]=lv+1;u.apply();uhRenderUpg();
};

window.uhStartGame=function(){
  uhResize();uhGenMap();
  uhWave=1;uhUpgPts=0;uhUpgLvl={};
  WEAPONS[0].dmg=18;WEAPONS[0].rate=18;WEAPONS[1].dmg=85;WEAPONS[1].rate=55;
  uhSpd=MOVE;uhHPMax=100;uhScopeR=80;pWep=0;
  uhParts=[];uhKF=0;uhDF=0;uhWCT=0;
  initPlayer();uhGenSpawn();
  showUhOverlay(false);
  document.getElementById('uhUpgPanel').style.display='none';
  uhShowGameBtns(true);uhUpdateHUD();
  uhRunning=true;
  if(uhAnimId) cancelAnimationFrame(uhAnimId);
  uhLoop();
};

document.getElementById('uhNextBtn').addEventListener('click',()=>{
  uhWave++;uhParts=[];initPlayer();uhGenSpawn();
  document.getElementById('uhUpgPanel').style.display='none';
  uhShowGameBtns(true);uhUpdateHUD();uhRunning=true;
  if(uhAnimId) cancelAnimationFrame(uhAnimId);uhLoop();
});

function uhGameOver(){
  uhRunning=false;uhShowGameBtns(false);
  document.getElementById('uhResult').textContent='💀 KIA on Wave '+uhWave+' · '+uhUpgPts+' pts earned';
  showUhOverlay(true);
  document.getElementById('uhPlayBtn').textContent='▶ Retry Mission';
}
window.exitUrbanHunt=function(){
  uhRunning=false;if(uhAnimId){cancelAnimationFrame(uhAnimId);uhAnimId=null;}
  uhShowGameBtns(false);navigate('home');
};

// ── Input ──────────────────────────────────────────────────────────────────
document.getElementById('uhPlayBtn').addEventListener('click',window.uhStartGame);
const sb=document.getElementById('uhShootBtn');
sb.addEventListener('touchstart',e=>{e.preventDefault();shootHeld=true;if(pWep===1) playerFire();},{passive:false});
sb.addEventListener('touchend',e=>{e.preventDefault();shootHeld=false;},{passive:false});
sb.addEventListener('mousedown',()=>{shootHeld=true;if(pWep===1) playerFire();});
sb.addEventListener('mouseup',()=>{shootHeld=false;});
const scb=document.getElementById('uhScopeBtn');
scb.addEventListener('touchstart',e=>{e.preventDefault();pScope=true;},{passive:false});
scb.addEventListener('touchend',e=>{e.preventDefault();pScope=false;},{passive:false});
scb.addEventListener('mousedown',()=>{pScope=true;});scb.addEventListener('mouseup',()=>{pScope=false;});
document.getElementById('uhWeaponBtn').addEventListener('click',()=>{pWep=(pWep+1)%2;pScope=false;uhUpdateHUD();});
document.getElementById('uhUpgBtn').addEventListener('click',()=>{if(!uhRunning) return;uhRunning=false;uhShowUpgrades();});

uhc.addEventListener('touchstart',e=>{
  e.preventDefault();
  for(const t of e.changedTouches){
    const rect=uhc.getBoundingClientRect();
    const tx=t.clientX-rect.left,ty=t.clientY-rect.top;
    if(tx<UW/2){if(!vjOn){vjOn=true;vjId=t.identifier;vjBX=tx;vjBY=ty;vjDX=0;vjDY=0;}}
    else{if(!aimOn){aimOn=true;aimId=t.identifier;aimLX=tx;}}
  }
},{passive:false});
uhc.addEventListener('touchmove',e=>{
  e.preventDefault();
  for(const t of e.changedTouches){
    const rect=uhc.getBoundingClientRect();
    if(t.identifier===vjId){vjDX=t.clientX-rect.left-vjBX;vjDY=t.clientY-rect.top-vjBY;}
    if(t.identifier===aimId){const nx=t.clientX-rect.left;rotP((nx-aimLX)*0.003);aimLX=nx;}
  }
},{passive:false});
uhc.addEventListener('touchend',e=>{
  e.preventDefault();
  for(const t of e.changedTouches){
    if(t.identifier===vjId){vjOn=false;vjId=-1;vjDX=0;vjDY=0;}
    if(t.identifier===aimId){aimOn=false;aimId=-1;}
  }
},{passive:false});

let md=false;
uhc.addEventListener('mousedown',e=>{
  md=true;const rect=uhc.getBoundingClientRect();const mx=e.clientX-rect.left;
  if(mx<UW/2){vjOn=true;vjId=0;vjBX=mx;vjBY=e.clientY-rect.top;vjDX=0;vjDY=0;}
  else{aimOn=true;aimLX=mx;}
});
uhc.addEventListener('mousemove',e=>{
  if(!md) return;
  const rect=uhc.getBoundingClientRect();
  if(vjOn){vjDX=e.clientX-rect.left-vjBX;vjDY=e.clientY-rect.top-vjBY;}
  else{rotP(e.movementX*0.003);}
});
uhc.addEventListener('mouseup',()=>{md=false;vjOn=false;vjId=-1;vjDX=0;vjDY=0;aimOn=false;});
document.addEventListener('keydown',e=>{keys[e.key]=true;if(e.key==='Tab') e.preventDefault();});
document.addEventListener('keyup',e=>{keys[e.key]=false;});
window.addEventListener('resize',()=>{if(typeof currentPage!=='undefined'&&currentPage==='hunter') uhResize();});

// ── Idle frame ─────────────────────────────────────────────────────────────
uhResize();
uctx.fillStyle='#080814';uctx.fillRect(0,0,UW,UH);
// Perspective corridor effect
uctx.strokeStyle='rgba(0,180,255,0.25)';uctx.lineWidth=1;
for(let i=0;i<=8;i++){const x=i*UW/8;uctx.beginPath();uctx.moveTo(UW/2,UH/2);uctx.lineTo(x,0);uctx.stroke();uctx.beginPath();uctx.moveTo(UW/2,UH/2);uctx.lineTo(x,UH);uctx.stroke();}
uctx.fillStyle='rgba(0,0,0,.45)';uctx.fillRect(0,0,UW,UH/2);
uctx.fillStyle='rgba(0,0,0,.3)';uctx.fillRect(0,UH/2,UW,UH/2);
uctx.fillStyle='rgba(255,255,255,.85)';uctx.font='bold 22px sans-serif';uctx.textAlign='center';
uctx.fillText('🔫 Urban Hunt 3D',UW/2,UH/2-12);
uctx.fillStyle='rgba(255,255,255,.4)';uctx.font='13px sans-serif';
uctx.fillText('First-person raycaster · Tap to start',UW/2,UH/2+16);
uctx.fillStyle='rgba(0,180,255,.5)';uctx.font='11px sans-serif';
uctx.fillText('WASD/joystick move · drag right to look · 🔫 shoot',UW/2,UH/2+36);

})();
