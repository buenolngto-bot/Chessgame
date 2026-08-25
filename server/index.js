'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const { Chess } = require('chess.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
  catch { return {}; }
}
function saveUsers(users) {
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}
function hashPw(pw) { return crypto.createHash('sha256').update(pw).digest('hex'); }
function makeToken() { return crypto.randomUUID(); }

const AVATARS = ['♔','♕','♖','♗','♘','♙','♚','♛','♜','♝','♞','♟','♟','🎲','🎯','🏆','⭐','🔥','💎','🌟'];
const REGIONS = ['NA','EU','Asia','SA','AF','OC'];
const RANKS = ['Bronze','Silver','Gold','Platinum','Diamond','Master','Grandmaster'];

function defaultProfile(name) {
  return {
    name, passwordHash: '', avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
    rank: 'Bronze', points: 0, region: 'EU',
    stats: { wins: 0, losses: 0, draws: 0 }, gamesPlayed: 0,
    createdAt: Date.now()
  };
}

// --- REST API ---
app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};
  const u = String(username || '').trim().toLowerCase();
  const p = String(password || '');
  if (u.length < 2 || u.length > 16) return res.json({ error: 'Username must be 2-16 characters.' });
  if (p.length < 3) return res.json({ error: 'Password must be 3+ characters.' });
  if (!/^[a-z0-9_]+$/.test(u)) return res.json({ error: 'Username: letters, numbers, underscores only.' });

  const users = loadUsers();
  if (users[u]) return res.json({ error: 'Username taken.' });

  const token = makeToken();
  const profile = defaultProfile(u);
  profile.passwordHash = hashPw(p);
  users[u] = { ...profile, token };
  saveUsers(users);

  const { passwordHash, ...safe } = users[u];
  res.json({ ok: true, user: safe });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = String(username || '').trim().toLowerCase();
  const p = String(password || '');
  const users = loadUsers();
  const user = users[u];
  if (!user || user.passwordHash !== hashPw(p)) {
    return res.json({ error: 'Invalid username or password.' });
  }
  const token = makeToken();
  user.token = token;
  saveUsers(users);
  const { passwordHash, ...safe } = user;
  res.json({ ok: true, user: safe });
});

app.post('/api/profile', (req, res) => {
  const { token, avatar, region } = req.body || {};
  const users = loadUsers();
  const user = Object.values(users).find(u => u.token === token);
  if (!user) return res.json({ error: 'Not logged in.' });
  if (avatar && AVATARS.includes(avatar)) user.avatar = avatar;
  if (region && REGIONS.includes(region)) user.region = region;
  saveUsers(users);
  const { passwordHash, ...safe } = user;
  res.json({ ok: true, user: safe });
});

app.get('/api/avatars', (_req, res) => res.json(AVATARS));
app.get('/api/regions', (_req, res) => res.json(REGIONS));
app.get('/api/ranks', (_req, res) => res.json(RANKS));

app.get('/api/leaderboard', (_req, res) => {
  const users = loadUsers();
  const list = Object.values(users)
    .filter(u => (u.gamesPlayed || 0) > 0)
    .sort((a, b) => (b.points || 0) - (a.points || 0))
    .slice(0, 20)
    .map(u => ({ name: u.name, avatar: u.avatar, rank: u.rank, points: u.points, wins: u.stats?.wins || 0, losses: u.stats?.losses || 0, draws: u.stats?.draws || 0, gamesPlayed: u.gamesPlayed || 0 }));
  res.json(list);
});

app.get('/api/online', (_req, res) => {
  let count = 0;
  for (const s of io.sockets.sockets.values()) count++;
  res.json({ online: count, rooms: rooms.size });
});

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const GRACE_MS = 60_000;        // disconnected player may rejoin within this window
const LOBBY_SEAT_TIMEOUT = 120_000;
const MAX_ROOMS = 200;
const CHAT_HISTORY = 60;

const TIME_CONTROLS = {
  '1+0': { initial: 60_000, inc: 0, label: 'Bullet 1+0' },
  '3+2': { initial: 180_000, inc: 2_000, label: 'Blitz 3+2' },
  '5+0': { initial: 300_000, inc: 0, label: 'Blitz 5+0' },
  '10+0': { initial: 600_000, inc: 0, label: 'Rapid 10+0' },
  '15+10': { initial: 900_000, inc: 10_000, label: 'Classical 15+10' },
  'unlimited': { initial: 0, inc: 0, label: 'Unlimited' }
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
/** rooms: code -> room */
const rooms = new Map();
/** quick-match queues: tcKey -> [entry] */
const queues = new Map();

function newRoom(code, tcKey) {
  return {
    code,
    tcKey,
    tc: TIME_CONTROLS[tcKey],
    players: { w: null, b: null }, // {pid, name, socketId, connected, disconnectedAt}
    spectators: new Set(),          // socket ids
    chat: [],
    game: null,                     // see startGame()
    rematch: { w: false, b: false },
    drawOffer: null                 // 'w' | 'b'
  };
}

function freshGame(tc) {
  return {
    chess: new Chess(),
    running: false,
    startedAt: null,
    turn: 'w',
    stamp: null,
    clocks: { w: tc.initial, b: tc.initial },
    result: null,        // 'w' | 'b' | 'draw'
    reason: null
  };
}

function makeCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function cleanName(raw) {
  const n = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return n || 'Player';
}

function seatOf(room, pid) {
  if (room.players.w && room.players.w.pid === pid) return 'w';
  if (room.players.b && room.players.b.pid === pid) return 'b';
  return null;
}

function opponentOf(color) { return color === 'w' ? 'b' : 'w'; }

function checkSquare(chess) {
  if (!chess.isCheck()) return null;
  const turn = chess.turn();
  for (const row of chess.board()) {
    for (const sq of row) {
      if (sq && sq.type === 'k' && sq.color === turn) return sq.square;
    }
  }
  return null;
}

function publicState(room) {
  const g = room.game;
  if (!g) return {
    fen: null,
    history: [],
    turn: 'w',
    running: false,
    clocks: { w: 0, b: 0 },
    timed: room.tc.initial > 0,
    checkSquare: null,
    result: null,
    reason: null
  };
  return {
    fen: g.chess.fen(),
    history: g.chess.history({ verbose: true }),
    turn: g.turn,
    running: g.running,
    clocks: g.clocks,
    timed: room.tc.initial > 0,
    checkSquare: checkSquare(g.chess),
    result: g.result,
    reason: g.reason
  };
}

function roomSummary(room) {
  return {
    code: room.code,
    tcKey: room.tcKey,
    tcLabel: room.tc.label,
    players: {
      w: room.players.w && { name: room.players.w.name, connected: room.players.w.connected },
      b: room.players.b && { name: room.players.b.name, connected: room.players.b.connected }
    },
    spectators: room.spectators.size
  };
}

function snapshotFor(room, color /* 'w'|'b'|null */) {
  return Object.assign(roomSummary(room), {
    youAre: color,
    state: publicState(room),
    chat: room.chat.slice(-CHAT_HISTORY),
    drawOffer: room.drawOffer,
    rematch: room.rematch
  });
}

function emitRoom(room, event, payload) {
  io.to(room.code).emit(event, payload);
}

// ---------------------------------------------------------------------------
// Room lifecycle
// ---------------------------------------------------------------------------
function maybeDeleteRoom(room) {
  const anyConnected =
    (room.players.w && room.players.w.connected) ||
    (room.players.b && room.players.b.connected) ||
    room.spectators.size > 0;
  if (!anyConnected) {
    rooms.delete(room.code);
  }
}

function removeSpectator(room, socketId) {
  room.spectators.delete(socketId);
  emitRoom(room, 'room_update', roomSummary(room));
  maybeDeleteRoom(room);
}

/**
 * Attach a socket to a room. Reclaims a seat when the pid matches.
 * Returns the assigned role ('w' | 'b' | spectator).
 */
function attachSocket(room, socket, name) {
  const seat = seatOf(room, socket.data.pid);
  if (seat) {
    const p = room.players[seat];
    const wasDisconnected = !p.connected;
    p.socketId = socket.id;
    p.connected = true;
    p.disconnectedAt = null;
    if (wasDisconnected && room.game && room.game.running) {
      emitRoom(room, 'opponent_reconnected', { seat });
    }
    emitRoom(room, 'room_update', roomSummary(room));
    socket.join(room.code);
    return seat;
  }

  const activeGame = room.game && room.game.running && !room.game.result;
  const freeSeat = !room.players.w ? 'w' : (!room.players.b ? 'b' : null);
  if (freeSeat && !activeGame) {
    room.players[freeSeat] = { pid: socket.data.pid, name, socketId: socket.id, connected: true, disconnectedAt: null };
    socket.join(room.code);
    maybeStartGame(room);
    emitRoom(room, 'room_update', roomSummary(room));
    return freeSeat;
  }

  room.spectators.add(socket.id);
  socket.join(room.code);
  emitRoom(room, 'room_update', roomSummary(room));
  return null;
}

function detachSocket(room, socket) {
  const seat = seatOf(room, socket.data.pid);
  if (seat) {
    const p = room.players[seat];
    if (p.socketId !== socket.id) return;
    p.connected = false;
    p.disconnectedAt = Date.now();
    if (room.game && room.game.running && !room.game.result) {
      emitRoom(room, 'opponent_disconnected', { seat, graceSec: GRACE_MS / 1000 });
    } else {
      emitRoom(room, 'room_update', roomSummary(room));
      scheduleLobbyCleanup(room);
    }
  } else {
    removeSpectator(room, socket.id);
  }
}

function scheduleLobbyCleanup(room) {
  setTimeout(() => {
    const r = rooms.get(room.code);
    if (!r || r !== room) return;
    for (const c of ['w', 'b']) {
      const p = r.players[c];
      if (p && !p.connected && p.disconnectedAt && Date.now() - p.disconnectedAt > LOBBY_SEAT_TIMEOUT - 1000) {
        r.players[c] = null;
        sysChat(r, `${p.name} left the room`);
        emitRoom(r, 'room_update', roomSummary(r));
      }
    }
    maybeDeleteRoom(r);
  }, LOBBY_SEAT_TIMEOUT);
}

// ---------------------------------------------------------------------------
// Game flow
// ---------------------------------------------------------------------------
function maybeStartGame(room) {
  if (!room.players.w || !room.players.b) return;
  if (room.game && room.game.running && !room.game.result) return;
  startGame(room);
}

function startGame(room) {
  const tc = room.tc;
  room.game = freshGame(tc);
  room.drawOffer = null;
  room.rematch = { w: false, b: false };
  const g = room.game;
  g.running = true;
  g.startedAt = Date.now();
  g.stamp = Date.now();
  for (const c of ['w', 'b']) {
    const p = room.players[c];
    if (p && p.connected) io.to(p.socketId).emit('game_start', snapshotFor(room, c));
  }
  io.to(room.code).emit('game_start', snapshotFor(room, null));
  emitClock(room);
}

function endGame(room, result, reason) {
  const g = room.game;
  if (!g || g.result) return;
  g.result = result;
  g.reason = reason;
  g.running = false;
  room.drawOffer = null;
  room.rematch = { w: false, b: false };

  // Update stats
  const users = loadUsers();
  for (const c of ['w', 'b']) {
    const p = room.players[c];
    if (p && p.pid) {
      const uname = p.name && p.name.toLowerCase();
      const acct = users[uname];
      if (acct) {
        acct.gamesPlayed = (acct.gamesPlayed || 0) + 1;
        if (result === 'draw') { acct.stats.draws = (acct.stats.draws || 0) + 1; acct.points = (acct.points || 0) + 5; }
        else if (result === c) { acct.stats.wins = (acct.stats.wins || 0) + 1; acct.points = (acct.points || 0) + 15; }
        else { acct.stats.losses = (acct.stats.losses || 0) + 1; acct.points = Math.max(0, (acct.points || 0) - 10); }
        acct.rank = RANK_FROM_POINTS(acct.points);
      }
    }
  }
  saveUsers(users);

  emitRoom(room, 'game_over', { result, reason, state: publicState(room) });
}

function RANK_FROM_POINTS(pts) {
  if (pts >= 2000) return 'Grandmaster';
  if (pts >= 1500) return 'Master';
  if (pts >= 1000) return 'Diamond';
  if (pts >= 600) return 'Platinum';
  if (pts >= 300) return 'Gold';
  if (pts >= 100) return 'Silver';
  return 'Bronze';
}

function applyMove(room, color, from, to, promotion) {
  const g = room.game;
  if (!g || !g.running || g.result) return { error: 'Game is not active.' };
  if (g.turn !== color) return { error: 'Not your turn.' };

  let mv = null;
  try {
    mv = g.chess.move({ from, to, promotion: promotion || undefined });
  } catch (_) {
    mv = null;
  }
  if (!mv) return { error: 'Illegal move.' };

  // Clocks
  const now = Date.now();
  if (room.tc.initial > 0) {
    const elapsed = now - g.stamp;
    g.clocks[color] = Math.max(0, g.clocks[color] - elapsed) + room.tc.inc;
  }
  g.stamp = now;
  g.turn = opponentOf(color);

  emitRoom(room, 'move_made', {
    by: color,
    move: { san: mv.san, from: mv.from, to: mv.to, promotion: mv.promotion || null },
    state: publicState(room)
  });

  // End conditions
  const chess = g.chess;
  if (chess.isCheckmate()) endGame(room, color, 'checkmate');
  else if (chess.isStalemate()) endGame(room, 'draw', 'stalemate');
  else if (chess.isInsufficientMaterial()) endGame(room, 'draw', 'insufficient material');
  else if (chess.isThreefoldRepetition()) endGame(room, 'draw', 'threefold repetition');
  else if (chess.isDraw()) endGame(room, 'draw', 'fifty-move rule');

  return { ok: true };
}

function flagCheck(room) {
  const g = room.game;
  if (!g || !g.running || g.result || room.tc.initial <= 0) return;
  const elapsed = Date.now() - g.stamp;
  g.clocks[g.turn] -= elapsed;
  g.stamp = Date.now();
  if (g.clocks[g.turn] <= 0) {
    g.clocks[g.turn] = 0;
    const winner = opponentOf(g.turn);
    // FIDE-style: if the opponent cannot possibly mate, it's a draw.
    const probe = new Chess(g.chess.fen());
    if (probe.isInsufficientMaterial()) endGame(room, 'draw', 'timeout vs insufficient material');
    else endGame(room, winner, 'timeout');
  }
}

function emitClock(room) {
  if (!room.game || room.tc.initial <= 0) return;
  const g = room.game;
  const clocks = { w: g.clocks.w, b: g.clocks.b };
  if (g.running && !g.result) clocks[g.turn] = Math.max(0, clocks[g.turn] - (Date.now() - g.stamp));
  emitRoom(room, 'clock', { clocks, turn: g.turn, running: g.running && !g.result });
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------
function sysChat(room, text) {
  pushChat(room, { sys: true, text });
}
function pushChat(room, msg) {
  msg.t = Date.now();
  room.chat.push(msg);
  if (room.chat.length > CHAT_HISTORY * 2) room.chat.splice(0, room.chat.length - CHAT_HISTORY);
  emitRoom(room, 'chat', msg);
}

// ---------------------------------------------------------------------------
// Socket handling
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  socket.data.pid = String(socket.handshake.auth && socket.handshake.auth.pid || socket.id).slice(0, 64);
  socket.data.token = socket.handshake.auth && socket.handshake.auth.token;
  socket.data.account = null;
  socket.data.username = null;
  if (socket.data.token) {
    const users = loadUsers();
    const acct = Object.values(users).find(u => u.token === socket.data.token);
    if (acct) {
      const { passwordHash, ...safe } = acct;
      socket.data.account = safe;
      socket.data.username = acct.name;
      acct.pid = socket.data.pid;
      saveUsers(users);
    }
  }

  const getRoomFor = () => {
    for (const room of rooms.values()) {
      if (socket.rooms.has(room.code)) return room;
    }
    return null;
  };

  const leaveCurrentRoom = () => {
    const room = getRoomFor();
    if (room) {
      socket.leave(room.code);
      detachSocket(room, socket);
    }
    // also clear any quick-match queue entries
    for (const list of queues.values()) {
      const i = list.findIndex(e => e.socketId === socket.id);
      if (i >= 0) list.splice(i, 1);
    }
    return room;
  };

  const joinRoomByCode = (codeRaw, nameRaw, cb) => {
    const code = String(codeRaw || '').toUpperCase().trim();
    const name = cleanName(nameRaw);
    const room = rooms.get(code);
    if (!room) return cb && cb({ error: 'Room not found. Check the code.' });

    leaveCurrentRoom();
    const role = attachSocket(room, socket, name);
    cb && cb({
      ok: true,
      snapshot: Object.assign(snapshotFor(room, role), { youName: name })
    });
  };

  // ---- lobby actions ----
  socket.on('create_room', ({ name, tc } = {}, cb) => {
    if (rooms.size >= MAX_ROOMS) return cb && cb({ error: 'Server is full, try again later.' });
    const tcKey = TIME_CONTROLS[tc] ? tc : '5+0';
    const code = makeCode();
    const room = newRoom(code, tcKey);
    rooms.set(code, room);
    joinRoomByCode(code, name, cb);
  });

  socket.on('join_room', ({ code, name } = {}, cb) => joinRoomByCode(code, name, cb));

  socket.on('quick_match', ({ name, tc } = {}, cb) => {
    const tcKey = TIME_CONTROLS[tc] ? tc : '5+0';
    const nameClean = cleanName(name);
    leaveCurrentRoom();
    let list = queues.get(tcKey);
    if (!list) { list = []; queues.set(tcKey, list); }

    const idx = list.findIndex(e => e.socketId !== socket.id && e.socket.connected);
    if (idx < 0) {
      // nobody waiting - enter the queue
      const existing = list.findIndex(e => e.socketId === socket.id);
      const entry = { socketId: socket.id, socket, pid: socket.data.pid, name: nameClean };
      if (existing >= 0) list[existing] = entry; else list.push(entry);
      cb && cb({ ok: true, waiting: true, position: list.length });
      return;
    }

    const other = list.splice(idx, 1)[0];
    const meIdx = list.findIndex(e => e.socketId === socket.id);
    if (meIdx >= 0) list.splice(meIdx, 1);

    const code = makeCode();
    const room = newRoom(code, tcKey);
    rooms.set(code, room);
    other.socket.join(code);
    socket.join(code);
    room.players.w = { pid: other.socket.data.pid, name: other.name, socketId: other.socket.id, connected: true, disconnectedAt: null };
    room.players.b = { pid: socket.data.pid, name: nameClean, socketId: socket.id, connected: true, disconnectedAt: null };
    startGame(room);
    other.socket.emit('joined', Object.assign(snapshotFor(room, 'w'), { viaQueue: true }));
    socket.emit('joined', Object.assign(snapshotFor(room, 'b'), { viaQueue: true }));
    cb && cb({ ok: true, matched: true, code });
  });

  socket.on('cancel_quick_match', (_d, cb) => {
    for (const list of queues.values()) {
      const i = list.findIndex(e => e.socketId === socket.id);
      if (i >= 0) list.splice(i, 1);
    }
    cb && cb({ ok: true });
  });

  socket.on('leave_room', (_d, cb) => {
    const room = getRoomFor();
    if (room) {
      const seat = seatOf(room, socket.data.pid);
      socket.leave(room.code);
      if (seat && room.game && room.game.running && !room.game.result) {
        endGame(room, opponentOf(seat), 'abandoned');
        detachSocket(room, socket);
      } else {
        detachSocket(room, socket);
      }
      maybeDeleteRoom(room);
    }
    cb && cb({ ok: true });
  });

  // ---- gameplay ----
  socket.on('move', ({ from, to, promotion } = {}) => {
    const room = getRoomFor();
    if (!room) return;
    const color = seatOf(room, socket.data.pid);
    if (!color) return socket.emit('error_msg', { message: 'Spectators cannot move.' });
    const res = applyMove(room, color, String(from || ''), String(to || ''), promotion ? String(promotion) : null);
    if (res.error) socket.emit('error_msg', { message: res.error });
  });

  socket.on('resign', () => {
    const room = getRoomFor();
    if (!room || !room.game || !room.game.running || room.game.result) return;
    const color = seatOf(room, socket.data.pid);
    if (!color) return;
    endGame(room, opponentOf(color), 'resignation');
  });

  socket.on('offer_draw', () => {
    const room = getRoomFor();
    if (!room || !room.game || !room.game.running || room.game.result) return;
    const color = seatOf(room, socket.data.pid);
    if (!color || room.drawOffer) return;
    room.drawOffer = color;
    emitRoom(room, 'draw_offered', { by: color });
  });

  socket.on('accept_draw', () => {
    const room = getRoomFor();
    if (!room || !room.drawOffer || !room.game || room.game.result) return;
    const color = seatOf(room, socket.data.pid);
    if (!color || color === room.drawOffer) return;
    room.drawOffer = null;
    endGame(room, 'draw', 'agreement');
  });

  socket.on('decline_draw', () => {
    const room = getRoomFor();
    if (!room || !room.drawOffer) return;
    const color = seatOf(room, socket.data.pid);
    if (!color || color === room.drawOffer) return;
    room.drawOffer = null;
    emitRoom(room, 'draw_declined', {});
  });

  socket.on('rematch', () => {
    const room = getRoomFor();
    if (!room || !room.game || !room.game.result) return;
    const color = seatOf(room, socket.data.pid);
    if (!color) return;
    room.rematch[color] = true;
    emitRoom(room, 'rematch_offered', { rematch: room.rematch });
    if (room.rematch.w && room.rematch.b) {
      // swap colors
      const w = room.players.w, b = room.players.b;
      room.players.w = b; room.players.b = w;
      startGame(room);
    }
  });

  socket.on('chat_msg', ({ text } = {}) => {
    const room = getRoomFor();
    if (!room) return;
    const s = String(text || '').slice(0, 300).trim();
    if (!s) return;
    const color = seatOf(room, socket.data.pid);
    const name = color ? room.players[color].name : 'Spectator';
    pushChat(room, { from: name, color: color || 's', text: s });
  });

  socket.on('disconnect', () => {
    for (const list of queues.values()) {
      const i = list.findIndex(e => e.socketId === socket.id);
      if (i >= 0) list.splice(i, 1);
    }
    const room = getRoomFor();
    if (room) detachSocket(room, socket);
  });
});

// ---------------------------------------------------------------------------
// Timers: clocks + abandon detection
// ---------------------------------------------------------------------------
setInterval(() => {
  const now = Date.now();
  for (const room of Array.from(rooms.values())) {
    const g = room.game;
    if (g && g.running && !g.result) flagCheck(room);

    // forfeit on long disconnect during an active game
    for (const c of ['w', 'b']) {
      const p = room.players[c];
      if (p && !p.connected && p.disconnectedAt && now - p.disconnectedAt > GRACE_MS &&
          g && g.running && !g.result) {
        endGame(room, opponentOf(c), 'abandoned');
        p.disconnectedAt = now;
      }
    }

    if (g && g.running && !g.result && room.tc.initial > 0) emitClock(room);
  }
}, 250);

// ---------------------------------------------------------------------------
// Static assets
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/vendor/chess.js', express.static(
  path.join(__dirname, '..', 'node_modules', 'chess.js', 'dist', 'esm')
));

server.listen(PORT, () => {
  console.log(`Chess server listening on http://localhost:${PORT}`);
});
