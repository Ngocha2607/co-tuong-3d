// titles.js — the words for a title worn by a player's name, whatever gave it: the campaign ('dao-vien' and the like,
// campaign.js), an achievement ('a:<id>', achievements.js) or a season's top ten ('s:<season>:<tier>:<board>',
// seasons.js). Shared by the page and the Worker.
'use strict';
const TITLES = (() => {
  const C = typeof CAMPAIGN !== 'undefined' ? CAMPAIGN : require('./campaign.js');
  const A = typeof ACHIEVEMENTS !== 'undefined' ? ACHIEVEMENTS : require('./achievements.js');
  const S = typeof SEASONS !== 'undefined' ? SEASONS : require('./seasons.js');
  const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
  const text = id => (own(C.TITLES, id) ? C.TITLES[id] : A.title(id) || S.title(id) || '');
  return { text };
})();
if (typeof module === 'object' && module.exports) module.exports = TITLES;
