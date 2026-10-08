// worker/room.js — one Durable Object per online room. The room is the referee: it seats Red and Black, checks every
// move with the same rules as the page, runs the clocks, keeps the game in storage (players can close the tab and come
// back) and relays moves to everyone watching.
// Friendly rooms are opened by a link and seat whoever arrives first (by a random token kept in the browser).
// Ranked rooms are set up by the Lobby with two signed-in players; the result goes into D1 and moves both ratings.
import { DurableObject } from 'cloudflare:workers';
import XQ from '../src/xiangqi.js';
import HEROES from '../src/heroes.js';
import * as C from './clock.js';
import { rate } from './elo.js';

const fresh = () => ({
  seats: { 1: null, '-1': null }, moves: [], over: null, rematch: { 1: false, '-1': false }, game: 1,
  code: '', rated: false, info: { 1: null, '-1': null },     // info: { id, name, rating? } of a signed-in player
  tc: null, left: null, turnAt: 0, away: { 1: 0, '-1': 0 },  // clocks; when each ranked player lost their connection
  recorded: false, retryAt: 0,                                // ranked result written to D1 / when to try again
  drawOffer: 0, offeredAt: { 1: -99, '-1': -99 },             // side offering a draw now / ply of each side's last offer
  heroes: { 1: '', '-1': '' },                                // hero leading each side (heroes.js id, '' = the plain general)
});

// the signed-in user the router attached to the request (it strips anything a client sent under that name)
export function userOf(req) {
  try { const u = JSON.parse(decodeURIComponent(req.headers.get('x-user') || '')); return u && Number.isInteger(u.id) ? u : null; }
  catch (e) { return null; }
}

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.st = null;
    this.ctx.blockConcurrencyWhile(async () => { this.st = { ...fresh(), ...((await this.ctx.storage.get('st')) || {}) }; });
  }

  async fetch(req) {
    if (new URL(req.url).pathname === '/setup') return this.setup(await req.json());
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);            // hibernation: idle rooms cost nothing between moves
    server.serializeAttachment({ side: 0, user: userOf(req) });
    return new Response(null, { status: 101, webSocket: client });
  }

  // a ranked game between two players the Lobby paired (the public router only forwards /ws, so only the Lobby gets here)
  async setup({ code, info }) {
    const st = this.st;
    if (st.moves.length || st.seats[1] || st.seats[-1] || st.rated) return new Response('room taken', { status: 409 });
    const tc = C.CONTROLS[C.RANKED_TC];
    this.st = { ...fresh(), code, rated: true, info, seats: { 1: 'u' + info[1].id, '-1': 'u' + info[-1].id }, tc, left: C.fullClock(tc), turnAt: Date.now() };
    await this.save(); await this.schedule();
    return new Response('ok');
  }

  save() { return this.ctx.storage.put('st', this.st); }
  send(ws, o) { try { ws.send(JSON.stringify(o)); } catch (e) { } }
  sockets(except) { return this.ctx.getWebSockets().filter(w => w !== except); }
  broadcast(o, except) { const s = JSON.stringify(o); for (const w of this.sockets(except)) { try { w.send(s); } catch (e) { } } }
  sideOf(ws) { const a = ws.deserializeAttachment(); return a ? a.side : 0; }
  presence(except) {
    const p = { 1: false, '-1': false };
    for (const w of this.sockets(except)) { const s = this.sideOf(w); if (s) p[s] = true; }
    return p;
  }
  // clocks as of now, and a pending abort / abandon countdown (the clocks themselves show a coming loss on time)
  timing(now = Date.now()) {
    const d = C.deadline(this.st);
    return {
      clock: this.st.tc ? { left: C.leftNow(this.st, now), running: C.running(this.st) } : null,
      deadline: d && d.kind !== 'time' ? { kind: d.kind, side: d.side, ms: Math.max(0, d.at - now) } : null,
    };
  }
  stateFor(ws, extra = {}) {
    const { moves, over, rematch, rated, info, tc, drawOffer, heroes } = this.st;
    return { t: 'state', you: this.sideOf(ws), moves, over, rematch, rated, info, tc, drawOffer, heroes, players: this.presence(), ...this.timing(), ...extra };
  }
  // the game so far, replayed: position, earlier position keys, plies without a capture
  replay() {
    const pos = XQ.Pos.fromFen(XQ.START), keys = []; let quiet = 0;
    for (const m of this.st.moves) { keys.push(pos.key()); quiet = pos.make(m) ? 0 : quiet + 1; }
    return { pos, keys, quiet };
  }
  expired(d) { const b = this.replay().pos.b; return C.expire(d, side => C.canMate(b, side)); }

  async schedule() {
    const d = C.deadline(this.st), at = Math.min(d ? d.at : Infinity, this.st.retryAt || Infinity);
    if (at < Infinity) await this.ctx.storage.setAlarm(at); else await this.ctx.storage.deleteAlarm();
  }
  async alarm() {
    const st = this.st, now = Date.now(), d = C.deadline(st);
    if (d && now >= d.at) await this.finish(this.expired(d), now);
    else if (st.retryAt && now >= st.retryAt) {
      await this.record(); await this.save();
      if (st.recorded && st.over.delta) this.broadcast({ t: 'rated', delta: st.over.delta, rating: st.over.rating });
    }
    await this.schedule();
  }

  async finish(over, now = Date.now()) {
    const st = this.st;
    if (st.tc) st.left = C.leftNow(st, now);   // freeze the clocks where they stood
    st.over = over; st.drawOffer = 0;
    await this.record();
    await this.save(); await this.schedule();
    this.broadcast({ t: 'over', ...st.over, ...this.timing(now) });
  }
  // a finished ranked game → D1: the game row and both players' new ratings, in one transaction
  async record() {
    const st = this.st, db = this.env.DB;
    if (!st.rated || st.recorded || !st.over || st.over.reason === 'aborted') return;
    if (!db) { st.recorded = true; return; }
    try {
      const ids = [st.info[1].id, st.info[-1].id];
      const { results } = await db.prepare('SELECT id, rating, games FROM users WHERE id IN (?, ?)').bind(...ids).all();
      const R = results.find(u => u.id === ids[0]), B = results.find(u => u.id === ids[1]);
      if (!R || !B) { st.recorded = true; return; }
      const w = st.over.winner, d = rate(R, B, w);
      const upd = db.prepare('UPDATE users SET rating = rating + ?, games = games + 1, wins = wins + ?, draws = draws + ?, losses = losses + ? WHERE id = ?');
      await db.batch([
        db.prepare(`INSERT INTO games (room, red, black, winner, reason, plies, red_rating, black_rating, red_delta, black_delta, ended_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(st.code, R.id, B.id, w, st.over.reason, st.moves.length, R.rating, B.rating, d.red, d.black, Date.now()),
        upd.bind(d.red, +(w === 1), +(w === 0), +(w === -1), R.id),
        upd.bind(d.black, +(w === -1), +(w === 0), +(w === 1), B.id),
      ]);
      st.over = { ...st.over, delta: { 1: d.red, '-1': d.black }, rating: { 1: R.rating + d.red, '-1': B.rating + d.black } };
      st.recorded = true; st.retryAt = 0;
    } catch (e) {
      if (/UNIQUE/i.test(String(e && e.message))) { st.recorded = true; st.retryAt = 0; return; }   // written before a restart
      console.error('ranked result not saved', e);
      st.retryAt = Date.now() + 30000;
    }
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 512) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    const st = this.st, now = Date.now();
    const due = C.deadline(st);
    if (due && now >= due.at) await this.finish(this.expired(due), now);   // the alarm has not fired yet

    if (m.t === 'hello') {
      const a = ws.deserializeAttachment() || {}, user = a.user;
      let side = 0, dirty = false;
      if (st.rated) side = user ? (st.info[1].id === user.id ? 1 : st.info[-1].id === user.id ? -1 : 0) : 0;
      else {
        const token = typeof m.token === 'string' ? m.token.slice(0, 40) : '';
        if (token && st.seats[1] === token) side = 1;
        else if (token && st.seats[-1] === token) side = -1;
        else if (token && !st.seats[1]) { st.seats[1] = token; side = 1; dirty = true; }
        else if (token && !st.seats[-1]) { st.seats[-1] = token; side = -1; dirty = true; }
        if (side) {
          const info = user ? { id: user.id, name: user.name } : null;
          if (JSON.stringify(info) !== JSON.stringify(st.info[side])) { st.info[side] = info; dirty = true; }
        }
        // the player who opened the room picks the time control, before the first move
        if (side === 1 && !st.moves.length && !st.tc && C.CONTROLS[m.tc]) { st.tc = C.CONTROLS[m.tc]; st.left = C.fullClock(st.tc); dirty = true; }
      }
      if (side && st.away[side]) { st.away[side] = 0; dirty = true; }
      // each player brings their hero; once the game is under way it stays the one they started with
      const hero = HEROES.valid(m.hero) ? m.hero : '';
      if (side && st.heroes[side] !== hero && (!st.moves.length || !st.heroes[side])) { st.heroes = { ...st.heroes, [side]: hero }; dirty = true; }
      ws.serializeAttachment({ ...a, side });
      if (dirty) { await this.save(); await this.schedule(); }
      this.send(ws, this.stateFor(ws));
      this.broadcast({ t: 'presence', players: this.presence(), info: st.info, heroes: st.heroes, ...this.timing() }, ws);
      return;
    }
    const side = this.sideOf(ws);
    if (m.t === 'sync') { this.send(ws, this.stateFor(ws)); return; }

    if (m.t === 'move') {
      if (!side || st.over || !Number.isInteger(m.m) || m.ply !== st.moves.length) { this.send(ws, this.stateFor(ws)); return; }
      const { pos, keys, quiet } = this.replay();
      if (pos.turn !== side || !pos.legal().includes(m.m)) { this.send(ws, this.stateFor(ws)); this.send(ws, { t: 'error', msg: 'Nước đi không hợp lệ' }); return; }
      if (!C.charge(st, side, now)) {   // too late: the page already shows the move, so send it the real position
        await this.finish(this.expired({ kind: 'time', side }), now);
        this.send(ws, this.stateFor(ws));
        return;
      }
      keys.push(pos.key());
      const cap = pos.make(m.m);
      st.moves.push(m.m);
      if (st.drawOffer === -side) st.drawOffer = 0;   // playing on instead of answering turns the offer down
      const res = XQ.status(pos, keys, cap ? 0 : quiet + 1, st.moves);
      await this.save();
      this.broadcast({ t: 'move', m: m.m, ply: st.moves.length - 1, draw: st.drawOffer, ...this.timing(now) });
      if (res.over) await this.finish({ winner: res.winner, reason: res.reason }, now);
      else await this.schedule();
      return;
    }
    if (m.t === 'resign') {
      if (!side || st.over) return;
      await this.finish({ winner: -side, reason: 'resign' }, now);
      return;
    }
    // draw offers: 'draw' offers one, or accepts the opponent's; 'draw-no' turns it down
    if (m.t === 'draw') {
      if (!side || st.over) return;
      if (st.drawOffer === -side) { await this.finish({ winner: 0, reason: 'agreement' }, now); return; }
      if (st.drawOffer === side) return;
      let why = '';
      if (st.moves.length < 2) why = 'Chỉ cầu hòa được sau khi hai bên đã đi nước đầu';
      else if (st.moves.length - st.offeredAt[side] < 4) why = 'Bạn vừa cầu hòa. Đi thêm 2 nước rồi hãy cầu hòa lại';
      if (why) { this.send(ws, { t: 'error', msg: why }); this.send(ws, { t: 'draw', offer: st.drawOffer }); return; }
      st.drawOffer = side; st.offeredAt = { ...st.offeredAt, [side]: st.moves.length };
      await this.save();
      this.broadcast({ t: 'draw', offer: side });
      return;
    }
    if (m.t === 'draw-no') {
      if (!side || st.over || st.drawOffer !== -side) return;
      st.drawOffer = 0;
      await this.save();
      this.broadcast({ t: 'draw', offer: 0, declined: side });
      return;
    }
    if (m.t === 'rematch') {
      if (!side || !st.over || st.rated) return;   // ranked players look for a new opponent instead
      st.rematch[side] = true;
      if (st.rematch[1] && st.rematch[-1]) {
        // new game, the players swap colours and keep the time control
        const seats = { 1: st.seats[-1], '-1': st.seats[1] }, info = { 1: st.info[-1], '-1': st.info[1] }, heroes = { 1: st.heroes[-1], '-1': st.heroes[1] };
        this.st = { ...fresh(), seats, info, heroes, game: st.game + 1, tc: st.tc, left: C.fullClock(st.tc), turnAt: now };
        for (const w of this.ctx.getWebSockets()) { const a = w.deserializeAttachment(); if (a && a.side) w.serializeAttachment({ ...a, side: -a.side }); }
        await this.save(); await this.schedule();
        for (const w of this.ctx.getWebSockets()) this.send(w, this.stateFor(w, { fresh: true }));
        return;
      }
      await this.save();
      this.broadcast({ t: 'rematch', want: st.rematch });
    }
  }

  async webSocketClose(ws) { await this.left(ws); }
  async webSocketError(ws) { await this.left(ws); }
  async left(ws) {
    const st = this.st, side = this.sideOf(ws);
    if (side && st.rated && !st.over && !this.presence(ws)[side]) { st.away[side] = Date.now(); await this.save(); await this.schedule(); }
    this.broadcast({ t: 'presence', players: this.presence(ws), info: st.info, ...this.timing() }, ws);
  }
}
