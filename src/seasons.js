// seasons.js — ranked seasons: each quarter of the year in Vietnam's time (UTC+7) is a season, the first being the
// winter of 2026 (October to December). The leaderboards count a season's games; when it ends (worker/seasons.js,
// run by a cron trigger) the top ten of each board get a title for it, and every rating moves halfway back to 1200.
// Shared by the page and the Worker.
'use strict';
const SEASONS = (() => {
  const TZ = 7 * 3600e3, NAMES = ['Xuân', 'Hạ', 'Thu', 'Đông'];
  const FIRST = 2026 * 4 + 3;                               // quarters since year 0: the last of 2026
  const quarterOf = ms => { const d = new Date(ms + TZ); return d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3); };
  const of = (ms = Date.now()) => Math.max(1, quarterOf(ms) - FIRST + 1);
  const name = n => { const q = FIRST + n - 1; return `Mùa ${NAMES[q % 4]} ${Math.floor(q / 4)}`; };
  // the first instant of season n (season 1 counts from whenever ranked play began)
  const start = n => { const q = FIRST + n - 1; return Date.UTC(Math.floor(q / 4), (q % 4) * 3, 1) - TZ; };
  const end = n => start(n + 1);
  // the titles of a season's top ten: first, second and third, fourth to tenth; on each board
  const TIERS = [
    { tier: 1, upTo: 1, xq: 'Kỳ vương', sg: 'Bá chủ Tam Quốc' },
    { tier: 2, upTo: 3, xq: 'Á vương', sg: 'Kiêu hùng Tam Quốc' },
    { tier: 3, upTo: 10, xq: 'Thập đại cao thủ', sg: 'Thập đại kiêu hùng' },
  ];
  const tierOf = rank => TIERS.find(t => rank <= t.upTo) || null;
  const titleId = (n, tier, v) => `s:${n}:${tier}:${v}`;
  function title(id) {
    const m = /^s:(\d{1,4}):([123]):(xq|sg)$/.exec(String(id || ''));
    return m ? `${TIERS[m[2] - 1][m[3]]} ${name(+m[1])}` : '';
  }
  const MIN_GAMES = 10;                                      // ranked games in the season to be on its board
  // a rating carried into the next season: halfway back to 1200, halves rounded away from 1200 (as SQLite's ROUND
  // does in worker/seasons.js)
  const soften = r => { const d = (r - 1200) / 2; return 1200 + Math.sign(d) * Math.round(Math.abs(d)); };
  return { of, name, start, end, TIERS, tierOf, titleId, title, MIN_GAMES, soften };
})();
if (typeof module === 'object' && module.exports) module.exports = SEASONS;
