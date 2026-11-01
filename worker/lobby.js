// worker/lobby.js — the queues for ranked games: a single Durable Object every signed-in seeker connects to.
// Two queues: ordinary games ('xq'), where seekers are paired by rating (fits in elo.js), and Tam Quốc ('sg'), where
// three are matched by their Tam Quốc rating (trio). A match gets a fresh ranked room (code X + 7 characters, or Y + 7
// for Tam Quốc) with random seats; the pages are told the code and open it like any other room.
// It also keeps the list of open friendly rooms, the ranked games under way (to watch), and who is online: a signed-in
// page keeps a socket here ('hi'), through which friends challenge each other and hear of friend requests.
import { DurableObject } from 'cloudflare:workers';
import { userOf } from './room.js';
import { fits, trio } from './elo.js';
import { pick, pickLive, STALE_MS, LIVE_STALE_MS } from './rooms.js';
import { CONTROLS } from './clock.js';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = (first, n = 7) => first + Array.from(crypto.getRandomValues(new Uint8Array(n)), b => CHARS[b % CHARS.length]).join('');
export const CHALLENGE_MS = 45000;      // a challenge not answered by then is off (the pages show 30 seconds)
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export class Lobby extends DurableObject {
  async fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === '/room') return this.roomSays(await req.json());
    if (path === '/rooms') return Response.json(await this.openRooms(Object.fromEntries(new URL(req.url).searchParams)), { headers: { 'cache-control': 'no-store' } });
    if (path === '/live') return Response.json(await this.liveGames(new URL(req.url).searchParams.get('v')), { headers: { 'cache-control': 'no-store' } });
    // from api.js: who of these players is online, and news for one of them (a friend request)
    if (path === '/presence') return Response.json(this.presenceOf((await req.json()).ids || []));
    if (path === '/notify') { const b = await req.json(); for (const ws of this.pages(b.to)) this.send(ws, b.msg); return new Response('ok'); }
    const user = userOf(req);
    if (!user) return new Response('sign in first', { status: 401 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ user, since: 0, v: 'xq' });
    return new Response(null, { status: 101, webSocket: client });
  }

  send(ws, o) { try { ws.send(JSON.stringify(o)); } catch (e) { } }

  // ---------- the list of open friendly rooms ----------
  // Each room tells how it stands (hall.js listing) whenever that changes, or that it is gone. Every room is kept under
  // its own key ('r:<game>:<code>', so one room's news writes one small value however many rooms there are) and in
  // memory, where the menu's frequent questions are answered (rooms.js picks the page). Entries not heard of for
  // 3 hours are dropped: a room that went away without saying so.
  async roomMap() {
    if (!this.loading) this.loading = this.ctx.storage.list({ prefix: 'r:' }).then(m => { this.rooms = new Map(m); });
    await this.loading;
    return this.rooms;
  }
  async roomSays(r) {
    if (!r || typeof r.code !== 'string' || !/^[A-Z0-9]{4,8}$/.test(r.code) || !['xq', 'sg'].includes(r.v)) return new Response('bad', { status: 400 });
    const map = r.live ? await this.liveMap() : await this.roomMap(), key = `${r.live ? 'l' : 'r'}:${r.v}:${r.code}`;
    if (r.gone) { map.delete(key); await this.ctx.storage.delete(key); }
    else { const e = { ...r, at: Date.now() }; map.set(key, e); await this.ctx.storage.put(key, e); }
    return new Response('ok');
  }
  // ---------- the ranked games under way, to watch ----------
  // The Lobby writes one when it opens the room ('l:<game>:<code>', the players and their ratings); the room says when
  // the game is over. Entries not heard of for 2 hours are dropped (rooms.js LIVE_STALE_MS).
  async liveMap() {
    if (!this.liveLoading) this.liveLoading = this.ctx.storage.list({ prefix: 'l:' }).then(m => { this.live = new Map(m); });
    await this.liveLoading;
    return this.live;
  }
  async liveGames(v) {
    const map = await this.liveMap(), now = Date.now(), stale = [];
    for (const [k, r] of map) if (now - r.at > LIVE_STALE_MS) { map.delete(k); stale.push(k); }
    for (let i = 0; i < stale.length; i += 128) await this.ctx.storage.delete(stale.slice(i, i + 128));
    return pickLive([...map.values()], v === 'sg' ? 'sg' : 'xq', now);
  }
  async goesLive(room, v, players) { await this.roomSays({ code: room, v, live: true, players }); }

  async openRooms(q) {
    const map = await this.roomMap(), now = Date.now(), stale = [];
    for (const [k, r] of map) if (now - r.at > STALE_MS) { map.delete(k); stale.push(k); }
    for (let i = 0; i < stale.length; i += 128) await this.ctx.storage.delete(stale.slice(i, i + 128));   // at most 128 keys a call
    return pick([...map.values()], q, now);
  }
  // everyone searching in queue v, longest waiting first
  seekers(v) {
    return this.ctx.getWebSockets().map(ws => ({ ws, a: ws.deserializeAttachment() })).filter(s => s.a && s.a.since && (!v || (s.a.v || 'xq') === v))
      .sort((x, y) => x.a.since - y.a.since);
  }
  mark(s, since, v) { s.a = { ...s.a, since, ...(v ? { v } : {}) }; s.ws.serializeAttachment(s.a); }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 256) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const me = { ws, a: ws.deserializeAttachment() };
    if (!m || !me.a) return;
    if (m.t === 'seek') {
      // one search per player: a second tab takes over
      const v = m.v === 'sg' ? 'sg' : 'xq';
      for (const s of this.seekers()) if (s.ws !== ws && s.a.user.id === me.a.user.id) { this.mark(s, 0); this.send(s.ws, { t: 'cancelled', why: 'elsewhere' }); }
      if (!me.a.since || me.a.v !== v) this.mark(me, Date.now(), v);
      await this.pair();
    } else if (m.t === 'cancel') {
      this.mark(me, 0);
      this.send(ws, { t: 'cancelled' });
      await this.pair();
    } else if (m.t === 'hi' || m.t === 'status') {
      // a page saying it is here, and whether its player is in a game (tab: which page of theirs this is)
      const tab = typeof m.tab === 'string' ? m.tab.slice(0, 16) : me.a.tab || '';
      ws.serializeAttachment({ ...me.a, presence: true, tab, status: m.status === 'playing' ? 'playing' : 'online' });
    } else if (m.t === 'challenge') await this.challenge(me, m);
    else if (m.t === 'answer') await this.answer(me, m);
    else if (m.t === 'unchallenge') await this.unchallenge(me, m);
  }

  // ---------- who is online, and challenges between friends ----------
  // the pages a player has open here (all of them, or the one with that tab id)
  pages(id, tab) {
    return this.ctx.getWebSockets().filter(ws => { const a = ws.deserializeAttachment(); return a && a.presence && a.user.id === id && (!tab || a.tab === tab); });
  }
  // { [id]: 'online' | 'playing' } for those of ids who have a page open (free on any of their pages counts as free)
  presenceOf(ids) {
    const want = new Set(ids.map(Number)), out = {};
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (!a || !a.presence || !want.has(a.user.id)) continue;
      if (out[a.user.id] !== 'online') out[a.user.id] = a.status;
    }
    return out;
  }
  async friends(a, b) {
    if (!this.env.DB) return false;
    return !!(await this.env.DB.prepare('SELECT 1 AS x FROM friends WHERE user_id = ? AND friend_id = ? AND state = 1').bind(a, b).first());
  }
  // a friend is challenged to a game: every page of theirs hears of it; the challenge lives in storage, so a pause of
  // this object between the asking and the answer loses nothing
  async challenge(me, m) {
    const from = me.a.user, to = Number(m.to);
    const fail = why => this.send(me.ws, { t: 'challenge-fail', to, why });
    if (!Number.isInteger(to) || to === from.id) return;
    const targets = this.pages(to);
    if (!targets.length) { fail('offline'); return; }
    if (!(await this.friends(from.id, to))) { fail('not-friends'); return; }
    // challenges nobody answered are cleared away as new ones come
    const old = [...(await this.ctx.storage.list({ prefix: 'c:' }))].filter(([, v]) => Date.now() - v.at > CHALLENGE_MS).map(([k]) => k);
    if (old.length) await this.ctx.storage.delete(old.slice(0, 128));
    const c = {
      id: code('C'), to, fromTab: me.a.tab || '', at: Date.now(), tc: CONTROLS[m.tc] ? m.tc : '',
      from: { id: from.id, name: from.name, rating: from.rating, title: from.title || '' },
    };
    await this.ctx.storage.put('c:' + c.id, c);
    for (const ws of targets) this.send(ws, { t: 'challenged', id: c.id, from: c.from, tc: c.tc, ms: CHALLENGE_MS - 15000 });
    this.send(me.ws, { t: 'challenge-sent', id: c.id, to });
  }
  // the answer, from one of the challenged player's pages: off, or both into a new private friendly room (the one who
  // challenged opens it, so they hold the room and Red; the other follows a moment later)
  async answer(me, m) {
    const c = typeof m.id === 'string' && await this.ctx.storage.get('c:' + m.id);
    if (!c || c.to !== me.a.user.id) { this.send(me.ws, { t: 'challenge-over', id: m.id }); return; }
    await this.ctx.storage.delete('c:' + c.id);
    for (const ws of this.pages(c.to)) if (ws !== me.ws) this.send(ws, { t: 'challenge-over', id: c.id });
    const asker = this.pages(c.from.id, c.fromTab)[0] || this.pages(c.from.id)[0];   // the page that asked, or another of theirs
    if (Date.now() - c.at > CHALLENGE_MS || !asker) { this.send(me.ws, { t: 'challenge-over', id: c.id }); return; }
    if (!m.ok) { this.send(asker, { t: 'declined', id: c.id, by: me.a.user.name }); return; }
    const room = code('F', 5);
    this.send(asker, { t: 'go', id: c.id, room, tc: c.tc, host: true });
    this.send(me.ws, { t: 'go', id: c.id, room, tc: c.tc, host: false });
  }
  async unchallenge(me, m) {
    const c = typeof m.id === 'string' && await this.ctx.storage.get('c:' + m.id);
    if (!c || c.from.id !== me.a.user.id) return;
    await this.ctx.storage.delete('c:' + c.id);
    for (const ws of this.pages(c.to)) this.send(ws, { t: 'challenge-over', id: c.id, withdrawn: true });
  }
  async webSocketClose() { await this.pair(); }
  async webSocketError() { await this.pair(); }
  async alarm() { await this.pair(); }

  async pair() {
    if (this.pairing) return;            // setting up a room awaits another object; don't pair the same people twice
    this.pairing = true;
    try {
      const now = Date.now(), list = this.seekers('xq'), taken = new Set();
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
      // Tam Quốc: threes, each judged by their Tam Quốc rating
      for (;;) {
        const sg = this.seekers('sg').map(s => ({ s, user: { id: s.a.user.id, rating: s.a.user.sgRating || 1200 }, since: s.a.since }));
        const t = trio(sg, now);
        if (!t || !(await this.start3(t.map(x => x.s)))) break;
      }
      const left = this.seekers();
      for (const v of ['xq', 'sg']) { const q = left.filter(s => (s.a.v || 'xq') === v); for (const s of q) this.send(s.ws, { t: 'seeking', n: q.length }); }
      if (left.length) await this.ctx.storage.setAlarm(now + 2000); else await this.ctx.storage.deleteAlarm();
    } finally { this.pairing = false; }
  }

  async start(x, y) {
    const since = [x.a.since, y.a.since];
    this.mark(x, 0); this.mark(y, 0);
    const [red, black] = Math.random() < 0.5 ? [x, y] : [y, x];
    const seat = s => ({ id: s.a.user.id, name: s.a.user.name, rating: s.a.user.rating, title: s.a.user.title || '' });
    for (let i = 0; i < 4; i++) {
      const room = code('X');
      const r = await this.env.ROOMS.get(this.env.ROOMS.idFromName(room)).fetch('https://room/setup', {
        method: 'POST', body: JSON.stringify({ code: room, info: { 1: seat(red), '-1': seat(black) } }),
      });
      if (r.ok) {
        this.send(x.ws, { t: 'match', room }); this.send(y.ws, { t: 'match', room });
        await this.goesLive(room, 'xq', [seat(red), seat(black)]);
        return;
      }
    }
    this.mark(x, since[0]); this.mark(y, since[1]);   // could not open a room: back in the queue
  }
  // three Tam Quốc seekers into a ranked room, in random seats; false when no room could be opened
  async start3(list) {
    const since = list.map(s => s.a.since);
    for (const s of list) this.mark(s, 0);
    const seats = shuffle(list.slice());
    const info = seats.map(s => ({ id: s.a.user.id, name: s.a.user.name, rating: s.a.user.sgRating || 1200, title: s.a.user.title || '' }));
    for (let i = 0; i < 4; i++) {
      const room = code('Y');
      const r = await this.env.SGROOMS.get(this.env.SGROOMS.idFromName(room)).fetch('https://room/setup', { method: 'POST', body: JSON.stringify({ code: room, info }) });
      if (r.ok) {
        for (const s of list) this.send(s.ws, { t: 'match', room, v: 'sg' });
        await this.goesLive(room, 'sg', info);
        return true;
      }
    }
    list.forEach((s, i) => this.mark(s, since[i]));
    return false;
  }
}
