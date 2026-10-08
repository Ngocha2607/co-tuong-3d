// heroes.js — the Three Kingdoms heroes a player can pick to lead their side: their general piece becomes that hero
// (models.js builds them), the rest of the army keeps the side's colours. Shared by the page and the Worker, which
// only checks that an id exists.
'use strict';
const HEROES = (() => {
  const list = [
    { id: 'quan-vu', name: 'Quan Vũ', han: '關', kingdom: 'Thục', look: 'Mặt đỏ, râu dài, áo xanh, Thanh Long Yển Nguyệt đao' },
    { id: 'truong-phi', name: 'Trương Phi', han: '張', kingdom: 'Thục', look: 'Râu hùm rậm, giáp đen, Trượng bát xà mâu' },
    { id: 'trieu-van', name: 'Triệu Vân', han: '趙', kingdom: 'Thục', look: 'Giáp bạc, mũ cắm lông trắng, ngân thương' },
    { id: 'gia-cat-luong', name: 'Gia Cát Lượng', han: '亮', kingdom: 'Thục', look: 'Áo trắng, khăn luân, quạt lông vũ' },
    { id: 'luu-bi', name: 'Lưu Bị', han: '劉', kingdom: 'Thục', look: 'Áo vàng, mũ miện, song cổ kiếm' },
    { id: 'tao-thao', name: 'Tào Tháo', han: '曹', kingdom: 'Ngụy', look: 'Áo tía, mũ quan, Ỷ Thiên kiếm' },
    { id: 'ton-quyen', name: 'Tôn Quyền', han: '孫', kingdom: 'Ngô', look: 'Râu tím, giáp xanh ngọc, mũ vàng' },
    { id: 'lu-bo', name: 'Lữ Bố', han: '呂', kingdom: '', look: 'Hai lông trĩ thật dài, Phương Thiên họa kích' },
  ];
  const byId = Object.assign(Object.create(null), Object.fromEntries(list.map(h => [h.id, h])));
  return { list, byId, valid: id => typeof id === 'string' && id in byId };
})();
if (typeof module === 'object' && module.exports) module.exports = HEROES;
