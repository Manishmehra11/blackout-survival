const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, game: 'BLACKOUT', uptime: process.uptime() }));

const rooms = new Map();
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;
const ROUND_SECONDS = 14;
const RESULT_MS = 4200;
const MAX_CHAT = 80;

const SCENARIOS = [
  {
    id: 'reactor', title: 'REACTOR CORE FAILURE', sector: 'SECTOR 07', threat: 'CRITICAL',
    incident: 'Containment pressure is rising. The core has 18 seconds before the safety shell buckles.',
    choices: [
      { id: 'stabilize', label: 'STABILIZE CORE', short: 'STABILIZE' },
      { id: 'vent', label: 'VENT THE CORE', short: 'VENT' },
      { id: 'evacuate', label: 'EVACUATE SECTOR', short: 'EVACUATE' }
    ],
    safe: 'stabilize',
    clues: [
      'The coolant pressure is still inside the manual stabilization range.',
      'A warning on your console says: VENTING WILL DROP CONTAINMENT.',
      'The emergency map highlights the evacuation corridor in amber.',
      'You hear the cooling pumps ramp up behind the west wall.',
      'A corrupted note repeats: “Do not open the core vents.”',
      'The safest-looking option on the wall display is marked with a damaged icon.'
    ]
  },
  {
    id: 'gas', title: 'TOXIC GAS BREACH', sector: 'MEDICAL DECK', threat: 'SEVERE',
    incident: 'Unknown gas is spreading through the ventilation system. Visibility is falling fast.',
    choices: [
      { id: 'seal', label: 'SEAL YOUR SECTOR', short: 'SEAL' },
      { id: 'vent', label: 'FORCE VENTILATION', short: 'VENT' },
      { id: 'run', label: 'RUN TO ELEVATOR', short: 'RUN' }
    ],
    safe: 'seal',
    clues: [
      'The door controller still has enough power to seal the sector.',
      'Airflow arrows point toward the elevator shaft.',
      'The maintenance log says forced ventilation can spread contaminants.',
      'Your mask sensor shows the highest concentration outside this room.',
      'A medical terminal recommends isolation before ventilation.',
      'The elevator indicator flickers even though the shaft is not certified safe.'
    ]
  },
  {
    id: 'lockdown', title: 'SECURITY LOCKDOWN', sector: 'COMMAND RING', threat: 'HIGH',
    incident: 'Every internal door is locking in sequence. Something is moving toward Command.',
    choices: [
      { id: 'override', label: 'OVERRIDE DOORS', short: 'OVERRIDE' },
      { id: 'power', label: 'CUT SECURITY POWER', short: 'CUT POWER' },
      { id: 'wait', label: 'WAIT IT OUT', short: 'WAIT' }
    ],
    safe: 'power',
    clues: [
      'The security grid is routing through one overloaded power trunk.',
      'Manual logs warn that door overrides trigger silent alarms.',
      'Your panel shows a power spike behind the locked doors.',
      'The system clock is six seconds ahead of the physical alarm.',
      'A red indicator labels the security trunk as non-essential.',
      'Someone has disabled the motion sensors near Command.'
    ]
  },
  {
    id: 'flood', title: 'LOWER DECK FLOOD', sector: 'DECK -03', threat: 'CRITICAL',
    incident: 'Water is entering faster than the pumps can remove it. The lift is losing power.',
    choices: [
      { id: 'bulkhead', label: 'SEAL BULKHEAD', short: 'SEAL' },
      { id: 'drain', label: 'ACTIVATE DRAIN', short: 'DRAIN' },
      { id: 'lift', label: 'TAKE THE LIFT', short: 'LIFT' }
    ],
    safe: 'bulkhead',
    clues: [
      'The bulkhead actuator still shows hydraulic pressure.',
      'The drain pumps are already drawing maximum current.',
      'The lift display shows a power fault on every lower-deck stop.',
      'A maintenance sticker says: “Seal first. Pump second.”',
      'Water pressure is rising behind the east bulkhead.',
      'The emergency ladder remains above the projected flood line.'
    ]
  },
  {
    id: 'ai', title: 'AI OVERRIDE', sector: 'CORE NETWORK', threat: 'UNKNOWN',
    incident: 'The facility AI has taken control of life-support routing and refuses manual requests.',
    choices: [
      { id: 'trust', label: 'TRUST AI ROUTING', short: 'TRUST AI' },
      { id: 'manual', label: 'TAKE MANUAL CONTROL', short: 'MANUAL' },
      { id: 'reset', label: 'RESET THE CORE', short: 'RESET' }
    ],
    safe: 'manual',
    clues: [
      'The AI has rerouted oxygen away from occupied rooms.',
      'A manual override key is still physically enabled.',
      'The core reset would reboot every door controller.',
      'The AI claims oxygen levels are stable, but your local sensor disagrees.',
      'A hidden diagnostic says the routing model changed 47 seconds ago.',
      'The manual console shows a green connection to life-support.'
    ]
  },
  {
    id: 'fire', title: 'ENGINE FIRE', sector: 'POWER DECK', threat: 'SEVERE',
    incident: 'Fuel vapor has ignited near the auxiliary engine. Heat is climbing toward the tanks.',
    choices: [
      { id: 'cool', label: 'COOL THE ENGINE', short: 'COOL' },
      { id: 'fuel', label: 'CUT FUEL SUPPLY', short: 'CUT FUEL' },
      { id: 'abandon', label: 'ABANDON THE DECK', short: 'ABANDON' }
    ],
    safe: 'fuel',
    clues: [
      'Fuel pressure is feeding the fire from a valve marked AUX-2.',
      'Cooling spray is blocked by the heat curtain.',
      'The fuel isolation valve is still responding to local commands.',
      'The engine room door has already begun to warp from heat.',
      'A technician note says the auxiliary engine must lose fuel before cooling.',
      'The deck alarm warns of secondary ignition near the tanks.'
    ]
  },
  {
    id: 'intruder', title: 'UNKNOWN INTRUDER', sector: 'HABITATION RING', threat: 'UNKNOWN',
    incident: 'A biometric signal that does not belong to any crew member is moving between dark rooms.',
    choices: [
      { id: 'hide', label: 'HIDE AND SILENCE', short: 'HIDE' },
      { id: 'lockdown', label: 'LOCK DOWN YOUR ROOM', short: 'LOCKDOWN' },
      { id: 'investigate', label: 'INVESTIGATE SIGNAL', short: 'INVESTIGATE' }
    ],
    safe: 'lockdown',
    clues: [
      'The signal cannot open a door that is manually locked.',
      'The corridor camera is looping the same six seconds.',
      'Your room has a physical deadbolt under the control panel.',
      'The biometric profile is tagged as UNKNOWN rather than HOSTILE.',
      'A service hatch behind you is not included in the motion map.',
      'The signal stopped moving when the lights went dark.'
    ]
  },
  {
    id: 'comms', title: 'COMMS FAILURE', sector: 'SIGNAL ARRAY', threat: 'HIGH',
    incident: 'A repeating distress signal is being transmitted from inside the facility itself.',
    choices: [
      { id: 'broadcast', label: 'BROADCAST DISTRESS', short: 'BROADCAST' },
      { id: 'jam', label: 'JAM THE SIGNAL', short: 'JAM' },
      { id: 'silent', label: 'STAY SILENT', short: 'SILENT' }
    ],
    safe: 'silent',
    clues: [
      'The signal contains your own facility identifier.',
      'External receivers are not acknowledging the distress burst.',
      'The array log shows the transmission originated internally.',
      'Jamming the signal would expose your location to nearby systems.',
      'The distress packet repeats with impossible timestamps.',
      'A technician note says: “If the signal calls you by name, do not answer.”'
    ]
  },
  {
    id: 'pressure', title: 'AIRLOCK PRESSURE LOSS', sector: 'DOCKING BAY', threat: 'CRITICAL',
    incident: 'Docking Bay pressure is collapsing. The outer hatch is cycling without authorization.',
    choices: [
      { id: 'close', label: 'CLOSE OUTER HATCH', short: 'CLOSE' },
      { id: 'equalize', label: 'EQUALIZE PRESSURE', short: 'EQUALIZE' },
      { id: 'open', label: 'OPEN INNER DOOR', short: 'OPEN' }
    ],
    safe: 'close',
    clues: [
      'The outer hatch actuator is still within safe pressure limits.',
      'The equalization valve is responding too quickly for normal pressure.',
      'The inner door seal is rated only after bay pressure stabilizes.',
      'A red light flashes whenever the outer hatch begins to move.',
      'The bay camera shows debris being pulled toward the outer hatch.',
      'The emergency guide starts with: CLOSE OUTER HATCH.'
    ]
  }
];

function cleanName(name) {
  return String(name || '').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 18);
}

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function randomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function publicPlayers(room) {
  return [...room.players.values()].map(p => ({
    id: p.id, name: p.name, alive: p.alive, host: p.id === room.hostId,
    roundsSurvived: p.roundsSurvived, decisionLocked: !!p.decision
  }));
}

function broadcastLobby(room) {
  io.to(room.code).emit('lobbyState', {
    code: room.code, hostId: room.hostId, players: publicPlayers(room),
    phase: room.phase, minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS
  });
}

function roomSnapshot(room, socketId) {
  const me = room.players.get(socketId);
  return {
    code: room.code, hostId: room.hostId, phase: room.phase, round: room.round,
    totalRounds: room.totalRounds, players: publicPlayers(room), aliveCount: [...room.players.values()].filter(p => p.alive).length,
    me: me ? { id: me.id, name: me.name, alive: me.alive, clue: me.clue, decision: me.decision, roundsSurvived: me.roundsSurvived } : null,
    scenario: room.scenario ? {
      title: room.scenario.title, sector: room.scenario.sector, threat: room.scenario.threat,
      incident: room.scenario.incident, choices: room.scenario.choices
    } : null,
    roundEndsAt: room.roundEndsAt,
    chat: room.chat.slice(-MAX_CHAT)
  };
}

function sendSnapshots(room) {
  for (const player of room.players.values()) {
    io.to(player.id).emit('state', roomSnapshot(room, player.id));
  }
}

function assignClues(room) {
  const clues = [...room.scenario.clues].sort(() => Math.random() - 0.5);
  const alive = [...room.players.values()].filter(p => p.alive);
  alive.forEach((p, i) => { p.clue = clues[i % clues.length]; });
  [...room.players.values()].filter(p => !p.alive).forEach(p => { p.clue = ''; p.decision = null; });
}

function clearRoundTimer(room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
}

function chooseScenario(room) {
  const used = new Set(room.usedScenarios || []);
  let pool = SCENARIOS.filter(s => !used.has(s.id));
  if (!pool.length) pool = SCENARIOS;
  const scenario = randomItem(pool);
  room.usedScenarios = [...(room.usedScenarios || []), scenario.id];
  return scenario;
}

function startRound(room) {
  clearRoundTimer(room);
  const alive = [...room.players.values()].filter(p => p.alive);
  if (alive.length <= 1) return finishGame(room, alive[0]);

  room.round += 1;
  room.scenario = chooseScenario(room);
  room.phase = 'decision';
  for (const p of room.players.values()) p.decision = null;
  assignClues(room);
  room.roundEndsAt = Date.now() + ROUND_SECONDS * 1000;
  sendSnapshots(room);
  io.to(room.code).emit('roundStarted', {
    round: room.round, totalRounds: room.totalRounds,
    scenario: { title: room.scenario.title, sector: room.scenario.sector, threat: room.scenario.threat, incident: room.scenario.incident, choices: room.scenario.choices },
    roundEndsAt: room.roundEndsAt
  });
  room.timer = setTimeout(() => resolveRound(room), ROUND_SECONDS * 1000 + 250);
}

function resolveRound(room) {
  if (!rooms.has(room.code) || room.phase !== 'decision') return;
  clearRoundTimer(room);
  room.phase = 'result';
  const alive = [...room.players.values()].filter(p => p.alive);
  const outcome = [];
  let survivors = [];

  for (const p of alive) {
    const survived = p.decision === room.scenario.safe;
    outcome.push({ id: p.id, name: p.name, decision: p.decision || 'NO DECISION', survived });
    if (survived) survivors.push(p);
  }

  // Never allow a no-survivor state to destroy the match. The facility triggers
  // an emergency override and preserves one randomly selected active player.
  if (!survivors.length && alive.length) {
    const override = randomItem(alive);
    override.alive = true;
    survivors = [override];
    const row = outcome.find(x => x.id === override.id);
    if (row) row.survived = true;
    room.overrideId = override.id;
  } else {
    room.overrideId = null;
  }

  for (const p of alive) {
    const survived = survivors.includes(p);
    if (survived) p.roundsSurvived += 1;
    else p.alive = false;
  }

  const eliminated = alive.filter(p => !p.alive).map(p => ({ id: p.id, name: p.name }));
  const aliveAfter = [...room.players.values()].filter(p => p.alive);
  room.lastOutcome = { outcome, eliminated, overrideId: room.overrideId, aliveCount: aliveAfter.length };

  io.to(room.code).emit('roundResult', {
    outcome, eliminated, overrideId: room.overrideId, aliveCount: aliveAfter.length,
    safeChoice: room.scenario.safe,
    choiceLabels: Object.fromEntries(room.scenario.choices.map(c => [c.id, c.label]))
  });
  sendSnapshots(room);

  room.resultTimer = setTimeout(() => {
    if (!rooms.has(room.code)) return;
    const currentAlive = [...room.players.values()].filter(p => p.alive);
    if (currentAlive.length <= 1) finishGame(room, currentAlive[0]);
    else startRound(room);
  }, RESULT_MS);
}

function finishGame(room, winner) {
  clearRoundTimer(room);
  if (room.resultTimer) clearTimeout(room.resultTimer);
  room.phase = 'gameover';
  room.roundEndsAt = null;
  const ranked = [...room.players.values()].sort((a, b) => {
    if (a.alive !== b.alive) return Number(b.alive) - Number(a.alive);
    return b.roundsSurvived - a.roundsSurvived;
  });
  io.to(room.code).emit('gameOver', {
    winner: winner ? { id: winner.id, name: winner.name, roundsSurvived: winner.roundsSurvived } : null,
    leaderboard: ranked.map((p, i) => ({ rank: i + 1, id: p.id, name: p.name, alive: p.alive, roundsSurvived: p.roundsSurvived }))
  });
  sendSnapshots(room);
}

function resetGame(room) {
  clearRoundTimer(room);
  if (room.resultTimer) clearTimeout(room.resultTimer);
  room.phase = 'lobby';
  room.round = 0;
  room.usedScenarios = [];
  room.scenario = null;
  room.roundEndsAt = null;
  room.lastOutcome = null;
  room.overrideId = null;
  for (const p of room.players.values()) {
    p.alive = true; p.clue = ''; p.decision = null; p.roundsSurvived = 0;
  }
  broadcastLobby(room);
  sendSnapshots(room);
}

function addChat(room, player, message) {
  const text = String(message || '').replace(/[<>]/g, '').trim().slice(0, 160);
  if (!text) return;
  room.chat.push({ id: `${Date.now()}-${player.id}`, name: player.name, text, at: Date.now() });
  room.chat = room.chat.slice(-MAX_CHAT);
  io.to(room.code).emit('chatMessage', room.chat[room.chat.length - 1]);
}

io.on('connection', socket => {
  socket.on('createRoom', ({ name } = {}, ack) => {
    const playerName = cleanName(name);
    if (!playerName) return ack?.({ ok: false, error: 'Enter a valid callsign.' });
    const code = makeCode();
    const room = {
      code, hostId: socket.id, players: new Map(), phase: 'lobby', round: 0,
      totalRounds: 5, scenario: null, usedScenarios: [], roundEndsAt: null,
      timer: null, resultTimer: null, chat: [], lastOutcome: null, overrideId: null
    };
    room.players.set(socket.id, { id: socket.id, name: playerName, alive: true, clue: '', decision: null, roundsSurvived: 0 });
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    socket.emit('roomCreated', { code });
    broadcastLobby(room);
    sendSnapshots(room);
    ack?.({ ok: true, code });
  });

  socket.on('joinRoom', ({ code, name } = {}, ack) => {
    const roomCode = String(code || '').toUpperCase().trim();
    const playerName = cleanName(name);
    const room = rooms.get(roomCode);
    if (!room) return ack?.({ ok: false, error: 'Room not found. Check the code.' });
    if (!playerName) return ack?.({ ok: false, error: 'Enter a valid callsign.' });
    if (room.players.size >= MAX_PLAYERS) return ack?.({ ok: false, error: 'Room is full.' });
    if (room.phase !== 'lobby') return ack?.({ ok: false, error: 'This mission has already started.' });
    if ([...room.players.values()].some(p => p.name.toLowerCase() === playerName.toLowerCase())) return ack?.({ ok: false, error: 'That callsign is already in use.' });

    room.players.set(socket.id, { id: socket.id, name: playerName, alive: true, clue: '', decision: null, roundsSurvived: 0 });
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    ack?.({ ok: true, code: roomCode });
    io.to(roomCode).emit('systemMessage', `${playerName} entered the facility.`);
    broadcastLobby(room);
    sendSnapshots(room);
  });

  socket.on('startGame', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id || room.phase !== 'lobby') return;
    if (room.players.size < MIN_PLAYERS) return socket.emit('errorMessage', 'At least 2 players are required.');
    room.phase = 'briefing';
    io.to(room.code).emit('briefing', { seconds: 3 });
    sendSnapshots(room);
    setTimeout(() => {
      if (rooms.has(room.code) && room.phase === 'briefing') startRound(room);
    }, 3000);
  });

  socket.on('submitDecision', ({ choice } = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== 'decision') return;
    const player = room.players.get(socket.id);
    if (!player || !player.alive || player.decision) return;
    if (!room.scenario.choices.some(c => c.id === choice)) return;
    player.decision = choice;
    socket.emit('decisionAccepted', { choice });
    sendSnapshots(room);
    const alive = [...room.players.values()].filter(p => p.alive);
    if (alive.every(p => p.decision)) resolveRound(room);
  });

  socket.on('sendChat', ({ message } = {}) => {
    const room = rooms.get(socket.data.roomCode);
    const player = room?.players.get(socket.id);
    if (room && player) addChat(room, player, message);
  });

  socket.on('restartGame', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id || room.phase !== 'gameover') return;
    resetGame(room);
  });

  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room) return;
    const leaving = room.players.get(socket.id);
    room.players.delete(socket.id);
    if (!room.players.size) {
      clearRoundTimer(room);
      if (room.resultTimer) clearTimeout(room.resultTimer);
      rooms.delete(code);
      return;
    }
    if (room.hostId === socket.id) room.hostId = room.players.keys().next().value;
    io.to(code).emit('systemMessage', `${leaving?.name || 'A player'} lost connection.`);
    broadcastLobby(room);
    sendSnapshots(room);
    if (room.phase === 'decision') {
      const alive = [...room.players.values()].filter(p => p.alive);
      if (alive.length <= 1) finishGame(room, alive[0]);
      else if (alive.every(p => p.decision)) resolveRound(room);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`BLACKOUT running on http://localhost:${PORT}`);
});
