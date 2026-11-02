// skins.js — the looks a player can give the board, their pieces and their warriors, and what opens each one.
// Shared by the page (models.js draws them, game.js offers them) and the Worker, which checks a look saved to an
// account has been earned. In a room each side's pieces and warriors wear their player's look; the board is the
// host's, as the stage is.
// Each look but the first of its kind is earned: campaign stars, a number of achievements, one achievement in
// particular, a top ten finish in a ranked season, or quest stars (quests.js: counted on the player's device).
'use strict';
const SKINS = (() => {
  const KINDS = {
    board: [
      { id: 'go', name: 'Gỗ', han: '木' },
      { id: 'son-mai', name: 'Sơn mài', han: '漆', need: { stars: 24 } },
      { id: 'ngoc', name: 'Ngọc bích', han: '玉', need: { ach: 'that-tinh' } },
      { id: 'dong', name: 'Đồng', han: '銅', need: { achs: 6 } },
    ],
    pieces: [
      { id: 'nga', name: 'Ngà', han: '牙' },
      { id: 'ngoc', name: 'Ngọc', han: '玉', need: { achs: 3 } },
      { id: 'dong', name: 'Đồng', han: '銅', need: { ach: 'bach-chien' } },
      { id: 'mun', name: 'Gỗ mun', han: '烏', need: { stars: 48 } },
      { id: 'son', name: 'Sơn son', han: '朱', need: { quests: 6 } },
    ],
    army: [
      { id: 'mau', name: 'Tô màu', han: '彩' },
      { id: 'tuong-dong', name: 'Tượng đồng', han: '銅', need: { achs: 10 } },
      { id: 'tuong-vang', name: 'Tượng vàng', han: '金', need: { season: true } },
    ],
  };
  const NAMES = Object.keys(KINDS);
  const byId = Object.fromEntries(NAMES.map(k => [k, Object.assign(Object.create(null), Object.fromEntries(KINDS[k].map(s => [s.id, s])))]));
  const valid = (kind, id) => NAMES.includes(kind) && typeof id === 'string' && id in byId[kind];
  const DEFAULT = Object.fromEntries(NAMES.map(k => [k, KINDS[k][0].id]));
  // a player's record: { stars (campaign), ach (ids of the achievements earned), season (a top ten finish) }
  function earned(kind, id, rec) {
    const n = (byId[kind][id] || {}).need;
    if (!n) return true;
    if (n.stars) return (rec.stars | 0) >= n.stars;
    if (n.ach) return rec.ach.has(n.ach);
    if (n.achs) return rec.ach.size >= n.achs;
    if (n.season) return !!rec.season;
    if (n.quests) return (rec.quests | 0) >= n.quests;
    return false;
  }
  function requirement(kind, id) {
    const n = (byId[kind][id] || {}).need;
    if (!n) return '';
    if (n.stars) return `Đạt ${n.stars} sao trong Chiến dịch`;
    if (n.achs) return `Đạt ${n.achs} thành tựu`;
    if (n.season) return 'Lọt vào top 10 một mùa giải xếp hạng';
    if (n.quests) return `Hoàn thành ${n.quests} nhiệm vụ tuần`;
    return n.ach === 'that-tinh' ? 'Thành tựu Thất tinh: phá Chân Long Kỳ Trận 7 ngày liên tiếp' : 'Thành tựu Thân kinh bách chiến: đánh 50 ván xếp hạng cờ tướng';
  }
  // the three looks travel and are stored as one string, 'board/pieces/army'; anything unknown falls back to the first
  const pack = s => NAMES.map(k => (s && valid(k, s[k]) ? s[k] : DEFAULT[k])).join('/');
  const unpack = str => { const p = String(str || '').split('/'); return Object.fromEntries(NAMES.map((k, i) => [k, valid(k, p[i]) ? p[i] : DEFAULT[k]])); };
  return { KINDS, NAMES, byId, valid, DEFAULT, earned, requirement, pack, unpack };
})();
if (typeof module === 'object' && module.exports) module.exports = SKINS;
