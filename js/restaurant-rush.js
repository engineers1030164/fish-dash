// ══════════════════════════════════════════════════════════════════════════
// RESTAURANT RUSH — Game Engine  (responsive, phone-optimised)
// ══════════════════════════════════════════════════════════════════════════
const rc=document.getElementById('vendorCanvas');
const rctx=rc.getContext('2d');
let RW=520,RH=400,S=1;

// Layout constants — recalculated by rResize()
let R_KITCHEN_H,R_TABLE_ROW1,R_TABLE_ROW2,R_FLOOR_BOT;
let R_TABLE_DEFS,R_KITCHEN_SUBMIT,R_KITCHEN_PICKUP;

function rResize(){
  const cont=document.getElementById('vendorContainer');
  RW=Math.max(260,cont.clientWidth||520);
  RH=Math.max(300,cont.clientHeight||400);
  rc.width=RW; rc.height=RH;
  S=Math.min(RW/520,RH/400);
  R_KITCHEN_H=Math.round(RH*0.175);
  R_TABLE_ROW1=Math.round(RH*0.3875);
  R_TABLE_ROW2=Math.round(RH*0.6375);
  R_FLOOR_BOT=Math.round(RH*0.925);
  R_KITCHEN_SUBMIT={x:Math.round(RW*0.25),y:Math.round(R_KITCHEN_H*0.6)};
  R_KITCHEN_PICKUP={x:Math.round(RW*0.75),y:Math.round(R_KITCHEN_H*0.6)};
  R_TABLE_DEFS=[
    {id:0,x:Math.round(RW*0.173),y:R_TABLE_ROW1,seats:2},
    {id:1,x:Math.round(RW*0.5),  y:R_TABLE_ROW1,seats:4},
    {id:2,x:Math.round(RW*0.827),y:R_TABLE_ROW1,seats:2},
    {id:3,x:Math.round(RW*0.25), y:R_TABLE_ROW2,seats:4},
    {id:4,x:Math.round(RW*0.712),y:R_TABLE_ROW2,seats:4},
  ];
  if(rTables&&rTables.length)
    rTables.forEach(t=>{const d=R_TABLE_DEFS.find(d=>d.id===t.id);if(d){t.x=d.x;t.y=d.y;}});
}

const R_DISHES=[
  {emoji:'🍔',name:'Burger',cook:90, price:12,tip:4},
  {emoji:'🍕',name:'Pizza', cook:120,price:18,tip:6},
  {emoji:'🍣',name:'Sushi', cook:75, price:22,tip:8},
  {emoji:'🍝',name:'Pasta', cook:100,price:15,tip:5},
  {emoji:'🥗',name:'Salad', cook:50, price:10,tip:3},
  {emoji:'🍜',name:'Ramen', cook:110,price:16,tip:5},
];
const R_CUST=['👨','👩','🧔','👱','👧','👦','🧑'];
const R_LVL_XP=[0,120,350,750,1500,3000,6000];

let rState='idle',rRaf,rFrame=0;
let rScore=0,rTips=0,rLevel=1,rXP=0,rMoney=0,rServed=0;
let rTables=[],rKitchen=[],rQueue=[],rFloats=[],rParticles=[],rTapRipples=[];
let rSpawnTimer=0,rShakeTimer=0;
let rUpg={speed:0,kitchen:0,water:false,table4:false,table5:false,autoServe:false};
let rPlayer={x:260,y:330,state:'idle',targetX:260,targetY:330,dir:1,carrying:null,task:null,actTimer:0};

// ── TAP QUEUE ──
let rTapQueue=[];
const R_TAP_QUEUE_MAX=5;

function rRI(a,b){return a+Math.floor(Math.random()*(b-a+1));}
function rDish(){return R_DISHES[rRI(0,Math.min(R_DISHES.length-1,1+rLevel))];}

function rInitTables(){
  let n=3;
  if(rUpg.table4)n=4;
  if(rUpg.table5)n=5;
  rTables=R_TABLE_DEFS.slice(0,n).map(d=>({
    ...d,state:'empty',cust:null,order:null,eatTimer:0,bill:0,tip:0
  }));
}

// ── Particles ──
function rSpawnParticles(x,y,color,count,lift=1){
  for(let i=0;i<count;i++){
    const a=Math.random()*Math.PI*2;
    const sp=1.5+Math.random()*4;
    rParticles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-lift,r:(3+Math.random()*3)*S,life:1,color});
  }
}
function rAddRipple(x,y){
  rTapRipples.push({x,y,r:0,maxR:55*S,life:1});
}
function rShake(frames=8){rShakeTimer=frames;}

// ── Player movement ──
function rPlayerUpdate(){
  const spd=(3.5+rUpg.speed*0.8)*(S+0.5)/1.5;
  if(rPlayer.state==='moving'){
    const dx=rPlayer.targetX-rPlayer.x,dy=rPlayer.targetY-rPlayer.y;
    const dist=Math.sqrt(dx*dx+dy*dy);
    if(dist<spd+1){
      rPlayer.x=rPlayer.targetX;rPlayer.y=rPlayer.targetY;
      rPlayer.state='acting';rPlayer.actTimer=12;
    }else{
      rPlayer.x+=dx/dist*spd;rPlayer.y+=dy/dist*spd;
      rPlayer.dir=dx>=0?1:-1;
    }
  }else if(rPlayer.state==='acting'){
    rPlayer.actTimer--;
    if(rPlayer.actTimer<=0)rExecTask();
  }else if(rPlayer.state==='idle'){
    rProcessQueue();
  }
}

function rGoTo(tx,ty,task){
  if(rPlayer.state!=='idle')return false;
  rPlayer.targetX=tx;rPlayer.targetY=ty;
  rPlayer.task=task;rPlayer.state='moving';
  return true;
}

function rFloat(x,y,txt,color){
  rFloats.push({x,y,txt,color,life:1.4,vy:-0.8});
}

// ── Queue processing ──
function rResolveTap(mx,my){
  const hitMarginY=40*S;
  if(my<R_KITCHEN_H+20*S){
    const hasReady=rKitchen.some(s=>s.ready);
    if(hasReady&&!rPlayer.carrying) return {tx:R_KITCHEN_PICKUP.x,ty:R_KITCHEN_PICKUP.y+40*S,task:{type:'pickup'}};
    return null;
  }
  for(const t of rTables){
    const tw=(t.seats===2?65:90)*S;
    if(Math.abs(mx-t.x)<tw/2+20*S&&Math.abs(my-t.y)<hitMarginY){
      if(t.state==='empty'&&rQueue.length>0) return {tx:t.x,ty:t.y+35*S,task:{type:'seat',tableId:t.id}};
      if(t.state==='seated'&&t.cust?.orderReady) return {tx:t.x,ty:t.y+35*S,task:{type:'take-order',tableId:t.id}};
      if(t.state==='food-ready'&&!rPlayer.carrying) return {tx:R_KITCHEN_PICKUP.x,ty:R_KITCHEN_PICKUP.y+40*S,task:{type:'pickup'}};
      if(t.state==='ready-serve'&&rPlayer.carrying?.tableId===t.id) return {tx:t.x,ty:t.y+35*S,task:{type:'serve',tableId:t.id}};
      if(t.state==='paying') return {tx:t.x,ty:t.y+35*S,task:{type:'collect',tableId:t.id}};
      if(rUpg.water&&t.cust&&t.state!=='empty'&&t.state!=='paying') return {tx:t.x,ty:t.y+35*S,task:{type:'water',tableId:t.id}};
      return null;
    }
  }
  return null;
}

function rProcessQueue(){
  if(rTapQueue.length===0||rPlayer.state!=='idle')return;
  while(rTapQueue.length>0){
    const q=rTapQueue.shift();
    const resolved=rResolveTap(q.mx,q.my);
    if(resolved){rGoTo(resolved.tx,resolved.ty,resolved.task);return;}
  }
}

// ── Task execution ──
function rExecTask(){
  const t=rPlayer.task;
  if(!t){rPlayer.state='idle';return;}
  const tbl=t.tableId!=null?rTables.find(tb=>tb.id===t.tableId):null;

  if(t.type==='seat'&&tbl&&tbl.state==='empty'&&rQueue.length>0){
    let ci=rQueue.findIndex(q=>q.size<=tbl.seats);
    if(ci<0)ci=0;
    const c=rQueue.splice(ci,1)[0];
    tbl.state='seated';
    tbl.cust={emojis:c.emojis,size:c.size,happiness:100,hapTimer:0,
              orderTimer:rRI(60,120),orderReady:false,dish:null};
    rFloat(tbl.x,tbl.y-45*S,'Seated!','#80ff80');
    rSpawnParticles(tbl.x,tbl.y-20*S,'#80ff80',6,1.5);
  }
  else if(t.type==='take-order'&&tbl&&tbl.state==='seated'&&tbl.cust?.orderReady){
    const dish=tbl.cust.dish||rDish();
    tbl.order={dish};tbl.state='order-taken';
    rPlayer.carrying={type:'order',tableId:tbl.id,dish};
    rPlayer.state='idle';rPlayer.task=null;
    rGoTo(R_KITCHEN_SUBMIT.x,R_KITCHEN_SUBMIT.y+40*S,{type:'submit',tableId:tbl.id});
    return;
  }
  else if(t.type==='submit'&&rPlayer.carrying?.type==='order'){
    const tid=rPlayer.carrying.tableId;
    const tb=rTables.find(x=>x.id===tid);
    if(tb&&tb.cust&&rKitchen.length<1+rUpg.kitchen){
      tb.state='cooking';
      const d=rPlayer.carrying.dish;
      rKitchen.push({tableId:tid,dish:d,timer:d.cook,total:d.cook,ready:false});
      rPlayer.carrying=null;
      rFloat(R_KITCHEN_SUBMIT.x,R_KITCHEN_SUBMIT.y+20*S,'Order in!','#fff');
    }else{
      if(tb&&tb.cust){tb.state='seated';tb.cust.orderReady=true;}
      rPlayer.carrying=null;
      rFloat(RW/2,RH/2,tb&&tb.cust?'Kitchen full!':'Customer left!','#ff5252');
    }
  }
  else if(t.type==='pickup'){
    const slot=rKitchen.find(s=>s.ready);
    if(slot){
      const tb=rTables.find(x=>x.id===slot.tableId);
      if(tb&&tb.cust){
        rPlayer.carrying={type:'food',tableId:slot.tableId,dish:slot.dish};
        tb.state='ready-serve';
        rKitchen=rKitchen.filter(s2=>s2!==slot);
        rFloat(R_KITCHEN_PICKUP.x,R_KITCHEN_PICKUP.y+20*S,'Picked up!','#ffd700');
        rSpawnParticles(R_KITCHEN_PICKUP.x,R_KITCHEN_PICKUP.y,'#ffd700',8,2);
        rPlayer.state='idle';rPlayer.task=null;
        rGoTo(tb.x,tb.y+35*S,{type:'serve',tableId:tb.id});
        return;
      }else{
        rKitchen=rKitchen.filter(s2=>s2!==slot);
        rFloat(RW/2,RH/2,'Customer left!','#ff5252');
      }
    }
  }
  else if(t.type==='serve'&&rPlayer.carrying?.type==='food'){
    const tid=rPlayer.carrying.tableId;
    const tb=rTables.find(x=>x.id===tid);
    if(tb&&tb.cust){
      tb.state='eating';
      tb.eatTimer=180+tb.cust.size*30;
      const h=tb.cust.happiness;
      tb.tip=Math.round(rPlayer.carrying.dish.tip*(h/100));
      tb.bill=rPlayer.carrying.dish.price;
      rFloat(tb.x,tb.y-45*S,'Served! 🎉','#ffd700');
      rSpawnParticles(tb.x,tb.y-20*S,'#ffd700',12,2);
      rSpawnParticles(tb.x,tb.y-20*S,'#ff9800',8,2.5);
    }
    rPlayer.carrying=null;
  }
  else if(t.type==='collect'&&tbl&&tbl.state==='paying'){
    const total=tbl.bill+tbl.tip;
    rScore+=total;rXP+=total;rMoney+=total;rTips+=tbl.tip;rServed++;
    rFloat(tbl.x,tbl.y-45*S,'+$'+tbl.bill+(tbl.tip>0?' +$'+tbl.tip+' tip':''),'#ffd700');
    rSpawnParticles(tbl.x,tbl.y,'#ffd700',15,3);
    rSpawnParticles(tbl.x,tbl.y,'#ffeb3b',10,2.5);
    tbl.state='empty';tbl.cust=null;tbl.order=null;
    rCheckLevel();rUpdateHUD();
  }
  else if(t.type==='water'&&tbl&&tbl.cust&&tbl.state!=='empty'&&tbl.state!=='paying'){
    tbl.cust.happiness=Math.min(100,tbl.cust.happiness+15);
    rFloat(tbl.x,tbl.y-45*S,'+15 happy 💧','#00bcd4');
    rSpawnParticles(tbl.x,tbl.y,'#00bcd4',8,2);
  }

  rPlayer.state='idle';rPlayer.task=null;
}

function rCheckLevel(){
  if(rLevel>=6)return;
  if(rXP>=R_LVL_XP[rLevel]){
    rLevel++;
    rFloat(RW/2,RH/2-30,'Level '+rLevel+'! ⭐','#00e5ff');
    rSpawnParticles(RW/2,RH/2,'#00e5ff',20,2);
    rSpawnParticles(RW/2,RH/2,'#fff',15,2.5);
    if(rLevel>=3&&!rUpg.table4){
      rUpg.table4=true;
      const d=R_TABLE_DEFS[3];
      rTables.push({...d,state:'empty',cust:null,order:null,eatTimer:0,bill:0,tip:0});
      rFloat(d.x,d.y,'New Table!','#00e5ff');
    }
    if(rLevel>=5&&!rUpg.table5){
      rUpg.table5=true;
      const d=R_TABLE_DEFS[4];
      rTables.push({...d,state:'empty',cust:null,order:null,eatTimer:0,bill:0,tip:0});
      rFloat(d.x,d.y,'New Table!','#00e5ff');
    }
    rUpdateHUD();
  }
}

// ── Kitchen update ──
function rKitchenUpdate(){
  for(const s of rKitchen){
    if(!s.ready){
      s.timer--;
      if(s.timer<=0){
        s.ready=true;
        const tb=rTables.find(x=>x.id===s.tableId);
        if(tb)tb.state='food-ready';
        rFloat(R_KITCHEN_PICKUP.x,R_KITCHEN_PICKUP.y+20*S,'Ready! 🔔','#ffd700');
        rSpawnParticles(R_KITCHEN_PICKUP.x,R_KITCHEN_PICKUP.y,'#80ff00',10,2);
      }
    }
  }
  if(rUpg.autoServe&&rPlayer.state==='idle'&&!rPlayer.carrying){
    const slot=rKitchen.find(s=>s.ready);
    if(slot){
      const tb=rTables.find(x=>x.id===slot.tableId);
      if(tb&&tb.cust){
        tb.state='eating';tb.eatTimer=180+tb.cust.size*30;
        tb.tip=Math.round(slot.dish.tip*(tb.cust.happiness/100));
        tb.bill=slot.dish.price;
        rKitchen=rKitchen.filter(s2=>s2!==slot);
        rFloat(tb.x,tb.y-45*S,'Auto! ⚡','#00e5ff');
      }
    }
  }
}

// ── Table update ──
function rTablesUpdate(){
  for(const t of rTables){
    if(!t.cust)continue;
    const rate=t.state==='eating'?0.003:t.state==='cooking'||t.state==='food-ready'?0.008:0.006;
    t.cust.happiness=Math.max(0,t.cust.happiness-rate);
    if(t.cust.happiness<=0&&t.state!=='eating'&&t.state!=='paying'){
      rFloat(t.x,t.y-45*S,'Left! 😤','#ff5252');
      rSpawnParticles(t.x,t.y,'#ff5252',8,1);
      rShake(10);
      t.state='empty';t.cust=null;t.order=null;
      rKitchen=rKitchen.filter(s=>s.tableId!==t.id);
      rScore=Math.max(0,rScore-5);rUpdateHUD();
    }
    if(t.state==='seated'&&t.cust&&!t.cust.orderReady){
      t.cust.orderTimer--;
      if(t.cust.orderTimer<=0){t.cust.orderReady=true;t.cust.dish=rDish();}
    }
    if(t.state==='eating'){
      t.eatTimer--;
      if(t.eatTimer<=0){t.state='paying';rFloat(t.x,t.y-35*S,'Pay! 💰','#80ff80');}
    }
  }
}

// ── Tap handler ──
function rHandleTap(mx,my){
  if(rState!=='playing')return;
  rAddRipple(mx,my);
  if(rPlayer.state==='idle'){
    const resolved=rResolveTap(mx,my);
    if(resolved){rGoTo(resolved.tx,resolved.ty,resolved.task);return;}
  }
  if(rTapQueue.length<R_TAP_QUEUE_MAX) rTapQueue.push({mx,my});
}

// ── HUD ──
function rUpdateHUD(){
  document.getElementById('vendorMoney').textContent='$'+rScore;
  document.getElementById('vendorLevel').textContent='Lv '+rLevel;
  document.getElementById('vendorHonks').textContent='Served '+rServed;
  const tgt=R_LVL_XP[Math.min(rLevel,R_LVL_XP.length-1)];
  const prev=R_LVL_XP[Math.max(0,rLevel-1)];
  document.getElementById('vendorXpBar').style.width=(Math.min(1,(rXP-prev)/Math.max(1,tgt-prev))*100)+'%';
}

// ══════════════════════════════════════════════════════════════════════════
// RENDER
// ══════════════════════════════════════════════════════════════════════════

function rDrawKitchen(){
  const kg=rctx.createLinearGradient(0,0,0,R_KITCHEN_H);
  kg.addColorStop(0,'#2a0f00');kg.addColorStop(0.5,'#3d1a00');kg.addColorStop(1,'#4a2200');
  rctx.fillStyle=kg;rctx.fillRect(0,0,RW,R_KITCHEN_H);

  // Brick pattern
  rctx.strokeStyle='rgba(0,0,0,0.15)';rctx.lineWidth=Math.max(0.5,S*0.5);
  const bh=Math.max(6,10*S),bw=Math.max(20,36*S);
  for(let by=2*S;by<R_KITCHEN_H-6*S;by+=bh){
    const off=(Math.floor(by/bh)%2)*bw*0.5;
    for(let bx=off;bx<RW;bx+=bw) rctx.strokeRect(bx,by,bw-2,bh-1);
  }

  // Counter
  const cg=rctx.createLinearGradient(0,R_KITCHEN_H-8*S,0,R_KITCHEN_H);
  cg.addColorStop(0,'#8b5e3c');cg.addColorStop(0.3,'#a0703c');cg.addColorStop(0.7,'#c08050');cg.addColorStop(1,'#6d4c30');
  rctx.fillStyle=cg;rctx.fillRect(0,R_KITCHEN_H-8*S,RW,8*S);
  rctx.fillStyle='rgba(255,255,255,0.12)';rctx.fillRect(0,R_KITCHEN_H-7*S,RW,2*S);

  // Order window
  const owX=RW*0.038,owW=RW*0.346,owCX=RW*0.212;
  rctx.save();
  const owg=rctx.createRadialGradient(owCX,R_KITCHEN_H*0.5,5*S,owCX,R_KITCHEN_H*0.5,60*S);
  owg.addColorStop(0,'rgba(255,180,80,0.15)');owg.addColorStop(1,'transparent');
  rctx.fillStyle=owg;rctx.fillRect(owX,5*S,owW,R_KITCHEN_H-16*S);
  rctx.fillStyle='rgba(40,20,0,0.7)';
  rctx.beginPath();rctx.roundRect(owX,8*S,owW,R_KITCHEN_H-20*S,8*S);rctx.fill();
  rctx.strokeStyle='#c08040';rctx.lineWidth=2*S;rctx.stroke();
  rctx.strokeStyle='rgba(255,200,120,0.2)';rctx.lineWidth=S;
  rctx.beginPath();rctx.roundRect(owX+2*S,10*S,owW-4*S,R_KITCHEN_H-24*S,6*S);rctx.stroke();
  rctx.fillStyle='#ffd080';rctx.font=`bold ${Math.round(9*S)}px Segoe UI`;rctx.textAlign='center';
  rctx.fillText('ORDER',owCX,R_KITCHEN_H*0.35);
  rctx.font=`${Math.round(14*S)}px serif`;rctx.fillText('🔔',owCX-owW*0.25,R_KITCHEN_H*0.72);
  rctx.restore();

  // Pickup window
  const pwX=RW*0.615,pwW=RW*0.346,pwCX=RW*0.788;
  const hasReady=rKitchen.some(s=>s.ready);
  rctx.save();
  if(hasReady){
    const pg=rctx.createRadialGradient(pwCX,R_KITCHEN_H*0.5,5*S,pwCX,R_KITCHEN_H*0.5,70*S);
    pg.addColorStop(0,'rgba(80,255,80,0.2)');pg.addColorStop(1,'transparent');
    rctx.fillStyle=pg;rctx.fillRect(pwX,5*S,pwW,R_KITCHEN_H-16*S);
  }
  rctx.fillStyle=hasReady?'rgba(20,60,0,0.7)':'rgba(40,20,0,0.7)';
  rctx.beginPath();rctx.roundRect(pwX,8*S,pwW,R_KITCHEN_H-20*S,8*S);rctx.fill();
  rctx.strokeStyle=hasReady?'#60d040':'#c08040';rctx.lineWidth=2*S;rctx.stroke();
  rctx.strokeStyle=hasReady?'rgba(80,255,80,0.3)':'rgba(255,200,120,0.2)';rctx.lineWidth=S;
  rctx.beginPath();rctx.roundRect(pwX+2*S,10*S,pwW-4*S,R_KITCHEN_H-24*S,6*S);rctx.stroke();
  const pwLabel=hasReady?'PICKUP READY!':'PICKUP';
  rctx.fillStyle=hasReady?'#80ff80':'#ffd080';
  rctx.font=`bold ${Math.round(9*S)}px Segoe UI`;rctx.textAlign='center';
  rctx.fillText(pwLabel,pwCX,R_KITCHEN_H*0.35);
  if(hasReady){
    const p=0.6+Math.sin(rFrame*0.15)*0.4;
    rctx.strokeStyle='rgba(128,255,0,'+p+')';rctx.lineWidth=2.5*S;
    rctx.beginPath();rctx.roundRect(pwX,8*S,pwW,R_KITCHEN_H-20*S,8*S);rctx.stroke();
  }
  rctx.restore();

  // Cooking slots
  const slotW=RW*0.154,slotStartX=RW*0.423;
  rKitchen.forEach((s,i)=>{
    const sx=slotStartX+i*slotW,sy=R_KITCHEN_H*0.54;
    const sw=52*S,sh=32*S;
    rctx.fillStyle=s.ready?'#1a4a00':'#3a2000';
    rctx.beginPath();rctx.roundRect(sx-sw/2,sy-sh/2,sw,sh,6*S);rctx.fill();
    rctx.strokeStyle=s.ready?'#60d040':'#6a4020';rctx.lineWidth=S;rctx.stroke();
    if(!s.ready){
      for(let fi=0;fi<3;fi++){
        const fx=sx+(fi-1)*8*S,fh=(5+Math.sin(rFrame*0.2+fi)*3)*S;
        rctx.fillStyle='rgba(255,'+(120+fi*30)+',0,'+(0.4+Math.sin(rFrame*0.3+fi)*0.2)+')';
        rctx.beginPath();rctx.ellipse(fx,sy+sh/2+4*S,3*S,fh,0,0,Math.PI*2);rctx.fill();
      }
    }
    rctx.font=`${Math.round(18*S)}px serif`;rctx.textAlign='center';
    if(s.ready){rctx.shadowColor='#80ff00';rctx.shadowBlur=10*S;}
    rctx.fillText(s.dish.emoji,sx,sy+5*S);
    rctx.shadowBlur=0;
    if(!s.ready){
      const prog=1-s.timer/s.total;
      const bw=44*S,bh2=5*S;
      rctx.fillStyle='rgba(0,0,0,0.4)';rctx.beginPath();rctx.roundRect(sx-bw/2,sy+sh/2+2*S,bw,bh2,2*S);rctx.fill();
      const pg2=rctx.createLinearGradient(sx-bw/2,0,sx+bw/2,0);
      pg2.addColorStop(0,'#ff6600');pg2.addColorStop(1,'#ffcc00');
      rctx.fillStyle=pg2;rctx.beginPath();rctx.roundRect(sx-bw/2,sy+sh/2+2*S,bw*prog,bh2,2*S);rctx.fill();
      for(let j=0;j<3;j++){
        const stx=sx+(j-1)*10*S,phase=(rFrame*0.5+j*5)%22;
        const sty=sy-sh/2-phase*S;
        rctx.strokeStyle='rgba(220,220,220,'+(0.3-phase/80)+')';
        rctx.lineWidth=1.5*S;rctx.lineCap='round';rctx.beginPath();
        rctx.moveTo(stx,sty+18*S);rctx.bezierCurveTo(stx-3*S,sty+10*S,stx+3*S,sty+5*S,stx-S,sty);rctx.stroke();
      }
    }else{
      rctx.fillStyle='#80ff00';rctx.font=`bold ${Math.round(8*S)}px Segoe UI`;rctx.fillText('READY!',sx,sy+sh/2+8*S);
    }
  });

  // Hanging pots decoration (centre)
  const potXs=[RW*0.423,RW*0.5,RW*0.577];
  potXs.forEach(px=>{
    rctx.strokeStyle='rgba(150,100,60,0.3)';rctx.lineWidth=S;
    rctx.beginPath();rctx.moveTo(px,0);rctx.lineTo(px,12*S);rctx.stroke();
    rctx.font=`${Math.round(12*S)}px serif`;rctx.textAlign='center';
    rctx.fillStyle='rgba(100,70,40,0.4)';rctx.fillText('🍳',px,22*S);
  });
}

function rDrawFloor(){
  const floorG=rctx.createLinearGradient(0,R_KITCHEN_H,0,R_FLOOR_BOT);
  floorG.addColorStop(0,'#3a2210');floorG.addColorStop(0.5,'#2e1a0c');floorG.addColorStop(1,'#241408');
  rctx.fillStyle=floorG;rctx.fillRect(0,R_KITCHEN_H,RW,R_FLOOR_BOT-R_KITCHEN_H);

  // Tile grid
  const tileStep=40*S;
  rctx.save();rctx.globalAlpha=0.06;rctx.strokeStyle='#000';rctx.lineWidth=0.5;
  for(let ty=R_KITCHEN_H;ty<R_FLOOR_BOT;ty+=tileStep){
    rctx.beginPath();rctx.moveTo(0,ty);rctx.lineTo(RW,ty);rctx.stroke();
  }
  for(let tx=0;tx<RW;tx+=tileStep){
    rctx.beginPath();rctx.moveTo(tx,R_KITCHEN_H);rctx.lineTo(tx,R_FLOOR_BOT);rctx.stroke();
  }
  rctx.restore();

  // Ceiling lights
  rctx.save();
  [0.25,0.5,0.77].forEach(frac=>{
    const lx=RW*frac;
    const lg=rctx.createRadialGradient(lx,R_KITCHEN_H+10*S,5*S,lx,R_KITCHEN_H+60*S,90*S);
    lg.addColorStop(0,'rgba(255,200,100,0.08)');lg.addColorStop(1,'transparent');
    rctx.fillStyle=lg;rctx.fillRect(lx-90*S,R_KITCHEN_H,180*S,130*S);
  });
  rctx.restore();

  rctx.fillStyle='rgba(80,50,20,0.4)';rctx.fillRect(0,R_KITCHEN_H,RW,3*S);
  rctx.fillStyle='rgba(200,150,80,0.15)';rctx.fillRect(0,R_KITCHEN_H,RW,S);

  // Wall art
  const wallArt=[
    {fx:0.115,emoji:'🎨',w:40,h:30},{fx:0.385,emoji:'🖼️',w:50,h:30},
    {fx:0.673,emoji:'🏔️',w:40,h:30},{fx:0.904,emoji:'🌅',w:35,h:28},
  ];
  wallArt.forEach(a=>{
    const ax=RW*a.fx,aw=a.w*S,ah=a.h*S,ay=R_KITCHEN_H+14*S;
    rctx.fillStyle='rgba(60,35,15,0.5)';
    rctx.beginPath();rctx.roundRect(ax-aw/2-2*S,ay-2*S,aw+4*S,ah+4*S,3*S);rctx.fill();
    rctx.strokeStyle='rgba(200,160,80,0.4)';rctx.lineWidth=1.5*S;rctx.stroke();
    rctx.fillStyle='rgba(40,25,10,0.6)';rctx.fillRect(ax-aw/2,ay,aw,ah);
    rctx.font=`${Math.round(16*S)}px serif`;rctx.textAlign='center';
    rctx.fillText(a.emoji,ax,ay+ah/2+6*S);
  });

  // Potted plants
  [RW*0.038,RW*0.962].forEach(px=>{
    rctx.fillStyle='#5a3018';
    rctx.beginPath();rctx.roundRect(px-8*S,R_TABLE_ROW1-8*S,16*S,20*S,3*S);rctx.fill();
    rctx.font=`${Math.round(16*S)}px serif`;rctx.textAlign='center';
    rctx.fillText('🌿',px,R_TABLE_ROW1-12*S);
  });
  [RW*0.038,RW*0.962].forEach(px=>{
    rctx.fillStyle='#5a3018';
    rctx.beginPath();rctx.roundRect(px-8*S,R_TABLE_ROW2-8*S,16*S,20*S,3*S);rctx.fill();
    rctx.font=`${Math.round(16*S)}px serif`;rctx.textAlign='center';
    rctx.fillText('🪴',px,R_TABLE_ROW2-12*S);
  });

  // Bottom entrance area
  const btmG=rctx.createLinearGradient(0,R_FLOOR_BOT-25*S,0,RH);
  btmG.addColorStop(0,'#1a0e04');btmG.addColorStop(1,'#0d0800');
  rctx.fillStyle=btmG;rctx.fillRect(0,R_FLOOR_BOT-25*S,RW,RH-R_FLOOR_BOT+25*S);

  // Door
  rctx.fillStyle='#4a2800';
  rctx.beginPath();rctx.roundRect(6*S,R_FLOOR_BOT,55*S,28*S,4*S);rctx.fill();
  rctx.strokeStyle='#c8a060';rctx.lineWidth=1.5*S;rctx.stroke();
  rctx.fillStyle='#e0c080';rctx.beginPath();rctx.arc(48*S,R_FLOOR_BOT+14*S,3*S,0,Math.PI*2);rctx.fill();
  rctx.fillStyle='#ffd080';rctx.font=`bold ${Math.round(7*S)}px Segoe UI`;rctx.textAlign='center';
  rctx.fillText('ENTRANCE',33*S,R_FLOOR_BOT+18*S);
  rctx.fillStyle='rgba(180,60,60,0.3)';
  rctx.beginPath();rctx.roundRect(10*S,R_FLOOR_BOT+26*S,50*S,6*S,2*S);rctx.fill();
}

function rDrawTable(t){
  const tw=(t.seats===2?65:90)*S,th=48*S;

  rctx.save();
  rctx.fillStyle='rgba(0,0,0,0.25)';
  rctx.beginPath();rctx.ellipse(t.x+2*S,t.y+th/2+5*S,tw/2+4*S,7*S,0,0,Math.PI*2);rctx.fill();
  rctx.restore();

  let clothCol='rgba(240,230,210,0.12)';
  if(t.state==='paying') clothCol='rgba(80,255,120,0.12)';
  else if(t.state==='food-ready') clothCol='rgba(255,215,0,0.12)';
  rctx.fillStyle=clothCol;
  rctx.beginPath();rctx.roundRect(t.x-tw/2-3*S,t.y-th/2-3*S,tw+6*S,th+6*S,10*S);rctx.fill();

  const tg=rctx.createLinearGradient(t.x-tw/2,t.y-th/2,t.x+tw/2,t.y+th/2);
  let c1='#6d4020',c2='#5a3018';
  if(t.state==='paying'){c1='#1a6630';c2='#0d4420';}
  else if(t.state!=='empty'){c1='#5a3520';c2='#4a2a15';}
  tg.addColorStop(0,c1);tg.addColorStop(1,c2);
  rctx.fillStyle=tg;
  rctx.beginPath();rctx.roundRect(t.x-tw/2,t.y-th/2,tw,th,8*S);rctx.fill();

  rctx.save();rctx.globalAlpha=0.08;rctx.strokeStyle='#000';rctx.lineWidth=0.5;
  for(let gy=t.y-th/2+6*S;gy<t.y+th/2-4*S;gy+=6*S){
    rctx.beginPath();rctx.moveTo(t.x-tw/2+4*S,gy);
    rctx.bezierCurveTo(t.x-tw/4,gy+S,t.x+tw/4,gy-S,t.x+tw/2-4*S,gy);rctx.stroke();
  }
  rctx.restore();

  rctx.strokeStyle='rgba(200,160,100,0.25)';rctx.lineWidth=S;
  rctx.beginPath();rctx.roundRect(t.x-tw/2,t.y-th/2,tw,th,8*S);rctx.stroke();

  if(t.state==='paying'||t.state==='food-ready'){
    const gc=t.state==='paying'?'rgba(0,255,100,':'rgba(255,215,0,';
    const pulse=0.4+Math.sin(rFrame*0.12)*0.3;
    rctx.strokeStyle=gc+pulse+')';rctx.lineWidth=2.5*S;
    rctx.beginPath();rctx.roundRect(t.x-tw/2-S,t.y-th/2-S,tw+2*S,th+2*S,9*S);rctx.stroke();
  }
  // Low happiness red pulse
  if(t.cust&&t.cust.happiness<30&&t.state!=='empty'&&t.state!=='paying'){
    const pulse=0.15+Math.sin(rFrame*0.2)*0.1;
    rctx.fillStyle=`rgba(255,50,50,${pulse})`;
    rctx.beginPath();rctx.roundRect(t.x-tw/2-S,t.y-th/2-S,tw+2*S,th+2*S,9*S);rctx.fill();
  }

  // Chairs
  const chairs=t.seats===2?
    [{dx:-tw/2-10*S,dy:0},{dx:tw/2+10*S,dy:0}]:
    [{dx:-tw/2-10*S,dy:-10*S},{dx:tw/2+10*S,dy:-10*S},{dx:-tw/2-10*S,dy:10*S},{dx:tw/2+10*S,dy:10*S}];
  chairs.forEach(c=>{
    rctx.fillStyle='#3a2210';rctx.beginPath();
    rctx.ellipse(t.x+c.dx,t.y+c.dy,9*S,7*S,0,0,Math.PI*2);rctx.fill();
    rctx.fillStyle='#8b2020';rctx.beginPath();
    rctx.ellipse(t.x+c.dx,t.y+c.dy,7*S,5*S,0,0,Math.PI*2);rctx.fill();
    rctx.fillStyle='rgba(255,255,255,0.1)';rctx.beginPath();
    rctx.ellipse(t.x+c.dx-S,t.y+c.dy-S,4*S,3*S,0,0,Math.PI*2);rctx.fill();
  });

  // Candle
  const flicker=Math.sin(rFrame*0.25)*1.5;
  rctx.save();
  const cGlow=rctx.createRadialGradient(t.x,t.y-10*S,S,t.x,t.y-10*S,16*S);
  cGlow.addColorStop(0,'rgba(255,180,50,0.18)');cGlow.addColorStop(1,'transparent');
  rctx.fillStyle=cGlow;rctx.beginPath();rctx.arc(t.x,t.y-10*S,16*S,0,Math.PI*2);rctx.fill();
  rctx.restore();
  rctx.fillStyle='#fff8e1';rctx.fillRect(t.x-1.5*S,t.y-7*S,3*S,9*S);
  rctx.fillStyle='#ff8800';
  rctx.beginPath();rctx.ellipse(t.x,t.y-9*S+flicker*0.3,2*S,(3+flicker*0.5)*S,0,0,Math.PI*2);rctx.fill();
  rctx.fillStyle='#ffcc00';
  rctx.beginPath();rctx.ellipse(t.x,t.y-10*S+flicker*0.2,S,2*S,0,0,Math.PI*2);rctx.fill();

  // Customers
  if(t.cust){
    const n=Math.min(t.cust.emojis.length,t.seats<=2?2:4);
    rctx.font=`${Math.round(14*S)}px serif`;rctx.textAlign='center';
    for(let i=0;i<n;i++) rctx.fillText(t.cust.emojis[i],t.x+(i-(n-1)/2)*18*S,t.y+7*S);
    // Happiness bar
    const bw=tw-6*S,bx=t.x-bw/2,by=t.y-th/2-10*S;
    rctx.fillStyle='rgba(0,0,0,0.5)';rctx.beginPath();rctx.roundRect(bx,by,bw,5*S,2.5*S);rctx.fill();
    const hp=t.cust.happiness;
    const hg=rctx.createLinearGradient(bx,0,bx+bw,0);
    if(hp>70){hg.addColorStop(0,'#4caf50');hg.addColorStop(1,'#81c784');}
    else if(hp>40){hg.addColorStop(0,'#ff9800');hg.addColorStop(1,'#ffc107');}
    else{hg.addColorStop(0,'#f44336');hg.addColorStop(1,'#ff7043');}
    rctx.fillStyle=hg;rctx.beginPath();rctx.roundRect(bx,by,bw*hp/100,5*S,2.5*S);rctx.fill();
    const mood=hp>75?'😊':hp>50?'😐':hp>25?'😟':'😠';
    rctx.font=`${Math.round(12*S)}px serif`;rctx.fillText(mood,t.x+tw/2+12*S,t.y-th/2-5*S);
  }

  // State icons
  const iconFont=Math.round(Math.max(14,16*S));
  const labelFont=Math.round(Math.max(9,10*S));
  rctx.font=`${iconFont}px serif`;rctx.textAlign='center';
  const iy=t.y-th/2-22*S;
  if(t.state==='empty'&&rQueue.length>0){
    rctx.globalAlpha=0.5+Math.sin(rFrame*0.1)*0.5;
    rctx.fillText('🪑',t.x,iy);rctx.globalAlpha=1;
    rctx.fillStyle='#80ff80';rctx.font=`bold ${labelFont}px Segoe UI`;
    rctx.fillText('TAP',t.x,iy-12*S);rctx.fillStyle='#fff';
  }
  if(t.state==='seated'&&t.cust?.orderReady){
    rctx.fillText(t.cust.dish?.emoji||'📋',t.x,iy);
    rctx.globalAlpha=0.5+Math.sin(rFrame*0.12)*0.5;
    rctx.fillStyle='#ffd700';rctx.font=`bold ${labelFont}px Segoe UI`;
    rctx.fillText('TAKE ORDER',t.x,iy-12*S);rctx.globalAlpha=1;rctx.fillStyle='#fff';
  }
  if(t.state==='seated'&&t.cust&&!t.cust.orderReady){rctx.font=`${iconFont}px serif`;rctx.fillText('🤔',t.x,iy);}
  if(t.state==='cooking'||t.state==='order-taken'){rctx.font=`${iconFont}px serif`;rctx.fillText('⏳',t.x,iy);}
  if(t.state==='food-ready'){
    rctx.font=`${iconFont}px serif`;
    rctx.globalAlpha=0.6+Math.sin(rFrame*0.2)*0.4;rctx.fillText('🔔',t.x,iy);rctx.globalAlpha=1;
    rctx.fillStyle='#ffd700';rctx.font=`bold ${labelFont}px Segoe UI`;
    rctx.fillText('TAP KITCHEN',t.x,iy-12*S);rctx.fillStyle='#fff';
  }
  if(t.state==='eating'){rctx.font=`${iconFont}px serif`;rctx.fillText('🍽️',t.x,iy);}
  if(t.state==='paying'){
    rctx.font=`${iconFont}px serif`;
    rctx.globalAlpha=0.6+Math.sin(rFrame*0.15)*0.4;rctx.fillText('💰',t.x,iy);rctx.globalAlpha=1;
    rctx.fillStyle='#00ff88';rctx.font=`bold ${labelFont}px Segoe UI`;
    rctx.fillText('$'+(t.bill+t.tip),t.x,iy-12*S);rctx.fillStyle='#fff';
  }
}

function rDrawPlayer(){
  rctx.save();rctx.translate(rPlayer.x,rPlayer.y);
  if(rPlayer.dir<0)rctx.scale(-1,1);
  const moving=rPlayer.state==='moving';
  const lg=moving?Math.sin(rFrame*0.3)*7*S:0;
  const bob=moving?Math.abs(Math.sin(rFrame*0.3))*2*S:0;
  rctx.translate(0,-bob);
  // Shadow
  rctx.fillStyle='rgba(0,0,0,0.2)';rctx.beginPath();rctx.ellipse(0,16*S,12*S,4*S,0,0,Math.PI*2);rctx.fill();
  // Legs
  rctx.strokeStyle='#1a1a40';rctx.lineWidth=4.5*S;rctx.lineCap='round';
  rctx.beginPath();rctx.moveTo(-3*S,-2*S);rctx.lineTo(-6*S+lg,12*S);rctx.stroke();
  rctx.beginPath();rctx.moveTo(3*S,-2*S);rctx.lineTo(6*S-lg,12*S);rctx.stroke();
  // Shoes
  rctx.fillStyle='#0a0a0a';
  rctx.beginPath();rctx.ellipse(-6*S+lg,14*S,6*S,3.5*S,0.15,0,Math.PI*2);rctx.fill();
  rctx.beginPath();rctx.ellipse(6*S-lg,14*S,6*S,3.5*S,-0.15,0,Math.PI*2);rctx.fill();
  rctx.fillStyle='rgba(255,255,255,0.15)';
  rctx.beginPath();rctx.ellipse(-5*S+lg,13*S,3*S,1.5*S,0,0,Math.PI*2);rctx.fill();
  rctx.beginPath();rctx.ellipse(7*S-lg,13*S,3*S,1.5*S,0,0,Math.PI*2);rctx.fill();
  // Body
  const shirtG=rctx.createLinearGradient(-9*S,-22*S,9*S,-2*S);
  shirtG.addColorStop(0,'#ffffff');shirtG.addColorStop(1,'#e8e8e8');
  rctx.fillStyle=shirtG;
  rctx.beginPath();rctx.roundRect(-9*S,-22*S,18*S,20*S,3*S);rctx.fill();
  rctx.fillStyle='rgba(0,0,0,0.15)';
  [-16*S,-12*S,-8*S].forEach(by=>{rctx.beginPath();rctx.arc(0,by,S,0,Math.PI*2);rctx.fill();});
  // Apron
  rctx.fillStyle='#1a1a1a';
  rctx.beginPath();rctx.roundRect(-8*S,-10*S,16*S,10*S,2*S);rctx.fill();
  rctx.strokeStyle='rgba(255,255,255,0.1)';rctx.lineWidth=0.5;
  rctx.strokeRect(-4*S,-7*S,8*S,5*S);
  // Bow tie
  rctx.fillStyle='#cc1111';
  rctx.beginPath();rctx.moveTo(-5*S,-20*S);rctx.lineTo(0,-17*S);rctx.lineTo(5*S,-20*S);
  rctx.lineTo(5*S,-16*S);rctx.lineTo(0,-19*S);rctx.lineTo(-5*S,-16*S);rctx.closePath();rctx.fill();
  rctx.fillStyle='#ff3333';rctx.beginPath();rctx.arc(0,-18*S,1.5*S,0,Math.PI*2);rctx.fill();
  // Arms
  rctx.strokeStyle='#ffe0b2';rctx.lineWidth=3.5*S;rctx.lineCap='round';
  rctx.beginPath();rctx.moveTo(-8*S,-18*S);rctx.lineTo(-14*S,-8*S+lg*0.4);rctx.stroke();
  rctx.beginPath();rctx.moveTo(8*S,-18*S);rctx.lineTo(14*S,-8*S-lg*0.4);rctx.stroke();
  // Hands
  rctx.fillStyle='#ffe0b2';
  rctx.beginPath();rctx.arc(-14*S,-8*S+lg*0.4,2.5*S,0,Math.PI*2);rctx.fill();
  rctx.beginPath();rctx.arc(14*S,-8*S-lg*0.4,2.5*S,0,Math.PI*2);rctx.fill();
  // Head
  rctx.fillStyle='#ffe0b2';rctx.beginPath();rctx.arc(0,-30*S,9*S,0,Math.PI*2);rctx.fill();
  // Hair
  rctx.fillStyle='#3d2000';rctx.beginPath();rctx.arc(0,-34*S,9*S,Math.PI+0.3,0-0.3);rctx.fill();
  // Eyes
  rctx.fillStyle='#222';
  rctx.beginPath();rctx.arc(-3*S,-30*S,1.8*S,0,Math.PI*2);rctx.fill();
  rctx.beginPath();rctx.arc(3*S,-30*S,1.8*S,0,Math.PI*2);rctx.fill();
  rctx.fillStyle='#fff';
  rctx.beginPath();rctx.arc(-2.5*S,-30.5*S,0.6*S,0,Math.PI*2);rctx.fill();
  rctx.beginPath();rctx.arc(3.5*S,-30.5*S,0.6*S,0,Math.PI*2);rctx.fill();
  // Smile
  rctx.strokeStyle='#c0392b';rctx.lineWidth=1.2*S;
  rctx.beginPath();rctx.arc(0,-28*S,3*S,0.3,Math.PI-0.3);rctx.stroke();
  // Carrying
  if(rPlayer.carrying){
    if(rPlayer.carrying.type==='order'){
      rctx.font=`${Math.round(14*S)}px serif`;rctx.textAlign='center';rctx.fillText('📋',0,-48*S);
    }else if(rPlayer.carrying.type==='food'){
      rctx.fillStyle='#e0e0e0';
      rctx.beginPath();rctx.ellipse(0,-44*S,12*S,4*S,0,0,Math.PI*2);rctx.fill();
      rctx.fillStyle='#f5f5f5';
      rctx.beginPath();rctx.ellipse(0,-45*S,10*S,3*S,0,0,Math.PI*2);rctx.fill();
      rctx.font=`${Math.round(15*S)}px serif`;rctx.textAlign='center';rctx.fillText(rPlayer.carrying.dish.emoji,0,-50*S);
    }
  }
  if(rPlayer.state==='acting'){
    rctx.font=`${Math.round(12*S)}px serif`;rctx.textAlign='center';rctx.fillText('⚡',12*S,-44*S);
  }
  rctx.restore();
}

function rDrawQueue(){
  if(rQueue.length>0){
    rctx.fillStyle='rgba(255,200,100,0.3)';
    rctx.font=`bold ${Math.round(7*S)}px Segoe UI`;rctx.textAlign='left';
    rctx.fillText('WAITING',RW*0.16,R_FLOOR_BOT+32*S);
  }
  rQueue.forEach((c,i)=>{
    const qx=RW*0.173+i*RW*0.106,qy=R_FLOOR_BOT+10*S;
    rctx.fillStyle='rgba(255,255,255,0.08)';
    rctx.beginPath();rctx.roundRect(qx-16*S,qy-14*S,32*S,24*S,8*S);rctx.fill();
    rctx.font=`${Math.round(15*S)}px serif`;rctx.textAlign='center';
    rctx.fillText(c.emojis[0],qx,qy+4*S);
    if(c.size>1){
      rctx.fillStyle='#ffd700';rctx.font=`bold ${Math.round(8*S)}px Segoe UI`;
      rctx.fillText('x'+c.size,qx+14*S,qy-6*S);rctx.fillStyle='#fff';
    }
    const dots=Math.min(3,Math.floor((rFrame+i*40)%180/60));
    rctx.fillStyle='rgba(255,255,255,0.3)';rctx.font=`${Math.round(6*S)}px serif`;
    rctx.fillText('.'.repeat(dots+1),qx+2*S,qy-12*S);
  });

  // Queued tap dots above player
  if(rTapQueue.length>0){
    rctx.save();
    for(let i=0;i<rTapQueue.length;i++){
      rctx.fillStyle='rgba(255,200,0,'+(0.5+i*0.1)+')';
      rctx.beginPath();rctx.arc(rPlayer.x-12*S+i*6*S,rPlayer.y-52*S,4*S,0,Math.PI*2);rctx.fill();
    }
    rctx.restore();
  }
}

function rRender(){
  // Screen shake
  let shakeX=0,shakeY=0;
  if(rShakeTimer>0){
    shakeX=(Math.random()-0.5)*6*S;
    shakeY=(Math.random()-0.5)*4*S;
    rShakeTimer--;
  }
  rctx.save();
  if(shakeX||shakeY)rctx.translate(shakeX,shakeY);
  rctx.clearRect(-10,-10,RW+20,RH+20);
  rDrawFloor();rDrawKitchen();
  rTables.forEach(t=>rDrawTable(t));
  rDrawQueue();rDrawPlayer();

  // Particles
  rctx.save();
  for(const p of rParticles){
    rctx.globalAlpha=p.life;rctx.fillStyle=p.color;
    rctx.beginPath();rctx.arc(p.x,p.y,p.r*p.life,0,Math.PI*2);rctx.fill();
  }
  rctx.restore();

  // Tap ripples
  rctx.save();
  for(const rp of rTapRipples){
    rctx.globalAlpha=rp.life*0.5;
    rctx.strokeStyle='rgba(255,255,255,'+rp.life+')';
    rctx.lineWidth=2*S;
    rctx.beginPath();rctx.arc(rp.x,rp.y,rp.r,0,Math.PI*2);rctx.stroke();
  }
  rctx.restore();

  // Float texts
  rFloats.forEach(f=>{
    rctx.save();rctx.globalAlpha=Math.min(1,f.life);
    rctx.font=`bold ${Math.round(Math.max(12,14*S))}px Segoe UI`;
    rctx.textAlign='center';rctx.textBaseline='middle';
    rctx.shadowColor='rgba(0,0,0,0.7)';rctx.shadowBlur=6*S;
    rctx.fillStyle=f.color;rctx.fillText(f.txt,f.x,f.y);
    rctx.restore();
  });
  rctx.restore();
}

// ── Game loop ──
let _rLastTs=0;
function rLoop(ts=0){
  if(rState!=='playing')return;
  if(_rLastTs&&ts-_rLastTs<14){rRaf=requestAnimationFrame(rLoop);return;}
  _rLastTs=ts;
  rFrame++;
  rSpawnTimer--;
  const interval=Math.max(150,320-rLevel*22);
  if(rSpawnTimer<=0){rSpawnCustomer();rSpawnTimer=interval+rRI(-30,30);}
  rPlayerUpdate();rTablesUpdate();rKitchenUpdate();
  rFloats.forEach(f=>{f.y+=f.vy;f.life-=0.015;});
  rFloats=rFloats.filter(f=>f.life>0);
  for(const p of rParticles){p.x+=p.vx;p.y+=p.vy;p.vy+=0.08;p.life-=0.03;}
  rParticles=rParticles.filter(p=>p.life>0);
  for(const rp of rTapRipples){rp.r+=3*S;rp.life-=0.08;}
  rTapRipples=rTapRipples.filter(rp=>rp.life>0);
  rRender();
  rRaf=requestAnimationFrame(rLoop);
}

function rSpawnCustomer(){
  if(rQueue.length>=3)return;
  const sz=rRI(1,Math.min(4,1+Math.floor(rLevel/2)));
  const emojis=Array.from({length:sz},()=>R_CUST[rRI(0,R_CUST.length-1)]);
  rQueue.push({emojis,size:sz});
}

function initRestaurantGame(){
  rResize();
  rState='playing';rFrame=0;rScore=0;rTips=0;rLevel=1;rXP=0;rMoney=0;rServed=0;
  rKitchen=[];rQueue=[];rFloats=[];rTapQueue=[];rParticles=[];rTapRipples=[];rSpawnTimer=60;rShakeTimer=0;
  rUpg={speed:0,kitchen:0,water:false,table4:false,table5:false,autoServe:false};
  rPlayer={x:Math.round(RW*0.5),y:Math.round(RH*0.825),state:'idle',
           targetX:Math.round(RW*0.5),targetY:Math.round(RH*0.825),dir:1,carrying:null,task:null,actTimer:0};
  rInitTables();
  document.getElementById('vendorOverlay').style.display='none';
  document.getElementById('vendorUpgradePanel').style.display='none';
  rUpdateHUD();rLoop();
}

function showRestaurantOverlay(ended){
  const ov=document.getElementById('vendorOverlay');
  ov.style.display='flex';
  if(ended){
    ov.querySelector('h2').textContent='Session Over!';
    ov.querySelector('.vo-sub').textContent='Level '+rLevel+' | $'+rScore+' earned | '+rServed+' served';
  }else{
    ov.querySelector('h2').textContent='Restaurant Rush';
    ov.querySelector('.vo-sub').textContent='Seat, serve, and delight your customers!';
  }
  document.getElementById('vPlayBtn').textContent=ended?'Play Again':'Start';
}

function rRenderUpgPanel(){
  const defs=[
    {key:'speed',label:'Speed',max:3,costs:[80,160,320],desc:'Waiter moves faster',isInt:true},
    {key:'kitchen',label:'Kitchen',max:2,costs:[150,300],desc:'Cook more at once',isInt:true},
    {key:'water',label:'Water',max:1,costs:[100],desc:'Tap tables for +15 happiness',isInt:false},
    {key:'autoServe',label:'Auto Server',max:1,costs:[400],desc:'Auto-serves ready food',isInt:false},
  ];
  document.getElementById('vendorUpgradeContent').innerHTML=defs.map(u=>{
    const lvl=u.isInt?rUpg[u.key]:(rUpg[u.key]?1:0);
    const maxed=lvl>=u.max,cost=maxed?0:u.costs[lvl],can=!maxed&&rMoney>=cost;
    return '<div class="vupg-row"><div class="vupg-info">'+
      '<div class="vupg-name">'+u.label+'</div><div class="vupg-desc">'+u.desc+'</div>'+
      '<div class="vupg-level">Lv '+lvl+'/'+u.max+'</div>'+
      '</div>'+(maxed?'<div class="vupg-maxed">MAX</div>':'<button class="vupg-btn" '+(can?'':'disabled')+' onclick="rBuyUpg(\''+u.key+'\','+cost+')">$'+cost+'</button>')+'</div>';
  }).join('');
}

function rBuyUpg(key,cost){
  if(rMoney<cost||rState!=='playing')return;
  rMoney-=cost;
  if(typeof rUpg[key]==='boolean')rUpg[key]=true;
  else rUpg[key]++;
  rFloat(RW/2,RH/2-30,'Upgraded! ✨','#00e5ff');
  rSpawnParticles(RW/2,RH/2,'#00e5ff',15,2);
  rUpdateHUD();rRenderUpgPanel();
}

// ── Events ──
rc.addEventListener('click',e=>{
  const r=rc.getBoundingClientRect();
  rHandleTap((e.clientX-r.left)*(RW/r.width),(e.clientY-r.top)*(RH/r.height));
});
rc.addEventListener('touchstart',e=>{e.preventDefault();},{passive:false});
rc.addEventListener('touchend',e=>{
  e.preventDefault();
  const r=rc.getBoundingClientRect(),t=e.changedTouches[0];
  rHandleTap((t.clientX-r.left)*(RW/r.width),(t.clientY-r.top)*(RH/r.height));
},{passive:false});

document.getElementById('vBtnUpgrade').addEventListener('click',()=>{
  const p=document.getElementById('vendorUpgradePanel');
  p.style.display=p.style.display==='flex'?'none':'flex';
  if(p.style.display==='flex')rRenderUpgPanel();
});
document.getElementById('vPlayBtn').addEventListener('click',initRestaurantGame);

window.addEventListener('resize',()=>{
  if(typeof currentPage!=='undefined'&&currentPage==='vendor'){
    rResize();
    if(rState!=='playing'){
      rctx.clearRect(0,0,RW,RH);
      rDrawIdleFrame();
    }
  }
});

function exitVendorGame(){
  if(rState==='playing'){cancelAnimationFrame(rRaf);rState='idle';}
  rTapQueue=[];
  navigate('home');
}

function rDrawIdleFrame(){
  const g=rctx.createLinearGradient(0,0,0,RH);
  g.addColorStop(0,'#3d1a00');g.addColorStop(0.6,'#1a0e00');g.addColorStop(1,'#0d0800');
  rctx.fillStyle=g;rctx.fillRect(0,0,RW,RH);
  const glow=rctx.createRadialGradient(RW/2,RH/2-20,10,RW/2,RH/2,120*S);
  glow.addColorStop(0,'rgba(255,180,80,0.12)');glow.addColorStop(1,'transparent');
  rctx.fillStyle=glow;rctx.fillRect(0,0,RW,RH);
  rctx.font=`${Math.round(48*S)}px serif`;rctx.textAlign='center';
  rctx.fillText('🍽️',RW/2,RH/2-10*S);
  rctx.fillStyle='rgba(255,220,150,0.8)';rctx.font=`bold ${Math.round(16*S)}px Segoe UI`;
  rctx.fillText('Restaurant Rush',RW/2,RH/2+28*S);
  rctx.fillStyle='rgba(255,200,100,0.35)';rctx.font=`${Math.round(11*S)}px Segoe UI`;
  rctx.fillText('Tap to begin',RW/2,RH/2+48*S);
}

// Draw idle frame on load
(function(){rResize();rDrawIdleFrame();})();
