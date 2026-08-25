function deepCopy(state) {
  return {
    board: state.board.map(r => [...r]),
    turn: state.turn,
    history: state.history.map(h => ({
      from: { ...h.from },
      to: { ...h.to },
      captures: h.captures.map(c => ({ ...c })),
    })),
    result: state.result,
    reason: state.reason,
  };
}

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function isOwn(piece, color) {
  if (!piece) return false;
  return color === 'b' ? piece === 'b' || piece === 'B' : piece === 'w' || piece === 'W';
}

function isEnemy(piece, color) {
  if (!piece) return false;
  return color === 'b' ? piece === 'w' || piece === 'W' : piece === 'b' || piece === 'B';
}

function isKing(piece) {
  return piece === 'B' || piece === 'W';
}

function toKing(piece) {
  if (piece === 'b') return 'B';
  if (piece === 'w') return 'W';
  return piece;
}

function forwardDir(color) {
  return color === 'b' ? 1 : -1;
}

const ORTHOGONAL = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function getRegularMoves(board, r, c, color) {
  const moves = [];
  const piece = board[r][c];
  if (!piece || isKing(piece)) return moves;

  const fwd = forwardDir(color);

  // Forward, backward, left, right — regular pieces can move in all 4 orthogonal dirs by 1 step
  for (const [dr, dc] of ORTHOGONAL) {
    const nr = r + dr;
    const nc = c + dc;
    if (inBounds(nr, nc) && !board[nr][nc]) {
      moves.push({
        from: { row: r, col: c },
        to: { row: nr, col: nc },
        captures: [],
      });
    }
  }

  return moves;
}

function getKingMoves(board, r, c, color) {
  const moves = [];
  for (const [dr, dc] of ORTHOGONAL) {
    for (let step = 1; step <= 4; step++) {
      const nr = r + dr * step;
      const nc = c + dc * step;
      if (!inBounds(nr, nc)) break;
      if (board[nr][nc]) break;
      moves.push({
        from: { row: r, col: c },
        to: { row: nr, col: nc },
        captures: [],
      });
    }
  }
  return moves;
}

function getRegularCaptures(board, r, c, color, multiJump, visited) {
  const captures = [];
  const piece = board[r][c];
  if (!piece || isKing(piece)) return captures;

  for (const [dr, dc] of ORTHOGONAL) {
    const er = r + dr;
    const ec = c + dc;
    if (!inBounds(er, ec)) continue;
    if (!isEnemy(board[er][ec], color)) continue;

    const lr = r + dr * 2;
    const lc = c + dc * 2;
    if (!inBounds(lr, lc)) continue;
    if (board[lr][lc]) continue;

    const key = `${lr},${lc}`;
    if (visited.has(key)) continue;

    const newVisited = new Set(visited);
    newVisited.add(key);

    const subCaptures = getRegularCaptures(board, lr, lc, color, true, newVisited);

    if (subCaptures.length === 0) {
      captures.push({
        from: { row: r, col: c },
        to: { row: lr, col: lc },
        captures: [{ row: er, col: ec }],
      });
    } else {
      for (const sub of subCaptures) {
        captures.push({
          from: { row: r, col: c },
          to: sub.to,
          captures: [{ row: er, col: ec }, ...sub.captures],
        });
      }
    }
  }

  return captures;
}

function getKingCaptures(board, r, c, color, multiJump, visited) {
  const captures = [];
  for (const [dr, dc] of ORTHOGONAL) {
    let foundEnemy = false;
    for (let step = 1; step <= 4; step++) {
      const nr = r + dr * step;
      const nc = c + dc * step;
      if (!inBounds(nr, nc)) break;

      if (!foundEnemy) {
        if (isEnemy(board[nr][nc], color)) {
          foundEnemy = true;
        } else if (board[nr][nc]) {
          break;
        }
      } else {
        if (board[nr][nc]) break;

        const key = `${nr},${nc}`;
        if (visited.has(key)) continue;

        const newVisited = new Set(visited);
        newVisited.add(key);

        const subCaptures = getKingCaptures(board, nr, nc, color, true, newVisited);

        if (subCaptures.length === 0) {
          // Find the enemy piece position between (r,c) and (nr,nc)
          let er, ec;
          for (let s = 1; s < step; s++) {
            const tr = r + dr * s;
            const tc = c + dc * s;
            if (isEnemy(board[tr][tc], color)) {
              er = tr;
              ec = tc;
              break;
            }
          }
          captures.push({
            from: { row: r, col: c },
            to: { row: nr, col: nc },
            captures: [{ row: er, col: ec }],
          });
        } else {
          let er, ec;
          for (let s = 1; s < step; s++) {
            const tr = r + dr * s;
            const tc = c + dc * s;
            if (isEnemy(board[tr][tc], color)) {
              er = tr;
              ec = tc;
              break;
            }
          }
          for (const sub of subCaptures) {
            captures.push({
              from: { row: r, col: c },
              to: sub.to,
              captures: [{ row: er, col: ec }, ...sub.captures],
            });
          }
        }
      }
    }
  }
  return captures;
}

function getAllCaptures(board, r, c, color) {
  const piece = board[r][c];
  if (!piece) return [];
  const visited = new Set();
  if (isKing(piece)) {
    return getKingCaptures(board, r, c, color, false, visited);
  }
  return getRegularCaptures(board, r, c, color, false, visited);
}

function applyPromotion(board, toRow, toCol) {
  const newBoard = board.map(r => [...r]);
  const piece = newBoard[toRow][toCol];
  if (toRow === 7 && piece === 'b') {
    newBoard[toRow][toCol] = 'B';
  } else if (toRow === 0 && piece === 'w') {
    newBoard[toRow][toCol] = 'W';
  }
  return newBoard;
}

export default {
  name: 'Dama',
  id: 'dama',
  cols: 8,
  rows: 8,

  startState() {
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));

    for (let c = 0; c < 8; c++) {
      if (c % 2 === 0) {
        board[0][c] = 'b';
        board[2][c] = 'b';
        board[5][c] = 'w';
        board[7][c] = 'w';
      } else {
        board[1][c] = 'b';
        board[6][c] = 'w';
      }
    }

    return { board, turn: 'b', history: [], result: null, reason: null };
  },

  getLegalMoves(state) {
    const { board, turn } = state;
    const allCaptures = [];
    const allNormal = [];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (!isOwn(board[r][c], turn)) continue;
        const caps = getAllCaptures(board, r, c, turn);
        allCaptures.push(...caps);

        if (!isKing(board[r][c])) {
          allNormal.push(...getRegularMoves(board, r, c, turn));
        } else {
          allNormal.push(...getKingMoves(board, r, c, turn));
        }
      }
    }

    // Mandatory capture rule
    if (allCaptures.length > 0) return allCaptures;
    return allNormal;
  },

  makeMove(state, move) {
    const newState = deepCopy(state);
    const { board } = newState;
    const { from, to, captures } = move;

    let boardAfter = board.map(r => [...r]);

    // Move piece
    boardAfter[to.row][to.col] = boardAfter[from.row][from.col];
    boardAfter[from.row][from.col] = null;

    // Remove captured pieces
    for (const cap of captures) {
      boardAfter[cap.row][cap.col] = null;
    }

    // Promotion
    boardAfter = applyPromotion(boardAfter, to.row, to.col);

    newState.board = boardAfter;
    newState.turn = state.turn === 'b' ? 'w' : 'b';
    newState.history = [...state.history, move];

    return newState;
  },

  isGameOver(state) {
    const { board, turn } = state;

    let hasPiece = false;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (isOwn(board[r][c], turn)) {
          hasPiece = true;
          break;
        }
      }
      if (hasPiece) break;
    }

    if (!hasPiece) {
      return {
        over: true,
        winner: turn === 'b' ? 'w' : 'b',
        reason: `${turn === 'b' ? 'White' : 'Black'} wins — ${turn === 'b' ? 'Black' : 'White'} has no pieces.`,
      };
    }

    const moves = this.getLegalMoves(state);
    if (moves.length === 0) {
      return {
        over: true,
        winner: turn === 'b' ? 'w' : 'b',
        reason: `${turn === 'b' ? 'White' : 'Black'} wins — ${turn === 'b' ? 'Black' : 'White'} has no legal moves.`,
      };
    }

    if (state.history.length > 200) {
      return { over: true, winner: 'draw', reason: 'Draw — move limit reached.' };
    }

    return { over: false, winner: null, reason: null };
  },

  evaluate(state, color) {
    const { board } = state;
    let score = 0;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (!piece) continue;

        const pieceColor = piece === 'b' || piece === 'B' ? 'b' : 'w';
        const sign = pieceColor === color ? 1 : -1;

        if (isKing(piece)) {
          score += sign * 5;
          // Center control bonus for kings
          const centerDist = Math.abs(r - 3.5) + Math.abs(c - 3.5);
          if (centerDist <= 2) {
            score += sign * 3;
          }
        } else {
          score += sign * 1;
          // Advancement bonus
          if (pieceColor === 'b') {
            score += sign * (r / 7);
          } else {
            score += sign * ((7 - r) / 7);
          }
        }

        // Back row bonus
        if (pieceColor === 'b' && r === 0) score += sign * 1;
        if (pieceColor === 'w' && r === 7) score += sign * 1;
      }
    }

    return score;
  },

  aiBestMove(state, color, depth = 4) {
    const moves = this.getLegalMoves(state);
    if (moves.length === 0) return null;

    let bestMove = moves[0];
    let bestScore = -Infinity;

    for (const move of moves) {
      const newState = this.makeMove(state, move);
      const score = -this._minimax(newState, color === 'b' ? 'w' : 'b', color, depth - 1, -Infinity, Infinity);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  },

  _minimax(state, currentTurn, aiColor, depth, alpha, beta) {
    const gameOver = this.isGameOver(state);
    if (gameOver.over) {
      if (gameOver.winner === aiColor) return 1000 + depth;
      if (gameOver.winner === 'draw') return 0;
      return -1000 - depth;
    }

    if (depth <= 0) {
      return this.evaluate(state, aiColor);
    }

    const moves = this.getLegalMoves(state);
    if (moves.length === 0) {
      return currentTurn === aiColor ? -1000 - depth : 1000 + depth;
    }

    let best = -Infinity;

    for (const move of moves) {
      const newState = this.makeMove(state, move);
      const score = -this._minimax(newState, currentTurn === 'b' ? 'w' : 'b', aiColor, depth - 1, -beta, -alpha);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }

    return best;
  },

  PIECE_VAL: { b: 1, w: 1 },

  getCaptureValue(piece) {
    return 0;
  },
};
