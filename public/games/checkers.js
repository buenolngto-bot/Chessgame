export default {
  name: 'Checkers',
  id: 'checkers',
  cols: 8,
  rows: 8,

  startState() {
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 8; c++)
        if ((r + c) % 2 === 1) board[r][c] = 'b';
    for (let r = 5; r < 8; r++)
      for (let c = 0; c < 8; c++)
        if ((r + c) % 2 === 1) board[r][c] = 'w';
    return { board, turn: 'w', history: [], result: null, reason: null };
  },

  getLegalMoves(state) {
    const { board, turn } = state;
    const isKing = (p) => p === 'B' || p === 'W';
    const colorOf = (p) => (p === 'b' || p === 'B') ? 'b' : 'w';
    const enemy = turn === 'w' ? 'b' : 'w';
    const forward = turn === 'w' ? -1 : 1;

    const dirs = (p) => {
      if (isKing(p)) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
      return turn === 'w' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
    };

    const inBounds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

    const findCaptures = (r, c, piece, visited) => {
      const results = [];
      for (const [dr, dc] of dirs(piece)) {
        const mr = r + dr, mc = c + dc;
        const tr = r + 2 * dr, tc = c + 2 * dc;
        if (inBounds(tr, tc) && board[mr] && board[mr][mc] &&
            colorOf(board[mr][mc]) === enemy && board[tr][tc] === null &&
            !visited.has(`${mr},${mc}`)) {
          results.push({ to: { row: tr, col: tc }, captures: [{ row: mr, col: mc }] });
        }
      }
      return results;
    };

    const findMultiCaptures = (r, c, piece, captured, visited) => {
      const results = [];
      for (const [dr, dc] of dirs(piece)) {
        const mr = r + dr, mc = c + dc;
        const tr = r + 2 * dr, tc = c + 2 * dc;
        if (inBounds(tr, tc) && board[mr] && board[mr][mc] &&
            colorOf(board[mr][mc]) === enemy && board[tr][tc] === null &&
            !visited.has(`${mr},${mc}`)) {
          const newVisited = new Set(visited);
          newVisited.add(`${mr},${mc}`);
          const newCaptured = [...captured, { row: mr, col: mc }];
          const newR = (turn === 'w' && tr === 0) || (turn === 'b' && tr === 7) ? piece : piece;
          if (newR === piece) {
            const sub = findMultiCaptures(tr, tc, piece, newCaptured, newVisited);
            if (sub.length > 0) {
              results.push(...sub);
            } else {
              results.push({ to: { row: tr, col: tc }, captures: newCaptured });
            }
          } else {
            results.push({ to: { row: tr, col: tc }, captures: newCaptured });
          }
        }
      }
      return results;
    };

    let allCaptures = [];
    let allSimple = [];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p || colorOf(p) !== turn) continue;
        const caps = findMultiCaptures(r, c, p, [], new Set());
        if (caps.length > 0) allCaptures.push(...caps.map(cap => ({ from: { row: r, col: c }, ...cap })));
        for (const [dr, dc] of dirs(p)) {
          const nr = r + dr, nc = c + dc;
          if (inBounds(nr, nc) && board[nr][nc] === null) {
            allSimple.push({ from: { row: r, col: c }, to: { row: nr, col: nc }, captures: [] });
          }
        }
      }
    }

    if (allCaptures.length > 0) return allCaptures;
    return allSimple;
  },

  makeMove(state, move) {
    const board = state.board.map((row) => [...row]);
    const { from, to, captures } = move;
    const piece = board[from.row][from.col];
    board[from.row][from.col] = null;
    for (const cap of captures) board[cap.row][cap.col] = null;
    let finalPiece = piece;
    if (state.turn === 'w' && to.row === 0) finalPiece = 'W';
    else if (state.turn === 'b' && to.row === 7) finalPiece = 'B';
    board[to.row][to.col] = finalPiece;
    return {
      board,
      turn: state.turn === 'w' ? 'b' : 'w',
      history: [...state.history, move],
      result: state.result,
      reason: state.reason,
    };
  },

  isGameOver(state) {
    const { board, turn } = state;
    const colorOf = (p) => (p === 'b' || p === 'B') ? 'b' : 'w';
    let hasW = false, hasB = false;
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        if (board[r][c]) {
          if (colorOf(board[r][c]) === 'w') hasW = true;
          else hasB = true;
        }
      }
    if (!hasW) return { over: true, winner: 'b', reason: 'Black wins — White has no pieces.' };
    if (!hasB) return { over: true, winner: 'w', reason: 'White wins — Black has no pieces.' };
    const moves = this.getLegalMoves(state);
    if (moves.length === 0) {
      const winner = turn === 'w' ? 'b' : 'w';
      return { over: true, winner, reason: `${winner === 'w' ? 'White' : 'Black'} wins — ${turn === 'w' ? 'White' : 'Black'} has no legal moves.` };
    }
    return { over: false, winner: null, reason: null };
  },

  evaluate(state, color) {
    const { board } = state;
    const enemy = color === 'w' ? 'b' : 'w';
    const isKing = (p) => p === 'B' || p === 'W';
    const colorOf = (p) => (p === 'b' || p === 'B') ? 'b' : 'w';
    let score = 0;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p) continue;
        const pc = colorOf(p);
        const sign = pc === color ? 1 : -1;

        // piece value: regular=1, king=3
        score += sign * (isKing(p) ? 3 : 1);

        // back row bonus
        if ((pc === 'w' && r === 7) || (pc === 'b' && r === 0)) {
          score += sign * 5;
        }

        // center control bonus (rows 2-5, cols 2-5)
        if (r >= 2 && r <= 5 && c >= 2 && c <= 5) {
          score += sign * 3;
        } else if (r >= 1 && r <= 6 && c >= 1 && c <= 6) {
          score += sign * 1;
        }

        // king proximity to center bonus
        if (isKing(p)) {
          const dr = Math.abs(r - 3.5);
          const dc = Math.abs(c - 3.5);
          const dist = dr + dc;
          score += sign * Math.max(0, Math.round((7 - dist) * 2 / 7));
        }
      }
    }

    return score;
  },

  aiBestMove(state, color, depth = 4) {
    const moves = this.getLegalMoves(state);
    if (moves.length === 0) return null;

    let bestMove = moves[0];
    let bestScore = -Infinity;

    const minimax = (s, d, alpha, beta, maximizing) => {
      const g = this.isGameOver(s);
      if (g.over) {
        if (g.winner === color) return 10000 + d;
        if (g.winner && g.winner !== color) return -10000 - d;
        return 0;
      }
      if (d === 0) return this.evaluate(s, color);

      const mvs = this.getLegalMoves(s);
      if (mvs.length === 0) {
        if (s.turn === color) return -10000 - d;
        return 10000 + d;
      }

      if (maximizing) {
        let val = -Infinity;
        for (const m of mvs) {
          const ns = this.makeMove(s, m);
          val = Math.max(val, minimax(ns, d - 1, alpha, beta, false));
          alpha = Math.max(alpha, val);
          if (beta <= alpha) break;
        }
        return val;
      } else {
        let val = Infinity;
        for (const m of mvs) {
          const ns = this.makeMove(s, m);
          val = Math.min(val, minimax(ns, d - 1, alpha, beta, true));
          beta = Math.min(beta, val);
          if (beta <= alpha) break;
        }
        return val;
      }
    };

    for (const m of moves) {
      const ns = this.makeMove(state, m);
      const score = minimax(ns, depth - 1, -Infinity, Infinity, false);
      if (score > bestScore) {
        bestScore = score;
        bestMove = m;
      }
    }

    return bestMove;
  },

  PIECE_VAL: { b: 1, w: 1 },
  getCaptureValue() {
    return 0;
  },
};
