const $ = s => document.querySelector(s);
const screens = [...document.querySelectorAll('.screen')];
let ws = null;
let me = localStorage.getItem('typeoutPlayerId') || '';
let clientId = localStorage.getItem('typeoutClientId') || crypto.randomUUID();
let isHost = false;
let isOwner = false;
let hostToken = sessionStorage.getItem('typeoutHostToken') || '';
let roomCode = '';
let state = null;
let votedFor = null;
localStorage.setItem('typeoutClientId', clientId);

function show(id){ screens.forEach(s=>s.classList.toggle('active',s.id===id)); }
function esc(s=''){ return String(s).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2600); }
function send(type, extra={}){ if(ws?.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type,...extra})); }
function phaseName(p){ return ({lobby:'LOBBY',answering:'ANSWER',voting:'VOTING',results:'RESULTS',final:'FINAL'})[p]||p; }
function myPlayer(){ return state?.players?.find(p=>p.id===me); }
function syncRole(){ const p=myPlayer(); isHost=Boolean(p?.isHost); isOwner=Boolean(p?.isOwner); }

$('#showHost').onclick=()=>show('hostSetup');
$('#showJoin').onclick=()=>show('joinSetup');
document.querySelectorAll('[data-back]').forEach(b=>b.onclick=()=>show('home'));
$('#homeBtn').onclick=()=>location.reload();
$('#joinCode').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6));

$('#createRoom').onclick=async()=>{
  const hostName=$('#hostName').value.trim();
  if(!hostName) return toast('Enter your name first.');
  const btn=$('#createRoom'); btn.disabled=true; btn.textContent='CREATING…';
  try{
    const r=await fetch('/api/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({hostName,rounds:Number($('#hostRounds').value)})});
    const d=await r.json();
    if(!r.ok) throw new Error(d.error||'Could not create room');
    hostToken=d.hostToken; sessionStorage.setItem('typeoutHostToken',hostToken);
    localStorage.removeItem(`typeoutBanned:${d.code}`);
    connect(d.code,hostName,hostToken);
  }catch(e){toast(e.message)}finally{btn.disabled=false;btn.textContent='CREATE ROOM'}
};

$('#joinRoom').onclick=()=>{
  const code=$('#joinCode').value.trim().toUpperCase();
  const name=$('#joinName').value.trim();
  if(code.length!==6) return toast('Enter the 6-character room code.');
  if(!name) return toast('Enter your name.');
  if(localStorage.getItem(`typeoutBanned:${code}`)==='1') return toast('You are banned from this room.');
  connect(code,name,'');
};

function connect(code,name,token){
  roomCode=code;
  const proto=location.protocol==='https:'?'wss':'ws';
  const q=new URLSearchParams({name,clientId});
  if(me) q.set('playerId',me);
  if(token) q.set('hostToken',token);
  ws=new WebSocket(`${proto}://${location.host}/ws/${code}?${q}`);
  ws.onopen=()=>{ show('game'); $('#roomPill').classList.remove('hidden'); $('#roomCodeTop').textContent=code; };
  ws.onmessage=e=>{
    const msg=JSON.parse(e.data);
    if(msg.type==='error') return toast(msg.message);
    if(msg.type==='kicked') return toast(msg.message||'You were kicked from the room.');
    if(msg.type==='banned') {
      localStorage.setItem(`typeoutBanned:${roomCode}`,'1');
      return toast(msg.message||'You were banned from the room.');
    }
    if(msg.type==='welcome'){
      me=msg.playerId;
      localStorage.setItem('typeoutPlayerId',me);
      state=msg.state;
      syncRole();
      render();
    }
    if(msg.type==='state'){
      state=msg.state;
      syncRole();
      render();
    }
  };
  ws.onerror=()=>toast(localStorage.getItem(`typeoutBanned:${roomCode}`)==='1'?'You are banned from this room.':'Connection problem or room not found.');
  ws.onclose=e=>{
    if(e.code===4001){ show('joinSetup'); return toast('You were kicked from the room.'); }
    if(e.code===4003){ localStorage.setItem(`typeoutBanned:${roomCode}`,'1'); show('home'); return toast('You were banned from the room.'); }
    if(e.code!==1000) toast('Disconnected from room.');
  };
}

function render(){
  if(!state?.exists) return;
  syncRole();
  $('#roomCodeTop').textContent=state.code;
  renderSide();
  const main=$('#mainCard');
  if(state.phase==='lobby') main.innerHTML=lobbyHTML();
  if(state.phase==='answering') main.innerHTML=answerHTML();
  if(state.phase==='voting') main.innerHTML=voteHTML();
  if(state.phase==='results') main.innerHTML=resultsHTML();
  if(state.phase==='final') main.innerHTML=finalHTML();
  bindMain();
}

function lobbyHTML(){
  const connected=state.players.filter(p=>p.connected).length;
  return `<div class="topline"><span class="round">ROOM ${esc(state.code)}</span><span class="phase-badge">LOBBY</span></div>
    <p class="eyebrow">JOIN CODE</p><div class="question room-code-big">${esc(state.code)}</div>
    <div class="waiting">${connected} player${connected===1?'':'s'} connected. Share the code and wait for everyone to join.</div>
    ${isHost?`<div style="margin-top:18px"><button class="btn primary" id="startBtn" ${connected<2?'disabled':''}>START GAME</button></div>`:''}`;
}

function answerHTML(){
  const mine=myPlayer();
  const already=mine?.answered;
  return `<div class="topline"><span class="round">QUESTION ${state.round} OF ${state.rounds}</span><span class="phase-badge">${phaseName(state.phase)}</span></div>
    <h2 class="question">${esc(state.question)}</h2>
    ${already?`<div class="waiting">Answer locked in. Waiting for the others…</div>`:`<div class="answer-box"><textarea id="answerText" maxlength="140" placeholder="Type your answer…"></textarea><button class="btn primary" id="answerBtn">SUBMIT</button></div>`}
    ${isHost?`<div class="host-box"><button class="btn secondary" id="revealBtn">REVEAL ANSWERS</button></div>`:''}`;
}

function voteHTML(){
  const meP=myPlayer();
  return `<div class="topline"><span class="round">QUESTION ${state.round} OF ${state.rounds}</span><span class="phase-badge">VOTE</span></div>
    <p class="eyebrow">PICK YOUR FAVOURITE</p><h2 class="question small-question">${esc(state.question)}</h2>
    <div class="answers-grid">${state.answers.map(a=>`<button class="answer-card ${a.id===me?'mine':''} ${votedFor===a.id?'selected':''}" data-vote="${a.id}" ${meP?.voted||a.id===me?'disabled':''}>${esc(a.text)}</button>`).join('')}</div>
    ${meP?.voted?`<div class="waiting" style="margin-top:14px">Vote locked in.</div>`:''}
    ${isHost?`<div class="host-box"><button class="btn primary" id="scoreBtn">SHOW RESULTS + ADD POINTS</button></div>`:''}`;
}

function resultsHTML(){
  return `<div class="topline"><span class="round">QUESTION ${state.round} OF ${state.rounds}</span><span class="phase-badge">RESULTS</span></div>
    <p class="eyebrow">ROUND RESULTS</p><h2 class="question small-question">${esc(state.question)}</h2>
    <div>${state.answers.map(a=>`<div class="result-card"><div>${esc(a.text)}</div><div class="result-meta"><span>${esc(a.ownerName||'')}</span><span><b>${a.votes||0}</b> vote${a.votes===1?'':'s'} · <span class="points-pop">+${(a.votes||0)*100} pts</span></span></div></div>`).join('')}</div>
    ${isHost?`<div class="host-box"><button class="btn primary" id="nextBtn">${state.round>=state.rounds?'FINAL SCORES':'NEXT QUESTION'}</button></div>`:''}`;
}

function finalHTML(){
  const w=state.winner;
  return `<div class="topline"><span class="round">GAME OVER</span><span class="phase-badge">FINAL</span></div>
    <div class="final-wrap"><div class="winner-label">WINNER</div><div class="winner-name">${esc(w?.name||'—')}</div><div class="winner-score">${w?.score||0} points</div>
    <div class="final-list">${state.leaderboard.map(p=>`<div class="final-row"><span class="final-pos">${p.place}</span><span>${esc(p.name)} ${p.isHost?'<span class="mini-host">HOST</span>':''}</span><strong>${p.score}</strong></div>`).join('')}</div></div>`;
}

function playerManagementHTML(){
  if(!isHost) return '';
  const others=state.players.filter(p=>p.id!==me);
  return `<div class="host-box"><h3>Player controls</h3><div class="manage-list">${others.map(p=>{
    const protectedOwner=p.isOwner;
    const hostButton=isOwner
      ? (p.isHost
          ? `<button class="mini-btn" data-demote="${p.id}" ${protectedOwner?'disabled':''}>REMOVE HOST</button>`
          : `<button class="mini-btn" data-promote="${p.id}">MAKE HOST</button>`)
      : '';
    return `<div class="manage-player"><div class="manage-name"><span class="dot ${p.connected?'on':''}"></span><span>${esc(p.name)}</span>${p.isOwner?'<span class="mini-owner">OWNER</span>':p.isHost?'<span class="mini-host">HOST</span>':''}</div><div class="manage-actions">${hostButton}<button class="mini-btn warn" data-kick="${p.id}" ${protectedOwner?'disabled':''}>KICK</button><button class="mini-btn danger-mini" data-ban="${p.id}" ${protectedOwner?'disabled':''}>BAN</button></div></div>`;
  }).join('')||'<div class="empty">No other players yet.</div>'}</div></div>`;
}

function renderSide(){
  const side=$('#sideCard');
  side.innerHTML=`<p class="players-title">LEADERBOARD</p><div>${state.leaderboard.map(p=>`<div class="score-row"><span class="player-name"><span class="dot ${p.connected?'on':''}"></span>${esc(p.name)} ${p.isOwner?'<span class="mini-owner">OWNER</span>':p.isHost?'<span class="mini-host">HOST</span>':''}</span><span class="score">${p.score}</span></div>`).join('')||'<div class="empty">No players yet</div>'}</div>
    ${state.phase==='lobby'&&isHost?`<div class="host-box"><h3>Game settings</h3><label>Questions<select id="roundSelect"><option ${state.rounds===3?'selected':''}>3</option><option ${state.rounds===5?'selected':''}>5</option><option ${state.rounds===7?'selected':''}>7</option><option ${state.rounds===10?'selected':''}>10</option></select></label><h3 style="margin-top:18px">Custom questions</h3><div class="custom-row"><input id="customQ" maxlength="180" placeholder="Add your own question"><button class="btn secondary" id="addQ">ADD</button></div><div class="custom-list">${state.customQuestions.map((q,i)=>`<div class="custom-item"><span>${esc(q)}</span><button data-remove="${i}">✕</button></div>`).join('')||'<div class="empty">None added yet.</div>'}</div></div>`:''}
    ${playerManagementHTML()}
    ${['answering','voting','results'].includes(state.phase)&&isHost?`<div class="host-box"><button class="btn danger full" id="endBtn">END GAME NOW</button></div>`:''}`;

  if($('#roundSelect')) $('#roundSelect').onchange=e=>send('setRounds',{rounds:Number(e.target.value)});
  if($('#addQ')) $('#addQ').onclick=()=>{const q=$('#customQ').value.trim();if(q){send('addQuestion',{question:q});$('#customQ').value=''}};
  side.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>send('removeQuestion',{index:Number(b.dataset.remove)}));
  side.querySelectorAll('[data-promote]').forEach(b=>b.onclick=()=>send('promoteHost',{playerId:b.dataset.promote}));
  side.querySelectorAll('[data-demote]').forEach(b=>b.onclick=()=>send('demoteHost',{playerId:b.dataset.demote}));
  side.querySelectorAll('[data-kick]').forEach(b=>b.onclick=()=>{
    const p=state.players.find(x=>x.id===b.dataset.kick);
    if(confirm(`Kick ${p?.name||'this player'} from the room?`)) send('kickPlayer',{playerId:b.dataset.kick});
  });
  side.querySelectorAll('[data-ban]').forEach(b=>b.onclick=()=>{
    const p=state.players.find(x=>x.id===b.dataset.ban);
    if(confirm(`Ban ${p?.name||'this player'} from this room? They will not be able to rejoin from the same browser.`)) send('banPlayer',{playerId:b.dataset.ban});
  });
  if($('#endBtn')) $('#endBtn').onclick=()=>send('end');
}

function bindMain(){
  if($('#startBtn')) $('#startBtn').onclick=()=>send('start');
  if($('#answerBtn')) $('#answerBtn').onclick=()=>{const a=$('#answerText').value.trim();if(!a)return toast('Type an answer first.');send('answer',{answer:a})};
  if($('#revealBtn')) $('#revealBtn').onclick=()=>send('reveal');
  document.querySelectorAll('[data-vote]').forEach(b=>b.onclick=()=>{votedFor=b.dataset.vote;send('vote',{target:votedFor})});
  if($('#scoreBtn')) $('#scoreBtn').onclick=()=>send('score');
  if($('#nextBtn')) $('#nextBtn').onclick=()=>{votedFor=null;send('next')};
}
