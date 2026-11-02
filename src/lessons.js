// lessons.js — learning to play (Học chơi): one lesson for each piece and one for checkmate, each a few small steps.
// A step is a position with Red to move and one move to find: take a piece, reach a point, or give mate. Touching a
// piece shows where it may go, so the steps teach how each one moves. test/lessons.test.js checks every step can be
// done, and not by just any move.
// Squares are [row, column]: row 0 is Black's back rank, row 9 Red's.
'use strict';
const LESSONS = (() => {
  const sq = ([r, c]) => r * 9 + c;
  // a position from the pieces on it (FEN letters: K A B N R C P, Black's in lower case), Red to move
  function fen(pieces) {
    const b = Array.from({ length: 10 }, () => Array(9).fill(''));
    for (const [p, r, c] of pieces) b[r][c] = p;
    return b.map(row => { let s = '', n = 0; for (const p of row) { if (p) { s += (n || '') + p; n = 0; } else n++; } return s + (n || ''); }).join('/') + ' w';
  }
  const kings = [['K', 9, 4], ['k', 0, 3]];              // the generals, kept off each other's file
  const step = (pieces, say, goal, why) => ({ fen: fen([...kings.filter(k => !pieces.some(p => p[0] === k[0])), ...pieces]), say, goal, why });
  const take = (...at) => ({ to: at.map(sq), take: true }), to = (...at) => ({ to: at.map(sq) }), MATE = { mate: true };

  const list = [
    { id: 'tuong', name: 'Tướng', han: '帥', steps: [
      step([['K', 9, 4]], 'Tướng đi ngang hay dọc từng ô theo đường kẻ, không ra khỏi cung (ô có gạch chéo). Đưa Tướng lên một ô.', to([8, 4]), 'Lên phía trước một ô.'),
      step([['K', 8, 4]], 'Hai Tướng không được nhìn thẳng mặt nhau trên một cột trống: ô bên trái bị cấm vì Tướng đen ở cột đó. Đưa Tướng sang ngang về bên phải.', to([8, 5]), 'Đi sang ngang, về bên phải.'),
    ] },
    { id: 'si', name: 'Sĩ', han: '仕', steps: [
      step([['A', 9, 3], ['p', 8, 4]], 'Sĩ đi chéo một ô trong cung. Tốt đen đang chiếu Tướng: dùng Sĩ ăn nó.', { ...take([8, 4]), from: sq([9, 3]) }, 'Lần này hãy dùng Sĩ.'),
      step([['A', 8, 4]], 'Sĩ không bao giờ ra khỏi cung (ô có gạch chéo). Đưa Sĩ lên góc trên bên phải của cung.', to([7, 5])),
    ] },
    { id: 'tuong-voi', name: 'Tượng', han: '相', steps: [
      step([['B', 9, 2], ['p', 7, 4]], 'Tượng đi chéo đúng hai ô, như hai đường chéo của chữ điền 田. Ăn con Tốt đen.', take([7, 4])),
      step([['B', 7, 4], ['P', 6, 5], ['p', 5, 2], ['n', 5, 6]], 'Có quân đứng ở giữa đường chéo (mắt Tượng) thì Tượng không đi được về hướng đó. Tượng cũng không qua sông. Ăn quân Tượng còn với tới.', take([5, 2]), 'Tốt đỏ đang cản mắt Tượng về phía Mã đen.'),
    ] },
    { id: 'ma', name: 'Mã', han: '傌', steps: [
      step([['N', 7, 4], ['p', 5, 3]], 'Mã đi một bước thẳng rồi một bước chéo, như chữ nhật 日. Ăn con Tốt đen.', take([5, 3])),
      step([['N', 7, 4], ['P', 6, 4], ['p', 5, 3], ['p', 8, 2]], 'Có quân đứng sát Mã theo hướng đi (chân Mã) thì Mã không nhảy về hướng đó. Ăn con Tốt mà Mã còn với tới.', take([8, 2]), 'Tốt đỏ đứng ngay trước Mã, chặn chân Mã đi lên.'),
    ] },
    { id: 'xe', name: 'Xe', han: '俥', steps: [
      step([['R', 7, 1], ['p', 2, 1]], 'Xe đi thẳng, dọc hay ngang, bao xa cũng được. Ăn con Tốt đen.', take([2, 1])),
      step([['R', 5, 0], ['P', 5, 4], ['n', 5, 7], ['c', 1, 0]], 'Xe không nhảy qua quân nào. Ăn quân Pháo đen.', take([1, 0]), 'Tốt đỏ chặn đường ngang tới Mã đen.'),
    ] },
    { id: 'phao', name: 'Pháo', han: '炮', steps: [
      step([['C', 7, 1], ['p', 4, 1], ['n', 2, 1]], 'Pháo đi như Xe. Nhưng muốn ăn quân, Pháo phải nhảy qua đúng một quân ở giữa (ngòi). Ăn quân Mã đen.', take([2, 1])),
      step([['C', 7, 4], ['P', 5, 4], ['r', 2, 4], ['n', 7, 8]], 'Không có ngòi thì Pháo không ăn được. Ăn quân Xe đen, Tốt đỏ làm ngòi.', take([2, 4]), 'Giữa Pháo và Mã đen không có ngòi nào.'),
    ] },
    { id: 'tot', name: 'Tốt', han: '兵', steps: [
      step([['P', 6, 2], ['p', 5, 2], ['n', 6, 3]], 'Tốt đi thẳng về phía trước từng ô một, không bao giờ lùi. Chưa qua sông thì chưa được đi ngang. Ăn con Tốt đen trước mặt.', take([5, 2]), 'Tốt chưa qua sông nên chưa ăn ngang được.'),
      step([['P', 4, 4], ['n', 4, 5]], 'Qua sông rồi, Tốt được đi thêm sang ngang. Ăn quân Mã đen bên cạnh.', take([4, 5])),
    ] },
    { id: 'chieu-bi', name: 'Chiếu bí', han: '將', steps: [
      step([['k', 0, 4], ['K', 9, 3], ['R', 1, 0], ['R', 3, 8]], 'Chiếu bí là chiếu Tướng mà Tướng không còn đường thoát: ai làm được là thắng. Một Xe giữ hàng dưới, Xe kia chiếu bí.', MATE, 'Tướng đen vẫn còn đường thoát.'),
      step([['k', 0, 4], ['n', 0, 3], ['n', 0, 5], ['K', 9, 3], ['P', 2, 4], ['R', 5, 4]], 'Tốt cũng chiếu bí được khi có quân giữ cho nó. Đẩy Tốt chiếu bí.', MATE, 'Tướng đen vẫn còn đường thoát.'),
    ] },
  ];
  const byId = Object.fromEntries(list.map(l => [l.id, l]));
  // did a move (from, to) reach the step's goal? status: XQ.status after it
  const done = (st, from, to, status) => (st.goal.mate ? status.over && status.winner === 1
    : st.goal.to.includes(to) && (st.goal.from === undefined || st.goal.from === from));
  return { list, byId, done, fen };
})();
if (typeof module === 'object' && module.exports) module.exports = LESSONS;
