// worker/sg-room.js — one Durable Object per three-kingdom room (Tam Quốc). Like room.js it is the referee: it seats
// Shu, Wu and Wei, checks every move with the page's own rules (sanguo.js), runs the three clocks, keeps the game in
// storage and relays everything to everyone watching. Its rules live in sg-game.js.
// A kingdom that resigns, runs out of time or (ranked) stays away leaves the game and the other two play on; the game
// ends with one kingdom left, or drawn. Friendly rooms seat the first three browsers to arrive; ranked rooms are set
// up by the Lobby with three signed-in players, and their result moves the three Tam Quốc ratings.
import { DurableObject } from 'cloudflare:workers';
import SG from '../src/sanguo.js';
import HEROES from '../src/heroes.js';
import * as C from './clock.js';
import * as R from './sg-game.js';
import { rate3 } from './elo.js';
import { userOf } from './room.js';

const KINGDOMS = [0, 1, 2];

export class SgRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.st = null;
    this.ctx.blockConcurrencyWhile(async () => { this.st = { ...R.fresh(), ...((await this.ctx.storage.get('st')) || {}) }; });
  }

  async fetch(req) {
    if (new URL(req.url).pathname === '/setup') return this.setup(await req.json());
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ side: -1, user: userOf(req) });
    return new Response(null, { status: 101, webSocket: client });
  }

  // a ranked game between three players the Lobby matched (only the Lobby can reach /setup)
  async setup({ code, info }) {
    const st = this.st;
    if (st.hist.length || st.seats.some(Boolean) || st.rated) return new Response('room taken', { status: 409 });
    const tc = C.CONTROLS[C.RANKED_TC];
    this.st = { ...R.fresh(), code, rated: true, info, seats: info.map(u => 'u' + u.id), tc, left: R.fullClock(tc), turnAt: Date.now() };
    await this.save(); await this.schedule();
    return new Response('ok');
  }

  save() { return this.ctx.storage.put('st', this.st); }
  send(ws, o) { try { ws.send(JSON.stringify(o)); } catch (e) { } }
  sockets(except) { return this.ctx.getWebSockets().filter(w => w !== except); }
  broadcast(o, except) { const s = JSON.stringify(o); for (const w of this.sockets(except)) { try { w.send(s); } catch (e) { } } }
  sideOf(ws) { const a = ws.deserializeAttachment(); return a && a.side >= 0 ? a.side : -1; }
  presence(except) {
    const p = [false, false, false];
    for (const w of this.sockets(except)) { const s = this.sideOf(w); if (s >= 0) p[s] = true; }
    return p;
  }
  timing(now = Date.now()) {
    const d = R.deadline(this.st);
    return {
      clock: this.st.tc ? { left: R.leftNow(this.st, now), running: R.running(this.st) } : null,
      deadline: d && d.kind !== 'time' ? { kind: d.kind, side: d.side, ms: Math.max(0, d.at - now) } : null,
    };
  }
  stateFor(ws, extra = {}) {
    const { hist, over, rematch, rated, info, tc, heroes } = this.st;
    return { t: 'state', you: this.sideOf(ws), hist, over, rematch, rated, info, tc, heroes, players: this.presence(), ...this.timing(), ...extra };
  }

  async schedule() {
    const d = R.deadline(this.st), at = Math.min(d ? d.at : Infinity, this.st.retryAt || Infinity);
    if (at < Infinity) await this.ctx.storage.setAlarm(at); else await this.ctx.storage.deleteAlarm();
  }
  async alarm() {
    const st = this.st, now = Date.now(), d = R.deadline(st);
    if (d && now >= d.at) await this.expire(d, now);
    else if (st.retryAt && now >= st.retryAt) {
      await this.record(); await this.save();
      if (st.recorded && st.over.delta) this.broadcast({ t: 'rated', delta: st.over.delta, rating: st.over.rating });
    }
    await this.schedule();
  }
  // a deadline passed: nobody really started (the game is called off), or the kingdom to move leaves the game
  async expire(d, now) {
    if (d.kind === 'abort') await this.finish({ winner: -1, reason: 'aborted', places: [0, 0, 0], out: [] }, now);
    else await this.leave(d.side, d.kind, now);
  }

  // kingdom k leaves the game; the others play on unless that ends it
  async leave(k, why, now) {
    const st = this.st;
    if (st.over || !R.replay(st.hist).pos.alive[k]) return;
    R.freeze(st, now);
    st.hist.push({ out: k, why });
    const g = R.replay(st.hist);
    st.turn = g.pos.turn;
    await this.save();
    this.broadcast({ t: 'out', k, why, ply: st.hist.length - 1, ...this.timing(now) });
    const over = R.result(g);
    if (over) await this.finish(over, now); else await this.schedule();
  }
  async finish(over, now = Date.now()) {
    const st = this.st;
    if (st.tc) st.left = R.leftNow(st, now);
    st.over = over;
    await this.record();
    await this.save(); await this.schedule();
    this.broadcast({ t: 'over', ...st.over, ...this.timing(now) });
  }
  // a finished ranked game → D1: the game row and the three new Tam Quốc ratings, in one transaction
  async record() {
    const st = this.st, db = this.env.DB;
    if (!st.rated || st.recorded || !st.over || st.over.reason === 'aborted') return;
    if (!db) { st.recorded = true; return; }
    try {
      const ids = st.info.map(u => u.id);
      const { results } = await db.prepare('SELECT id, sg_rating AS rating, sg_games AS games FROM users WHERE id IN (?, ?, ?)').bind(...ids).all();
      const P = ids.map(id => results.find(u => u.id === id));
      if (P.some(u => !u)) { st.recorded = true; return; }
      const places = st.over.places, d = rate3(P, places);
      // a win is uniting the realm alone; still standing at a draw is a draw; having fallen is a loss
      const res = places.map(p => (p !== 1 ? 'l' : places.filter(q => q === 1).length === 1 ? 'w' : 'd'));
      const upd = db.prepare('UPDATE users SET sg_rating = sg_rating + ?, sg_games = sg_games + 1, sg_wins = sg_wins + ?, sg_draws = sg_draws + ?, sg_losses = sg_losses + ? WHERE id = ?');
      await db.batch([
        db.prepare(`INSERT INTO sg_games (room, p0, p1, p2, place0, place1, place2, reason, plies, rating0, rating1, rating2, delta0, delta1, delta2, ended_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(st.code, ...ids, ...places, st.over.reason, st.moves, ...P.map(u => u.rating), ...d, Date.now()),
        ...KINGDOMS.map(k => upd.bind(d[k], +(res[k] === 'w'), +(res[k] === 'd'), +(res[k] === 'l'), ids[k])),
      ]);
      st.over = { ...st.over, delta: d, rating: P.map((u, k) => u.rating + d[k]) };
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
    const due = R.deadline(st);
    if (due && now >= due.at) await this.expire(due, now);   // the alarm has not fired yet

    if (m.t === 'hello') {
      const a = ws.deserializeAttachment() || {}, user = a.user;
      let side = -1, dirty = false;
      if (st.rated) side = user ? st.info.findIndex(u => u.id === user.id) : -1;
      else {
        const token = typeof m.token === 'string' ? m.token.slice(0, 40) : '';
        if (token) {
          side = st.seats.indexOf(token);
          if (side < 0 && st.seats.indexOf(null) >= 0) { side = st.seats.indexOf(null); st.seats[side] = token; dirty = true; }
        }
        if (side >= 0) {
          const info = user ? { id: user.id, name: user.name, title: user.title || '' } : null;
          if (JSON.stringify(info) !== JSON.stringify(st.info[side])) { st.info[side] = info; dirty = true; }
        }
        // the player who opened the room picks the time control, before the first move
        if (side === 0 && !st.hist.length && !st.tc && C.CONTROLS[m.tc]) { st.tc = C.CONTROLS[m.tc]; st.left = R.fullClock(st.tc); dirty = true; }
      }
      if (side >= 0 && st.away[side]) { st.away[side] = 0; dirty = true; }
      const hero = HEROES.valid(m.hero) ? m.hero : '';
      if (side >= 0 && st.heroes[side] !== hero && (!st.hist.length || !st.heroes[side])) { st.heroes[side] = hero; dirty = true; }
      ws.serializeAttachment({ ...a, side });
      if (dirty) { await this.save(); await this.schedule(); }
      this.send(ws, this.stateFor(ws));
      this.broadcast({ t: 'presence', players: this.presence(), info: st.info, heroes: st.heroes, ...this.timing() }, ws);
      return;
    }
    const side = this.sideOf(ws);
    if (m.t === 'sync') { this.send(ws, this.stateFor(ws)); return; }

    if (m.t === 'move') {
      if (side < 0 || st.over || !Number.isInteger(m.m) || m.ply !== st.hist.length) { this.send(ws, this.stateFor(ws)); return; }
      if (st.seats.some(s => !s)) { this.send(ws, this.stateFor(ws)); this.send(ws, { t: 'error', msg: 'Chờ đủ ba người vào phòng rồi mới đi quân' }); return; }
      const g = R.replay(st.hist);
      if (g.pos.turn !== side || !g.pos.legal().includes(m.m)) { this.send(ws, this.stateFor(ws)); this.send(ws, { t: 'error', msg: 'Nước đi không hợp lệ' }); return; }
      if (!R.charge(st, side, now)) {   // too late: the page already shows the move, so send it the real position
        await this.leave(side, 'time', now);
        this.send(ws, this.stateFor(ws));
        return;
      }
      st.hist.push(m.m); st.moves++;
      const after = R.replay(st.hist);
      st.turn = after.pos.turn;
      await this.save();
      this.broadcast({ t: 'move', m: m.m, ply: st.hist.length - 1, ...this.timing(now) });
      const over = R.result(after);
      if (over) await this.finish(over, now); else await this.schedule();
      return;
    }
    if (m.t === 'resign') {
      if (side < 0 || st.over) return;
      await this.leave(side, 'resign', now);
      return;
    }
    if (m.t === 'rematch') {
      if (side < 0 || !st.over || st.rated) return;   // ranked players look for new opponents instead
      st.rematch[side] = true;
      if (st.rematch.every(Boolean)) {
        // new game: everyone moves one seat round the table (so each in turn gets to go first), clocks as before
        const turn = a => KINGDOMS.map(k => a[(k + 2) % 3]);
        this.st = { ...R.fresh(), seats: turn(st.seats), info: turn(st.info), heroes: turn(st.heroes), game: st.game + 1, tc: st.tc, left: R.fullClock(st.tc), turnAt: now };
        for (const w of this.ctx.getWebSockets()) { const a = w.deserializeAttachment(); if (a && a.side >= 0) w.serializeAttachment({ ...a, side: (a.side + 1) % 3 }); }
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
    if (side >= 0 && st.rated && !st.over && !this.presence(ws)[side]) { st.away[side] = Date.now(); await this.save(); await this.schedule(); }
    this.broadcast({ t: 'presence', players: this.presence(ws), info: st.info, ...this.timing() }, ws);
  }
}
