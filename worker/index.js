// worker/index.js — Cloudflare deployment: static files, the accounts API, one Durable Object per online room
// (room.js) and one for the ranked queue (lobby.js).
import { api, authReady, currentUser } from './api.js';
import { RANKED_TC } from './clock.js';
export { Room } from './room.js';
export { Lobby } from './lobby.js';

const ROOM_RE = /^[A-Z0-9]{4,8}$/;

// pass the signed-in user on to a Durable Object; whatever a client put in this header is dropped
function withUser(req, user) {
  const h = new Headers(req.headers);
  h.delete('x-user');
  if (user) h.set('x-user', encodeURIComponent(JSON.stringify({ id: user.id, name: user.name, rating: user.rating })));
  return new Request(req, { headers: h });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname;
    if (p === '/ws' || p === '/ws/lobby') {
      if ((req.headers.get('upgrade') || '').toLowerCase() !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
      let user = null;
      try { user = await currentUser(req, env); } catch (e) { console.error('session lookup failed', e); }
      if (p === '/ws/lobby') {
        if (!user) return new Response('Sign in first', { status: 401 });
        return env.LOBBY.get(env.LOBBY.idFromName('lobby')).fetch(withUser(req, user));
      }
      const room = (url.searchParams.get('room') || '').toUpperCase();
      if (!ROOM_RE.test(room)) return new Response('Bad room code', { status: 400 });
      return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(withUser(req, user));
    }
    if (p === '/info') {
      const accounts = authReady(env);
      return Response.json({ online: true, accounts, clientId: accounts ? env.GOOGLE_CLIENT_ID : '', ranked: RANKED_TC }, { headers: { 'cache-control': 'no-store' } });
    }
    if (p.startsWith('/api/') || p.startsWith('/auth/')) {
      try { return await api(req, env, url); }
      catch (e) { console.error(e); return Response.json({ error: 'server error' }, { status: 500 }); }
    }
    return env.ASSETS.fetch(req);
  },
};
