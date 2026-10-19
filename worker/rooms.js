// worker/rooms.js — the list of open friendly rooms (kept by lobby.js) as the menu asks for it: one game at a time,
// filtered, searched, a page at a time, with how many rooms each filter holds. Kept free of Workers APIs so `npm test`
// can run it. A room is as hall.js `listing` describes it, plus `at`, when it last told the Lobby how it stands.
export const STALE_MS = 3 * 3600e3, PAGE = 20, MAX_PAGE = 50;
export const FILTERS = ['open', 'playing', 'all'];

// a seat to take: in the hall and not yet full
export const isOpen = r => r.status === 'waiting' && r.seated < r.max;
// rooms with a free seat first, and among them the fullest (so rooms fill up and start), then the newest
export const order = (a, b) => (isOpen(b) - isOpen(a)) || (isOpen(a) ? b.seated - a.seated : 0) || b.at - a.at;

// q: { v: 'xq' | 'sg', f: one of FILTERS, q: text to look for in the code or the host's name, from, n }
// → { rooms: that page, total: rooms the filter holds, counts: { open, playing, all } } (counts follow the search)
export function pick(all, q, now) {
  const v = q.v === 'sg' ? 'sg' : 'xq', f = FILTERS.includes(q.f) ? q.f : 'all';
  const text = String(q.q || '').trim().toLowerCase().slice(0, 30);
  const from = Math.max(0, parseInt(q.from, 10) || 0);
  const n = Math.min(MAX_PAGE, Math.max(0, q.n == null || q.n === '' ? PAGE : parseInt(q.n, 10) || 0));
  const found = all.filter(r => r.v === v && now - r.at <= STALE_MS
    && (!text || r.code.toLowerCase().includes(text) || String(r.host || '').toLowerCase().includes(text)));
  const counts = { open: found.filter(isOpen).length, playing: found.filter(r => r.status === 'playing').length, all: found.length };
  const list = found.filter(r => f === 'all' || (f === 'open' ? isOpen(r) : r.status === 'playing')).sort(order);
  return { rooms: list.slice(from, from + n), total: list.length, counts };
}
