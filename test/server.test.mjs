// server.test.mjs — `npm test`: the parts of the Worker that need no Cloudflare runtime:
// ratings, clock rules, Google token checks (against a key made here) and session cookies.
import assert from 'assert';
import * as elo from '../worker/elo.js';
import * as C from '../worker/clock.js';
import { verifyGoogle, makeSession, readSession, b64u, cookieOf } from '../worker/auth.js';

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
