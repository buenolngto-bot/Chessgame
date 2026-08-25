/* Game Manager — bridges game engines with the app UI */
import connect4 from '/games/connect4.js';
import othello from '/games/othello.js';
import checkers from '/games/checkers.js';
import xiangqi from '/games/xiangqi.js';
import go from '/games/go.js';
import dama from '/games/dama.js';

const ENGINES = {
  connect4,
  othello,
  checkers,
  xiangqi,
  go,
  dama,
};

export function getEngine(gameId) {
  return ENGINES[gameId] || null;
}

export function listGames() {
  return Object.entries(ENGINES).map(([id, eng]) => ({
    id,
    name: eng.name,
    cols: eng.cols,
    rows: eng.rows,
  }));
}

/* ---- Generic renderers for non-chess games ---- */

export function renderConnect4(board, selSq) {
  let html = '';
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 7; c++) {
      const v = board[r][c];
      const cls = v === 'r' ? 'c4-red' : v === 'y' ? 'c4-yellow' : '';
      html += `<div class="sq c4-sq" data-sq="${r},${c}">
        <div class="c4-piece ${cls}"></div>
      </div>`;
    }
  }
  return html;
}

export function renderOthello(board, selSq) {
  let html = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const v = board[r][c];
      const cls = v === 'b' ? 'oth-black' : v === 'w' ? 'oth-white' : '';
      html += `<div class="sq oth-sq" data-sq="${r},${c}">
        ${v ? `<div class="oth-piece ${cls}"></div>` : ''}
      </div>`;
    }
  }
  return html;
}

export function renderCheckers(board, selSq) {
  let html = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const v = board[r][c];
      const isDark = (r + c) % 2 === 1;
      let cls = isDark ? 'dark' : 'light';
      let pieceCls = '';
      if (v === 'b') pieceCls = 'ck-black';
      else if (v === 'w') pieceCls = 'ck-white';
      else if (v === 'B') pieceCls = 'ck-black ck-king';
      else if (v === 'W') pieceCls = 'ck-white ck-king';
      html += `<div class="sq ${cls}" data-sq="${r},${c}">
        ${v ? `<div class="ck-piece ${pieceCls}"><span class="ck-inner">${(v||'').toUpperCase() === (v||'') && v ? '&#x265A;' : ''}</span></div>` : ''}
      </div>`;
    }
  }
  return html;
}

export function renderXiangqi(board, selSq) {
  const symbols = { K:'\u5C07', A:'\u58EB', B:'\u8C61', N:'\u9A6C', R:'\u8F66', C:'\u70AE', P:'\u5175' };
  let html = '';
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const v = board[r][c];
      const isRed = v && v.color === 'r';
      html += `<div class="sq xq-sq" data-sq="${r},${c}">
        ${v ? `<div class="xq-piece ${isRed ? 'xq-red' : 'xq-black'}">${symbols[v.type] || '?'}</div>` : ''}
      </div>`;
    }
  }
  return html;
}

export function renderGo(board, selSq) {
  let html = '';
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = board[r][c];
      const cls = v === 'b' ? 'go-black' : v === 'w' ? 'go-white' : '';
      html += `<div class="sq go-sq" data-sq="${r},${c}">
        ${v ? `<div class="go-piece ${cls}"></div>` : ''}
      </div>`;
    }
  }
  return html;
}

export function renderDama(board, selSq) {
  let html = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const v = board[r][c];
      const isDark = (r + c) % 2 === 1;
      let cls = isDark ? 'dark' : 'light';
      let pieceCls = '';
      if (v === 'b') pieceCls = 'dm-black';
      else if (v === 'w') pieceCls = 'dm-white';
      else if (v === 'B') pieceCls = 'dm-black dm-king';
      else if (v === 'W') pieceCls = 'dm-white dm-king';
      html += `<div class="sq ${cls}" data-sq="${r},${c}">
        ${v ? `<div class="dm-piece ${pieceCls}">${(v === 'B' || v === 'W') ? '&#x265A;' : ''}</div>` : ''}
      </div>`;
    }
  }
  return html;
}

export function renderGeneric8x8(board, selSq, styleFn) {
  let html = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const v = board[r][c];
      const { cls, piece } = styleFn(v, r, c);
      html += `<div class="sq ${cls}" data-sq="${r},${c}">${piece}</div>`;
    }
  }
  return html;
}
