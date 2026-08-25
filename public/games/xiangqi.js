/* Xiangqi (Chinese Chess) engine — ES module */
const ROWS = 10, COLS = 9;

const INIT_BOARD = (() => {
  const b = Array.from({length: ROWS}, () => Array(COLS).fill(null));
  const back = ['R','N','B','A','K','A','B','N','R'];
  for (let c = 0; c < 9; c++) {
    b[0][c] = { type: back[c], color: 'b' };
    b[9][c] = { type: back[c], color: 'r' };
  }
  b[2][1] = { type: 'C', color: 'b' }; b[2][7] = { type: 'C', color: 'b' };
  b[7][1] = { type: 'C', color: 'r' }; b[7][7] = { type: 'C', color: 'r' };
  for (let c = 0; c < 9; c += 2) { b[3][c] = { type: 'P', color: 'b' }; }
  for (let c = 0; c < 9; c += 2) { b[6][c] = { type: 'P', color: 'r' }; }
  return b;
})();

function cloneBoard(board) { return board.map(row => row.map(c => c ? {...c} : null)); }

function inBounds(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }
function inPalace(r, c, color) {
  const rMin = color === 'r' ? 7 : 0, rMax = color === 'r' ? 9 : 2;
  return r >= rMin && r <= rMax && c >= 3 && c <= 5;
}
function inOwnHalf(r, color) { return color === 'r' ? r >= 5 : r <= 4; }

function findKing(board, color) {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p && p.type === 'K' && p.color === color) return { row: r, col: c };
    }
  return null;
}

function kingsExposed(board) {
  const wk = findKing(board, 'r'), bk = findKing(board, 'b');
  if (!wk || !bk) return false;
  if (wk.col !== bk.col) return false;
  for (let r = Math.min(wk.row, bk.row) + 1; r < Math.max(wk.row, bk.row); r++) {
    if (board[r][wk.col]) return false;
  }
  return true;
}

function pseudoMoves(board, r, c) {
  const p = board[r][c];
  if (!p) return [];
  const moves = [];
  const color = p.color;
  const own = (rr, cc) => { const q = board[rr][cc]; return q && q.color === color; };

  function addIf(rr, cc) {
    if (!inBounds(rr, cc) || own(rr, cc)) return false;
    moves.push({ to: { row: rr, col: cc } });
    return !board[rr][cc]; // continue sliding if empty
  }

  switch (p.type) {
    case 'K':
      [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc]) => {
        const rr = r+dr, cc = c+dc;
        if (inPalace(rr, cc, color) && !own(rr, cc)) moves.push({ to: { row: rr, col: cc } });
      });
      break;
    case 'A':
      [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([dr,dc]) => {
        const rr = r+dr, cc = c+dc;
        if (inPalace(rr, cc, color) && !own(rr, cc)) moves.push({ to: { row: rr, col: cc } });
      });
      break;
    case 'B': {
      const dirs = [[-2,-2],[-2,2],[2,-2],[2,2]];
      dirs.forEach(([dr,dc]) => {
        const rr = r+dr, cc = c+dc, mr = r+dr/2, mc = c+dc/2;
        if (inBounds(rr, cc) && inOwnHalf(rr, color) && !board[mr][mc] && !own(rr, cc))
          moves.push({ to: { row: rr, col: cc } });
      });
      break;
    }
    case 'N': {
      const jumps = [[-2,-1,-1,0],[-2,1,-1,0],[2,-1,1,0],[2,1,1,0],[-1,-2,0,-1],[-1,2,0,1],[1,-2,0,-1],[1,2,0,1]];
      jumps.forEach(([dr,dc,br,bc]) => {
        const rr = r+dr, cc = c+dc, blockR = r+br, blockC = c+bc;
        if (inBounds(rr, cc) && !board[blockR][blockC] && !own(rr, cc))
          moves.push({ to: { row: rr, col: cc } });
      });
      break;
    }
    case 'R':
      [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc]) => {
        let rr = r+dr, cc = c+dc;
        while (inBounds(rr, cc)) {
          if (board[rr][cc]) { if (!own(rr, cc)) moves.push({ to: { row: rr, col: cc } }); break; }
          moves.push({ to: { row: rr, col: cc } });
          rr += dr; cc += dc;
        }
      });
      break;
    case 'C':
      [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc]) => {
        let rr = r+dr, cc = c+dc, screen = false;
        while (inBounds(rr, cc)) {
          if (!screen) {
            if (board[rr][cc]) { screen = true; }
            else moves.push({ to: { row: rr, col: cc } });
          } else {
            if (board[rr][cc]) {
              if (!own(board[rr][cc])) moves.push({ to: { row: rr, col: cc } });
              break;
            }
          }
          rr += dr; cc += dc;
        }
      });
      break;
    case 'P': {
      const fwd = color === 'r' ? -1 : 1;
      const crossed = color === 'r' ? r <= 4 : r >= 5;
      if (inBounds(r+fwd, c) && !own(r+fwd, c)) moves.push({ to: { row: r+fwd, col: c } });
      if (crossed) {
        if (inBounds(r, c-1) && !own(r, c-1)) moves.push({ to: { row: r, col: c-1 } });
        if (inBounds(r, c+1) && !own(r, c+1)) moves.push({ to: { row: r, col: c+1 } });
      }
      break;
    }
  }
  return moves;
}

function allMoves(board, color) {
  const moves = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p && p.color === color) {
        for (const m of pseudoMoves(board, r, c)) {
          moves.push({ from: { row: r, col: c }, to: m.to });
        }
      }
    }
  return moves;
}

function filterLegal(board, color, moves) {
  return moves.filter(m => {
    const nb = cloneBoard(board);
    nb[m.to.row][m.to.col] = nb[m.from.row][m.from.col];
    nb[m.from.row][m.from.col] = null;
    return !kingsExposed(nb);
  });
}

const PIECE_VAL = { K: 10000, A: 120, B: 120, N: 270, R: 600, C: 285, P: 30 };

const PST_N = [
  0,-5,-5,-5,-5,-5,-5,-5, 0,
  0, 0, 5, 5, 5, 5, 0, 0, 0,
  0, 5,10,10,10,10, 5, 0, 0,
  0, 5,10,15,15,10, 5, 0, 0,
  0, 5,10,15,15,10, 5, 0, 0,
  0, 5,10,15,15,10, 5, 0, 0,
  0, 5,10,10,10,10, 5, 0, 0,
  0, 0, 5, 5, 5, 5, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0
];

function evaluate(board, color) {
  let score = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p) continue;
      let val = PIECE_VAL[p.type] || 0;
      if (p.type === 'N') val += (PST_N[r * COLS + c] || 0);
      if (p.type === 'P') val += (inOwnHalf(r, p.color) ? 0 : 15);
      score += (p.color === color ? 1 : -1) * val;
    }
  }
  return score;
}

function minimax(board, depth, alpha, beta, maximizing, color) {
  if (depth === 0) return evaluate(board, color);
  const turn = maximizing ? color : (color === 'r' ? 'b' : 'r');
  const moves = filterLegal(board, turn, allMoves(board, turn));
  if (moves.length === 0) return maximizing ? -99999 : 99999;

  if (maximizing) {
    let maxEv = -Infinity;
    for (const m of moves) {
      const nb = cloneBoard(board);
      nb[m.to.row][m.to.col] = nb[m.from.row][m.from.col];
      nb[m.from.row][m.from.col] = null;
      const ev = minimax(nb, depth-1, alpha, beta, false, color);
      if (ev > maxEv) maxEv = ev;
      if (ev > alpha) alpha = ev;
      if (beta <= alpha) break;
    }
    return maxEv;
  } else {
    let minEv = Infinity;
    for (const m of moves) {
      const nb = cloneBoard(board);
      nb[m.to.row][m.to.col] = nb[m.from.row][m.from.col];
      nb[m.from.row][m.from.col] = null;
      const ev = minimax(nb, depth-1, alpha, beta, true, color);
      if (ev < minEv) minEv = ev;
      if (ev < beta) beta = ev;
      if (beta <= alpha) break;
    }
    return minEv;
  }
}

export default {
  name: 'Xiangqi',
  id: 'xiangqi',
  cols: COLS,
  rows: ROWS,
  PIECE_VAL,

  startState() {
    return { board: cloneBoard(INIT_BOARD), turn: 'r', history: [], result: null, reason: null };
  },

  getLegalMoves(state) {
    if (state.result) return [];
    return filterLegal(state.board, state.turn, allMoves(state.board, state.turn));
  },

  makeMove(state, move) {
    const nb = cloneBoard(state.board);
    nb[move.to.row][move.to.col] = nb[move.from.row][move.from.col];
    nb[move.from.row][move.from.col] = null;
    const nextTurn = state.turn === 'r' ? 'b' : 'r';
    const st = {
      board: nb, turn: nextTurn,
      history: [...state.history, { from: move.from, to: move.to, piece: state.board[move.from.row][move.from.col] }],
      result: state.result, reason: state.reason
    };
    const over = this.isGameOver(st);
    if (over.over) { st.result = over.winner; st.reason = over.reason; }
    return st;
  },

  isGameOver(state) {
    const wk = findKing(state.board, 'r');
    const bk = findKing(state.board, 'b');
    if (!wk) return { over: true, winner: 'b', reason: 'checkmate' };
    if (!bk) return { over: true, winner: 'r', reason: 'checkmate' };
    const rm = filterLegal(state.board, state.turn, allMoves(state.board, state.turn));
    if (rm.length === 0) {
      return { over: true, winner: state.turn === 'r' ? 'b' : 'r', reason: 'stalemate' };
    }
    return { over: false };
  },

  evaluate(state, color) { return evaluate(state.board, color); },

  aiBestMove(state, color, depth = 2) {
    const moves = this.getLegalMoves(state);
    if (!moves.length) return null;
    let best = moves[0], bestEv = -Infinity;
    for (const m of moves) {
      const nb = cloneBoard(state.board);
      nb[m.to.row][m.to.col] = nb[m.from.row][m.from.col];
      nb[m.from.row][m.from.col] = null;
      const ev = minimax(nb, depth - 1, -Infinity, Infinity, false, color);
      if (ev > bestEv) { bestEv = ev; best = m; }
    }
    return best;
  },

  getCaptureValue(piece) { return piece ? (PIECE_VAL[piece.type] || 0) : 0; }
};
