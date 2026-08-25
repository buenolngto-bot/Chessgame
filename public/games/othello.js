const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],          [0, 1],
  [1, -1],  [1, 0], [1, 1],
];

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function opponent(color) {
  return color === 'b' ? 'w' : 'b';
}

function cloneBoard(board) {
  return board.map(row => row.slice());
}

function cloneState(state) {
  return {
    board: cloneBoard(state.board),
    turn: state.turn,
    history: state.history.slice(),
    result: state.result,
    reason: state.reason,
  };
}

function getFlips(board, row, col, color) {
  if (board[row][col] !== null) return [];
  const opp = opponent(color);
  const allFlips = [];
  for (const [dr, dc] of DIRECTIONS) {
    const flips = [];
    let r = row + dr;
    let c = col + dc;
    while (inBounds(r, c) && board[r][c] === opp) {
      flips.push([r, c]);
      r += dr;
      c += dc;
    }
    if (flips.length > 0 && inBounds(r, c) && board[r][c] === color) {
      allFlips.push(...flips);
    }
  }
  return allFlips;
}

function countPieces(board) {
  let b = 0, w = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell === 'b') b++;
      else if (cell === 'w') w++;
    }
  }
  return { b, w };
}

const CORNERS = [[0, 0], [0, 7], [7, 0], [7, 7]];

const EDGES = [];
for (let i = 0; i < 8; i++) {
  if (i === 0 || i === 7) {
    for (let j = 1; j < 7; j++) {
      EDGES.push([i, j]);
      EDGES.push([j, i]);
    }
  }
}

function countCorners(board, color) {
  let count = 0;
  for (const [r, c] of CORNERS) {
    if (board[r][c] === color) count++;
  }
  return count;
}

function countEdges(board, color) {
  let count = 0;
  for (const [r, c] of EDGES) {
    if (board[r][c] === color) count++;
  }
  return count;
}

function getMoves(board, color) {
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (getFlips(board, r, c, color).length > 0) {
        moves.push({ row: r, col: c });
      }
    }
  }
  return moves;
}

function evaluate(state, color) {
  const { board } = state;
  const opp = opponent(color);
  const pieces = countPieces(board);
  const pieceDiff = pieces[color] - pieces[opp];
  const cornerDiff = countCorners(board, color) - countCorners(board, opp);
  const edgeDiff = countEdges(board, color) - countEdges(board, opp);
  const myMoves = getMoves(board, color).length;
  const oppMoves = getMoves(board, opp).length;
  const mobilityDiff = myMoves - oppMoves;
  return pieceDiff * 1 + cornerDiff * 100 + edgeDiff * 5 + mobilityDiff * 10;
}

function minimax(state, depth, alpha, beta, maximizing, color) {
  if (depth === 0) {
    return { score: evaluate(state, color) };
  }

  const current = maximizing ? color : opponent(color);
  const moves = getMoves(state.board, current);

  if (moves.length === 0) {
    const passState = cloneState(state);
    passState.turn = opponent(current);
    const oppMoves = getMoves(passState.board, current);
    if (oppMoves.length === 0) {
      const pieces = countPieces(state.board);
      const myP = pieces[color];
      const oppP = pieces[opponent(color)];
      if (myP > oppP) return { score: 10000 + myP - oppP };
      if (myP < oppP) return { score: -10000 - oppP + myP };
      return { score: 0 };
    }
    return minimax(passState, depth - 1, alpha, beta, !maximizing, color);
  }

  let bestMove = moves[0];

  if (maximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      const newState = cloneState(state);
      const flips = getFlips(newState.board, move.row, move.col, current);
      newState.board[move.row][move.col] = current;
      for (const [r, c] of flips) {
        newState.board[r][c] = current;
      }
      newState.turn = opponent(current);
      const result = minimax(newState, depth - 1, alpha, beta, false, color);
      if (result.score > maxEval) {
        maxEval = result.score;
        bestMove = move;
      }
      alpha = Math.max(alpha, result.score);
      if (beta <= alpha) break;
    }
    return { score: maxEval, move: bestMove };
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      const newState = cloneState(state);
      const flips = getFlips(newState.board, move.row, move.col, current);
      newState.board[move.row][move.col] = current;
      for (const [r, c] of flips) {
        newState.board[r][c] = current;
      }
      newState.turn = opponent(current);
      const result = minimax(newState, depth - 1, alpha, beta, true, color);
      if (result.score < minEval) {
        minEval = result.score;
        bestMove = move;
      }
      beta = Math.min(beta, result.score);
      if (beta <= alpha) break;
    }
    return { score: minEval, move: bestMove };
  }
}

function isGameOver(state) {
  const bMoves = getMoves(state.board, 'b').length;
  const wMoves = getMoves(state.board, 'w').length;
  if (bMoves === 0 && wMoves === 0) {
    const pieces = countPieces(state.board);
    let winner, reason;
    if (pieces.b > pieces.w) {
      winner = 'b';
      reason = 'Black wins by piece count';
    } else if (pieces.w > pieces.b) {
      winner = 'w';
      reason = 'White wins by piece count';
    } else {
      winner = 'draw';
      reason = 'Draw - equal piece count';
    }
    return { over: true, winner, reason };
  }
  return { over: false };
}

export default {
  name: 'Othello',
  id: 'othello',
  cols: 8,
  rows: 8,

  startState() {
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    board[3][3] = 'w';
    board[3][4] = 'b';
    board[4][3] = 'b';
    board[4][4] = 'w';
    return { board, turn: 'b', history: [], result: null, reason: null };
  },

  getLegalMoves(state) {
    return getMoves(state.board, state.turn);
  },

  makeMove(state, pos) {
    const newState = cloneState(state);
    const flips = getFlips(newState.board, pos.row, pos.col, state.turn);
    if (flips.length === 0) return null;

    newState.board[pos.row][pos.col] = state.turn;
    for (const [r, c] of flips) {
      newState.board[r][c] = state.turn;
    }
    newState.history.push({ pos, flips: flips.map(([r, c]) => ({ row: r, col: c })), color: state.turn });

    const nextTurn = opponent(state.turn);
    const nextMoves = getMoves(newState.board, nextTurn);
    const curMoves = getMoves(newState.board, state.turn);

    if (nextMoves.length > 0) {
      newState.turn = nextTurn;
    } else if (curMoves.length > 0) {
      newState.turn = state.turn;
    } else {
      const gameResult = isGameOver(newState);
      newState.result = gameResult.winner;
      newState.reason = gameResult.reason;
    }

    return newState;
  },

  isGameOver,

  evaluate(state, color) {
    return evaluate(state, color);
  },

  aiBestMove(state, color, depth = 5) {
    const result = minimax(state, depth, -Infinity, Infinity, true, color);
    return result.move;
  },

  PIECE_VAL: { b: 1, w: 1 },

  getCaptureValue() {
    return 0;
  },
};
