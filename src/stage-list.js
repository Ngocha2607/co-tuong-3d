// stage-list.js — the stages a player can pick (stages.js builds them). Shared by the page and the Worker, which
// checks a stage saved to an account exists and, for one the campaign gives, has been earned.
'use strict';
const STAGE_LIST = (() => {
  // in the order of history; han: the character on the picker; campaign: earned in the campaign (campaign.js)
  const list = [
    { id: 'room', name: 'Quân trướng', han: '帳', note: 'Đêm trong trướng, đèn lồng đỏ, bụi bay trong ánh đèn.' },
    { id: 'dao-vien', name: 'Đào viên', han: '桃', note: 'Năm 184, vườn đào nhà Trương Phi: nơi ba anh em thề kết nghĩa.', campaign: true },
    { id: 'ho-lao', name: 'Hổ Lao quan', han: '虎', note: 'Năm 190, trước cửa ải Hổ Lao: Lưu Bị, Quan Vũ, Trương Phi đại chiến Lữ Bố.' },
    { id: 'truong-ban', name: 'Trường Bản', han: '橋', note: 'Năm 208, bên cầu Trường Bản: Trương Phi một mình chặn đại quân Tào Tháo.' },
    { id: 'xich-bich', name: 'Xích Bích', han: '赤', note: 'Năm 208, trên sông Trường Giang: hỏa công đốt chiến thuyền Tào Tháo dưới vách đá đỏ.' },
    { id: 'ngu-truong', name: 'Ngũ Trượng Nguyên', han: '星', note: 'Năm 234, đêm thu trong doanh trại Thục, một ngôi sao lớn rơi xuống.' },
    // the side stories (Ngoại truyện), earned in the campaign
    { id: 'dinh-quan', name: 'Định Quân Sơn', han: '山', note: 'Năm 219, trên đỉnh núi đối diện Định Quân Sơn: cờ đỏ phất lên là Hoàng Trung đổ xuống.', campaign: true },
    { id: 'nam-man', name: 'Nam Man', han: '蠻', note: 'Năm 225, rừng rậm phương Nam bên sông Lô: khí độc trên mặt nước, voi chiến và cột vật tổ.', campaign: true },
    { id: 'tay-thanh', name: 'Tây Thành', han: '琴', note: 'Năm 228, cổng thành mở toang, Khổng Minh gảy đàn trên lầu trước mười lăm vạn quân Tư Mã Ý.', campaign: true },
  ];
  const byId = Object.assign(Object.create(null), Object.fromEntries(list.map(s => [s.id, s])));
  return { list, byId, valid: id => typeof id === 'string' && id in byId };
})();
if (typeof module === 'object' && module.exports) module.exports = STAGE_LIST;
