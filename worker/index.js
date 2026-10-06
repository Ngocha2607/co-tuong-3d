// worker/index.js — Cloudflare deployment: static files + one Durable Object per online room.
// The room is the referee: it seats Red and Black, checks every move with the same rules as the page,
// keeps the game in storage (players can close the tab and come back) and relays moves to everyone watching.
import { DurableObject } from 'cloudflare:workers';
import XQ from '../src/xiangqi.js';

const ROOM_RE = /^[A-Z0-9]{4,8}$/;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      if ((req.headers.get('upgrade') || '').toLowerCase() !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
      const room = (url.searchParams.get('room') || '').toUpperCase();
      if (!ROOM_RE.test(room)) return new Response('Bad room code', { status: 400 });
      return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(req);
    }
    if (url.pathname === '/info') return Response.json({ online: true }, { headers: { 'cache-control': 'no-store' } });
    return env.ASSETS.fetch(req);
  },
};

const fresh = () => ({ seats: { 1: null, '-1': null }, moves: [], over: null, rematch: { 1: false, '-1': false }, game: 1 });

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.st = null;
    this.ctx.blockConcurrencyWhile(async () => { this.st = (await this.ctx.storage.get('st')) || fresh(); });
  }

  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);            // hibernation: idle rooms cost nothing between moves
    return new Response(null, { status: 101, webSocket: client });
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
  stateFor(ws, extra = {}) {
    const { moves, over, rematch } = this.st;
    return { t: 'state', you: this.sideOf(ws), moves, over, rematch, players: this.presence(), ...extra };
  }
  // the game so far, replayed: position, earlier position keys, plies without a capture
  replay() {
    const pos = XQ.Pos.fromFen(XQ.START), keys = []; let quiet = 0;
    for (const m of this.st.moves) { keys.push(pos.key()); quiet = pos.make(m) ? 0 : quiet + 1; }
    return { pos, keys, quiet };
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 512) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    const st = this.st;

    if (m.t === 'hello') {
      const token = typeof m.token === 'string' ? m.token.slice(0, 40) : '';
      let side = 0;
      if (token && st.seats[1] === token) side = 1;
      else if (token && st.seats[-1] === token) side = -1;
      else if (token && !st.seats[1]) { st.seats[1] = token; side = 1; await this.save(); }
      else if (token && !st.seats[-1]) { st.seats[-1] = token; side = -1; await this.save(); }
      ws.serializeAttachment({ side });
      this.send(ws, this.stateFor(ws));
      this.broadcast({ t: 'presence', players: this.presence() }, ws);
      return;
    }
    const side = this.sideOf(ws);
    if (m.t === 'sync') { this.send(ws, this.stateFor(ws)); return; }

    if (m.t === 'move') {
      if (!side || st.over || !Number.isInteger(m.m) || m.ply !== st.moves.length) { this.send(ws, this.stateFor(ws)); return; }
      const { pos, keys, quiet } = this.replay();
      if (pos.turn !== side || !pos.legal().includes(m.m)) { this.send(ws, this.stateFor(ws)); this.send(ws, { t: 'error', msg: 'Nước đi không hợp lệ' }); return; }
      keys.push(pos.key());
      const cap = pos.make(m.m);
      st.moves.push(m.m);
      const res = XQ.status(pos, keys, cap ? 0 : quiet + 1);
      if (res.over) st.over = { winner: res.winner, reason: res.reason };
      await this.save();
      this.broadcast({ t: 'move', m: m.m, ply: st.moves.length - 1 });
      return;
    }
    if (m.t === 'resign') {
      if (!side || st.over) return;
      st.over = { winner: -side, reason: 'resign' };
      await this.save();
      this.broadcast({ t: 'over', ...st.over });
      return;
    }
    if (m.t === 'rematch') {
      if (!side || !st.over) return;
      st.rematch[side] = true;
      if (st.rematch[1] && st.rematch[-1]) {
        // new game, the players swap colours
        const seats = { 1: st.seats[-1], '-1': st.seats[1] };
        this.st = { ...fresh(), seats, game: st.game + 1 };
        for (const w of this.ctx.getWebSockets()) { const s = this.sideOf(w); if (s) w.serializeAttachment({ side: -s }); }
        await this.save();
        for (const w of this.ctx.getWebSockets()) this.send(w, this.stateFor(w, { fresh: true }));
        return;
      }
      await this.save();
      this.broadcast({ t: 'rematch', want: st.rematch });
    }
  }

  async webSocketClose(ws) { this.broadcast({ t: 'presence', players: this.presence(ws) }, ws); }
  async webSocketError(ws) { this.broadcast({ t: 'presence', players: this.presence(ws) }, ws); }
}
