// server.test.mjs — `npm test`: the parts of the Worker that need no Cloudflare runtime:
// ratings, clock rules, Tam Quốc rooms, Google token checks (against a key made here) and session cookies.
import assert from 'assert';
import * as elo from '../worker/elo.js';
import * as C from '../worker/clock.js';
import { verifyGoogle, makeSession, readSession, b64u, cookieOf } from '../worker/auth.js';
import * as R from '../worker/sg-game.js';
import SG from '../src/sanguo.js';

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('ok   ', name); } catch (e) { failed++; console.log('FAIL ', name, '\n     ', e.message); }
}

await test('elo: equal players, decisive game, provisional K', () => {
  assert.deepStrictEqual(elo.rate({ rating: 1200, games: 0 }, { rating: 1200, games: 0 }, 1), { red: 20, black: -20 });
  assert.deepStrictEqual(elo.rate({ rating: 1200, games: 50 }, { rating: 1200, games: 50 }, -1), { red: -10, black: 10 });
  assert.deepStrictEqual(elo.rate({ rating: 1200, games: 50 }, { rating: 1200, games: 50 }, 0), { red: 0, black: 0 });
});
await test('elo: the favourite gains little, the underdog a lot', () => {
  const win = elo.rate({ rating: 1600, games: 50 }, { rating: 1200, games: 50 }, 1);
  const upset = elo.rate({ rating: 1600, games: 50 }, { rating: 1200, games: 50 }, -1);
  assert.ok(win.red > 0 && win.red < 3, JSON.stringify(win));
  assert.ok(upset.black > 17, JSON.stringify(upset));
  assert.strictEqual(elo.kFactor(2200, 100), 10);
});

const room = over => ({ moves: [], over: null, rated: true, tc: C.CONTROLS['10+5'], left: C.fullClock(C.CONTROLS['10+5']), turnAt: 0, away: { 1: 0, '-1': 0 }, ...over });
await test('clock: no clock before both first moves, abort deadline instead', () => {
  const st = room({ turnAt: 1000 });
  assert.strictEqual(C.running(st), 0);
  assert.deepStrictEqual(C.deadline(st), { at: 1000 + C.ABORT_MS, kind: 'abort', side: 1 });
  assert.deepStrictEqual(C.expire(C.deadline(st), () => true), { winner: 0, reason: 'aborted' });
  assert.strictEqual(C.deadline({ ...st, rated: false }), null);
});
await test('clock: charges the mover and adds the increment', () => {
  const st = room({ moves: [1, 2], turnAt: 0 });
  assert.strictEqual(C.running(st), 1);
  assert.ok(C.charge(st, 1, 20000));
  assert.strictEqual(st.left[1], 600000 - 20000 + 5000);
  assert.strictEqual(st.turnAt, 20000);
  st.moves.push(3);
  assert.deepStrictEqual(C.leftNow(st, 30000), { 1: 585000, '-1': 590000 });
});
await test('clock: a move after the flag fell does not count', () => {
  const st = room({ moves: [1, 2], turnAt: 0, left: { 1: 1000, '-1': 5000 } });
  assert.strictEqual(C.charge(st, 1, 1500), false);
  assert.deepStrictEqual(C.deadline(st), { at: 1000, kind: 'time', side: 1 });
  assert.deepStrictEqual(C.expire({ kind: 'time', side: 1 }, () => true), { winner: -1, reason: 'time' });
  assert.deepStrictEqual(C.expire({ kind: 'time', side: 1 }, () => false), { winner: 0, reason: 'time' });
});
await test('clock: a disconnected player loses after the abandon delay, counted from their turn', () => {
  const st = room({ moves: [1, 2, 3], turnAt: 50000, away: { 1: 0, '-1': 10000 } });
  assert.deepStrictEqual(C.deadline(st), { at: 50000 + C.ABANDON_MS, kind: 'abandon', side: -1 });
  assert.deepStrictEqual(C.expire(C.deadline(st)), { winner: 1, reason: 'abandon' });
});
await test('clock: only horses, chariots, cannons and soldiers can mate', () => {
  assert.ok(C.canMate([1, 2, 3, 4, -1], 1));
  assert.ok(!C.canMate([1, 2, 3, -1, -7], 1));
  assert.ok(C.canMate([1, 2, 3, -1, -7], -1));
});
await test('lobby: rating window widens with waiting time', () => {
  const a = { user: { id: 1, rating: 1200 }, since: 0 }, b = { user: { id: 2, rating: 1450 }, since: 0 };
  assert.ok(!elo.fits(a, b, 1000));
  assert.ok(elo.fits(a, b, 8000));
  assert.ok(!elo.fits(a, { ...a }, 60000), 'a player is never paired with themselves');
});

// ---------- Tam Quốc rooms ----------
await test('elo, three kingdoms: first gains, last loses, the middle evens out', () => {
  const p = [{ rating: 1200, games: 0 }, { rating: 1200, games: 0 }, { rating: 1200, games: 0 }];
  assert.deepStrictEqual(elo.rate3(p, [1, 2, 3]), [20, 0, -20]);
  assert.deepStrictEqual(elo.rate3(p, [1, 1, 3]), [10, 10, -20]);
  const strong = [{ rating: 1600, games: 50 }, { rating: 1200, games: 50 }, { rating: 1200, games: 50 }];
  const d = elo.rate3(strong, [3, 1, 2]);
  assert.ok(d[0] < -8 && d[1] > 5, JSON.stringify(d));
});
await test('lobby, three kingdoms: three who all fit, closest first; never the same player twice', () => {
  const s = (id, rating, since = 0) => ({ user: { id, rating }, since });
  assert.strictEqual(elo.trio([s(1, 1200), s(2, 1250)], 0), null);
  const t = elo.trio([s(1, 1200), s(2, 1290), s(3, 1210), s(4, 1220)], 0);
  assert.deepStrictEqual(t.map(x => x.user.id).sort(), [1, 3, 4]);
  assert.strictEqual(elo.trio([s(1, 1200), s(2, 1200), s(1, 1200)], 0), null);
  assert.ok(elo.trio([s(1, 1200), s(2, 1400), s(3, 1300)], 6000));    // the windows widen with waiting
});
await test('three-kingdom room: replay, a kingdom leaving, places', () => {
  const p0 = SG.Pos.start(), m0 = p0.legal()[0];
  let g = R.replay([m0]);
  assert.strictEqual(g.pos.turn, 1);
  g = R.replay([m0, { out: 1, why: 'resign' }]);
  assert.strictEqual(g.pos.turn, 2); assert.deepStrictEqual(g.out, [1]); assert.ok(!g.pos.alive[1]);
  assert.strictEqual(R.result(g), null);
  g = R.replay([m0, { out: 1, why: 'resign' }, { out: 2, why: 'time' }]);
  assert.deepStrictEqual(R.result(g), { winner: 0, reason: 'unite', places: [1, 3, 2], out: [1, 2] });
  assert.deepStrictEqual(R.places([true, true, false], [2]), [1, 1, 3]);
});
await test('three-kingdom room: clocks start after everyone moved once, then charge whoever is to move', () => {
  const st = { ...R.fresh(), rated: true, tc: C.CONTROLS['10+5'], left: R.fullClock(C.CONTROLS['10+5']), turnAt: 1000 };
  assert.strictEqual(R.running(st), -1);
  assert.deepStrictEqual(R.deadline(st), { at: 1000 + C.ABORT_MS, kind: 'abort', side: 0 });
  Object.assign(st, { moves: 3, turn: 0, turnAt: 0 });
  assert.strictEqual(R.running(st), 0);
  assert.ok(R.charge(st, 0, 20000));
  assert.deepStrictEqual(st.left, [600000 - 20000 + 5000, 600000, 600000]);
  st.turn = 1;
  assert.deepStrictEqual(R.leftNow(st, 30000), [585000, 590000, 600000]);
  assert.deepStrictEqual(R.deadline(st), { at: 20000 + 600000, kind: 'time', side: 1 });
  Object.assign(st, { left: [9000, 1000, 9000] });
  assert.strictEqual(R.charge(st, 1, 22000), false);
  st.away = [0, 21000, 0]; st.left = [9000, 600000, 9000];
  assert.deepStrictEqual(R.deadline(st), { at: 21000 + C.ABANDON_MS, kind: 'abandon', side: 1 });
});

// a stand-in for Google: our own RSA key signs the tokens
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1' };
const enc = new TextEncoder();
async function token(claims, kid = 'k1') {
  const part = o => b64u.enc(enc.encode(JSON.stringify(o)));
  const body = part({ alg: 'RS256', kid, typ: 'JWT' }) + '.' + part(claims);
  return body + '.' + b64u.enc(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, enc.encode(body)));
}
const now = 1_800_000_000_000, opts = { getKeys: async () => [jwk], now };
const good = { iss: 'https://accounts.google.com', aud: 'cid', sub: '42', exp: now / 1000 + 600, given_name: 'Hà' };
await test('google token: accepted when signed, addressed to us and fresh', async () => {
  assert.strictEqual((await verifyGoogle(await token(good), 'cid', opts)).sub, '42');
});
await test('google token: rejected when tampered, for another app, expired or from elsewhere', async () => {
  const t = await token(good), parts = t.split('.');
  const forged = parts[0] + '.' + b64u.enc(enc.encode(JSON.stringify({ ...good, sub: '1' }))) + '.' + parts[2];
  const cases = [
    [forged, 'cid', 'bad signature'], [t, 'other', 'bad audience'], [await token({ ...good, exp: now / 1000 - 3600 }), 'cid', 'expired'],
    [await token({ ...good, iss: 'evil.example' }), 'cid', 'bad issuer'], [await token(good, 'k2'), 'cid', 'unknown key'], ['a.b', 'cid', 'malformed token'],
  ];
  for (const [bad, aud, why] of cases) await assert.rejects(verifyGoogle(bad, aud, opts), new RegExp(why));
});
await test('session cookie: round trip, forgery and expiry', async () => {
  const s = await makeSession('secret', 7, now);
  assert.strictEqual(await readSession('secret', s, now), 7);
  assert.strictEqual(await readSession('other', s, now), 0);
  assert.strictEqual(await readSession('secret', s, now + 31 * 86400e3), 0);
  const [, sig] = s.split('.');
  assert.strictEqual(await readSession('secret', b64u.enc(enc.encode('{"u":1,"e":9999999999}')) + '.' + sig, now), 0);
  assert.strictEqual(await readSession('secret', 'garbage', now), 0);
  assert.strictEqual(cookieOf({ headers: new Headers({ cookie: 'a=1; ct_sid=xyz; b=2' }) }), 'xyz');
});

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall server tests passed');
