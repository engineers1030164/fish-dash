// ══════════════════════════════════════════════════════════════════════════
// RESTAURANT RUSH — Game Engine
// ══════════════════════════════════════════════════════════════════════════
const rc=document.getElementById('vendorCanvas');
const rctx=rc.getContext('2d');
const RW=520,RH=400;
rc.width=RW;rc.height=RH;

const R_KITCHEN_H=70;
const R_TABLE_ROW1=155;
const R_TABLE_ROW2=255;
const R_FLOOR_BOT=370;

const R_TABLE_DEFS=[
  {id:0,x:90, y:R_TABLE_ROW1,seats:2},
  {id:1,x:260,y:R_TABLE_ROW1,seats:4},
  {id:2,x:430,y:R_TABLE_ROW1,seats:2},
  {id:3,x:130,y:R_TABLE_ROW2,seats:4},
  {id:4,x:370,y:R_TABLE_ROW2,seats:4},
];

const R_KITCHEN_SUBMIT={x:130,y:40};
const R_KITCHEN_PICKUP={x:390,y:40};

const R_DISHES=[
  {emoji:'🍔',name:'Burger',cook:90,price:12,tip:4},
  {emoji:'🍕',name:'Pizza', cook:120,price:18,tip:6},
  {emoji:'🍣',name:'Sushi', cook:75,price:22,tip:8},
  {emoji:'🍝',name:'Pasta', cook:100,price:15,tip:5},
  {emoji:'🥗',name:'Salad', cook:50,price:10,tip:3},
  {emoji:'🍜',name:'Ramen', cook:110,price:16,tip:5},
];

const R_CUST=['👨','👩','🧔','👱','👧','👦','🧑'];
const R_LVL_XP=[0,120,350,750,1500,3000,6000];

let rState='idle',rRaf,rFrame=0;
let rScore=0,rTips=0,rLevel=1,rXP=0,rMoney=0,rServed=0;
let rTables=[],rKitchen=[],rQueue=[],rFloats=[];
let rSpawnTimer=0;
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

function rSpawnCustomer(){
  if(rQueue.length>=3)return;
  const sz=rRI(1,Math.min(4,1+Math.floor(rLevel/2)));
  const emojis=Array.from({length:sz},()=>R_CUST[rRI(0,R_CUST.length-1)]);
  rQueue.push({emojis,size:sz});
}

// ── Player movement ──
function rPlayerUpdate(){
  const spd=3.5+rUpg.speed*0.8;
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
    // Process next queued tap
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
  // Returns a task object if the tap is valid, or null
  if(my<R_KITCHEN_H+20){
    const hasReady=rKitchen.some(s=>s.ready);
    if(hasReady&&!rPlayer.carrying) return {tx:R_KITCHEN_PICKUP.x,ty:R_KITCHEN_PICKUP.y+40,task:{type:'pickup'}};
    return null;
  }
  for(const t of rTables){
    const tw=t.seats===2?70:95;
    if(Math.abs(mx-t.x)<tw/2+15&&Math.abs(my-t.y)<40){
      if(t.state==='empty'&&rQueue.length>0) return {tx:t.x,ty:t.y+35,task:{type:'seat',tableId:t.id}};
      if(t.state==='seated'&&t.cust?.orderReady) return {tx:t.x,ty:t.y+35,task:{type:'take-order',tableId:t.id}};
      if(t.state==='food-ready'&&!rPlayer.carrying) return {tx:R_KITCHEN_PICKUP.x,ty:R_KITCHEN_PICKUP.y+40,task:{type:'pickup'}};
      if(t.state==='ready-serve'&&rPlayer.carrying?.tableId===t.id) return {tx:t.x,ty:t.y+35,task:{type:'serve',tableId:t.id}};
      if(t.state==='paying') return {tx:t.x,ty:t.y+35,task:{type:'collect',tableId:t.id}};
      if(rUpg.water&&t.cust&&t.state!=='empty'&&t.state!=='paying') return {tx:t.x,ty:t.y+35,task:{type:'water',tableId:t.id}};
      return null;
    }
  }
  return null;
}

function rProcessQueue(){
  if(rTapQueue.length===0||rPlayer.state!=='idle')return;
  // Try each queued tap in order; skip stale ones
  while(rTapQueue.length>0){
    const q=rTapQueue.shift();
    const resolved=rResolveTap(q.mx,q.my);
    if(resolved){
      rGoTo(resolved.tx,resolved.ty,resolved.task);
      return;
    }
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
    rFloat(tbl.x,tbl.y-45,'Seated!','#80ff80');
  }
  else if(t.type==='take-order'&&tbl&&tbl.state==='seated'&&tbl.cust?.orderReady){
    const dish=tbl.cust.dish||rDish();
    tbl.order={dish};tbl.state='order-taken';
    rPlayer.carrying={type:'order',tableId:tbl.id,dish};
    rPlayer.state='idle';rPlayer.task=null;
    rGoTo(R_KITCHEN_SUBMIT.x,R_KITCHEN_SUBMIT.y+40,{type:'submit',tableId:tbl.id});
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
      rFloat(R_KITCHEN_SUBMIT.x,R_KITCHEN_SUBMIT.y+20,'Order in!','#fff');
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
        rFloat(R_KITCHEN_PICKUP.x,R_KITCHEN_PICKUP.y+20,'Picked up!','#ffd700');
        rPlayer.state='idle';rPlayer.task=null;
        rGoTo(tb.x,tb.y+35,{type:'serve',tableId:tb.id});
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
      rFloat(tb.x,tb.y-45,'Served!','#ffd700');
    }
    rPlayer.carrying=null;
  }
  else if(t.type==='collect'&&tbl&&tbl.state==='paying'){
    const total=tbl.bill+tbl.tip;
    rScore+=total;rXP+=total;rMoney+=total;rTips+=tbl.tip;rServed++;
    rFloat(tbl.x,tbl.y-45,'+$'+tbl.bill+(tbl.tip>0?' +$'+tbl.tip+' tip':''),'#ffd700');
    tbl.state='empty';tbl.cust=null;tbl.order=null;
    rCheckLevel();rUpdateHUD();
  }
  else if(t.type==='water'&&tbl&&tbl.cust&&tbl.state!=='empty'&&tbl.state!=='paying'){
    tbl.cust.happiness=Math.min(100,tbl.cust.happiness+15);
    rFloat(tbl.x,tbl.y-45,'+15 happy','#00bcd4');
  }

  rPlayer.state='idle';rPlayer.task=null;
}

function rCheckLevel(){
  if(rLevel>=6)return;
  if(rXP>=R_LVL_XP[rLevel]){
    rLevel++;
    rFloat(RW/2,RH/2-30,'Level '+rLevel+'!','#00e5ff');
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
        rFloat(R_KITCHEN_PICKUP.x,R_KITCHEN_PICKUP.y+20,'Ready!','#ffd700');
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
        rFloat(tb.x,tb.y-45,'Auto!','#00e5ff');
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
      rFloat(t.x,t.y-45,'Left!','#ff5252');
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
      if(t.eatTimer<=0){t.state='paying';rFloat(t.x,t.y-35,'Pay!','#80ff80');}
    }
  }
}

// ── Tap handler — now queues ──
function rHandleTap(mx,my){
  if(rState!=='playing')return;
  // If idle, try to execute immediately
  if(rPlayer.state==='idle'){
    const resolved=rResolveTap(mx,my);
    if(resolved){rGoTo(resolved.tx,resolved.ty,resolved.task);return;}
  }
  // Otherwise queue it (max 5)
  if(rTapQueue.length<R_TAP_QUEUE_MAX){
    rTapQueue.push({mx,my});
  }
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
// RENDER — Premium Restaurant Visuals
// ══════════════════════════════════════════════════════════════════════════

function rDrawKitchen(){
  // Kitchen background — brick wall effect
  const kg=rctx.createLinearGradient(0,0,0,R_KITCHEN_H);
  kg.addColorStop(0,'#2a0f00');kg.addColorStop(0.5,'#3d1a00');kg.addColorStop(1,'#4a2200');
  rctx.fillStyle=kg;rctx.fillRect(0,0,RW,R_KITCHEN_H);

  // Brick pattern
  rctx.strokeStyle='rgba(0,0,0,0.15)';rctx.lineWidth=0.5;
  for(let by=2;by<R_KITCHEN_H-6;by+=10){
    const off=(Math.floor(by/10)%2)*18;
    for(let bx=off;bx<RW;bx+=36){
      rctx.strokeRect(bx,by,34,9);
    }
  }

  // Kitchen counter — polished wood
  const cg=rctx.createLinearGradient(0,R_KITCHEN_H-8,0,R_KITCHEN_H);
  cg.addColorStop(0,'#8b5e3c');cg.addColorStop(0.3,'#a0703c');cg.addColorStop(0.7,'#c08050');cg.addColorStop(1,'#6d4c30');
  rctx.fillStyle=cg;rctx.fillRect(0,R_KITCHEN_H-8,RW,8);
  // Counter shine
  rctx.fillStyle='rgba(255,255,255,0.12)';rctx.fillRect(0,R_KITCHEN_H-7,RW,2);

  // Order window — warm glow
  rctx.save();
  const owg=rctx.createRadialGradient(110,35,5,110,35,60);
  owg.addColorStop(0,'rgba(255,180,80,0.15)');owg.addColorStop(1,'transparent');
  rctx.fillStyle=owg;rctx.fillRect(20,5,180,R_KITCHEN_H-16);
  rctx.fillStyle='rgba(40,20,0,0.7)';
  rctx.beginPath();rctx.roundRect(20,8,180,R_KITCHEN_H-20,8);rctx.fill();
  rctx.strokeStyle='#c08040';rctx.lineWidth=2;rctx.stroke();
  // Inner bevel
  rctx.strokeStyle='rgba(255,200,120,0.2)';rctx.lineWidth=1;
  rctx.beginPath();rctx.roundRect(22,10,176,R_KITCHEN_H-24,6);rctx.stroke();
  rctx.fillStyle='#ffd080';rctx.font='bold 9px Segoe UI';rctx.textAlign='center';
  rctx.fillText('ORDER WINDOW',110,22);
  // Bell icon
  rctx.font='14px serif';rctx.fillText('🔔',45,50);
  rctx.restore();

  // Pickup window
  const hasReady=rKitchen.some(s=>s.ready);
  rctx.save();
  if(hasReady){
    const pg=rctx.createRadialGradient(RW-110,35,5,RW-110,35,70);
    pg.addColorStop(0,'rgba(80,255,80,0.15)');pg.addColorStop(1,'transparent');
    rctx.fillStyle=pg;rctx.fillRect(RW-200,5,180,R_KITCHEN_H-16);
  }
  rctx.fillStyle=hasReady?'rgba(20,60,0,0.7)':'rgba(40,20,0,0.7)';
  rctx.beginPath();rctx.roundRect(RW-200,8,180,R_KITCHEN_H-20,8);rctx.fill();
  rctx.strokeStyle=hasReady?'#60d040':'#c08040';rctx.lineWidth=2;rctx.stroke();
  rctx.strokeStyle=hasReady?'rgba(80,255,80,0.3)':'rgba(255,200,120,0.2)';rctx.lineWidth=1;
  rctx.beginPath();rctx.roundRect(RW-198,10,176,R_KITCHEN_H-24,6);rctx.stroke();
  rctx.fillStyle=hasReady?'#80ff80':'#ffd080';rctx.font='bold 9px Segoe UI';rctx.textAlign='center';
  rctx.fillText(hasReady?'PICKUP READY!':'PICKUP',RW-110,22);
  if(hasReady){
    const p=0.6+Math.sin(rFrame*0.15)*0.4;
    rctx.strokeStyle='rgba(128,255,0,'+p+')';rctx.lineWidth=2.5;
    rctx.beginPath();rctx.roundRect(RW-200,8,180,R_KITCHEN_H-20,8);rctx.stroke();
  }
  rctx.restore();

  // Cooking slots with flames
  rKitchen.forEach((s,i)=>{
    const sx=50+i*80,sy=38;
    // Stove
    rctx.fillStyle=s.ready?'#1a4a00':'#3a2000';
    rctx.beginPath();rctx.roundRect(sx-26,sy-14,52,32,6);rctx.fill();
    rctx.strokeStyle=s.ready?'#60d040':'#6a4020';rctx.lineWidth=1;rctx.stroke();
    // Fire/glow under
    if(!s.ready){
      for(let fi=0;fi<3;fi++){
        const fx=sx-8+fi*8,fh=5+Math.sin(rFrame*0.2+fi)*3;
        rctx.fillStyle='rgba(255,'+(120+fi*30)+',0,'+(0.4+Math.sin(rFrame*0.3+fi)*0.2)+')';
        rctx.beginPath();rctx.ellipse(fx,sy+14,3,fh,0,0,Math.PI*2);rctx.fill();
      }
    }
    // Food emoji
    rctx.font='18px serif';rctx.textAlign='center';
    if(s.ready){rctx.shadowColor='#80ff00';rctx.shadowBlur=10;}
    rctx.fillText(s.dish.emoji,sx,sy+6);
    rctx.shadowBlur=0;
    // Progress bar
    if(!s.ready){
      const prog=1-s.timer/s.total;
      rctx.fillStyle='rgba(0,0,0,0.4)';rctx.beginPath();rctx.roundRect(sx-22,sy+18,44,5,2);rctx.fill();
      const pg=rctx.createLinearGradient(sx-22,0,sx+22,0);
      pg.addColorStop(0,'#ff6600');pg.addColorStop(1,'#ffcc00');
      rctx.fillStyle=pg;rctx.beginPath();rctx.roundRect(sx-22,sy+18,44*prog,5,2);rctx.fill();
    }else{
      rctx.fillStyle='#80ff00';rctx.font='bold 8px Segoe UI';rctx.fillText('READY!',sx,sy+24);
    }
    // Steam
    if(!s.ready){
      for(let j=0;j<3;j++){
        const stx=sx+(j-1)*10,phase=(rFrame*0.5+j*5)%22;
        const sty=sy-14-phase;
        rctx.strokeStyle='rgba(220,220,220,'+(0.3-phase/80)+')';
        rctx.lineWidth=1.5;rctx.lineCap='round';rctx.beginPath();
        rctx.moveTo(stx,sty+18);rctx.bezierCurveTo(stx-3,sty+10,stx+3,sty+5,stx-1,sty);
        rctx.stroke();
      }
    }
  });

  // Hanging pots decoration
  rctx.fillStyle='rgba(100,70,40,0.4)';
  [220,250,280].forEach(px=>{
    rctx.strokeStyle='rgba(150,100,60,0.3)';rctx.lineWidth=1;
    rctx.beginPath();rctx.moveTo(px,0);rctx.lineTo(px,12);rctx.stroke();
    rctx.font='12px serif';rctx.textAlign='center';
    rctx.fillText('🍳',px,24);
  });
}

function rDrawFloor(){
  // Warm wood-look floor
  const floorG=rctx.createLinearGradient(0,R_KITCHEN_H,0,R_FLOOR_BOT);
  floorG.addColorStop(0,'#3a2210');floorG.addColorStop(0.5,'#2e1a0c');floorG.addColorStop(1,'#241408');
  rctx.fillStyle=floorG;rctx.fillRect(0,R_KITCHEN_H,RW,R_FLOOR_BOT-R_KITCHEN_H);

  // Subtle tile pattern
  rctx.save();rctx.globalAlpha=0.06;rctx.strokeStyle='#000';rctx.lineWidth=0.5;
  for(let ty=R_KITCHEN_H;ty<R_FLOOR_BOT;ty+=40){
    rctx.beginPath();rctx.moveTo(0,ty);rctx.lineTo(RW,ty);rctx.stroke();
  }
  for(let tx=0;tx<RW;tx+=40){
    rctx.beginPath();rctx.moveTo(tx,R_KITCHEN_H);rctx.lineTo(tx,R_FLOOR_BOT);rctx.stroke();
  }
  rctx.restore();

  // Warm ambient glow circles (ceiling lights effect)
  rctx.save();
  [130,260,400].forEach(lx=>{
    const lg=rctx.createRadialGradient(lx,R_KITCHEN_H+10,5,lx,R_KITCHEN_H+60,90);
    lg.addColorStop(0,'rgba(255,200,100,0.08)');lg.addColorStop(1,'transparent');
    rctx.fillStyle=lg;rctx.fillRect(lx-90,R_KITCHEN_H,180,130);
  });
  rctx.restore();

  // Decorative wall strip
  rctx.fillStyle='rgba(80,50,20,0.4)';rctx.fillRect(0,R_KITCHEN_H,RW,3);
  rctx.fillStyle='rgba(200,150,80,0.15)';rctx.fillRect(0,R_KITCHEN_H,RW,1);

  // Wall decorations — framed art
  const wallArt=[
    {x:60,y:R_KITCHEN_H+14,w:40,h:30,emoji:'🎨'},
    {x:200,y:R_KITCHEN_H+14,w:50,h:30,emoji:'🖼️'},
    {x:350,y:R_KITCHEN_H+14,w:40,h:30,emoji:'🏔️'},
    {x:470,y:R_KITCHEN_H+14,w:35,h:28,emoji:'🌅'},
  ];
  wallArt.forEach(a=>{
    rctx.fillStyle='rgba(60,35,15,0.5)';
    rctx.beginPath();rctx.roundRect(a.x-a.w/2-2,a.y-2,a.w+4,a.h+4,3);rctx.fill();
    rctx.strokeStyle='rgba(200,160,80,0.4)';rctx.lineWidth=1.5;
    rctx.beginPath();rctx.roundRect(a.x-a.w/2-2,a.y-2,a.w+4,a.h+4,3);rctx.stroke();
    rctx.fillStyle='rgba(40,25,10,0.6)';
    rctx.fillRect(a.x-a.w/2,a.y,a.w,a.h);
    rctx.font='16px serif';rctx.textAlign='center';
    rctx.fillText(a.emoji,a.x,a.y+a.h/2+6);
  });

  // Potted plants
  [20,500].forEach(px=>{
    rctx.fillStyle='#5a3018';
    rctx.beginPath();rctx.roundRect(px-8,R_TABLE_ROW1-8,16,20,3);rctx.fill();
    rctx.font='16px serif';rctx.textAlign='center';
    rctx.fillText('🌿',px,R_TABLE_ROW1-12);
  });
  [20,500].forEach(px=>{
    rctx.fillStyle='#5a3018';
    rctx.beginPath();rctx.roundRect(px-8,R_TABLE_ROW2-8,16,20,3);rctx.fill();
    rctx.font='16px serif';rctx.textAlign='center';
    rctx.fillText('🪴',px,R_TABLE_ROW2-12);
  });

  // Bottom area — entrance/waiting
  const btmG=rctx.createLinearGradient(0,R_FLOOR_BOT-25,0,RH);
  btmG.addColorStop(0,'#1a0e04');btmG.addColorStop(1,'#0d0800');
  rctx.fillStyle=btmG;rctx.fillRect(0,R_FLOOR_BOT-25,RW,RH-R_FLOOR_BOT+25);

  // Entrance door
  rctx.fillStyle='#4a2800';
  rctx.beginPath();rctx.roundRect(6,R_FLOOR_BOT,55,28,4);rctx.fill();
  rctx.strokeStyle='#c8a060';rctx.lineWidth=1.5;
  rctx.beginPath();rctx.roundRect(6,R_FLOOR_BOT,55,28,4);rctx.stroke();
  // Door handle
  rctx.fillStyle='#e0c080';rctx.beginPath();rctx.arc(48,R_FLOOR_BOT+14,3,0,Math.PI*2);rctx.fill();
  rctx.fillStyle='#ffd080';rctx.font='bold 7px Segoe UI';rctx.textAlign='center';
  rctx.fillText('ENTRANCE',33,R_FLOOR_BOT+18);

  // Welcome mat
  rctx.fillStyle='rgba(180,60,60,0.3)';
  rctx.beginPath();rctx.roundRect(10,R_FLOOR_BOT+26,50,6,2);rctx.fill();
}

function rDrawTable(t){
  const tw=t.seats===2?65:90,th=48;

  // Table shadow
  rctx.save();
  rctx.fillStyle='rgba(0,0,0,0.25)';
  rctx.beginPath();rctx.ellipse(t.x+2,t.y+th/2+5,tw/2+4,7,0,0,Math.PI*2);rctx.fill();
  rctx.restore();

  // Tablecloth (white with subtle pattern)
  let clothCol='rgba(240,230,210,0.12)';
  if(t.state==='paying') clothCol='rgba(80,255,120,0.12)';
  else if(t.state==='food-ready') clothCol='rgba(255,215,0,0.12)';
  rctx.fillStyle=clothCol;
  rctx.beginPath();rctx.roundRect(t.x-tw/2-3,t.y-th/2-3,tw+6,th+6,10);rctx.fill();

  // Table surface — rich wood
  const tg=rctx.createLinearGradient(t.x-tw/2,t.y-th/2,t.x+tw/2,t.y+th/2);
  let c1='#6d4020',c2='#5a3018';
  if(t.state==='paying'){c1='#1a6630';c2='#0d4420';}
  else if(t.state!=='empty'){c1='#5a3520';c2='#4a2a15';}
  tg.addColorStop(0,c1);tg.addColorStop(1,c2);
  rctx.fillStyle=tg;
  rctx.beginPath();rctx.roundRect(t.x-tw/2,t.y-th/2,tw,th,8);rctx.fill();

  // Wood grain
  rctx.save();rctx.globalAlpha=0.08;rctx.strokeStyle='#000';rctx.lineWidth=0.5;
  for(let gy=t.y-th/2+6;gy<t.y+th/2-4;gy+=6){
    rctx.beginPath();rctx.moveTo(t.x-tw/2+4,gy);
    rctx.bezierCurveTo(t.x-tw/4,gy+1,t.x+tw/4,gy-1,t.x+tw/2-4,gy);
    rctx.stroke();
  }
  rctx.restore();

  // Table edge highlight
  rctx.strokeStyle='rgba(200,160,100,0.25)';rctx.lineWidth=1;
  rctx.beginPath();rctx.roundRect(t.x-tw/2,t.y-th/2,tw,th,8);rctx.stroke();
  // State border glow
  if(t.state==='paying'||t.state==='food-ready'){
    const gc=t.state==='paying'?'rgba(0,255,100,':'rgba(255,215,0,';
    const pulse=0.4+Math.sin(rFrame*0.12)*0.3;
    rctx.strokeStyle=gc+pulse+')';rctx.lineWidth=2;
    rctx.beginPath();rctx.roundRect(t.x-tw/2-1,t.y-th/2-1,tw+2,th+2,9);rctx.stroke();
  }

  // Chairs — cushioned
  const chairs=t.seats===2?
    [{dx:-tw/2-10,dy:0},{dx:tw/2+10,dy:0}]:
    [{dx:-tw/2-10,dy:-10},{dx:tw/2+10,dy:-10},{dx:-tw/2-10,dy:10},{dx:tw/2+10,dy:10}];
  chairs.forEach(c=>{
    // Chair base
    rctx.fillStyle='#3a2210';rctx.beginPath();
    rctx.ellipse(t.x+c.dx,t.y+c.dy,9,7,0,0,Math.PI*2);rctx.fill();
    // Cushion
    rctx.fillStyle='#8b2020';rctx.beginPath();
    rctx.ellipse(t.x+c.dx,t.y+c.dy,7,5,0,0,Math.PI*2);rctx.fill();
    rctx.fillStyle='rgba(255,255,255,0.1)';rctx.beginPath();
    rctx.ellipse(t.x+c.dx-1,t.y+c.dy-1,4,3,0,0,Math.PI*2);rctx.fill();
  });

  // Candle with flickering glow
  const flicker=Math.sin(rFrame*0.25)*1.5;
  rctx.save();
  const cGlow=rctx.createRadialGradient(t.x,t.y-10,1,t.x,t.y-10,16);
  cGlow.addColorStop(0,'rgba(255,180,50,0.15)');cGlow.addColorStop(1,'transparent');
  rctx.fillStyle=cGlow;rctx.beginPath();rctx.arc(t.x,t.y-10,16,0,Math.PI*2);rctx.fill();
  rctx.restore();
  rctx.fillStyle='#fff8e1';rctx.fillRect(t.x-1.5,t.y-7,3,9);
  rctx.fillStyle='#ff8800';
  rctx.beginPath();rctx.ellipse(t.x,t.y-9+flicker*0.3,2,3+flicker*0.5,0,0,Math.PI*2);rctx.fill();
  rctx.fillStyle='#ffcc00';
  rctx.beginPath();rctx.ellipse(t.x,t.y-10+flicker*0.2,1,2,0,0,Math.PI*2);rctx.fill();

  // Customers on table
  if(t.cust){
    const n=Math.min(t.cust.emojis.length,t.seats<=2?2:4);
    rctx.font='13px serif';rctx.textAlign='center';
    for(let i=0;i<n;i++) rctx.fillText(t.cust.emojis[i],t.x+(i-(n-1)/2)*18,t.y+7);
    // Happiness bar
    const bw=tw-6,bx=t.x-bw/2,by=t.y-th/2-10;
    rctx.fillStyle='rgba(0,0,0,0.5)';rctx.beginPath();rctx.roundRect(bx,by,bw,5,2.5);rctx.fill();
    const hp=t.cust.happiness;
    const hg=rctx.createLinearGradient(bx,0,bx+bw,0);
    if(hp>70){hg.addColorStop(0,'#4caf50');hg.addColorStop(1,'#81c784');}
    else if(hp>40){hg.addColorStop(0,'#ff9800');hg.addColorStop(1,'#ffc107');}
    else{hg.addColorStop(0,'#f44336');hg.addColorStop(1,'#ff7043');}
    rctx.fillStyle=hg;rctx.beginPath();rctx.roundRect(bx,by,bw*hp/100,5,2.5);rctx.fill();
    // Mood
    const mood=hp>75?'😊':hp>50?'😐':hp>25?'😟':'😠';
    rctx.font='11px serif';rctx.fillText(mood,t.x+tw/2+12,t.y-th/2-5);
  }

  // State icons
  rctx.font='16px serif';rctx.textAlign='center';
  const iy=t.y-th/2-22;
  if(t.state==='empty'&&rQueue.length>0){
    rctx.globalAlpha=0.5+Math.sin(rFrame*0.1)*0.5;
    rctx.fillText('🪑',t.x,iy);rctx.globalAlpha=1;
    rctx.fillStyle='#80ff80';rctx.font='bold 8px Segoe UI';
    rctx.fillText('TAP',t.x,iy-10);rctx.fillStyle='#fff';
  }
  if(t.state==='seated'&&t.cust?.orderReady){
    rctx.fillText(t.cust.dish?.emoji||'📋',t.x,iy);
    rctx.globalAlpha=0.5+Math.sin(rFrame*0.12)*0.5;
    rctx.fillStyle='#ffd700';rctx.font='bold 8px Segoe UI';
    rctx.fillText('TAKE ORDER',t.x,iy-10);rctx.globalAlpha=1;rctx.fillStyle='#fff';
  }
  if(t.state==='seated'&&t.cust&&!t.cust.orderReady) rctx.fillText('🤔',t.x,iy);
  if(t.state==='cooking'||t.state==='order-taken') rctx.fillText('⏳',t.x,iy);
  if(t.state==='food-ready'){
    rctx.globalAlpha=0.6+Math.sin(rFrame*0.2)*0.4;rctx.fillText('🔔',t.x,iy);rctx.globalAlpha=1;
    rctx.fillStyle='#ffd700';rctx.font='bold 8px Segoe UI';
    rctx.fillText('TAP KITCHEN',t.x,iy-10);rctx.fillStyle='#fff';
  }
  if(t.state==='eating') rctx.fillText('🍽️',t.x,iy);
  if(t.state==='paying'){
    rctx.globalAlpha=0.6+Math.sin(rFrame*0.15)*0.4;rctx.fillText('💰',t.x,iy);rctx.globalAlpha=1;
    rctx.fillStyle='#00ff88';rctx.font='bold 9px Segoe UI';
    rctx.fillText('$'+(t.bill+t.tip),t.x,iy-10);rctx.fillStyle='#fff';
  }
}

function rDrawPlayer(){
  rctx.save();rctx.translate(rPlayer.x,rPlayer.y);
  if(rPlayer.dir<0)rctx.scale(-1,1);
  const moving=rPlayer.state==='moving';
  const lg=moving?Math.sin(rFrame*0.3)*7:0;
  const bob=moving?Math.abs(Math.sin(rFrame*0.3))*2:0;
  rctx.translate(0,-bob);
  // Shadow
  rctx.fillStyle='rgba(0,0,0,0.2)';rctx.beginPath();rctx.ellipse(0,16,12,4,0,0,Math.PI*2);rctx.fill();
  // Legs — dark pants
  rctx.strokeStyle='#1a1a40';rctx.lineWidth=4.5;rctx.lineCap='round';
  rctx.beginPath();rctx.moveTo(-3,-2);rctx.lineTo(-6+lg,12);rctx.stroke();
  rctx.beginPath();rctx.moveTo(3,-2);rctx.lineTo(6-lg,12);rctx.stroke();
  // Shoes — polished black
  rctx.fillStyle='#0a0a0a';
  rctx.beginPath();rctx.ellipse(-6+lg,14,6,3.5,0.15,0,Math.PI*2);rctx.fill();
  rctx.beginPath();rctx.ellipse(6-lg,14,6,3.5,-0.15,0,Math.PI*2);rctx.fill();
  rctx.fillStyle='rgba(255,255,255,0.15)';
  rctx.beginPath();rctx.ellipse(-5+lg,13,3,1.5,0,0,Math.PI*2);rctx.fill();
  rctx.beginPath();rctx.ellipse(7-lg,13,3,1.5,0,0,Math.PI*2);rctx.fill();
  // Body — crisp white shirt
  const shirtG=rctx.createLinearGradient(-9,-22,9,-2);
  shirtG.addColorStop(0,'#ffffff');shirtG.addColorStop(1,'#e8e8e8');
  rctx.fillStyle=shirtG;
  rctx.beginPath();rctx.roundRect(-9,-22,18,20,3);rctx.fill();
  // Shirt buttons
  rctx.fillStyle='rgba(0,0,0,0.15)';
  [-16,-12,-8].forEach(by=>{rctx.beginPath();rctx.arc(0,by,1,0,Math.PI*2);rctx.fill();});
  // Apron — dark with pocket
  rctx.fillStyle='#1a1a1a';
  rctx.beginPath();rctx.roundRect(-8,-10,16,10,2);rctx.fill();
  rctx.strokeStyle='rgba(255,255,255,0.1)';rctx.lineWidth=0.5;
  rctx.strokeRect(-4,-7,8,5);
  // Bow tie — red satin
  rctx.fillStyle='#cc1111';
  rctx.beginPath();rctx.moveTo(-5,-20);rctx.lineTo(0,-17);rctx.lineTo(5,-20);
  rctx.lineTo(5,-16);rctx.lineTo(0,-19);rctx.lineTo(-5,-16);rctx.closePath();rctx.fill();
  rctx.fillStyle='#ff3333';
  rctx.beginPath();rctx.arc(0,-18,1.5,0,Math.PI*2);rctx.fill();
  // Arms
  rctx.strokeStyle='#ffe0b2';rctx.lineWidth=3.5;rctx.lineCap='round';
  rctx.beginPath();rctx.moveTo(-8,-18);rctx.lineTo(-14,-8+lg*0.4);rctx.stroke();
  rctx.beginPath();rctx.moveTo(8,-18);rctx.lineTo(14,-8-lg*0.4);rctx.stroke();
  // Hands
  rctx.fillStyle='#ffe0b2';
  rctx.beginPath();rctx.arc(-14,-8+lg*0.4,2.5,0,Math.PI*2);rctx.fill();
  rctx.beginPath();rctx.arc(14,-8-lg*0.4,2.5,0,Math.PI*2);rctx.fill();
  // Head
  rctx.fillStyle='#ffe0b2';rctx.beginPath();rctx.arc(0,-30,9,0,Math.PI*2);rctx.fill();
  // Hair
  rctx.fillStyle='#3d2000';rctx.beginPath();rctx.arc(0,-34,9,Math.PI+0.3,0-0.3);rctx.fill();
  // Eyes
  rctx.fillStyle='#222';
  rctx.beginPath();rctx.arc(-3,-30,1.8,0,Math.PI*2);rctx.fill();
  rctx.beginPath();rctx.arc(3,-30,1.8,0,Math.PI*2);rctx.fill();
  // Eye shine
  rctx.fillStyle='#fff';
  rctx.beginPath();rctx.arc(-2.5,-30.5,0.6,0,Math.PI*2);rctx.fill();
  rctx.beginPath();rctx.arc(3.5,-30.5,0.6,0,Math.PI*2);rctx.fill();
  // Smile
  rctx.strokeStyle='#c0392b';rctx.lineWidth=1.2;
  rctx.beginPath();rctx.arc(0,-28,3,0.3,Math.PI-0.3);rctx.stroke();
  // Carrying
  if(rPlayer.carrying){
    if(rPlayer.carrying.type==='order'){
      rctx.font='14px serif';rctx.textAlign='center';rctx.fillText('📋',0,-48);
    }else if(rPlayer.carrying.type==='food'){
      // Plate
      rctx.fillStyle='#e0e0e0';
      rctx.beginPath();rctx.ellipse(0,-44,12,4,0,0,Math.PI*2);rctx.fill();
      rctx.fillStyle='#f5f5f5';
      rctx.beginPath();rctx.ellipse(0,-45,10,3,0,0,Math.PI*2);rctx.fill();
      rctx.font='15px serif';rctx.textAlign='center';rctx.fillText(rPlayer.carrying.dish.emoji,0,-50);
    }
  }
  if(rPlayer.state==='acting'){rctx.font='12px serif';rctx.textAlign='center';rctx.fillText('⚡',12,-44);}
  rctx.restore();
}

function rDrawQueue(){
  // Queue area label
  if(rQueue.length>0){
    rctx.fillStyle='rgba(255,200,100,0.3)';rctx.font='bold 7px Segoe UI';rctx.textAlign='left';
    rctx.fillText('WAITING',75,R_FLOOR_BOT+32);
  }
  rQueue.forEach((c,i)=>{
    const qx=90+i*55,qy=R_FLOOR_BOT+10;
    // Speech bubble
    rctx.fillStyle='rgba(255,255,255,0.08)';
    rctx.beginPath();rctx.roundRect(qx-16,qy-14,32,24,8);rctx.fill();
    rctx.font='15px serif';rctx.textAlign='center';
    rctx.fillText(c.emojis[0],qx,qy+4);
    if(c.size>1){
      rctx.fillStyle='#ffd700';rctx.font='bold 8px Segoe UI';
      rctx.fillText('x'+c.size,qx+14,qy-6);rctx.fillStyle='#fff';
    }
    // Impatience dots
    const dots=Math.min(3,Math.floor((rFrame+i*40)%180/60));
    rctx.fillStyle='rgba(255,255,255,0.3)';rctx.font='6px serif';
    rctx.fillText('.'.repeat(dots+1),qx+2,qy-12);
  });

  // Queued actions indicator (dots above player)
  if(rTapQueue.length>0){
    rctx.save();
    for(let i=0;i<rTapQueue.length;i++){
      rctx.fillStyle='rgba(255,200,0,'+(0.5+i*0.1)+')';
      rctx.beginPath();rctx.arc(rPlayer.x-12+i*6,rPlayer.y-52,2.5,0,Math.PI*2);rctx.fill();
    }
    rctx.restore();
  }
}

function rRender(){
  rctx.clearRect(0,0,RW,RH);
  rDrawFloor();rDrawKitchen();
  rTables.forEach(t=>rDrawTable(t));
  rDrawQueue();rDrawPlayer();
  // Float texts
  rFloats.forEach(f=>{
    rctx.save();rctx.globalAlpha=Math.min(1,f.life);
    rctx.font='bold 13px Segoe UI';rctx.textAlign='center';rctx.textBaseline='middle';
    rctx.shadowColor='rgba(0,0,0,0.7)';rctx.shadowBlur=6;
    rctx.fillStyle=f.color;rctx.fillText(f.txt,f.x,f.y);
    rctx.restore();
  });
}

// ── Game loop ──
function rLoop(){
  if(rState!=='playing')return;
  rFrame++;
  rSpawnTimer--;
  const interval=Math.max(150,320-rLevel*22);
  if(rSpawnTimer<=0){rSpawnCustomer();rSpawnTimer=interval+rRI(-30,30);}
  rPlayerUpdate();rTablesUpdate();rKitchenUpdate();
  rFloats.forEach(f=>{f.y+=f.vy;f.life-=0.015;});
  rFloats=rFloats.filter(f=>f.life>0);
  rRender();
  rRaf=requestAnimationFrame(rLoop);
}

function initRestaurantGame(){
  rState='playing';rFrame=0;rScore=0;rTips=0;rLevel=1;rXP=0;rMoney=0;rServed=0;
  rKitchen=[];rQueue=[];rFloats=[];rTapQueue=[];rSpawnTimer=60;
  rUpg={speed:0,kitchen:0,water:false,table4:false,table5:false,autoServe:false};
  rPlayer={x:260,y:330,state:'idle',targetX:260,targetY:330,dir:1,carrying:null,task:null,actTimer:0};
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
  rFloat(RW/2,RH/2-30,'Upgraded!','#00e5ff');
  rUpdateHUD();rRenderUpgPanel();
}

// ── Events ──
rc.addEventListener('click',e=>{
  const r=rc.getBoundingClientRect();
  rHandleTap((e.clientX-r.left)*(RW/r.width),(e.clientY-r.top)*(RH/r.height));
});
rc.addEventListener('touchend',e=>{
  const r=rc.getBoundingClientRect(),t=e.changedTouches[0];
  rHandleTap((t.clientX-r.left)*(RW/r.width),(t.clientY-r.top)*(RH/r.height));
},{passive:true});

document.getElementById('vBtnUpgrade').addEventListener('click',()=>{
  const p=document.getElementById('vendorUpgradePanel');
  p.style.display=p.style.display==='flex'?'none':'flex';
  if(p.style.display==='flex')rRenderUpgPanel();
});
document.getElementById('vPlayBtn').addEventListener('click',initRestaurantGame);

function exitVendorGame(){
  if(rState==='playing'){cancelAnimationFrame(rRaf);rState='idle';}
  rTapQueue=[];
  navigate('home');
}

// Draw idle frame
(function(){
  const g=rctx.createLinearGradient(0,0,0,RH);g.addColorStop(0,'#3d1a00');g.addColorStop(0.6,'#1a0e00');g.addColorStop(1,'#0d0800');
  rctx.fillStyle=g;rctx.fillRect(0,0,RW,RH);
  // Warm glow
  const glow=rctx.createRadialGradient(RW/2,RH/2-20,10,RW/2,RH/2,120);
  glow.addColorStop(0,'rgba(255,180,80,0.12)');glow.addColorStop(1,'transparent');
  rctx.fillStyle=glow;rctx.fillRect(0,0,RW,RH);
  rctx.font='48px serif';rctx.textAlign='center';
  rctx.fillText('🍽️',RW/2,RH/2-10);
  rctx.fillStyle='rgba(255,220,150,0.8)';rctx.font='bold 16px Segoe UI';
  rctx.fillText('Restaurant Rush',RW/2,RH/2+28);
  rctx.fillStyle='rgba(255,200,100,0.35)';rctx.font='11px Segoe UI';
  rctx.fillText('Tap to begin',RW/2,RH/2+48);
})();
