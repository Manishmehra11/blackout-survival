const socket = io();

const $ = id => document.getElementById(id);
let mode = 'create';
let state = null;
let currentChoice = null;
let timerInterval = null;
let countdownInterval = null;
let soundOn = true;
let audioCtx = null;

const screens = ['Landing','Name','Lobby','Briefing','Game','Result','Gameover'];
function showScreen(name) {
  screens.forEach(s => $(`screen${s}`).classList.toggle('active', s === name));
}
function toast(message) {
  const el = $('toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2500);
}
function beep(freq=440, duration=.08, type='sine') {
  if (!soundOn) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(.045, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + duration);
    o.connect(g).connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + duration);
  } catch (_) {}
}
function renderParticles() {
  const box = $('particles');
  for (let i=0;i<42;i++) {
    const p = document.createElement('i'); p.className='particle';
    p.style.left = `${Math.random()*100}%`; p.style.animationDuration = `${8+Math.random()*15}s`;
    p.style.animationDelay = `${-Math.random()*18}s`; p.style.opacity = `${.15+Math.random()*.55}`;
    box.appendChild(p);
  }
}
function setConnection(online) {
  const el = $('connectionDot'); el.classList.toggle('online', online); el.innerHTML = `<i></i> ${online ? 'CONNECTED' : 'CONNECTING'}`;
}
function initialNameFlow(targetMode) {
  mode = targetMode;
  $('nameTitle').textContent = targetMode === 'create' ? 'CREATE MISSION' : 'JOIN MISSION';
  $('roomCodeWrap').classList.toggle('hidden', targetMode === 'create');
  $('nameError').textContent = '';
  $('nameInput').value = '';
  $('roomInput').value = '';
  showScreen('Name');
  setTimeout(() => $('nameInput').focus(), 100);
}
function sendIdentity() {
  const name = $('nameInput').value.trim();
  const room = $('roomInput').value.trim().toUpperCase();
  $('nameError').textContent = '';
  if (!name) return $('nameError').textContent = 'CALLSIGN REQUIRED.';
  if (mode === 'create') {
    socket.emit('createRoom', { name }, result => {
      if (!result?.ok) return $('nameError').textContent = result?.error || 'Unable to create room.';
      $('roomCodeDisplay').textContent = result.code;
      showScreen('Lobby');
    });
  } else {
    if (room.length !== 5) return $('nameError').textContent = 'ENTER THE 5-CHARACTER ROOM CODE.';
    socket.emit('joinRoom', { name, code: room }, result => {
      if (!result?.ok) return $('nameError').textContent = result?.error || 'Unable to join room.';
      $('roomCodeDisplay').textContent = result.code;
      showScreen('Lobby');
    });
  }
}
function initials(name) { return (name || '?').slice(0,2).toUpperCase(); }
function renderLobby(s) {
  $('roomCodeDisplay').textContent = s.code;
  const grid = $('playerGrid'); grid.innerHTML = '';
  s.players.forEach(p => {
    const el = document.createElement('div'); el.className = `player-card ${p.host?'host':''}`;
    el.innerHTML = `<div class="avatar">${initials(p.name)}</div><div class="pname">${escapeHtml(p.name)}</div><div class="role">${p.host?'MISSION HOST':'SURVIVOR'}</div>`;
    grid.appendChild(el);
  });
  $('startBtn').disabled = !(s.me?.id === s.hostId && s.players.length >= 2);
  $('startHint').textContent = s.me?.id === s.hostId
    ? (s.players.length < 2 ? 'Waiting for at least 2 players.' : 'All systems ready. You control the launch.')
    : 'Waiting for the mission host to launch the protocol.';
  $('lobbyStatus').textContent = `${s.players.length}/${s.maxPlayers || 8} SURVIVORS ASSEMBLED`;
  renderChat('chatMessages', s.chat || []);
}
function renderGame(s) {
  $('roundNo').textContent = String(s.round).padStart(2,'0');
  $('roundTotal').textContent = s.totalRounds || 5;
  $('sectorText').textContent = s.scenario?.sector || 'SECTOR --';
  $('scenarioTitle').textContent = s.scenario?.title || 'UNKNOWN INCIDENT';
  $('incidentText').textContent = s.scenario?.incident || '';
  $('threatBadge').textContent = s.scenario?.threat || 'UNKNOWN';
  $('clueText').textContent = s.me?.clue || 'No private intel received.';
  $('aliveCount').textContent = `${s.aliveCount} ALIVE`;
  currentChoice = s.me?.decision || null;
  const choices = $('choices'); choices.innerHTML = '';
  (s.scenario?.choices || []).forEach((c, i) => {
    const b = document.createElement('button'); b.className = `choice ${currentChoice===c.id?'selected':''}`;
    b.disabled = !s.me?.alive || !!currentChoice;
    b.innerHTML = `<span class="num">0${i+1}</span><span class="label">${escapeHtml(c.label)}</span>`;
    b.onclick = () => submitChoice(c.id, b);
    choices.appendChild(b);
  });
  $('decisionStatus').textContent = currentChoice ? 'DECISION LOCKED // WAITING FOR OTHER SURVIVORS' : (s.me?.alive ? 'SELECT ONE RESPONSE' : 'YOU ARE OUT // OBSERVER MODE');
  renderGamePlayers(s.players || []);
  renderChat('gameChatMessages', s.chat || []);
  if (s.roundEndsAt) startTimer(s.roundEndsAt);
}
function renderGamePlayers(players) {
  $('gamePlayers').innerHTML = players.map(p => `<div class="game-player ${p.alive?'alive':'dead'}"><div class="mini">${initials(p.name)}</div><div class="gp-name">${escapeHtml(p.name)}${p.host?' ★':''}</div><div class="gp-status">${p.alive?(p.decisionLocked?'LOCKED':'LIVE'):'OUT'}</div></div>`).join('');
}
function startTimer(endAt) {
  clearInterval(timerInterval);
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((endAt-Date.now())/1000));
    $('timer').textContent = remaining;
    $('timerBar').style.width = `${Math.min(100, remaining/14*100)}%`;
    if (remaining <= 5) { $('timer').style.color='var(--red)'; $('timerBar').style.background='var(--red)'; }
    else { $('timer').style.color='var(--cyan)'; $('timerBar').style.background='var(--cyan)'; }
    if (remaining <= 3 && remaining > 0) beep(520, .04, 'square');
    if (remaining === 0) clearInterval(timerInterval);
  };
  tick(); timerInterval = setInterval(tick, 250);
}
function submitChoice(choice, button) {
  if (currentChoice) return;
  currentChoice = choice;
  socket.emit('submitDecision', { choice });
  document.querySelectorAll('.choice').forEach(b => b.disabled = true);
  button.classList.add('selected');
  $('decisionStatus').textContent = 'DECISION LOCKED // THE FACILITY IS LISTENING';
  beep(720,.12,'square');
}
function renderResult(data) {
  clearInterval(timerInterval);
  $('resultRows').innerHTML = data.outcome.map(r => {
    const choice = data.choiceLabels?.[r.decision] || r.decision;
    return `<div class="result-row ${r.survived?'survived':'eliminated'}"><div class="rname">${escapeHtml(r.name)}</div><div class="rchoice">${escapeHtml(choice)}</div><div class="rstate">${r.survived?'SURVIVED':'ELIMINATED'}</div></div>`;
  }).join('');
  $('overrideNotice').classList.toggle('hidden', !data.overrideId);
  $('resultText').textContent = `${data.eliminated.length ? data.eliminated.length + ' survivor(s) were removed.' : 'Nobody was removed this round.'} ${data.aliveCount} remain.`;
  showScreen('Result');
  beep(data.eliminated.length ? 130 : 620, .22, data.eliminated.length ? 'sawtooth' : 'sine');
  let n=4; $('nextRoundCountdown').textContent=n; clearInterval(countdownInterval);
  countdownInterval=setInterval(()=>{ n--; $('nextRoundCountdown').textContent=Math.max(0,n); if(n<=0) clearInterval(countdownInterval); },1000);
}
function renderGameOver(data) {
  clearInterval(timerInterval); clearInterval(countdownInterval);
  $('winnerName').textContent = data.winner?.name || 'NO SURVIVOR';
  $('leaderboard').innerHTML = data.leaderboard.map(p => `<div class="leader ${p.alive?'winner':''}"><div class="rank">#${p.rank}</div><div class="lname">${escapeHtml(p.name)}</div><div class="score">${p.roundsSurvived} ROUNDS</div></div>`).join('');
  $('restartBtn').classList.toggle('hidden', state?.me?.id !== state?.hostId);
  showScreen('Gameover');
  beep(860,.18,'sine'); setTimeout(()=>beep(1180,.2,'sine'),180);
}
function renderChat(id, messages) {
  const el=$(id); if (!el) return;
  el.innerHTML = messages.map(m => `<div class="chat-line"><div class="meta"><b>${escapeHtml(m.name)}</b> // ${new Date(m.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div><div class="msg">${escapeHtml(m.text)}</div></div>`).join('');
  el.scrollTop=el.scrollHeight;
}
function addChatMessage(m) {
  ['chatMessages','gameChatMessages'].forEach(id => {
    const el=$(id); if (!el) return;
    const row=document.createElement('div'); row.className='chat-line'; row.innerHTML=`<div class="meta"><b>${escapeHtml(m.name)}</b> // ${new Date(m.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div><div class="msg">${escapeHtml(m.text)}</div>`; el.appendChild(row); el.scrollTop=el.scrollHeight;
  });
}
function sendChat(input) { const message=input.value.trim(); if (!message) return; socket.emit('sendChat',{message}); input.value=''; }
function escapeHtml(s) { return String(s??'').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

$('createBtn').onclick=()=>initialNameFlow('create');
$('joinBtn').onclick=()=>initialNameFlow('join');
$('backLanding').onclick=()=>showScreen('Landing');
$('nameContinue').onclick=sendIdentity;
$('nameInput').addEventListener('keydown',e=>{if(e.key==='Enter')sendIdentity();});
$('roomInput').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''));
$('startBtn').onclick=()=>socket.emit('startGame');
$('copyRoom').onclick=()=>navigator.clipboard?.writeText($('roomCodeDisplay').textContent).then(()=>toast('ROOM CODE COPIED'));
$('soundBtn').onclick=()=>{soundOn=!soundOn;$('soundBtn').textContent=soundOn?'🔊':'🔇';if(soundOn)beep();};
$('chatForm').onsubmit=e=>{e.preventDefault();sendChat($('chatInput'));};
$('gameChatForm').onsubmit=e=>{e.preventDefault();sendChat($('gameChatInput'));};
$('restartBtn').onclick=()=>socket.emit('restartGame');
$('returnBtn').onclick=()=>{ location.reload(); };

socket.on('connect',()=>setConnection(true));
socket.on('disconnect',()=>{setConnection(false);toast('CONNECTION LOST // RECONNECTING');});
socket.on('roomCreated',({code})=>{ $('roomCodeDisplay').textContent=code; });
socket.on('lobbyState',s=>{state=s;renderLobby(s);if(s.phase==='lobby' && $('screenLobby').classList.contains('active')===false && s.me)showScreen('Lobby');});
socket.on('state',s=>{state=s; if(s.phase==='decision')renderGame(s); });
socket.on('briefing',data=>{showScreen('Briefing');let n=data.seconds||3;$('briefCount').textContent=n;const t=setInterval(()=>{n--;beep(430,.06,'square');$('briefCount').textContent=n;if(n<=0)clearInterval(t);},1000);});
socket.on('roundStarted',data=>{showScreen('Game');beep(280,.16,'sawtooth');setTimeout(()=>beep(420,.08,'square'),180);});
socket.on('decisionAccepted',()=>toast('DECISION LOCKED'));
socket.on('roundResult',renderResult);
socket.on('gameOver',renderGameOver);
socket.on('systemMessage',msg=>{toast(msg);});
socket.on('chatMessage',addChatMessage);
socket.on('errorMessage',msg=>toast(msg));

renderParticles();
setConnection(socket.connected);
