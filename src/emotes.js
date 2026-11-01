// emotes.js — what a player can say across the board in an online room: a few set phrases, and their general's own
// battle cry. No free text, so nothing to filter. Shared by the page and the Worker, which only passes on ids it
// knows (room.js, sg-room.js).
'use strict';
const EMOTES = (() => {
  const LINES = [
    { id: 'chao', text: 'Xin chào!' },
    { id: 'may', text: 'Chúc may mắn!' },
    { id: 'hay', text: 'Nước hay!' },
    { id: 'oi', text: 'Ối chà!' },
    { id: 'nghi', text: 'Để ta tính đã…' },
    { id: 'nhanh', text: 'Mau lên nào!' },
    { id: 'da-ta', text: 'Đa tạ!' },
    { id: 'van-hay', text: 'Ván hay lắm!' },
  ];
  // each general's own words ('' = the plain general), in the spirit of what the histories and the novel give them
  const CRY = {
    '': 'Toàn quân, xung trận!',
    'quan-vu': 'Thanh Long đao đã sẵn, kẻ nào dám ra đây!',
    'truong-phi': 'Ta là Trương Dực Đức đây! Ai dám cùng ta quyết chiến?',
    'trieu-van': 'Ta là Thường Sơn Triệu Tử Long!',
    'gia-cat-luong': 'Mưu sự tại nhân, thành sự tại thiên.',
    'luu-bi': 'Lấy nhân nghĩa mà phục lòng người.',
    'tao-thao': 'Thà ta phụ người trong thiên hạ, chứ không để người trong thiên hạ phụ ta!',
    'ton-quyen': 'Giang Đông đâu dễ khuất phục!',
    'lu-bo': 'Người có Lữ Bố, ngựa có Xích Thố!',
    'hoang-trung': 'Tuổi già nhưng đao chưa cùn!',
    'ma-sieu': 'Cẩm Mã Siêu ở đây, kẻ nào dám địch!',
    'chu-du': 'Gió đông đã nổi, lửa đốt chiến thuyền!',
    'tu-ma-y': 'Kiên nhẫn chờ thời, thắng ắt về ta.',
    'ha-hau-uyen': 'Ba ngày năm trăm dặm, sáu ngày một nghìn!',
    'manh-hoach': 'Bắt ta bảy lần, ta vẫn chưa phục!',
    'khuong-duy': 'Kế chí Thừa tướng, Bắc phạt chưa thôi!',
    'chuc-dung': 'Phi đao của ta chưa trượt bao giờ!',
  };
  const byId = Object.fromEntries(LINES.map(l => [l.id, l]));
  const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);   // never toString and the like
  const GAP_MS = 2500;                       // one emote per player at most this often (the room enforces it)
  return {
    LINES, CRY, GAP_MS,
    valid: id => id === 'cry' || own(byId, id),
    // the words for an emote by a player leading with hero (an id from heroes.js, '' for none)
    text: (id, hero) => (id === 'cry' ? (own(CRY, hero) ? CRY[hero] : CRY['']) : own(byId, id) ? byId[id].text : ''),
  };
})();
if (typeof module === 'object' && module.exports) module.exports = EMOTES;
