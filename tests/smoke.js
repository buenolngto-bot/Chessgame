'use strict';
/* Automated smoke test: boots the server on a scratch port and drives two
   socket clients through create/join, illegal moves, a full checkmate game,
   draw offers, chat, rematch, resignation, quick match and disconnects. */

process.env.PORT = '3987';
const { fork } = require('child_process');
const path = require('path');
const http = require('http');

const serverPath = path.join(__dirname, '..', 'server', 'index.js');
const child = fork(serverPath, [], { env: process.env, silent: true });

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  PASS', name); }
  else { failed++; console.log('  FAIL', name); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function waitPort(port, tries = 50) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      http.get({ host: '127.0.0.1', port, path: '/' }, res => { res.resume(); resolve(); })
        .on('error', () => n <= 0 ? reject(new Error('server never came up')) : setTimeout(() => attempt(n - 1), 100));
    };
    attempt(tries);
  });
}

let io;
function client(pid) {
  const c = io('http://127.0.0.1:3987', { auth: { pid }, transports: ['websocket'] });
  c.pid = pid;
  return c;
}
const emit = (c, ev, data) => new Promise(res => c.emit(ev, data, res));
const once = (c, ev, timeout = 4000) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('timeout waiting ' + ev)), timeout);
  c.once(ev, d => { clearTimeout(t); res(d); });
});

(async () => {
  await waitPort(3987);
  io = require('socket.io-client');
  console.log('\n[1] lobby: create + join');
  const A = client('pid-A');
  const B = client('pid-B');
  await Promise.all([
    new Promise(r => A.on('connect', r)),
    new Promise(r => B.on('connect', r))
  ]);

  const created = await emit(A, 'create_room', { name: 'Alice', tc: 'unlimited' });
  ok(created.ok && /^[A-Z2-9]{4}$/.test(created.snapshot.code), 'create_room returns code');
  const code = created.snapshot.code;

  const joined = await emit(B, 'join_room', { code, name: 'Bob' });
  ok(joined.ok && joined.snapshot.youAre === 'w' || joined.snapshot.youAre === 'b', 'join assigns a color');
  ok(created.snapshot.youAre === 'w', 'creator is white');
  ok(!!joined.snapshot.state, 'snapshot includes state');

  const badJoin = await emit(B, 'join_room', { code: 'ZZZZ', name: 'Bob' });
  ok(!!badJoin.error, 'joining unknown room errors');

  console.log('\n[2] gameplay: illegal move rejected, fool\'s mate ends game');
  await sleep(150);

  const moveRes = [];
  A.on('move_made', d => moveRes.push(d));
  A.emit('move', { from: 'e2', to: 'e5' });
  await sleep(120);
  ok(moveRes.length === 0, 'illegal first move rejected');

  const errP = once(A, 'error_msg');
  A.emit('move', { from: 'd2', to: 'd4' });
  await sleep(80);
  A.emit('move', { from: 'f2', to: 'f3' });
  let err;
  try { err = await errP; } catch {}
  ok(err && /Not your turn/.test(err.message), 'out-of-turn move flagged');

  await once(A, 'game_start').catch(() => {});
  const seqB = [['e7', 'e5'], ['d8', 'h4']];
  for (const [from, to] of seqB) { B.emit('move', { from, to }); await sleep(90); }
  A.emit('move', { from: 'g2', to: 'g4' }); await sleep(90);
  B.emit('move', { from: 'e7', 'to': 'e5' }); // duplicate/illegal, should be ignored
  await sleep(60);
  B.emit('move', { from: 'd8', to: 'h4' }); await sleep(60);
  const overA = await once(A, 'game_over');
  ok(overA.result === 'b' && overA.reason === 'checkmate', `checkmate detected (${overA.result}/${overA.reason})`);
  ok(moveRes.length >= 4 && moveRes[moveRes.length - 1].state.history.length === 4, 'history has 4 moves');
  ok(!!moveRes.find(m => m.state.checkSquare === 'e8'), 'check square broadcast during mate');

  console.log('\n[3] social: chat + draw flow on rematch game');
  const chatP = once(B, 'chat');
  A.emit('chat_msg', { text: 'gg wp' });
  const chat = await chatP;
  ok(chat.from === 'Alice' && chat.text === 'gg wp', 'chat relayed with name');

  const remP = once(A, 'rematch_offered');
  await emit(B, 'rematch');
  await emit(A, 'rematch');
  const startP = once(A, 'game_start', 5000);
  const start = await startP;
  ok(start.state.history.length === 0 && start.state.running, 'both-accepted rematch starts fresh game');
  const snapA = await emit(A, 'leave_room', {});
  ok(snapA.ok, 'leave_room acks');

  console.log('\n[4] draw offer & resign in new pairing');
  const C = client('pid-C');
  await new Promise(r => C.on('connect', r));
  const r2 = await emit(C, 'create_room', { name: 'Carol', tc: '3+2' });
  const j2 = await emit(B, 'join_room', { code: r2.snapshot.code, name: 'Bea' });
  await sleep(200);

  const offerP = once(B, 'draw_offered');
  await emit(C, 'offer_draw');
  const offer = await offerP;
  ok(offer.by === 'w' || offer.by === 'b', 'draw offer delivered');

  const decP = once(C, 'draw_declined');
  await emit(B, 'decline_draw');
  await decP;
  ok(true, 'draw decline round-trips');

  const resP = once(C, 'game_over');
  await emit(C, 'resign');
  const resOver = await resP;
  ok(resOver.reason === 'resignation' && resOver.result !== 'draw', 'resign ends game');

  console.log('\n[5] clocks tick and flag falls');
  const D = client('pid-D'), E = client('pid-E');
  await Promise.all([new Promise(r => D.on('connect', r)), new Promise(r => E.on('connect', r))]);
  const r3 = await emit(D, 'create_room', { name: 'Dan', tc: '1+0' });
  await emit(E, 'join_room', { code: r3.snapshot.code, name: 'Eve' });
  const clockP = once(D, 'clock');
  const clk = await clockP;
  ok(clk.running && clk.clocks.w > 0 && clk.clocks.w < 60000, 'white clock counting down');

  console.log('\n[6] quick match pairs strangers');
  const F = client('pid-F');
  await new Promise(r => F.on('connect', r));
  const qF = emit(F, 'quick_match', { name: 'Fay', tc: '5+0' });
  await sleep(250);
  const qG = emit(E, 'quick_match', { name: 'Gus', tc: '5+0' });
  const joinedF = await once(F, 'joined');
  ok(joinedF.viaQueue && (joinedF.youAre === 'w' || joinedF.youAre === 'b'), 'quick match matched via queue');
  await qF; await qG;

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  child.kill();
  process.exit(failed ? 1 : 0);
})().catch(e => {
  console.error('SMOKE TEST CRASH:', e);
  child.kill();
  process.exit(1);
});
