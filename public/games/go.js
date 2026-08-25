function cloneBoard(board) {
  return board.map(r => r.slice());
}

function cloneState(state) {
  return {
    board: cloneBoard(state.board),
    turn: state.turn,
    history: state.history.slice(),
    result: state.result,
    reason: state.reason,
    ko: state.ko ? { row: state.ko.row, col: state.ko.col } : null,
    passes: state.passes,
    captured: { b: state.captured.b, w: state.captured.w },
  };
}

function neighbors(row, col, rows, cols) {
  const adj = [];
  if (row > 0) adj.push({ row: row - 1, col });
  if (row < rows - 1) adj.push({ row: row + 1, col });
  if (col > 0) adj.push({ row, col: col - 1 });
  if (col < cols - 1) adj.push({ row, col: col + 1 });
  return adj;
}

function getGroup(board, row, col, rows, cols) {
  const color = board[row][col];
  if (!color) return { stones: [], liberties: new Set() };
  const visited = new Set();
  const stones = [];
  const liberties = new Set();
  const stack = [{ row, col }];
  while (stack.length) {
    const p = stack.pop();
    const key = p.row * cols + p.col;
    if (visited.has(key)) continue;
    visited.add(key);
    if (board[p.row][p.col] === color) {
      stones.push(p);
      for (const n of neighbors(p.row, p.col, rows, cols)) {
        const nk = n.row * cols + n.col;
        if (!visited.has(nk)) {
          if (board[n.row][n.col] === null) liberties.add(nk);
          else if (board[n.row][n.col] === color) stack.push(n);
        }
      }
    }
  }
  return { stones, liberties };
}

function wouldBeSelfCapture(board, row, col, color, rows, cols) {
  const opp = color === 'b' ? 'w' : 'b';
  const adj = neighbors(row, col, rows, cols);
  let hasLiberty = false;
  for (const n of adj) {
    const c = board[n.row][n.col];
    if (c === null) { hasLiberty = true; break; }
    if (c === color) {
      const g = getGroup(board, n.row, n.col, rows, cols);
      if (g.liberties.size > 0) { hasLiberty = true; break; }
    }
  }
  if (hasLiberty) return false;
  for (const n of adj) {
    if (board[n.row][n.col] === opp) {
      const g = getGroup(board, n.row, n.col, rows, cols);
      if (g.liberties.size === 1) return false;
    }
  }
  return true;
}

function applyMove(state, pos, Rows, Cols) {
  const rows = Rows || state.board.length;
  const cols = Cols || state.board[0].length;
  if (pos.pass) {
    const ns = cloneState(state);
    ns.turn = state.turn === 'b' ? 'w' : 'b';
    ns.passes = state.passes + 1;
    ns.ko = null;
    ns.history = [...state.history, { pass: true, color: state.turn }];
    return ns;
  }
  const ns = cloneState(state);
  const color = state.turn;
  const opp = color === 'b' ? 'w' : 'b';
  ns.board[pos.row][pos.col] = color;
  ns.passes = 0;
  ns.ko = null;
  let capturedStones = 0;
  let lastSingleCapture = null;
  const adj = neighbors(pos.row, pos.col, rows, cols);
  for (const n of adj) {
    if (ns.board[n.row][n.col] === opp) {
      const g = getGroup(ns.board, n.row, n.col, rows, cols);
      if (g.liberties.size === 0) {
        capturedStones += g.stones.length;
        if (g.stones.length === 1) lastSingleCapture = g.stones[0];
        for (const s of g.stones) ns.board[s.row][s.col] = null;
      }
    }
  }
  ns.captured[color] += capturedStones;
  if (capturedStones === 1 && lastSingleCapture) {
    ns.ko = lastSingleCapture;
  }
  ns.turn = opp;
  ns.history = [...state.history, { row: pos.row, col: pos.col, color, captured: capturedStones }];
  return ns;
}

const COL_NAMES = 'abcdefghi';

export default {
  name: 'Go',
  id: 'go',
  cols: 9,
  rows: 9,

  startState() {
    const board = Array.from({ length: 9 }, () => Array(9).fill(null));
    return { board, turn: 'b', history: [], result: null, reason: null, ko: null, passes: 0, captured: { b: 0, w: 0 } };
  },

  getLegalMoves(state) {
    const rows = 9, cols = 9;
    const moves = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (state.board[r][c] !== null) continue;
        if (state.ko && state.ko.row === r && state.ko.col === c) continue;
        if (wouldBeSelfCapture(state.board, r, c, state.turn, rows, cols)) continue;
        moves.push({ row: r, col: c });
      }
    }
    moves.push({ pass: true });
    return moves;
  },

  makeMove(state, pos) {
    return applyMove(state, pos, 9, 9);
  },

  isGameOver(state) {
    if (state.passes >= 2) {
      const score = this._scoreBoard(state);
      const blackScore = score.b;
      const whiteScore = score.w;
      const komi = 6.5;
      const net = blackScore - (whiteScore + komi);
      if (net > 0) return { over: true, winner: 'b', reason: `Black wins by ${net} points` };
      if (net < 0) return { over: true, winner: 'w', reason: `White wins by ${Math.abs(net)} points` };
      return { over: true, winner: 'draw', reason: 'Game drawn' };
    }
    if (state.history.length >= 9 * 9 * 2 && state.passes === 0) {
      return { over: true, winner: 'draw', reason: 'Board full' };
    }
    return { over: false };
  },

  evaluate(state, color) {
    const score = this._scoreBoard(state);
    const komi = 6.5;
    const blackTotal = score.b;
    const whiteTotal = score.w + komi;
    if (color === 'b') return blackTotal - whiteTotal;
    return whiteTotal - blackTotal;
  },

  _scoreBoard(state) {
    const rows = 9, cols = 9;
    const b = state.captured.b;
    const w = state.captured.w;
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    let bTerr = b, wTerr = w;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (visited[r][c] || state.board[r][c] !== null) continue;
        const region = [];
        const stack = [{ row: r, col: c }];
        visited[r][c] = true;
        let bordersB = false, bordersW = false;
        while (stack.length) {
          const p = stack.pop();
          region.push(p);
          for (const n of neighbors(p.row, p.col, rows, cols)) {
            if (state.board[n.row][n.col] === 'b') bordersB = true;
            else if (state.board[n.row][n.col] === 'w') bordersW = true;
            else if (!visited[n.row][n.col]) {
              visited[n.row][n.col] = true;
              stack.push(n);
            }
          }
        }
        if (bordersB && !bordersW) bTerr += region.length;
        else if (bordersW && !bordersB) wTerr += region.length;
      }
    }
    return { b: bTerr, w: wTerr };
  },

  _countTerritory(state, color) {
    const rows = 9, cols = 9;
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    let terr = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (visited[r][c] || state.board[r][c] !== null) continue;
        const region = [];
        const stack = [{ row: r, col: c }];
        visited[r][c] = true;
        let onlyColor = true;
        while (stack.length) {
          const p = stack.pop();
          region.push(p);
          for (const n of neighbors(p.row, p.col, rows, cols)) {
            if (state.board[n.row][n.col] !== null && state.board[n.row][n.col] !== color) onlyColor = false;
            if (!visited[n.row][n.col] && state.board[n.row][n.col] === null) {
              visited[n.row][n.col] = true;
              stack.push(n);
            }
          }
        }
        if (onlyColor) terr += region.length;
      }
    }
    return terr;
  },

  _heuristic(state, color) {
    const rows = 9, cols = 9;
    const opp = color === 'b' ? 'w' : 'b';
    let score = 0;
    score += this._countTerritory(state, color) * 10;
    score -= this._countTerritory(state, opp) * 10;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (state.board[r][c] === color) {
          const g = getGroup(state.board, r, c, rows, cols);
          if (g.stones.length >= 2) score += g.stones.length * 2;
          score += g.liberties.size;
          if (r >= 2 && r <= 6 && c >= 2 && c <= 6) score += 3;
          for (const n of neighbors(r, c, rows, cols)) {
            if (state.board[n.row][n.col] === color) score += 1;
          }
        } else if (state.board[r][c] === opp) {
          const g = getGroup(state.board, r, c, rows, cols);
          if (g.liberties.size === 1) score += 15;
        }
      }
    }
    const captureScore = (state.captured[color] - state.captured[opp]) * 8;
    score += captureScore;
    return score;
  },

  aiBestMove(state, color, depth) {
    const d = Math.min(depth || 1, 2);
    const moves = this.getLegalMoves(state);
    if (moves.length <= 1) return moves[0] || { pass: true };
    const opp = color === 'b' ? 'w' : 'b';
    let bestScore = -Infinity;
    let bestMove = moves[0];
    for (const move of moves) {
      const ns = applyMove(state, move, 9, 9);
      let s;
      if (d <= 1) {
        s = this._heuristic(ns, color);
      } else {
        let worstOpp = Infinity;
        const oppMoves = this.getLegalMoves(ns);
        for (const om of oppMoves) {
          const ns2 = applyMove(ns, om, 9, 9);
          const score2 = this._heuristic(ns2, color);
          if (score2 < worstOpp) worstOpp = score2;
        }
        s = worstOpp === Infinity ? this._heuristic(ns, color) : worstOpp;
      }
      if (s > bestScore) { bestScore = s; bestMove = move; }
    }
    return bestMove;
  },

  PIECE_VAL: { b: 1, w: 1 },
  getCaptureValue() { return 0; },
};
