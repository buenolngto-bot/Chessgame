import { Chess } from '/vendor/chess.js/chess.js';
import { getEngine, renderConnect4, renderOthello, renderCheckers, renderXiangqi, renderGo, renderDama } from '/games/manager.js';

/* ------------------------------------------------------------------ */
/* DOM                                                                 */
/* ------------------------------------------------------------------ */
const $ = (id) => document.getElementById(id);
const els = {};
['authScreen','loginForm','loginUser','loginPass','loginBtn','authStatus','showRegisterBtn',
 'registerForm','regUser','regPass','registerBtn','regStatus','showLoginBtn','playGuestBtn',
 'userBadge','userAvatar','userName','userRank','userPoints','logoutBtn',
 'landing','nameInput','tcSelect','quickBtn','createBtn','codeInput','joinBtn','landingStatus',
 'localBtn','aiBtn','aiDiffSel',
 'game','roomChip','flipBtn','soundBtn','settingsBtn','exitBtn',
 'board','boardWrap','boardOverlay','overlayTitle','overlaySub','overlayActions',
 'barTop','barBottom','avatarTop','avatarBottom','nameTop','nameBottom','colorTagTop','colorTagBottom',
 'capturedTop','capturedBottom','clockTop','clockBottom',
 'statusBar','statusText','drawActions','drawAccept','drawDecline',
 'histNav','navStart','navPrev','navNext','navLive','viewTag','moveList',
  'actionRow','resignBtn','offerDrawBtn','passBtn','rematchBtn','exportPgnBtn','copyFenBtn',
 'chatBox','chatHead','spectatorTag','msgs','chatForm','chatInput',
 'settingsPop','themeRow','pieceStyleSel','soundCheck','coordsCheck','legalCheck','autoQueenCheck',
  'promoModal','promoChoices','modal','modalTitle','modalBody','modalActions','toasts'
].forEach(id => els[id] = $(id));

/* ------------------------------------------------------------------ */
/* Persistent settings                                                 */
/* ------------------------------------------------------------------ */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

const pid = (() => {
  let p = store.get('gh-pid', null);
  if (!p) { p = crypto.randomUUID(); store.set('gh-pid', p); }
  return p;
})();

/* ------------------------------------------------------------------ */
/* Account state                                                       */
/* ------------------------------------------------------------------ */
let account = store.get('gh-account', null);
let selectedGame = 'chess';

function showAuth() {
  els.authScreen.hidden = false;
  els.landing.hidden = true;
  els.game.hidden = true;
}
function showLobby() {
  els.authScreen.hidden = true;
  els.landing.hidden = false;
  els.game.hidden = true;
  if (account) {
    els.userBadge.hidden = false;
    els.userAvatar.textContent = account.avatar;
    els.userName.textContent = account.name;
    els.userRank.textContent = account.rank;
    els.userPoints.textContent = account.points + ' pts';
  } else {
    els.userBadge.hidden = true;
  }
}
function updateUserBadge() {
  if (!account) return;
  els.userAvatar.textContent = account.avatar;
  els.userName.textContent = account.name;
  els.userRank.textContent = account.rank;
  els.userPoints.textContent = account.points + ' pts';
}
async function apiCall(url, data) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  return r.json();
}

// Auth UI
els.loginBtn.addEventListener('click', async () => {
  const u = els.loginUser.value.trim();
  const p = els.loginPass.value;
  if (!u || !p) { els.authStatus.textContent = 'Fill in both fields.'; return; }
  els.authStatus.textContent = 'Logging in...';
  const res = await apiCall('/api/login', { username: u, password: p });
  if (res.error) { els.authStatus.textContent = res.error; return; }
  account = res.user;
  store.set('gh-account', account);
  showLobby();
});
els.registerBtn.addEventListener('click', async () => {
  const u = els.regUser.value.trim();
  const p = els.regPass.value;
  if (!u || !p) { els.regStatus.textContent = 'Fill in both fields.'; return; }
  els.regStatus.textContent = 'Creating account...';
  const res = await apiCall('/api/register', { username: u, password: p });
  if (res.error) { els.regStatus.textContent = res.error; return; }
  account = res.user;
  store.set('gh-account', account);
  showLobby();
});
els.showRegisterBtn.addEventListener('click', () => { els.loginForm.hidden = true; els.registerForm.hidden = false; els.authStatus.textContent = ''; });
els.showLoginBtn.addEventListener('click', () => { els.registerForm.hidden = true; els.loginForm.hidden = false; els.regStatus.textContent = ''; });
els.playGuestBtn.addEventListener('click', () => { account = null; showLobby(); });
els.logoutBtn.addEventListener('click', () => { account = null; store.set('gh-account', null); showAuth(); });

// Game selector
document.querySelectorAll('.game-tile').forEach(tile => {
  tile.addEventListener('click', () => {
    document.querySelectorAll('.game-tile').forEach(t => t.classList.remove('active'));
    tile.classList.add('active');
    selectedGame = tile.dataset.game;
  });
});

// Init auth/lobby
if (account) showLobby(); else showAuth();

/* ------------------------------------------------------------------ */
/* Piece art                                                           */
/* ------------------------------------------------------------------ */
const PIECE_ART = {
  p: '<circle cx="50" cy="30" r="13"/><path d="M50 42c9 0 14 7 12 16l-4 12h7l4 14H31l4-14h7l-4-12c-2-9 3-16 12-16z"/><rect x="28" y="84" width="44" height="8" rx="3"/>',
  r: '<path d="M29 22h9v8h9v-8h6v8h9v-8h9v15l-5 6v30l6 11H28l6-11V43l-5-6z"/><rect x="24" y="84" width="52" height="8" rx="3"/>',
  n: '<path d="M32 84c1-17 7-25 15-34 4-5 5-9 3-13l-8 7c-3 3-8 2-9-2-2-7 3-16 12-21 4-2 6-5 7-9l7 7c10 2 18 12 21 26 3 12 2 26 1 39z"/><circle class="eye" cx="57" cy="31" r="2.8"/><rect x="26" y="84" width="50" height="8" rx="3"/>',
  b: '<path d="M50 12c9 10 18 20 18 32 0 9-6 15-13 17H45c-7-2-13-8-13-17 0-12 9-22 18-32z"/><path class="slit" d="M50 24v15" fill="none" stroke-width="3.5"/><path d="M45 61h10v10H45z"/><path d="M38 71h24l5 13H33z"/><rect x="27" y="84" width="46" height="8" rx="3"/>',
  q: '<circle cx="20" cy="26" r="5"/><circle cx="50" cy="18" r="5"/><circle cx="80" cy="26" r="5"/><path d="M20 30 36 48 50 26 64 48 80 30 88 74H12Z"/><path d="M18 74h64l-5 10H23z"/><rect x="24" y="84" width="52" height="8" rx="3"/>',
  k: '<path d="M46 6h8v9h9v8h-9v9h-8v-9h-9v-8h9z"/><path d="M50 36c11 0 18 7 18 15 0 6-4 10-9 13 10 3 17 8 19 20H22c2-12 9-17 19-20-5-3-9-7-9-13 0-8 7-15 18-15z"/><rect x="24" y="84" width="52" height="8" rx="3"/>'
};

function pieceSvg(type, color) {
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><g class="${color === 'w' ? 'pw' : 'pb'}">${PIECE_ART[type]}</g></svg>`;
}

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/* ------------------------------------------------------------------ */
/* Persistent settings                                                 */
/* ------------------------------------------------------------------ */
const settings = Object.assign({
  theme: 'green', pieceStyle: 'classic', sound: true,
  coords: true, legal: true, autoQueen: false
}, store.get('gh-settings', {}));

function saveSettings() { store.set('gh-settings', settings); }

function applySettings() {
  document.body.dataset.theme = settings.theme;
  document.body.dataset.pieces = settings.pieceStyle;
  els.board.classList.toggle('no-coords', !settings.coords);
  els.soundBtn.textContent = settings.sound ? '\u{1F50A}' : '\u{1F507}';
  els.soundCheck.checked = settings.sound;
  els.coordsCheck.checked = settings.coords;
  els.legalCheck.checked = settings.legal;
  els.autoQueenCheck.checked = settings.autoQueen;
  els.pieceStyleSel.value = settings.pieceStyle;
  document.querySelectorAll('.theme-dot').forEach(d =>
    d.classList.toggle('active', d.dataset.themeSet === settings.theme));
}

/* ------------------------------------------------------------------ */
/* Game state                                                          */
/* ------------------------------------------------------------------ */
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const S = {
  code: null,
  youAre: null,
  youName: '',
  players: { w: null, b: null },
  spectators: 0,
  tcKey: '5+0', tcLabel: '', timed: false,
  fens: [START_FEN],
  history: [],
  viewIdx: 0,
  turn: 'w',
  running: false,
  result: null,
  reason: null,
  checkSquare: null,
  clocks: { w: 0, b: 0 },
  clockRunning: false,
  drawOfferBy: null,
  rematch: { w: false, b: false },
  oppDisconnectedSeat: null,
  flipped: false,
  manualFlip: false,
  selected: null,
  targets: [],
  pendingPromo: null,
  lowTimeWarned: false,
  startedOnce: false,
  local: false,
  vsAI: false,
  aiDepth: 2,
  localChess: null,
  aiThinking: false,
  gameId: null,
  engine: null,
  gameState: null,
  aiColor: null
};

const socket = io({ auth: { pid, token: account?.token } });

/* ------------------------------------------------------------------ */
/* Sounds                                                              */
/* ------------------------------------------------------------------ */
let audioCtx = null;
function ctx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function tone(freq, dur, type = 'sine', gain = 0.09, delay = 0) {
  if (!settings.sound) return;
  try {
    const c = ctx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type; o.frequency.value = freq;
    const t0 = c.currentTime + delay;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  } catch {}
}
const snd = {
  move()    { tone(520, 0.06, 'triangle', 0.07); },
  capture() { tone(300, 0.07, 'square', 0.05); tone(180, 0.1, 'triangle', 0.08, 0.02); },
  check()   { tone(660, 0.07, 'sine', 0.1); tone(660, 0.07, 'sine', 0.1, 0.12); },
  start()   { tone(392, 0.09, 'triangle', 0.08); tone(523, 0.12, 'triangle', 0.08, 0.1); },
  end()     { tone(523, 0.16, 'triangle', 0.08); tone(659, 0.16, 'triangle', 0.08, 0.14); tone(784, 0.24, 'triangle', 0.08, 0.28); },
  low()     { tone(880, 0.08, 'square', 0.06); tone(880, 0.08, 'square', 0.06, 0.15); },
  notify()  { tone(700, 0.05, 'sine', 0.06); }
};

/* ------------------------------------------------------------------ */
/* Board construction                                                  */
/* ------------------------------------------------------------------ */
const FILES = 'abcdefgh';
let squareEls = {};

function orientation() {
  return (S.flipped || S.youAre === 'b') ? 'b' : 'w';
}

function buildBoard() {
  els.board.innerHTML = '';
  squareEls = {};
  const isChess = !S.gameId || S.gameId === 'chess';
  const engine = S.engine;
  const rows = isChess ? 8 : (engine ? engine.rows : 8);
  const cols = isChess ? 8 : (engine ? engine.cols : 8);
  els.board.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  els.board.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  els.board.style.aspectRatio = `${cols} / ${rows}`;

  if (isChess) {
    const orient = orientation();
    const ranks = orient === 'w' ? ['8','7','6','5','4','3','2','1'] : ['1','2','3','4','5','6','7','8'];
    const files = orient === 'w' ? FILES.split('') : FILES.split('').reverse();
    ranks.forEach((rank, ri) => {
      files.forEach((file, fi) => {
        const sq = file + rank;
        const el = document.createElement('div');
        el.className = 'sq ' + ((fi + ri) % 2 === 0 ? 'light' : 'dark');
        el.dataset.sq = sq;
        if (ri === 0) el.insertAdjacentHTML('beforeend', `<span class="coord file">${file}</span>`);
        if (fi === 7) el.insertAdjacentHTML('beforeend', `<span class="coord rank">${rank}</span>`);
        els.board.appendChild(el);
        squareEls[sq] = el;
      });
    });
  } else {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const el = document.createElement('div');
        el.dataset.sq = r + ',' + c;
        el.dataset.row = r;
        el.dataset.col = c;
        els.board.appendChild(el);
        squareEls[r + ',' + c] = el;
      }
    }
  }
}

function positionAt(idx) {
  if (S.gameId && S.gameId !== 'chess') return S.gameState;
  const ch = new Chess(S.fens[Math.max(0, Math.min(idx, S.fens.length - 1))]);
  return ch;
}

function isLive() { return S.viewIdx === S.fens.length - 1; }

function pieceAt(ch, sq) {
  if (S.gameId && S.gameId !== 'chess') return null;
  const p = ch.get(sq);
  return p ? { type: p.type, color: p.color } : null;
}

function renderBoard() {
  const isChess = !S.gameId || S.gameId === 'chess';
  const idx = S.viewIdx;

  if (!isChess) {
    renderGenericBoard();
    return;
  }

  const ch = positionAt(idx);
  const boardArr = ch.board();

  for (const sq of Object.keys(squareEls)) {
    const el = squareEls[sq];
    el.querySelector('.piece')?.remove();
    el.classList.remove('sel', 'last', 'check', 'hover-target');
    el.querySelector('.mk-dot')?.remove();
    el.querySelector('.mk-ring')?.remove();
  }

  for (const row of boardArr) {
    for (const cell of row) {
      if (!cell) continue;
      const el = squareEls[cell.square];
      const div = document.createElement('div');
      div.className = 'piece';
      div.innerHTML = pieceSvg(cell.type, cell.color);
      el.appendChild(div);
    }
  }

  if (idx > 0) {
    const last = S.history[idx - 1];
    if (last) {
      squareEls[last.from]?.classList.add('last');
      squareEls[last.to]?.classList.add('last');
    }
  }

  const checkSq = (idx === S.fens.length - 1) ? S.checkSquare : null;
  if (checkSq) {
    squareEls[checkSq]?.querySelector('.piece')?.classList.add('checked-piece');
    squareEls[checkSq]?.classList.add('check');
  }

  if (S.selected) markSelection();
}

function renderGenericBoard() {
  const gs = S.gameState;
  if (!gs || !S.engine) return;
  const eng = S.engine;
  const isC4 = eng.id === 'connect4';

  for (const sq of Object.keys(squareEls)) {
    const el = squareEls[sq];
    el.innerHTML = '';
    el.classList.remove('sel', 'last', 'hover-target');
  }

  if (isC4) {
    const board = gs.board || (gs.history && gs.history.length > 0 ? null : null);
    for (const sq of Object.keys(squareEls)) {
      const el = squareEls[sq];
      const [r, c] = sq.split(',').map(Number);
      const v = board[r][c];
      el.className = 'sq c4-sq';
      const pieceDiv = document.createElement('div');
      pieceDiv.className = 'c4-piece' + (v === 'r' ? ' c4-red' : v === 'y' ? ' c4-yellow' : '');
      el.appendChild(pieceDiv);
    }
  } else if (eng.id === 'othello') {
    const board = gs.board;
    for (const sq of Object.keys(squareEls)) {
      const el = squareEls[sq];
      const [r, c] = sq.split(',').map(Number);
      const v = board[r][c];
      el.className = 'sq oth-sq';
      if (v) {
        const pieceDiv = document.createElement('div');
        pieceDiv.className = 'oth-piece ' + (v === 'b' ? 'oth-black' : 'oth-white');
        el.appendChild(pieceDiv);
      }
    }
  } else if (eng.id === 'checkers') {
    const board = gs.board;
    for (const sq of Object.keys(squareEls)) {
      const el = squareEls[sq];
      const [r, c] = sq.split(',').map(Number);
      const v = board[r][c];
      const isDark = (r + c) % 2 === 1;
      el.className = 'sq ' + (isDark ? 'dark' : 'light');
      if (v) {
        const pieceDiv = document.createElement('div');
        pieceDiv.className = 'ck-piece ' + (v === 'b' || v === 'B' ? 'ck-black' : 'ck-white') + (v === 'B' || v === 'W' ? ' ck-king' : '');
        if (v === 'B' || v === 'W') pieceDiv.innerHTML = '<span class="ck-inner">&#x265A;</span>';
        el.appendChild(pieceDiv);
      }
    }
  } else if (eng.id === 'xiangqi') {
    const symbols = { K:'\u5C07', A:'\u58EB', B:'\u8C61', N:'\u9A6C', R:'\u8F66', C:'\u70AE', P:'\u5175' };
    const board = gs.board;
    for (const sq of Object.keys(squareEls)) {
      const el = squareEls[sq];
      const [r, c] = sq.split(',').map(Number);
      const v = board[r][c];
      el.className = 'sq xq-sq';
      if (v) {
        const pieceDiv = document.createElement('div');
        pieceDiv.className = 'xq-piece ' + (v.color === 'r' ? 'xq-red' : 'xq-black');
        pieceDiv.textContent = symbols[v.type] || '?';
        el.appendChild(pieceDiv);
      }
    }
  } else if (eng.id === 'go') {
    const board = gs.board;
    for (const sq of Object.keys(squareEls)) {
      const el = squareEls[sq];
      const [r, c] = sq.split(',').map(Number);
      const v = board[r][c];
      el.className = 'sq go-sq';
      if (v) {
        const pieceDiv = document.createElement('div');
        pieceDiv.className = 'go-piece ' + (v === 'b' ? 'go-black' : 'go-white');
        el.appendChild(pieceDiv);
      }
    }
  } else if (eng.id === 'dama') {
    const board = gs.board;
    for (const sq of Object.keys(squareEls)) {
      const el = squareEls[sq];
      const [r, c] = sq.split(',').map(Number);
      const v = board[r][c];
      const isDark = (r + c) % 2 === 1;
      el.className = 'sq ' + (isDark ? 'dark' : 'light');
      if (v) {
        const pieceDiv = document.createElement('div');
        pieceDiv.className = 'dm-piece ' + (v === 'b' || v === 'B' ? 'dm-black' : 'dm-white') + (v === 'B' || v === 'W' ? ' dm-king' : '');
        if (v === 'B' || v === 'W') pieceDiv.innerHTML = '&#x265A;';
        el.appendChild(pieceDiv);
      }
    }
  }

  if (S.selected) {
    const el = squareEls[S.selected];
    if (el) el.classList.add('sel');
  }
}

function markSelection() {
  const el = squareEls[S.selected];
  if (!el) return;
  el.classList.add('sel');
  for (const t of S.targets) {
    const te = squareEls[t.to];
    if (!te) continue;
    if (!settings.legal) continue;
    if (t.flags.includes('c') || t.flags.includes('e')) {
      const ring = document.createElement('div');
      ring.className = 'mk-ring';
      te.appendChild(ring);
    } else {
      const dot = document.createElement('div');
      dot.className = 'mk-dot';
      te.appendChild(dot);
    }
  }
}

new ResizeObserver(() => {
  const isChess = !S.gameId || S.gameId === 'chess';
  const cols = isChess ? 8 : (S.engine ? S.engine.cols : 8);
  const px = els.board.getBoundingClientRect().width / cols;
  document.documentElement.style.setProperty('--sqsz', px + 'px');
}).observe(els.board);

/* ------------------------------------------------------------------ */
/* Interaction                                                         */
/* ------------------------------------------------------------------ */
function canInteract() {
  if (S.local) {
    const isChess = !S.gameId || S.gameId === 'chess';
    if (isChess) {
      return S.running && !S.result && isLive()
        && !S.pendingPromo && !S.aiThinking
        && (S.turn === 'w' || S.turn === 'b');
    }
    return S.running && !S.result && isLive() && !S.aiThinking;
  }
  return S.youAre && S.running && !S.result && isLive()
    && S.turn === S.youAre && !S.pendingPromo && !S.oppDisconnectedSeat;
}

function getLegalMovesGeneric(squareKey) {
  const gs = S.gameState;
  const eng = S.engine;
  if (!gs || !eng) return [];
  const moves = eng.getLegalMoves(gs);
  return moves.map(m => {
    if (eng.id === 'connect4') return { from: null, to: m, flags: '', piece: 'disc' };
    if (eng.id === 'othello') return { from: m.row + ',' + m.col, to: m.row + ',' + m.col, flags: 'q', piece: 'p', isPlace: true };
    if (eng.id === 'go') {
      if (m.pass) return { from: '-1,-1', to: '-1,-1', flags: '', piece: 'stone', isPass: true };
      return { from: m.row + ',' + m.col, to: m.row + ',' + m.col, flags: 'q', piece: 'stone', isPlace: true };
    }
    return { from: m.from.row + ',' + m.from.col, to: m.to.row + ',' + m.to.col, flags: 'q', piece: 'p' };
  });
}

function select(square) {
  const isChess = !S.gameId || S.gameId === 'chess';

  if (isChess) {
    const ch = positionAt(S.fens.length - 1);
    const p = pieceAt(ch, square);
    const myColor = S.local ? S.turn : S.youAre;
    if (!p || p.color !== myColor) { clearSelection(); return false; }
    S.targets = ch.moves({ square, verbose: true });
    S.selected = square;
    renderBoard();
    return true;
  }

  if (!S.engine || !S.gameState) return false;
  const eng = S.engine;
  const gs = S.gameState;
  const allMoves = getLegalMovesGeneric();

  if (eng.id === 'connect4') {
    const col = parseInt(square.split(',')[1]);
    const colMoves = allMoves.filter(m => m.to === col);
    if (colMoves.length > 0) {
      sendMove(null, col);
      return true;
    }
    return false;
  }

  if (eng.id === 'othello') {
    const squareMoves = allMoves.filter(m => m.to === square);
    if (squareMoves.length > 0) {
      sendMove({ row: parseInt(square.split(',')[0]), col: parseInt(square.split(',')[1]) },
               { row: parseInt(square.split(',')[0]), col: parseInt(square.split(',')[1]) });
      return true;
    }
    clearSelection();
    return false;
  }

  if (eng.id === 'go') {
    const goMoves = allMoves.filter(m => m.to === square);
    if (goMoves.length > 0) {
      sendMove({ row: parseInt(square.split(',')[0]), col: parseInt(square.split(',')[1]) },
               { row: parseInt(square.split(',')[0]), col: parseInt(square.split(',')[1]) });
      return true;
    }
    if (allMoves.some(m => m.to === 'pass')) {
      sendMove({ row: -1, col: -1 }, { row: -1, col: -1 });
      return true;
    }
    clearSelection();
    return false;
  }

  if (S.selected) {
    if (S.targets.some(m => m.to === square)) {
      sendMove(S.selected, square);
      return true;
    }
  }

  const pieceMoves = allMoves.filter(m => m.from === square);
  if (pieceMoves.length > 0) {
    S.selected = square;
    S.targets = pieceMoves;
    renderBoard();
    return true;
  }

  clearSelection();
  return false;
}

function clearSelection() {
  if (!S.selected) return;
  S.selected = null;
  S.targets = [];
  renderBoard();
}

function tryMove(from, to) {
  const mv = S.targets.find(t => t.from === from && t.to === to);
  if (!mv) return false;
  if (mv.promotion) {
    if (settings.autoQueen) { sendMove(from, to, 'q'); return true; }
    openPromoDialog(mv.color, (piece) => sendMove(from, to, piece));
    return true;
  }
  sendMove(from, to);
  return true;
}

function sendMove(from, to, promotion) {
  clearSelection();
  if (S.local) {
    localMove(from, to, promotion);
  } else {
    socket.emit('move', { from, to, promotion });
  }
}

els.board.addEventListener('pointerdown', (e) => {
  const sqEl = e.target.closest('.sq');
  if (!sqEl) return;
  const sq = sqEl.dataset.sq;
  const isChess = !S.gameId || S.gameId === 'chess';

  if (!canInteract()) {
    if (S.selected) clearSelection();
    return;
  }

  if (isChess) {
    if (S.selected && sq !== S.selected) {
      const hit = S.targets.find(t => t.to === sq);
      if (hit) { tryMove(S.selected, sq); return; }
    }
    const ch = positionAt(S.fens.length - 1);
    const p = pieceAt(ch, sq);
    const myColor = S.local ? S.turn : S.youAre;
    if (p && p.color === myColor) {
      const alreadySelected = S.selected === sq;
      select(sq);
      if (!alreadySelected) startDrag(e, sq);
      else if (S.targets.length === 0) clearSelection();
    } else {
      clearSelection();
    }
  } else {
    select(sq);
  }
});

let drag = null;

function startDrag(e, sq) {
  const pieceEl = squareEls[sq]?.querySelector('.piece');
  if (!pieceEl) return;
  const rect = els.board.getBoundingClientRect();
  drag = { sq, startX: e.clientX, startY: e.clientY, moved: false };
  const ghost = $('dragGhost') || (() => {
    const g = document.createElement('div');
    g.id = 'dragGhost';
    document.body.appendChild(g);
    return g;
  })();
  const isChess = !S.gameId || S.gameId === 'chess';
  const numCols = isChess ? 8 : (S.engine ? S.engine.cols : 8);
  ghost.style.width = (rect.width / numCols) + 'px';
  ghost.style.height = (rect.height / numCols) + 'px';
  ghost.innerHTML = pieceSvg(pieceAt(positionAt(S.fens.length - 1), sq).type, S.local ? S.turn : S.youAre);
  drag.ghost = ghost;
  drag.pieceEl = pieceEl;
}

window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 4) return;
  drag.moved = true;
  drag.pieceEl?.classList.add('dragging');
  drag.ghost.style.display = 'block';
  drag.ghost.style.left = (e.clientX - drag.ghost.offsetWidth / 2) + 'px';
  drag.ghost.style.top = (e.clientY - drag.ghost.offsetHeight / 2) + 'px';
  const over = squareFromPoint(e.clientX, e.clientY);
  for (const el of Object.values(squareEls)) el.classList.remove('hover-target');
  if (over && S.targets.some(t => t.to === over)) squareEls[over].classList.add('hover-target');
}, { passive: true });

window.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const { sq, moved, ghost, pieceEl } = drag;
  drag = null;
  ghost.style.display = 'none';
  pieceEl?.classList.remove('dragging');
  for (const el of Object.values(squareEls)) el.classList.remove('hover-target');

  if (!moved) return;
  const target = squareFromPoint(e.clientX, e.clientY);
  if (target && target !== sq && S.targets.some(t => t.to === target)) {
    tryMove(sq, target);
  } else if (target === sq) {
    /* sticky selection stays */
  } else if (target) {
    select(sq);
  }
});

function squareFromPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  const sqEl = el?.closest?.('.sq');
  return sqEl ? sqEl.dataset.sq : null;
}

/* ------------------------------------------------------------------ */
/* Promotion dialog                                                    */
/* ------------------------------------------------------------------ */
function openPromoDialog(color, cb) {
  S.pendingPromo = true;
  els.promoChoices.innerHTML = '';
  for (const t of ['q', 'r', 'b', 'n']) {
    const b = document.createElement('button');
    b.innerHTML = pieceSvg(t, color);
    b.onclick = () => { closePromo(); cb(t); };
    els.promoChoices.appendChild(b);
  }
  els.promoModal.hidden = false;
}
function closePromo() {
  els.promoModal.hidden = true;
  setTimeout(() => { S.pendingPromo = null; }, 50);
}
els.promoModal.addEventListener('pointerdown', (e) => {
  if (e.target === els.promoModal) closePromo();
});

/* ------------------------------------------------------------------ */
/* Rendering: panels                                                   */
/* ------------------------------------------------------------------ */
function barColors() {
  const orient = orientation();
  if (orient === 'w') return { top: 'b', bottom: 'w' };
  return { top: 'w', bottom: 'b' };
}

function playerName(color) {
  const p = S.players[color];
  if (!p) return 'Open seat';
  let n = p.name;
  if (color === S.youAre) n += ' (you)';
  if (!p.connected) n += ' \u26A0';
  return n;
}

function colorName(color) {
  if (!S.gameId || S.gameId === 'chess' || S.gameId === 'checkers' || S.gameId === 'dama') {
    return color === 'w' ? 'White' : 'Black';
  }
  if (S.gameId === 'xiangqi') return color === 'r' ? 'Red' : 'Black';
  if (S.gameId === 'connect4') return color === 'r' ? 'Red' : 'Yellow';
  if (S.gameId === 'othello' || S.gameId === 'go') return color === 'b' ? 'Black' : 'White';
  return color;
}

function renderBars() {
  const { top, bottom } = barColors();
  const cap = capturedPieces();
  const isChess = !S.gameId || S.gameId === 'chess';
  for (const [key, color] of [['Top', top], ['Bottom', bottom]]) {
    els['avatar' + key].innerHTML = S.players[color] ? (isChess ? pieceSvg('k', color) : colorName(color).charAt(0)) : '\u00B7';
    els['name' + key].textContent = playerName(color);
    els['colorTag' + key].textContent = colorName(color);
    if (isChess) {
      const victimColor = color === 'w' ? 'b' : 'w';
      renderCapturedInto(els['captured' + key], cap[color], cap[victimColor], victimColor);
    } else {
      els['captured' + key].innerHTML = '';
    }
  }
  els.spectatorTag.textContent = S.spectators > 0 ? `\u00B7 ${S.spectators} watching` : '';
}

const capturedPieces = () => {
  const out = { w: [], b: [] };
  for (const m of S.history) if (m.captured) out[m.color].push(m.captured);
  return out;
};

function materialScore(list) {
  return list.reduce((s, t) => s + PIECE_VALUE[t], 0);
}

function renderCapturedInto(el, capturedList, opponentList, victimColor) {
  const sorted = [...capturedList].sort((a, b) => PIECE_VALUE[b] - PIECE_VALUE[a]);
  const diff = materialScore(capturedList) - materialScore(opponentList);
  let html = sorted.map(t => pieceSvg(t, victimColor)).join('');
  if (diff > 0) html += `<span class="mat-diff">+${diff}</span>`;
  el.innerHTML = html;
}

function fmtClock(ms) {
  if (ms == null || isNaN(ms)) return '--:--';
  ms = Math.max(0, ms);
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (ms < 10000 && S.clockRunning) {
    const tenths = Math.floor((ms % 1000) / 100);
    return `${m}:${String(s).padStart(2, '0')}.${tenths}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function renderClocks() {
  const { top, bottom } = barColors();
  const map = { top: els.clockTop, bottom: els.clockBottom };
  if (!S.timed) {
    for (const k of ['top', 'bottom']) map[k].classList.add('hidden-clock');
    return;
  }
  for (const k of ['top', 'bottom']) {
    const color = barColors()[k];
    const el = map[k];
    el.classList.remove('hidden-clock');
    el.textContent = fmtClock(S.clocks[color]);
    el.classList.toggle('active', S.clockRunning && S.turn === color && !S.result);
    el.classList.toggle('low', S.clockRunning && S.turn === color && S.clocks[color] < 15000 && !S.result);

    if (settings.sound && S.clockRunning && !S.result && S.turn === S.youAre &&
        S.clocks[S.youAre] < 10500 && S.clocks[S.youAre] > 9000 && !S.lowTimeWarned) {
      S.lowTimeWarned = true;
      snd.low();
    }
  }
}

function renderMoveList() {
  const list = els.moveList;
  list.innerHTML = '';
  for (let i = 0; i < S.history.length; i += 2) {
    const num = document.createElement('span');
    num.className = 'mv-num';
    num.textContent = (i / 2 + 1) + '.';
    list.appendChild(num);
    for (let j = i; j < i + 2; j++) {
      const span = document.createElement('span');
      span.className = 'mv';
      if (j < S.history.length) {
        const mv = S.history[j];
        span.textContent = mv.san || formatGenericMove(mv);
        if (j === S.viewIdx - 1) span.classList.add('current');
        span.onclick = () => setView(j + 1);
      }
      list.appendChild(span);
    }
  }
  const cur = list.querySelector('.mv.current');
  if (cur) cur.scrollIntoView({ block: 'nearest' });
  else list.scrollTop = list.scrollHeight;
}

function setView(idx) {
  S.viewIdx = Math.max(0, Math.min(idx, S.fens.length - 1));
  clearSelection();
  renderAll();
}

function renderStatus() {
  const st = els.statusText;
  els.drawActions.hidden = true;
  els.statusBar.classList.remove('turn-mine');

  if (!S.players.w || !S.players.b) {
    st.textContent = 'Waiting for an opponent to join\u2026 share the room code.';
    return;
  }
  if (S.result) {
    st.textContent = resultText();
    return;
  }
  if (S.drawOfferBy && S.drawOfferBy !== S.youAre && S.youAre) {
    st.textContent = `${playerName(S.drawOfferBy)} offers a draw`;
    els.drawActions.hidden = false;
    return;
  }
  if (S.drawOfferBy && S.drawOfferBy === S.youAre) {
    st.textContent = 'Draw offer sent\u2026';
    return;
  }
  if (S.rematch.w || S.rematch.b) {
    const who = S.rematch.w && S.rematch.b ? null : (S.rematch.w ? 'w' : 'b');
    if (who && who !== S.youAre) {
      st.textContent = `${playerName(who)} wants a rematch`;
      return;
    }
  }
  if (S.running) {
    if (!S.youAre) {
      st.textContent = `${colorName(S.turn)} to move`;
    } else if (S.turn === S.youAre) {
      st.textContent = 'Your move' + (S.checkSquare ? ' \u2014 CHECK!' : '');
      els.statusBar.classList.add('turn-mine');
    } else {
      st.textContent = 'Opponent is thinking\u2026';
    }
  } else {
    st.textContent = 'Game not started';
  }
}

function resultText() {
  if (S.result === 'draw') return 'Draw \u2014 ' + reasonText(S.reason);
  const side = colorName(S.result);
  const how = reasonText(S.reason);
  const mine = S.result === S.youAre;
  const suffix = S.youAre ? (mine ? ' \u2014 you win!' : ' \u2014 you lose') : '';
  return `${side} wins (${how})${suffix}`;
}

function reasonText(r) {
  return ({
    'checkmate': 'checkmate',
    'resignation': 'by resignation',
    'timeout': 'on time',
    'abandoned': 'opponent left',
    'stalemate': 'stalemate',
    'threefold repetition': 'threefold repetition',
    'insufficient material': 'insufficient material',
    'fifty-move rule': 'fifty-move rule',
    'agreement': 'by agreement',
    'timeout vs insufficient material': 'timeout vs insufficient material'
  })[r] || r || '';
}

function renderActions() {
  const spectating = !S.youAre && !S.local;
  const gameOver = !!S.result;
  els.resignBtn.hidden = spectating || gameOver || !S.startedOnce || (S.local && S.vsAI && S.turn !== 'w');
  els.offerDrawBtn.hidden = spectating || gameOver || !S.startedOnce || S.local;
  els.offerDrawBtn.disabled = !!S.drawOfferBy;
  els.passBtn.hidden = !S.local || gameOver || !S.startedOnce || (S.gameId !== 'go');
  els.rematchBtn.hidden = false;
  els.rematchBtn.disabled = !gameOver ||
    (S.local ? false : ((S.rematch.w && S.rematch.b) || (S.youAre && S.rematch[S.youAre])));
  els.exportPgnBtn.hidden = !S.startedOnce;
  els.copyFenBtn.hidden = !S.startedOnce;
}

function renderNav() {
  els.viewTag.textContent = isLive() ? '' : `Reviewing ${S.viewIdx}/${S.fens.length - 1}`;
  els.navLive.classList.toggle('live', !isLive());
}

function renderOverlay() {
  const showWaiting = !S.result && (!S.players.w || !S.players.b);
  const showOver = !!S.result;
  if (!showWaiting && !showOver) { els.boardOverlay.hidden = true; return; }
  els.boardOverlay.hidden = false;
  els.overlayActions.innerHTML = '';

  if (showWaiting) {
    els.overlayTitle.textContent = 'Waiting for opponent\u2026';
    els.overlaySub.textContent = 'Share code ' + S.code + ' or the invite link.';
    const b = document.createElement('button');
    b.className = 'btn primary';
    b.textContent = 'Copy invite link';
    b.onclick = copyInvite;
    els.overlayActions.appendChild(b);
    return;
  }

  const title = S.result === 'draw' ? 'Draw'
    : `${colorName(S.result)} wins!`;
  els.overlayTitle.textContent = title;
  els.overlaySub.textContent = reasonText(S.reason);
  const rem = document.createElement('button');
  rem.className = 'btn primary';
  rem.textContent = 'Rematch';
  rem.onclick = () => {
    if (S.local) { startLocalGame(S.vsAI); return; }
    socket.emit('rematch');
  };
  const again = document.createElement('button');
  again.className = 'btn';
  again.textContent = 'New room';
  again.onclick = () => {
    if (S.local) { showLanding(); return; }
    leaveRoom(() => { showLanding(); });
  };
  const pgn = document.createElement('button');
  pgn.className = 'btn ghost';
  pgn.textContent = 'Copy PGN';
  pgn.onclick = copyPgn;
  els.overlayActions.append(rem, again, pgn);
}

function renderAll() {
  renderBoard();
  renderBars();
  renderClocks();
  renderMoveList();
  renderStatus();
  renderActions();
  renderNav();
  renderOverlay();
}

/* ------------------------------------------------------------------ */
/* Chat                                                                */
/* ------------------------------------------------------------------ */
function addChat(msg) {
  const div = document.createElement('div');
  if (msg.sys) {
    div.className = 'msg sys';
    div.textContent = msg.text;
  } else {
    div.className = 'msg';
    const who = document.createElement('span');
    who.className = 'who ' + (msg.color || 's');
    who.textContent = msg.from + ':';
    div.appendChild(who);
    div.appendChild(document.createTextNode(msg.text));
  }
  els.msgs.appendChild(div);
  els.msgs.scrollTop = els.msgs.scrollHeight;
}

els.chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = els.chatInput.value.trim();
  if (!text || !S.code) return;
  socket.emit('chat_msg', { text });
  els.chatInput.value = '';
});

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */
function formatGenericMove(mv) {
  if (mv.pass) return 'Pass';
  if (mv.from && mv.to) return mv.from.row + ',' + mv.from.col + '\u2192' + mv.to.row + ',' + mv.to.col;
  if (mv.row !== undefined && mv.col !== undefined) return mv.row + ',' + mv.col;
  if (mv.color) return (mv.color === 'r' || mv.color === 'b') ? (mv.from ? mv.from.row+','+mv.from.col : '') : '';
  return JSON.stringify(mv);
}

function pgnString() {
  const names = { w: S.players.w?.name || '?', b: S.players.b?.name || '?' };
  const res = S.result === 'draw' ? '1/2-1/2' : S.result === 'w' ? '1-0' : S.result === 'b' ? '0-1' : '*';
  const d = new Date();
  const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  let out = `[Event "Gambit Hall ${S.code}"]\n[Site "?"]\n[Date "${date}"]\n[White "${names.w}"]\n[Black "${names.b}"]\n[TimeControl "${S.tcKey}"]\n[Result "${res}"]\n\n`;
  const sans = S.history.map(m => m.san);
  for (let i = 0; i < sans.length; i += 2) {
    out += `${i / 2 + 1}. ${sans[i]}${sans[i + 1] ? ' ' + sans[i + 1] : ''} `;
  }
  return out.trim() + (sans.length ? ' ' : '') + res;
}

async function copyText(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast(okMsg); } catch { toast('Copy failed', true); }
    ta.remove();
  }
}

const copyInvite = () => copyText(location.origin + '/?room=' + S.code, 'Invite link copied');
const copyPgn = () => copyText(pgnString(), 'PGN copied');

/* ------------------------------------------------------------------ */
/* Modals & toasts                                                     */
/* ------------------------------------------------------------------ */
function showModal(title, body, buttons) {
  els.modalTitle.textContent = title;
  els.modalBody.textContent = body;
  els.modalActions.innerHTML = '';
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.className = 'btn ' + (b.cls || '');
    btn.textContent = b.label;
    btn.onclick = () => { hideModal(); b.cb && b.cb(); };
    els.modalActions.appendChild(btn);
  }
  els.modal.hidden = false;
}
function hideModal() { els.modal.hidden = true; }

function toast(text, err = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.textContent = text;
  els.toasts.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

/* ------------------------------------------------------------------ */
/* Snapshot ingestion                                                  */
/* ------------------------------------------------------------------ */
function ingestSnapshot(snap, opts = {}) {
  if (!S.code) S.code = snap.code;
  if (snap.youAre !== undefined && snap.youAre !== null) S.youAre = snap.youAre;
  else if (opts.resetRole) S.youAre = snap.youAre;
  S.youName = snap.youName || S.youName;
  S.players = snap.players;
  S.spectators = snap.spectators ?? S.spectators;
  S.tcKey = snap.tcKey;
  S.tcLabel = snap.tcLabel;
  S.timed = snap.state.timed;
  S.drawOfferBy = snap.drawOffer;
  S.rematch = snap.rematch || { w: false, b: false };

  const st = snap.state;
  rebuildFromHistory(st.history);
  S.turn = st.turn;
  S.running = st.running;
  S.result = st.result;
  S.reason = st.reason;
  S.checkSquare = st.checkSquare;
  S.clocks = st.clocks;
  S.clockRunning = st.running && !st.result;

  if (opts.newGame) {
    S.manualFlip = false;
    S.flipped = false;
    S.lowTimeWarned = false;
    S.startedOnce = true;
    S.viewIdx = S.fens.length - 1;
    snd.start();
    toast('Game started \u2014 good luck!');
  } else if (st.history.length || st.result) {
    S.startedOnce = true;
  }
  if (!S.startedOnce) S.viewIdx = S.fens.length - 1;
}

function rebuildFromHistory(historyVerbose) {
  const ch = new Chess();
  S.fens = [ch.fen()];
  S.history = [];
  for (const m of historyVerbose) {
    const mv = ch.move({ from: m.from, to: m.to, promotion: m.promotion || undefined });
    S.history.push(mv);
    S.fens.push(ch.fen());
  }
}

function applyIncomingMove(payload) {
  const prevCount = S.history.length;
  const wasLive = isLive();
  rebuildFromHistory(payload.state.history);
  S.turn = payload.state.turn;
  S.running = payload.state.running;
  S.result = payload.state.result;
  S.reason = payload.state.reason;
  S.checkSquare = payload.state.checkSquare;
  S.clocks = payload.state.clocks;
  S.clockRunning = S.running && !S.result;
  S.drawOfferBy = null;

  if (prevCount < S.history.length) {
    const m = S.history[S.history.length - 1];
    if (m.captured) snd.capture(); else snd.move();
    if (payload.state.checkSquare) setTimeout(snd.check, 90);
  }
  if (wasLive) S.viewIdx = S.fens.length - 1;
  clearSelectionSoft();
  renderAll();
}

function clearSelectionSoft() {
  S.selected = null;
  S.targets = [];
  if (drag) { drag.ghost.style.display = 'none'; drag = null; }
}

/* ------------------------------------------------------------------ */
/* Local / AI game                                                     */
/* ------------------------------------------------------------------ */
function startLocalGame(vsAI) {
  S.local = true;
  S.vsAI = vsAI;
  S.aiDepth = parseInt(els.aiDiffSel?.value || '2', 10);
  S.aiThinking = false;
  S.code = 'LOCAL';
  S.gameId = selectedGame;
  S.engine = getEngine(S.gameId);
  const isChess = S.gameId === 'chess';
  S.youAre = isChess ? 'w' : 'p1';
  S.players = { w: { name: 'White', connected: true }, b: { name: vsAI ? 'Computer' : 'Black', connected: true } };
  S.spectators = 0;
  S.tcKey = 'unlimited';
  S.tcLabel = 'Local';
  S.timed = false;
  S.clocks = { w: 0, b: 0 };
  S.clockRunning = false;
  S.result = null;
  S.reason = null;
  S.checkSquare = null;
  S.drawOfferBy = null;
  S.rematch = { w: false, b: false };
  S.flipped = false;
  S.manualFlip = false;
  S.selected = null;
  S.targets = [];
  S.pendingPromo = null;
  S.lowTimeWarned = false;
  S.startedOnce = true;

  if (isChess) {
    S.localChess = new Chess();
    S.fens = [S.localChess.fen()];
    S.turn = 'w';
    S.aiColor = 'b';
  } else {
    S.gameState = S.engine.startState();
    S.fens = [S.gameState];
    S.turn = S.gameState.turn;
    const firstTurn = S.gameState.turn;
    if (vsAI) {
      const colorMap = { connect4: 'y', othello: 'w', checkers: 'b', xiangqi: 'b', go: 'w', dama: 'b' };
      S.aiColor = colorMap[S.gameId] || (firstTurn === 'w' ? 'b' : 'w');
    } else {
      S.aiColor = null;
    }
  }
  S.history = [];
  S.viewIdx = 0;
  S.running = true;
  els.landing.hidden = true;
  els.game.hidden = false;
  buildBoard();
  renderAll();
  els.spectatorTag.textContent = '';
  els.roomChip.textContent = 'LOCAL';
}

function localMove(from, to, promotion) {
  if (!S.gameId || S.gameId === 'chess') {
    const ch = S.localChess;
    let mv;
    try { mv = ch.move({ from, to, promotion: promotion || undefined }); } catch (_) { return false; }
    if (!mv) return false;
    S.history.push(mv);
    S.fens.push(ch.fen());
    S.turn = ch.turn();
    S.checkSquare = null;
    if (ch.isCheck()) {
      const t = ch.turn();
      for (const row of ch.board()) {
        for (const sq of row) {
          if (sq && sq.type === 'k' && sq.color === t) S.checkSquare = sq.square;
        }
      }
    }
    if (ch.isCheckmate()) endLocalGame(S.turn === 'w' ? 'b' : 'w', 'checkmate');
    else if (ch.isStalemate()) endLocalGame('draw', 'stalemate');
    else if (ch.isInsufficientMaterial()) endLocalGame('draw', 'insufficient material');
    else if (ch.isThreefoldRepetition()) endLocalGame('draw', 'threefold repetition');
    else if (ch.isDraw()) endLocalGame('draw', 'fifty-move rule');

    S.viewIdx = S.fens.length - 1;
    clearSelection();
    renderAll();

    if (S.vsAI && S.running && S.turn === 'b' && !S.result) {
      S.aiThinking = true;
      setTimeout(() => {
        const move = aiBestMove(S.localChess, S.aiDepth);
        S.aiThinking = false;
        if (move) localMove(move.from, move.to, move.promotion || undefined);
      }, 300);
    }
    return true;
  }

  const eng = S.engine;
  const gs = S.gameState;
  let newState;
  try {
    if (eng.id === 'connect4') {
      newState = eng.makeMove(gs, to);
    } else if (eng.id === 'go') {
      const r = parseInt(from.split(',')[0]), c = parseInt(from.split(',')[1]);
      if (r === -1 && c === -1) newState = eng.makeMove(gs, { pass: true });
      else newState = eng.makeMove(gs, { row: r, col: c });
    } else if (eng.id === 'othello') {
      const r = parseInt(from.split(',')[0]), c = parseInt(from.split(',')[1]);
      newState = eng.makeMove(gs, { row: r, col: c });
    } else {
      const fr = parseInt(from.split(',')[0]), fc = parseInt(from.split(',')[1]);
      const tr = parseInt(to.split(',')[0]), tc = parseInt(to.split(',')[1]);
      newState = eng.makeMove(gs, { from: { row: fr, col: fc }, to: { row: tr, col: tc } });
    }
  } catch (_) { return false; }
  if (!newState) return false;

  S.gameState = newState;
  S.fens = [newState];
  S.turn = newState.turn;
  S.history = newState.history || [];
  S.checkSquare = null;

  const over = eng.isGameOver(newState);
  if (over.over) {
    endLocalGame(over.winner || 'draw', over.reason || 'draw');
  }

  S.viewIdx = 0;
  clearSelection();
  renderAll();

  const aiTurn = S.vsAI && S.running && !S.result && S.aiColor && newState.turn === S.aiColor;
  if (aiTurn) {
    S.aiThinking = true;
    setTimeout(() => {
      const move = eng.aiBestMove(S.gameState, S.aiColor, S.aiDepth);
      S.aiThinking = false;
      if (move) {
        if (eng.id === 'connect4') localMove(null, move, null);
        else if (eng.id === 'go') {
          if (move.pass) localMove('-1,-1', null, null);
          else localMove(move.row + ',' + move.col, null, null);
        }
        else if (eng.id === 'othello') localMove(move.row + ',' + move.col, null, null);
        else localMove(move.from.row + ',' + move.from.col, move.to.row + ',' + move.to.col, null);
      }
    }, 300);
  }
  return true;
}

function endLocalGame(result, reason) {
  S.result = result;
  S.reason = reason;
  S.running = false;
  snd.end();
}

/* ------------------------------------------------------------------ */
/* AI engine                                                           */
/* ------------------------------------------------------------------ */
const PIECE_VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const PST = {
  p: [0,0,0,0,0,0,0,0,50,50,50,50,50,50,50,50,10,10,20,30,30,20,10,10,5,5,10,25,25,10,5,5,0,0,0,20,20,0,0,0,5,-5,-10,0,0,-10,-5,5,5,10,10,-20,-20,10,10,5,0,0,0,0,0,0,0,0],
  n: [-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
  b: [-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,10,10,10,10,0,-10,-10,5,5,10,10,5,5,-10,-10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
  r: [0,0,0,0,0,0,0,0,5,10,10,10,10,10,10,5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,0,0,0,5,5,0,0,0],
  q: [-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,0,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-10,0,5,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
  k: [-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20],
  k_end: [-50,-40,-30,-20,-20,-30,-40,-50,-30,-20,-10,0,0,-10,-20,-30,-30,-10,20,30,30,20,-10,-30,-30,-10,30,40,40,30,-10,-30,-30,-10,30,40,40,30,-10,-30,-30,-10,20,30,30,20,-10,-30,-30,-30,0,0,0,0,-30,-30,-50,-30,-30,-30,-30,-30,-30,-50]
};

function isEndgame(chess) {
  let queens = 0, minors = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq) continue;
      if (sq.type === 'q') queens++;
      if (sq.type === 'n' || sq.type === 'b') minors++;
    }
  }
  return queens === 0 || (queens === 2 && minors <= 2);
}

function evaluate(chess) {
  if (chess.isCheckmate()) return chess.turn() === 'w' ? -9999 : 9999;
  if (chess.isStalemate() || chess.isDraw()) return 0;
  let score = 0;
  const endgame = isEndgame(chess);
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq) continue;
      const val = PIECE_VAL[sq.type];
      const pstKey = (sq.type === 'k' && endgame) ? 'k_end' : sq.type;
      const table = PST[pstKey];
      const idx = sq.color === 'w' ? (7 - Math.floor(sq.square[1] - 1)) * 8 + sq.square.charCodeAt(0) - 97
        : Math.floor(sq.square[1] - 1) * 8 + sq.square.charCodeAt(0) - 97;
      const pst = table ? table[idx] : 0;
      score += (sq.color === 'w' ? 1 : -1) * (val * 100 + pst);
    }
  }
  return score;
}

function minimax(chess, depth, alpha, beta, maximizing) {
  if (depth === 0 || chess.isGameOver()) return evaluate(chess);
  const moves = chess.moves({ verbose: true });
  if (maximizing) {
    let maxEval = -Infinity;
    for (const m of moves) {
      chess.move(m);
      const ev = minimax(chess, depth - 1, alpha, beta, false);
      chess.undo();
      if (ev > maxEval) maxEval = ev;
      if (ev > alpha) alpha = ev;
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const m of moves) {
      chess.move(m);
      const ev = minimax(chess, depth - 1, alpha, beta, true);
      chess.undo();
      if (ev < minEval) minEval = ev;
      if (ev < beta) beta = ev;
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

function aiBestMove(chess, depth) {
  const moves = chess.moves({ verbose: true });
  if (!moves.length) return null;
  let bestMove = moves[0];
  let bestEval = Infinity;
  for (const m of moves) {
    chess.move(m);
    const ev = minimax(chess, depth - 1, -Infinity, Infinity, true);
    chess.undo();
    if (ev < bestEval) { bestEval = ev; bestMove = m; }
  }
  return bestMove;
}

/* ------------------------------------------------------------------ */
/* Socket wiring                                                       */
/* ------------------------------------------------------------------ */
socket.on('connect', () => {
  const params = new URLSearchParams(location.search);
  const roomParam = params.get('room');
  if (roomParam && !S.code) {
    els.codeInput.value = roomParam.toUpperCase();
    if (els.nameInput.value.trim()) attemptJoin(roomParam.toUpperCase());
  }
});

socket.on('disconnect', () => {
  if (!S.local && !els.game.hidden) toast('Connection lost \u2014 reconnecting\u2026', true);
});

socket.on('joined', (snap) => {
  enterGame(snap);
});
socket.on('game_start', (snap) => {
  const isNew = !S.startedOnce || S.result;
  ingestSnapshot(snap, { newGame: isNew });
  renderAll();
});

socket.on('room_update', (sum) => {
  S.players = sum.players;
  S.spectators = sum.spectators;
  renderAll();
});

socket.on('move_made', applyIncomingMove);

socket.on('clock', ({ clocks, turn, running }) => {
  S.clocks = clocks;
  S.turn = turn;
  S.clockRunning = running;
  renderClocks();
});

socket.on('game_over', ({ result, reason, state }) => {
  S.result = result;
  S.reason = reason;
  rebuildFromHistory(state.history);
  S.checkSquare = state.checkSquare;
  S.clockRunning = false;
  S.drawOfferBy = null;
  S.rematch = { w: false, b: false };
  S.viewIdx = S.fens.length - 1;
  snd.end();
  renderAll();
});

socket.on('draw_offered', ({ by }) => {
  S.drawOfferBy = by;
  if (by !== S.youAre) { snd.notify(); toast(playerName(by) + ' offers a draw'); }
  renderStatus(); renderActions();
});

socket.on('draw_declined', () => {
  S.drawOfferBy = null;
  toast('Draw declined');
  renderStatus(); renderActions();
});

socket.on('rematch_offered', ({ rematch }) => {
  S.rematch = rematch;
  const other = rematch.w && rematch.b ? null : (rematch.w ? 'w' : 'b');
  if (other && other !== S.youAre) { snd.notify(); toast(playerName(other) + ' wants a rematch'); }
  renderStatus(); renderActions();
});

socket.on('opponent_disconnected', ({ graceSec }) => {
  toast(`Opponent disconnected \u2014 ${graceSec}s to reconnect`, true);
});
socket.on('opponent_reconnected', () => {
  toast('Opponent reconnected');
});

socket.on('chat', addChat);
socket.on('error_msg', ({ message }) => toast(message, true));

/* ------------------------------------------------------------------ */
/* Lobby                                                               */
/* ------------------------------------------------------------------ */
els.nameInput.value = store.get('gh-name', '');

function landingBusy(busy, msg) {
  els.quickBtn.disabled = busy;
  els.createBtn.disabled = busy;
  els.joinBtn.disabled = busy;
  if (busy) els.quickBtn.textContent = 'Cancel search';
  else els.quickBtn.textContent = 'Quick Match';
  els.landingStatus.textContent = msg || '';
}

let searching = false;

els.quickBtn.addEventListener('click', () => {
  if (searching) {
    searching = false;
    socket.emit('cancel_quick_match');
    landingBusy(false);
    return;
  }
  if (!ensureName()) return;
  searching = true;
  landingBusy(true, 'Searching for an opponent\u2026');
  socket.emit('quick_match', { name: getName(), tc: els.tcSelect.value }, (res) => {
    if (res && res.error) { searching = false; landingBusy(false, res.error); }
  });
});

els.createBtn.addEventListener('click', () => {
  if (!ensureName()) return;
  socket.emit('create_room', { name: getName(), tc: els.tcSelect.value }, (res) => {
    if (res && res.error) landingBusy(false, res.error);
    else if (res && res.ok) enterGame(res.snapshot);
  });
});

els.joinBtn.addEventListener('click', () => attemptJoin(els.codeInput.value));

els.localBtn.addEventListener('click', () => startLocalGame(false));
els.aiBtn.addEventListener('click', () => startLocalGame(true));

function attemptJoin(codeOverride) {
  if (!ensureName()) return;
  const code = (codeOverride || els.codeInput.value || '').toUpperCase().trim();
  if (code.length !== 4) { els.landingStatus.textContent = 'Enter the 4-letter room code.'; return; }
  socket.emit('join_room', { code, name: getName() }, (res) => {
    if (res && res.error) els.landingStatus.textContent = res.error;
    else if (res && res.ok) enterGame(res.snapshot);
  });
}

els.codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptJoin(els.codeInput.value); });

function ensureName() {
  const n = els.nameInput.value.trim();
  if (!n) { els.nameInput.focus(); els.landingStatus.textContent = 'Pick a name first.'; return false; }
  store.set('gh-name', n.slice(0, 16));
  return true;
}
function getName() { return els.nameInput.value.trim().slice(0, 16); }

function enterGame(snap) {
  searching = false;
  landingBusy(false);
  S.code = null;
  S.youAre = null;
  S.startedOnce = false;
  S.result = null;
  S.manualFlip = false;
  S.flipped = false;
  ingestSnapshot(snap, {});
  els.landing.hidden = true;
  els.game.hidden = false;
  buildBoard();
  renderAll();
  els.spectatorTag.textContent = S.youAre ? '' : `(spectator)`;
  history.replaceState(null, '', location.pathname);
}

function showLanding() {
  S.local = false;
  S.vsAI = false;
  S.localChess = null;
  S.aiThinking = false;
  els.game.hidden = true;
  els.landing.hidden = false;
  landingBusy(false);
}

function leaveRoom(cb) {
  socket.emit('leave_room', () => cb && cb());
}

/* ------------------------------------------------------------------ */
/* Top bar / controls                                                  */
/* ------------------------------------------------------------------ */
els.roomChip.addEventListener('click', copyInvite);

els.flipBtn.addEventListener('click', () => {
  S.flipped = !S.flipped;
  S.manualFlip = true;
  buildBoard();
  renderAll();
});

els.soundBtn.addEventListener('click', () => {
  settings.sound = !settings.sound;
  saveSettings();
  applySettings();
});

els.settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  els.settingsPop.hidden = !els.settingsPop.hidden;
});

document.addEventListener('click', (e) => {
  if (!els.settingsPop.hidden && !els.settingsPop.contains(e.target) && e.target !== els.settingsBtn) {
    els.settingsPop.hidden = true;
  }
});

els.exitBtn.addEventListener('click', () => {
  if (S.local) { showLanding(); return; }
  showModal('Leave room?', 'The game will be recorded as a loss if it is still running.', [
    { label: 'Stay' },
    { label: 'Leave', cls: 'danger', cb: () => leaveRoom(showLanding) }
  ]);
});

els.themeRow.addEventListener('click', (e) => {
  const dot = e.target.closest('[data-theme-set]');
  if (!dot) return;
  settings.theme = dot.dataset.themeSet;
  saveSettings();
  applySettings();
});

els.pieceStyleSel.addEventListener('change', () => {
  settings.pieceStyle = els.pieceStyleSel.value;
  saveSettings();
  applySettings();
  renderBoard(); renderBars();
});
els.soundCheck.addEventListener('change', () => { settings.sound = els.soundCheck.checked; saveSettings(); applySettings(); });
els.coordsCheck.addEventListener('change', () => { settings.coords = els.coordsCheck.checked; saveSettings(); applySettings(); });
els.legalCheck.addEventListener('change', () => { settings.legal = els.legalCheck.checked; saveSettings(); applySettings(); });
els.autoQueenCheck.addEventListener('change', () => { settings.autoQueen = els.autoQueenCheck.checked; saveSettings(); });

els.navStart.addEventListener('click', () => setView(0));
els.navPrev.addEventListener('click', () => setView(S.viewIdx - 1));
els.navNext.addEventListener('click', () => setView(S.viewIdx + 1));
els.navLive.addEventListener('click', () => setView(S.fens.length - 1));

els.resignBtn.addEventListener('click', () => {
  if (S.local) { endLocalGame(S.turn === 'w' ? 'b' : 'w', 'resignation'); renderAll(); return; }
  showModal('Resign the game?', '', [
    { label: 'Keep playing' },
    { label: 'Resign', cls: 'danger', cb: () => socket.emit('resign') }
  ]);
});

els.offerDrawBtn.addEventListener('click', () => socket.emit('offer_draw'));
els.passBtn.addEventListener('click', () => {
  if (!S.local || S.gameId !== 'go') return;
  sendMove('-1,-1', null);
});
els.drawAccept.addEventListener('click', () => socket.emit('accept_draw'));
els.drawDecline.addEventListener('click', () => socket.emit('decline_draw'));
els.rematchBtn.addEventListener('click', () => {
  if (S.local) { startLocalGame(S.vsAI); return; }
  socket.emit('rematch');
});
els.exportPgnBtn.addEventListener('click', copyPgn);
els.copyFenBtn.addEventListener('click', () => copyText(S.fens[S.viewIdx], 'FEN copied'));

window.addEventListener('keydown', (e) => {
  if (els.game.hidden) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'ArrowLeft') setView(S.viewIdx - 1);
  else if (e.key === 'ArrowRight') setView(S.viewIdx + 1);
  else if (e.key === 'f' || e.key === 'F') els.flipBtn.click();
});

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */
applySettings();
buildBoard();
