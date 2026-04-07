// ══════════════════════════════════════════════════════════════════════════
// BUBBLE STACK GAME — multiple bubbles fall at once, tap to collect
// ══════════════════════════════════════════════════════════════════════════

const BUBBLE_KEY='siddhArcade_bubbleStats';
let bCanvas, bCtx, bW, bH;
let bState='idle'; // idle | playing | ended
let bRaf=null;
let bCoins=0, bStackedCount=0, bTrophyEarned=false;
let bBubbles=[];      // active falling bubbles
let bCollected=[];    // collected bubbles stacking at bottom
let bFallSpeed=3.0;
let bSpawnTimer=0;
let bSpawnInterval=15; // frames between spawns
let bMissed=0;
let bMaxMissed=5;     // miss 5 normal/star bubbles = game over
let bTrophyShown=false;
let bTrophyAnim=0;
let bFloats=[];       // floating text animations
let bDifficulty=0;

const B_RADIUS=20;
const B_MAX_ON_SCREEN=30;

function loadBubbleStats(){
  try{return JSON.parse(localStorage.getItem(BUBBLE_KEY))||{totalCoins:0,bestCoins:0,gamesPlayed:0,trophies:0};}
  catch(e){return{totalCoins:0,bestCoins:0,gamesPlayed:0,trophies:0};}
}
function saveBubbleStats(s){localStorage.setItem(BUBBLE_KEY,JSON.stringify(s));}

function bResize(){
  const cont=document.getElementById('bubbleContainer');
  bW=cont.clientWidth;
  bH=cont.clientHeight;
  bCanvas.width=bW;
  bCanvas.height=bH;
}

function showBubbleOverlay(showResults){
  const ov=document.getElementById('bubbleOverlay');
  ov.style.display='flex';
  const earned=document.getElementById('bubbleEarned');
  const result=document.getElementById('bubbleResult');
  const trophy=document.getElementById('bubbleTrophy');
  if(showResults){
    earned.style.display='block';
    earned.textContent='🪙 '+bCoins+' coins ($'+(bCoins/10).toFixed(0)+')';
    result.style.display='block';
    result.textContent='Collected '+bStackedCount+' bubbles!';
    if(bTrophyEarned){
      trophy.style.display='block';
      trophy.textContent='🏆 Trophy earned! You collected 1000+ coins!';
    } else {
      trophy.style.display='none';
    }
    document.getElementById('bubblePlayBtn').textContent='▶ Play Again';
  } else {
    earned.style.display='none';
    result.style.display='none';
    trophy.style.display='none';
    document.getElementById('bubblePlayBtn').textContent='▶ Play';
  }
}

function exitBubbleGame(){
  bState='idle';
  if(bRaf) cancelAnimationFrame(bRaf);
  bRaf=null;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-home').classList.add('active');
  document.getElementById('bottomNav').style.display='flex';
  currentPage='home';
  refreshHome();
}

function bPickType(){
  const r=Math.random();
  if(r<0.12) return 'star';   // 12% star
  if(r<0.30) return 'snake';  // 18% snake
  return 'normal';             // 70% normal
}

function bSpawnBubble(){
  if(bBubbles.length>=B_MAX_ON_SCREEN) return;
  // random x, avoid edges
  const margin=B_RADIUS+10;
  const x=margin+Math.random()*(bW-margin*2);
  const type=bPickType();
  // vary speed per bubble
  const speed=bFallSpeed*(0.8+Math.random()*0.5);
  bBubbles.push({
    x: x,
    y: -B_RADIUS,
    radius: B_RADIUS,
    type: type,
    speed: speed,
    popping: false,
    popFrame: 0
  });
}

function bAddFloat(text, color, x, y){
  bFloats.push({text,color,x,y,life:45});
}

function bAddCoins(amount, x, y){
  bCoins+=amount;
  if(bCoins<0) bCoins=0;
  if(amount>0){
    bAddFloat('+'+amount, '#ffd700', x, y);
  } else {
    bAddFloat(amount+'', '#ff4444', x, y);
  }
  document.getElementById('bubbleCoins').textContent=bCoins;
  document.getElementById('bubbleDollars').textContent='$'+(bCoins/10).toFixed(0);
  // trophy check
  if(bCoins>=1000 && !bTrophyShown){
    bTrophyShown=true;
    bTrophyEarned=true;
    bTrophyAnim=120;
  }
}

function bHitTest(tapX, tapY){
  // find closest bubble to tap
  let best=null, bestDist=Infinity;
  for(let i=0;i<bBubbles.length;i++){
    const b=bBubbles[i];
    if(b.popping) continue;
    const dx=tapX-b.x, dy=tapY-b.y;
    const dist=Math.sqrt(dx*dx+dy*dy);
    if(dist<B_RADIUS*1.5 && dist<bestDist){
      best=b; bestDist=dist;
    }
  }
  return best;
}

function bHandleTap(tapX, tapY){
  if(bState!=='playing') return;
  const rect=bCanvas.getBoundingClientRect();
  const x=(tapX-rect.left)*(bW/rect.width);
  const y=(tapY-rect.top)*(bH/rect.height);
  const hit=bHitTest(x,y);
  if(!hit) return;

  if(hit.type==='snake'){
    // tapped snake — lose coins
    bAddCoins(-20, hit.x, hit.y);
    hit.popping=true;
    hit.popFrame=0;
  } else if(hit.type==='star'){
    bAddCoins(60, hit.x, hit.y);
    bStackedCount++;
    hit.popping=true;
    hit.popFrame=0;
    bAddCollected('star');
  } else {
    bAddCoins(10, hit.x, hit.y);
    bStackedCount++;
    hit.popping=true;
    hit.popFrame=0;
    bAddCollected('normal');
  }
  document.getElementById('bubbleCount').textContent=bStackedCount;
}

function bAddCollected(type){
  // add a small bubble to the stack at bottom
  const row=Math.floor(bCollected.length/8);
  const col=bCollected.length%8;
  const size=14;
  const startX=20;
  const startY=bH-20;
  bCollected.push({
    x: startX+col*(size*2+4),
    y: startY-row*(size*2+4),
    radius: size,
    type: type
  });
}

function bUpdate(){
  if(bState!=='playing') return;

  // spawn new bubbles
  bSpawnTimer++;
  if(bSpawnTimer>=bSpawnInterval){
    bSpawnTimer=0;
    // spawn 1-3 bubbles at once
    const count=4+Math.floor(Math.random()*4);
    for(let i=0;i<count;i++) bSpawnBubble();
  }

  // update falling bubbles
  for(let i=bBubbles.length-1;i>=0;i--){
    const b=bBubbles[i];

    if(b.popping){
      b.popFrame++;
      if(b.popFrame>10){
        bBubbles.splice(i,1);
      }
      continue;
    }

    b.y+=b.speed;

    // slight horizontal drift
    b.x+=Math.sin(b.y*0.02)*0.3;
    if(b.x<B_RADIUS) b.x=B_RADIUS;
    if(b.x>bW-B_RADIUS) b.x=bW-B_RADIUS;

    // hit bottom — just remove, no game over
    if(b.y > bH+B_RADIUS){
      bBubbles.splice(i,1);
    }
  }

  // update floats
  for(let i=bFloats.length-1;i>=0;i--){
    bFloats[i].life--;
    bFloats[i].y-=1.2;
    if(bFloats[i].life<=0) bFloats.splice(i,1);
  }

  // increase difficulty over time
  if(bStackedCount>0 && bStackedCount%10===0 && bStackedCount!==bDifficulty){
    bDifficulty=bStackedCount;
    bFallSpeed=Math.min(4, bFallSpeed+0.15);
    bSpawnInterval=Math.max(20, bSpawnInterval-3);
  }
}

function bDrawBubble(ctx, bub){
  const r=bub.radius;
  let drawX=bub.x, drawY=bub.y;

  // pop animation
  if(bub.popping){
    const scale=1+bub.popFrame*0.15;
    const alpha=1-bub.popFrame/10;
    ctx.save();
    ctx.globalAlpha=Math.max(0,alpha);
    ctx.translate(drawX,drawY);
    ctx.scale(scale,scale);
    ctx.translate(-drawX,-drawY);
  }

  ctx.save();
  if(bub.type==='normal'){
    const grad=ctx.createRadialGradient(drawX-r*0.3, drawY-r*0.3, r*0.1, drawX, drawY, r);
    grad.addColorStop(0,'rgba(120,200,255,0.9)');
    grad.addColorStop(0.7,'rgba(50,140,240,0.8)');
    grad.addColorStop(1,'rgba(20,80,180,0.6)');
    ctx.beginPath();
    ctx.arc(drawX, drawY, r, 0, Math.PI*2);
    ctx.fillStyle=grad;
    ctx.fill();
    // shine
    ctx.beginPath();
    ctx.arc(drawX-r*0.25, drawY-r*0.25, r*0.2, 0, Math.PI*2);
    ctx.fillStyle='rgba(255,255,255,0.4)';
    ctx.fill();
    // coin label
    ctx.fillStyle='#fff';
    ctx.font='bold '+Math.round(r*0.55)+'px sans-serif';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText('10', drawX, drawY+2);
  } else if(bub.type==='snake'){
    const grad=ctx.createRadialGradient(drawX-r*0.3, drawY-r*0.3, r*0.1, drawX, drawY, r);
    grad.addColorStop(0,'rgba(100,220,100,0.9)');
    grad.addColorStop(0.7,'rgba(50,160,50,0.8)');
    grad.addColorStop(1,'rgba(150,40,40,0.7)');
    ctx.beginPath();
    ctx.arc(drawX, drawY, r, 0, Math.PI*2);
    ctx.fillStyle=grad;
    ctx.fill();
    // danger ring
    ctx.strokeStyle='rgba(255,50,50,0.6)';
    ctx.lineWidth=2;
    ctx.stroke();
    // snake emoji
    ctx.font=Math.round(r*0.85)+'px sans-serif';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText('🐍', drawX, drawY);
  } else if(bub.type==='star'){
    const grad=ctx.createRadialGradient(drawX-r*0.3, drawY-r*0.3, r*0.1, drawX, drawY, r);
    grad.addColorStop(0,'rgba(255,240,100,0.95)');
    grad.addColorStop(0.7,'rgba(255,200,0,0.85)');
    grad.addColorStop(1,'rgba(200,150,0,0.7)');
    ctx.beginPath();
    ctx.arc(drawX, drawY, r, 0, Math.PI*2);
    ctx.fillStyle=grad;
    ctx.fill();
    // glow
    ctx.shadowColor='#ffd700';
    ctx.shadowBlur=12;
    ctx.stroke();
    ctx.shadowBlur=0;
    // star emoji
    ctx.font=Math.round(r*0.85)+'px sans-serif';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText('⭐', drawX, drawY);
  }
  ctx.restore();

  if(bub.popping) ctx.restore();
}

function bRender(){
  bCtx.clearRect(0,0,bW,bH);

  // background
  const bgGrad=bCtx.createLinearGradient(0,0,0,bH);
  bgGrad.addColorStop(0,'#0b0b2a');
  bgGrad.addColorStop(1,'#1a1a4a');
  bCtx.fillStyle=bgGrad;
  bCtx.fillRect(0,0,bW,bH);

  // draw collected stack at bottom
  for(let i=0;i<bCollected.length;i++){
    const c=bCollected[i];
    bCtx.save();
    bCtx.globalAlpha=0.5;
    const grad=bCtx.createRadialGradient(c.x,c.y,1,c.x,c.y,c.radius);
    if(c.type==='star'){
      grad.addColorStop(0,'rgba(255,230,80,0.8)');
      grad.addColorStop(1,'rgba(200,150,0,0.4)');
    } else {
      grad.addColorStop(0,'rgba(100,180,255,0.8)');
      grad.addColorStop(1,'rgba(30,80,180,0.4)');
    }
    bCtx.beginPath();
    bCtx.arc(c.x,c.y,c.radius,0,Math.PI*2);
    bCtx.fillStyle=grad;
    bCtx.fill();
    bCtx.restore();
  }

  // draw falling bubbles
  for(let i=0;i<bBubbles.length;i++){
    bDrawBubble(bCtx, bBubbles[i]);
  }


  // draw floating texts
  bCtx.save();
  for(let i=0;i<bFloats.length;i++){
    const f=bFloats[i];
    bCtx.globalAlpha=Math.min(1,f.life/15);
    bCtx.fillStyle=f.color;
    bCtx.font='bold 18px sans-serif';
    bCtx.textAlign='center';
    bCtx.fillText(f.text, f.x, f.y);
  }
  bCtx.restore();

  // trophy animation
  if(bTrophyAnim>0){
    bTrophyAnim--;
    bCtx.save();
    bCtx.globalAlpha=Math.min(1, bTrophyAnim/30);
    bCtx.font='bold 56px sans-serif';
    bCtx.textAlign='center';
    bCtx.textBaseline='middle';
    bCtx.fillText('🏆', bW/2, bH/2-(120-bTrophyAnim)*0.5);
    bCtx.font='bold 20px sans-serif';
    bCtx.fillStyle='#ffd700';
    bCtx.fillText('TROPHY EARNED!', bW/2, bH/2+45-(120-bTrophyAnim)*0.5);
    bCtx.restore();
  }
}

let _bLastTs=0;
function bLoop(ts=0){
  if(bState!=='playing'){
    if(bRaf) cancelAnimationFrame(bRaf);
    bRaf=null;
    return;
  }
  if(_bLastTs&&ts-_bLastTs<14){bRaf=requestAnimationFrame(bLoop);return;}
  _bLastTs=ts;
  bUpdate();
  bRender();
  bRaf=requestAnimationFrame(bLoop);
}

function bStartGame(){
  bState='playing';
  bCoins=0;
  bStackedCount=0;
  bBubbles=[];
  bCollected=[];
  bFloats=[];
  bFallSpeed=3.0;
  bSpawnTimer=0;
  bSpawnInterval=15;
  bMissed=0;
  bDifficulty=0;
  bTrophyEarned=false;
  bTrophyShown=false;
  bTrophyAnim=0;

  document.getElementById('bubbleCoins').textContent='0';
  document.getElementById('bubbleDollars').textContent='$0';
  document.getElementById('bubbleCount').textContent='0';
  document.getElementById('bubbleOverlay').style.display='none';

  bResize();
  bRaf=requestAnimationFrame(bLoop);
}

function bEndGame(){
  bState='ended';
  if(bRaf) cancelAnimationFrame(bRaf);
  bRaf=null;

  // save stats
  const stats=loadBubbleStats();
  stats.gamesPlayed++;
  stats.totalCoins+=bCoins;
  if(bCoins>stats.bestCoins) stats.bestCoins=bCoins;
  if(bTrophyEarned) stats.trophies++;
  saveBubbleStats(stats);

  // record in main stats
  recordGameEnd(bCoins, bStackedCount);

  setTimeout(()=>showBubbleOverlay(true), 400);
}

// ── INIT ──
(function bInit(){
  bCanvas=document.getElementById('bubbleCanvas');
  if(!bCanvas) return;
  bCtx=bCanvas.getContext('2d');

  // play button
  document.getElementById('bubblePlayBtn').addEventListener('click',(e)=>{
    e.stopPropagation();
    bStartGame();
  });

  // tap to collect bubbles
  document.getElementById('bubbleCanvas').addEventListener('click',(e)=>{
    if(bState!=='playing') return;
    bHandleTap(e.clientX, e.clientY);
  });
  document.getElementById('bubbleCanvas').addEventListener('touchstart',(e)=>{
    if(bState!=='playing') return;
    e.preventDefault();
    const t=e.touches[0];
    bHandleTap(t.clientX, t.clientY);
  },{passive:false});

  // resize
  window.addEventListener('resize',()=>{
    if(currentPage==='bubble') bResize();
  });
})();
