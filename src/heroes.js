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
    // earned in the campaign (campaign.js says how)
    { id: 'hoang-trung', name: 'Hoàng Trung', han: '黃', kingdom: 'Thục', look: 'Lão tướng tóc bạc râu trắng, đại đao và cung', campaign: true },
    { id: 'ma-sieu', name: 'Mã Siêu', han: '馬', kingdom: 'Thục', look: 'Giáp bạc, mũ đầu sư tử, thương dài', campaign: true },
    { id: 'chu-du', name: 'Chu Du', han: '周', kingdom: 'Ngô', look: 'Đô đốc trẻ, giáp đỏ sẫm, mũ cắm lông đỏ', campaign: true },
    { id: 'tu-ma-y', name: 'Tư Mã Ý', han: '懿', kingdom: 'Ngụy', look: 'Áo đen, mũ quan cao, râu bạc, kiếm', campaign: true },
    { id: 'ha-hau-uyen', name: 'Hạ Hầu Uyên', han: '淵', kingdom: 'Ngụy', look: 'Giáp thép xanh, mũ mào đỏ, song đao: vị tướng hành quân thần tốc', campaign: true },
    { id: 'manh-hoach', name: 'Mạnh Hoạch', han: '孟', kingdom: '', look: 'Vua Nam Man: da ngăm, mũ lông chim, áo da hổ, đại đao', campaign: true },
    { id: 'khuong-duy', name: 'Khương Duy', han: '維', kingdom: 'Thục', look: 'Tướng trẻ giáp xanh lam, mũ tua đỏ, thương dài: người kế thừa Khổng Minh', campaign: true },
    { id: 'chuc-dung', name: 'Chúc Dung', han: '祝', kingdom: '', look: 'Nữ tướng Nam Man, vợ Mạnh Hoạch: tóc búi cài lông chim, phi đao', campaign: true },
  ];
  const byId = Object.assign(Object.create(null), Object.fromEntries(list.map(h => [h.id, h])));
  return { list, byId, valid: id => typeof id === 'string' && id in byId };
})();
if (typeof module === 'object' && module.exports) module.exports = HEROES;
