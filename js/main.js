// ══════════════════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════════════════
let currentPage='home';
function navigate(page){
  if(page===currentPage) return;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  document.querySelectorAll('.nav-item').forEach((n,i)=>{
    n.classList.toggle('active',['home','leaderboard','profile','settings'][i]===page);
  });
  document.getElementById('bottomNav').style.display='flex';
  currentPage=page;
  if(page==='home') refreshHome();
  if(page==='leaderboard') renderLeaderboard();
  if(page==='profile') refreshProfile();
  if(page==='settings') loadSettings();
}

function launchGame(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('bottomNav').style.display='none';
  if(id==='fish-dash'){
    document.getElementById('page-game').classList.add('active');
    currentPage='game';
    gameSessionStart=Date.now();
    showGameOverlay(false);
  } else if(id==='city-stars'){
    document.getElementById('page-city').classList.add('active');
    currentPage='city';
    showCityOverlay(false);
  } else if(id==='street-vendor'){
    document.getElementById('page-vendor').classList.add('active');
    currentPage='vendor';
    showRestaurantOverlay(false);
  } else if(id==='bubble-stack'){
    document.getElementById('page-bubble').classList.add('active');
    currentPage='bubble';
    showBubbleOverlay(false);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// LOCAL STORAGE
// ══════════════════════════════════════════════════════════════════════════
const STATS_KEY='siddhArcade_stats';
const SETTINGS_KEY='siddhArcade_settings';

function loadStats(){
  try{return JSON.parse(localStorage.getItem(STATS_KEY))||defaultStats();}catch(e){return defaultStats();}
}
function defaultStats(){return{gamesPlayed:0,bestScore:0,bestLevel:1,totalPlaytimeMs:0,lastPlayed:null};}
function saveStats(s){localStorage.setItem(STATS_KEY,JSON.stringify(s));}

function loadSettingsData(){
  try{return JSON.parse(localStorage.getItem(SETTINGS_KEY))||{sound:true,music:true,vibration:true};}catch(e){return{sound:true,music:true,vibration:true};}
}
function saveSettingsData(s){localStorage.setItem(SETTINGS_KEY,JSON.stringify(s));}

function recordGameEnd(finalScore,finalLevel){
  const s=loadStats();
  s.gamesPlayed++;
  if(finalScore>s.bestScore) s.bestScore=finalScore;
  if(finalLevel>s.bestLevel) s.bestLevel=finalLevel;
  s.totalPlaytimeMs+=(Date.now()-(gameSessionStart||Date.now()));
  s.lastPlayed=new Date().toISOString();
  saveStats(s);
  updateAchievements(s);
}

// ══════════════════════════════════════════════════════════════════════════
// ACHIEVEMENTS
// ══════════════════════════════════════════════════════════════════════════
const ACH_KEY='siddhArcade_achievements';
const ACH_DEFS=[
  {id:'score10',name:'Getting Started',desc:'Score 10 points',icon:'⭐',target:10,stat:'bestScore'},
  {id:'score25',name:'Rising Tide',desc:'Score 25 points',icon:'🌊',target:25,stat:'bestScore'},
  {id:'score50',name:'Ocean Master',desc:'Score 50 points',icon:'🔱',target:50,stat:'bestScore'},
  {id:'level3',name:'Deep Diver',desc:'Reach Level 3',icon:'🤿',target:3,stat:'bestLevel'},
  {id:'level5',name:'Abyss Explorer',desc:'Reach Level 5',icon:'🌌',target:5,stat:'bestLevel'},
  {id:'games5',name:'Regular',desc:'Play 5 games',icon:'🎮',target:5,stat:'gamesPlayed'},
  {id:'games20',name:'Addict',desc:'Play 20 games',icon:'🕹️',target:20,stat:'gamesPlayed'},
  {id:'games50',name:'Unstoppable',desc:'Play 50 games',icon:'🏅',target:50,stat:'gamesPlayed'},
];

function loadAchievements(){
  try{return JSON.parse(localStorage.getItem(ACH_KEY))||{};}catch(e){return{};}
}
function saveAchievements(a){localStorage.setItem(ACH_KEY,JSON.stringify(a));}

function updateAchievements(stats){
  const ach=loadAchievements();
  ACH_DEFS.forEach(d=>{
    const val=stats[d.stat]||0;
    ach[d.id]={progress:Math.min(val,d.target),unlocked:val>=d.target};
  });
  saveAchievements(ach);
}

// ══════════════════════════════════════════════════════════════════════════
// HOME SCREEN
// ══════════════════════════════════════════════════════════════════════════
function refreshHome(){
  const s=loadStats();
  document.getElementById('homeScore').textContent=s.bestScore;
  document.getElementById('homeLevel').textContent=s.bestLevel;
  document.getElementById('homeGames').textContent=s.gamesPlayed;
}

// ══════════════════════════════════════════════════════════════════════════
// LEADERBOARD
// ══════════════════════════════════════════════════════════════════════════
const FAKE_FISH=[
  {name:'AquaKing',score:142},{name:'SharkSlayer',score:118},{name:'CoralQueen',score:105},
  {name:'TideRider',score:89},{name:'WaveRunner',score:76},{name:'DeepDive',score:63},
  {name:'SeaStar',score:55},{name:'PearlHunter',score:42},{name:'OceanBreeze',score:38}
];
const FAKE_CITY=[
  {name:'StarHunter',money:4200},{name:'GoldRush',money:3850},{name:'CitySlicker',money:3100},
  {name:'NeonWalker',money:2700},{name:'StreetStar',money:2200},{name:'UrbanPro',money:1900},
  {name:'BlockRunner',money:1450},{name:'CoinGrabber',money:980},{name:'NewcomerX',money:540}
];
let lbTab='global', lbGame='fish-dash';

function switchLbTab(el,tab){
  document.querySelectorAll('.lb-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active'); lbTab=tab; renderLeaderboard();
}
function switchLbGame(el,game){
  document.querySelectorAll('.lb-game-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active'); lbGame=game;
  document.getElementById('treasureBox').style.display=game==='city-stars'?'block':'none';
  renderLeaderboard();
}

function renderLeaderboard(){
  const s=loadStats();
  const cs=loadCityStats();
  const medals=['gold','silver','bronze'];
  let players, youScore, gameLabel, unit;
  if(lbGame==='fish-dash'){
    players=[...FAKE_FISH];
    if(lbTab==='weekly') players=players.map(p=>({...p,score:Math.floor(p.score*0.6)}));
    youScore=s.bestScore; gameLabel='Fish Dash'; unit='';
    const you={name:'Siddh Salgia',score:youScore,isYou:true};
    players.push(you);
    players.sort((a,b)=>b.score-a.score);
    const avatars=['🦈','🐙','🐠','🐬','🦑','🐡','🪼','🦞','🐚'];
    document.getElementById('lbList').innerHTML=players.map((p,i)=>{
      const cls=p.isYou?'lb-entry you':'lb-entry';
      const rc=i<3?medals[i]:''; const rankTxt=i<3?['🥇','🥈','🥉'][i]:(i+1);
      const av=p.isYou?'🎮':avatars[i%avatars.length];
      return `<div class="${cls}"><div class="lb-rank ${rc}">${rankTxt}</div><div class="lb-avatar">${av}</div><div class="lb-info"><div class="lb-name">${p.name}${p.isYou?' (You)':''}</div><div class="lb-score">${gameLabel}</div></div><div class="lb-pts">${p.score}</div></div>`;
    }).join('');
  } else {
    players=[...FAKE_CITY];
    if(lbTab==='weekly') players=players.map(p=>({...p,money:Math.floor(p.money*0.7)}));
    youScore=cs.weeklyMoney; gameLabel='City Stars';
    const you={name:'Siddh Salgia',money:youScore,isYou:true};
    players.push(you);
    players.sort((a,b)=>b.money-a.money);
    const avatars=['🏙','🌆','🌇','🌃','🌉','🌁','🏢','🏬','🏛'];
    document.getElementById('lbList').innerHTML=players.map((p,i)=>{
      const cls=p.isYou?'lb-entry you':'lb-entry';
      const rc=i<3?medals[i]:''; const rankTxt=i<3?['🥇','🥈','🥉'][i]:(i+1);
      const av=p.isYou?'🎮':avatars[i%avatars.length];
      const isLeader=i===0; const nameExtra=isLeader?' 👑':'';
      return `<div class="${cls}"><div class="lb-rank ${rc}">${rankTxt}</div><div class="lb-avatar">${av}</div><div class="lb-info"><div class="lb-name">${p.name}${p.isYou?' (You)':''}${nameExtra}</div><div class="lb-score">${gameLabel} · this week</div></div><div class="lb-pts" style="color:#ffd700">₹${p.money}</div></div>`;
    }).join('');
  }
}

// ══════════════════════════════════════════════════════════════════════════
// PROFILE
// ══════════════════════════════════════════════════════════════════════════
function refreshProfile(){
  const s=loadStats();
  const ach=loadAchievements();
  document.getElementById('profGames').textContent=s.gamesPlayed;
  document.getElementById('profBestScore').textContent=s.bestScore;
  document.getElementById('profBestLevel').textContent=s.bestLevel;
  const mins=Math.floor(s.totalPlaytimeMs/60000);
  document.getElementById('profPlaytime').textContent=mins<60?mins+'m':Math.floor(mins/60)+'h '+mins%60+'m';
  document.getElementById('profileBadge').textContent='Level '+s.bestLevel;

  // Rank
  const all=[...FAKE_FISH.map(p=>p.score),s.bestScore].sort((a,b)=>b-a);
  const rank=all.indexOf(s.bestScore)+1;
  document.getElementById('profRank').textContent='#'+rank;

  // Achievements
  const unlocked=ACH_DEFS.filter(d=>ach[d.id]&&ach[d.id].unlocked).length;
  document.getElementById('profAch').textContent=unlocked;

  document.getElementById('achievementsList').innerHTML=ACH_DEFS.map(d=>{
    const a=ach[d.id]||{progress:0,unlocked:false};
    const pct=Math.min(100,Math.round((a.progress/d.target)*100));
    return `<div class="achievement-item"><div class="ach-icon">${d.icon}</div><div class="ach-info"><div class="ach-name">${d.name}</div><div class="ach-desc">${d.desc}</div><div class="ach-bar"><div class="ach-bar-fill" style="width:${pct}%"></div></div></div><div class="ach-pct">${a.unlocked?'✅':pct+'%'}</div></div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════════════════════════
function loadSettings(){
  const s=loadSettingsData();
  document.querySelectorAll('.toggle[data-key]').forEach(t=>{
    t.classList.toggle('on',!!s[t.dataset.key]);
  });
}
function toggleSetting(el){
  const s=loadSettingsData();
  const key=el.dataset.key;
  s[key]=!s[key];
  saveSettingsData(s);
  el.classList.toggle('on',s[key]);
}

// ══════════════════════════════════════════════════════════════════════════
// FULLSCREEN
// ══════════════════════════════════════════════════════════════════════════
function toggleFullscreen(){
  const el=document.documentElement;
  if(!document.fullscreenElement&&!document.webkitFullscreenElement){
    (el.requestFullscreen||el.webkitRequestFullscreen).call(el);
  }else{
    (document.exitFullscreen||document.webkitExitFullscreen).call(document);
  }
}

// Prevent mobile scroll
document.addEventListener('touchmove',e=>{if(currentPage==='game'||currentPage==='city'||currentPage==='vendor'||currentPage==='bubble')e.preventDefault();},{passive:false});

// Handle rotation / resize
window.addEventListener('resize',()=>{
  document.body.style.height=window.innerHeight+'px';
  document.getElementById('app').style.height=window.innerHeight+'px';
});
window.dispatchEvent(new Event('resize'));

// Init
refreshHome();
updateAchievements(loadStats());
