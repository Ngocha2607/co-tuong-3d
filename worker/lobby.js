// worker/lobby.js — the queue for ranked games: a single Durable Object every signed-in seeker connects to.
// Seekers are paired by rating (fits in elo.js). A pair gets a fresh ranked room (code X + 7 characters) with random
// colours; both pages are told the code and open it like any other room.
import { DurableObject } from 'cloudflare:workers';
import { userOf } from './room.js';
import { fits } from './elo.js';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = () => 'X' + Array.from(crypto.getRandomValues(new Uint8Array(7)), b => CHARS[b % CHARS.length]).join('');

export class Lobby extends DurableObject {
  async fetch(req) {
    const user = userOf(req);
    if (!user) return new Response('sign in first', { status: 401 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ user, since: 0 });
    return new Response(null, { status: 101, webSocket: client });
  }

  send(ws, o) { try { ws.send(JSON.stringify(o)); } catch (e) { } }
  seekers() {
    return this.ctx.getWebSockets().map(ws => ({ ws, a: ws.deserializeAttachment() })).filter(s => s.a && s.a.since)
      .sort((x, y) => x.a.since - y.a.since);
  }
  mark(s, since) { s.a = { ...s.a, since }; s.ws.serializeAttachment(s.a); }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 256) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const me = { ws, a: ws.deserializeAttachment() };
    if (!m || !me.a) return;
    if (m.t === 'seek') {
      // one search per player: a second tab takes over
      for (const s of this.seekers()) if (s.ws !== ws && s.a.user.id === me.a.user.id) { this.mark(s, 0); this.send(s.ws, { t: 'cancelled', why: 'elsewhere' }); }
      if (!me.a.since) this.mark(me, Date.now());
      await this.pair();
    } else if (m.t === 'cancel') {
      this.mark(me, 0);
      this.send(ws, { t: 'cancelled' });
      await this.pair();
    }
  }
  async webSocketClose() { await this.pair(); }
  async webSocketError() { await this.pair(); }
  async alarm() { await this.pair(); }

  async pair() {
    if (this.pairing) return;            // setting up a room awaits another object; don't pair the same people twice
    this.pairing = true;
    try {
      const now = Date.now(), list = this.seekers(), taken = new Set();
      for (const x of list) {
        if (taken.has(x)) continue;
        let best = null;
        for (const y of list) {
          if (y === x || taken.has(y) || !fits(x.a, y.a, now)) continue;
          if (!best || Math.abs(x.a.user.rating - y.a.user.rating) < Math.abs(x.a.user.rating - best.a.user.rating)) best = y;
        }
        if (!best) continue;
        taken.add(x); taken.add(best);
        await this.start(x, best);
      }
      const left = this.seekers();
      for (const s of left) this.send(s.ws, { t: 'seeking', n: left.length });
      if (left.length) await this.ctx.storage.setAlarm(now + 2000); else await this.ctx.storage.deleteAlarm();
    } finally { this.pairing = false; }
  }

  async start(x, y) {
    const since = [x.a.since, y.a.since];
    this.mark(x, 0); this.mark(y, 0);
    const [red, black] = Math.random() < 0.5 ? [x, y] : [y, x];
    const seat = s => ({ id: s.a.user.id, name: s.a.user.name, rating: s.a.user.rating, title: s.a.user.title || '' });
    for (let i = 0; i < 4; i++) {
      const room = code();
      const r = await this.env.ROOMS.get(this.env.ROOMS.idFromName(room)).fetch('https://room/setup', {
        method: 'POST', body: JSON.stringify({ code: room, info: { 1: seat(red), '-1': seat(black) } }),
      });
      if (r.ok) { this.send(x.ws, { t: 'match', room }); this.send(y.ws, { t: 'match', room }); return; }
    }
    this.mark(x, since[0]); this.mark(y, since[1]);   // could not open a room: back in the queue
  }
}
