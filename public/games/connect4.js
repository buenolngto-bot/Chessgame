function cloneBoard(board) {
  return board.map(row => [...row]);
}

function cloneState(state) {
  return {
    board: cloneBoard(state.board),
    turn: state.turn,
    history: [...state.history],
    result: state.result,
    reason: state.reason,
  };
}

function createEmptyBoard(rows, cols) {
  const board = [];
  for (let r = 0; r < rows; r++) {
    board.push(new Array(cols).fill(null));
  }
  return board;
}

function dropRow(board, col) {
  for (let r = board.length - 1; r >= 0; r--) {
    if (board[r][col] === null) return r;
  }
  return -1;
}

function countLines(board, color) {
  const rows = board.length;
  const cols = board[0].length;
  let fours = 0;
  let openThrees = 0;
  let openTwos = 0;

  const dirs = [
    [0, 1],  // horizontal
    [1, 0],  // vertical
    [1, 1],  // diag down-right
    [1, -1], // diag down-left
  ];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (const [dr, dc] of dirs) {
        const endR = r + dr * 3;
        const endC = c + dc * 3;
        if (endR < 0 || endR >= rows || endC < 0 || endC >= cols) continue;

        let count = 0;
        let empty = 0;
        for (let i = 0; i < 4; i++) {
          const cell = board[r + dr * i][c + dc * i];
          if (cell === color) count++;
          else if (cell === null) empty++;
        }

        if (count === 4) {
          fours++;
        } else if (count === 3 && empty === 1) {
          openThrees++;
        } else if (count === 2 && empty === 2) {
          openTwos++;
        }
      }
    }
  }

  return { fours, openThrees, openTwos };
}

export default {
  name: 'Connect 4',
  id: 'connect4',
  cols: 7,
  rows: 6,

  startState() {
    return {
      board: createEmptyBoard(6, 7),
      turn: 'r',
      history: [],
      result: null,
      reason: null,
    };
  },

  getLegalMoves(state) {
    const moves = [];
    for (let c = 0; c < 7; c++) {
      if (state.board[0][c] === null) moves.push(c);
    }
    return moves;
  },

  makeMove(state, col) {
    const next = cloneState(state);
    const row = dropRow(next.board, col);
    if (row < 0) throw new Error('Column is full');
    next.board[row][col] = next.turn;
    next.history.push({ col, row, piece: next.turn });
    next.turn = next.turn === 'r' ? 'y' : 'r';

    const result = this.isGameOver(next);
    if (result.over) {
      next.result = result.winner;
      next.reason = result.reason;
    }

    return next;
  },

  isGameOver(state) {
    const board = state.board;
    const rows = 6;
    const cols = 7;

    // Check all directions for four in a row
    const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p = board[r][c];
        if (!p) continue;
        for (const [dr, dc] of dirs) {
          let count = 0;
          for (let i = 0; i < 4; i++) {
            const nr = r + dr * i;
            const nc = c + dc * i;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc] === p) {
              count++;
            }
          }
          if (count === 4) {
            return { over: true, winner: p, reason: 'Four in a row' };
          }
        }
      }
    }

    // Check draw
    for (let c = 0; c < cols; c++) {
      if (board[0][c] === null) return { over: false };
    }

    return { over: true, winner: 'draw', reason: 'Board is full' };
  },

  evaluate(state, color) {
    const opp = color === 'r' ? 'y' : 'r';
    const myLines = countLines(state.board, color);
    const oppLines = countLines(state.board, opp);

    let score = 0;
    score += myLines.fours * 10000;
    score += myLines.openThrees * 100;
    score += myLines.openTwos * 10;

    score -= oppLines.fours * 10000;
    score -= oppLines.openThrees * 100;
    score -= oppLines.openTwos * 10;

    // Center column preference
    const center = 3;
    for (let r = 0; r < 6; r++) {
      if (state.board[r][center] === color) score += 3;
      else if (state.board[r][center] === opp) score -= 3;
    }

    return color === 'y' ? -score : score;
  },

  aiBestMove(state, color, depth = 6) {
    const legal = this.getLegalMoves(state);
    if (legal.length === 0) return -1;

    const isMax = color === state.turn;
    let bestCol = legal[0];
    let bestScore = isMax ? -Infinity : Infinity;

    // Center-first ordering for better pruning
    const ordered = [...legal].sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3));

    for (const col of ordered) {
      const next = this.makeMove(state, col);
      const score = this._minimax(next, depth - 1, -Infinity, Infinity, !isMax);

      if (isMax) {
        if (score > bestScore) {
          bestScore = score;
          bestCol = col;
        }
      } else {
        if (score < bestScore) {
          bestScore = score;
          bestCol = col;
        }
      }
    }

    return bestCol;
  },

  _minimax(state, depth, alpha, beta, isMax) {
    const result = this.isGameOver(state);
    if (result.over) {
      if (result.winner === 'r') return 100000 + depth;
      if (result.winner === 'y') return -100000 - depth;
      return 0;
    }

    if (depth <= 0) return this.evaluate(state, 'r');

    const legal = this.getLegalMoves(state);
    if (legal.length === 0) return 0;

    const ordered = [...legal].sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3));

    if (isMax) {
      let value = -Infinity;
      for (const col of ordered) {
        const next = this.makeMove(state, col);
        value = Math.max(value, this._minimax(next, depth - 1, alpha, beta, false));
        alpha = Math.max(alpha, value);
        if (alpha >= beta) break;
      }
      return value;
    } else {
      let value = Infinity;
      for (const col of ordered) {
        const next = this.makeMove(state, col);
        value = Math.min(value, this._minimax(next, depth - 1, alpha, beta, true));
        beta = Math.min(beta, value);
        if (alpha >= beta) break;
      }
      return value;
    }
  },

  PIECE_VAL: { r: 1, y: 1 },

  getCaptureValue(piece) {
    return 0;
  },
};
