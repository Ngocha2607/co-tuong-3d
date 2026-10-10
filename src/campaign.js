// campaign.js — "Chinh chiến Tam Quốc": five chapters along the history of the Three Kingdoms, three battles each,
// then the "Ngoại truyện" (side stories): three harder chapters that go back to famous battles in between.
// Shared by the page and the Worker: the same judge() decides a battle on both sides (the Worker replays the moves
// a player sends before it records their stars), and the same rules say what is unlocked.
//   mate      a set position: checkmate within n moves (the puzzles are proven by test/campaign.test.js)
//   survive   hold out against an overwhelming attack for n of the enemy's moves
//   handicap  a whole game against the computer, one side short of pieces
//   duel      a whole game against the computer, nobody short of anything
// Stars: one for winning, one for winning without undo or hints, one for the battle's own extra goal.
'use strict';
const CAMPAIGN = (() => {
  const X = typeof XQ !== 'undefined' ? XQ : require('./xiangqi.js');

  // the computer's strength: same shape as the levels of the free game
  const AI = {
    easy: { time: 250, depth: 2, noise: true },
    normal: { time: 900, depth: 6 },
    hard: { time: 2600 },
    master: { time: 4500 },        // the side stories: as long a think as a phone can bear
    defend: { time: 1200 },        // puzzles: the best defence it can find
  };

  const CHAPTERS = [
    {
      id: 'c1', year: 184, name: 'Đào viên kết nghĩa', stage: 'dao-vien', foe: '', foeName: 'Giặc Khăn Vàng',
      intro: 'Giặc Khăn Vàng nổi dậy khắp nơi. Dưới gốc đào nhà Trương Phi, ba người thề cùng sinh tử, rồi lên đường dẹp loạn.',
      levels: [
        { id: '1-1', name: 'Lời thề vườn đào', type: 'mate', n: 1, side: 1, ai: 'defend', fen: '4k4/4a4/R2a5/9/9/9/9/4K4/9/9 w',
          story: 'Trận đầu tiên của huynh đệ: dồn Tướng địch vào góc cung, chỉ một nước là xong.' },
        { id: '1-2', name: 'Thao luyện binh mã', type: 'mate', n: 2, side: 1, ai: 'defend', fen: '3k5/4a4/b2N1a3/9/3R5/9/9/9/4K4/9 w',
          story: 'Xe và Mã phải phối hợp: một quân dồn, một quân chặn đường lui.' },
        { id: '1-3', name: 'Dẹp giặc Khăn Vàng', type: 'handicap', par: 45, side: 1, ai: 'easy', fen: '1nbakabn1/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w',
          story: 'Quân Khăn Vàng đông nhưng ô hợp, không có lấy một cỗ Xe. Hãy đánh một trận ra trò.' },
      ],
    },
    {
      id: 'c2', year: 190, name: 'Hổ Lao quan', stage: 'ho-lao', foe: 'lu-bo',
      intro: 'Mười tám lộ chư hầu kéo đến đánh Đổng Trác. Lữ Bố cưỡi Xích Thố trấn giữ cửa ải Hổ Lao, không ai địch nổi.',
      levels: [
        { id: '2-1', name: 'Tam anh chiến Lữ Bố', type: 'mate', n: 2, side: 1, ai: 'defend', fen: '5a3/9/b2k1a2b/5R3/2CN5/4p4/9/9/4K4/9 w',
          story: 'Lưu, Quan, Trương cùng xông vào: Xe, Mã, Pháo phải đánh như một.' },
        { id: '2-2', name: 'Giữ trận trước cửa ải', type: 'survive', n: 10, keep: 5, side: 1, ai: 'normal', fen: 'r1bakabnr/9/c1n4c1/p1p1p1p1p/9/9/2P1P4/1C7/9/RNBAKAB2 w',
          story: 'Quân ta mới đến, đội ngũ chưa đủ, Lữ Bố đã dàn quân xông trận. Coi chừng cỗ Pháo địch ngay từ nước đầu.' },
        { id: '2-3', name: 'Phá Hổ Lao', type: 'handicap', par: 50, side: 1, ai: 'normal', fen: '1nbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w',
          story: 'Lữ Bố đã núng, quân giữ ải thiếu một cỗ Xe. Thừa thắng phá cửa ải.' },
      ],
    },
    {
      id: 'c3', year: 208, name: 'Trường Bản', stage: 'truong-ban', foe: 'tao-thao',
      intro: 'Tào Tháo đem năm nghìn thiết kỵ đuổi theo Lưu Bị đến Đương Dương. Triệu Vân phá vây cứu A Đẩu, Trương Phi một mình đứng trên cầu Trường Bản.',
      levels: [
        { id: '3-1', name: 'Trương Phi trấn cầu', type: 'survive', n: 8, keep: 4, side: 1, ai: 'normal', fen: 'rnbakab1r/9/4c2c1/p1p1p3p/6p2/6n2/9/9/9/R1BAKAB2 w',
          story: 'Chỉ còn một cỗ Xe và vài quân giữ cung, kỵ binh Tào đã vượt sông. Hãy cầm cự cho đại quân rút lui.' },
        { id: '3-2', name: 'Triệu Vân cứu chúa', type: 'mate', n: 3, side: 1, ai: 'defend', fen: '5a3/4ak3/4b4/P8/4N4/9/2N6/9/9/3K5 w',
          story: 'Bảy lần xông vào, bảy lần phá ra: hai con ngựa của Triệu Vân phải mở đường giữa vòng vây.' },
        { id: '3-3', name: 'Rút về Hạ Khẩu', type: 'handicap', par: 50, side: -1, ai: 'normal', fen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/2BAKABNR w',
          story: 'Lần này bạn cầm quân Đen, đi sau. Quân truy kích của Tào Tháo đã mất một cỗ Xe và một con Mã ở cầu Trường Bản.' },
      ],
    },
    {
      id: 'c4', year: 208, name: 'Xích Bích', stage: 'xich-bich', foe: 'tao-thao',
      intro: 'Tào Tháo đem tám mươi vạn quân xuống Giang Nam. Tôn Quyền và Lưu Bị liên minh; Chu Du cầm quân, Gia Cát Lượng mượn gió đông.',
      levels: [
        { id: '4-1', name: 'Liên hoàn kế', type: 'mate', n: 3, side: 1, ai: 'defend', fen: '6n2/3k5/3aPa2b/8R/6b2/9/5C3/5K3/9/9 w',
          story: 'Chiến thuyền nhà Tào đã bị xích lại với nhau. Xe, Pháo, Tốt cùng siết, không để địch thoát.' },
        { id: '4-2', name: 'Hỏa thiêu chiến thuyền', type: 'mate', n: 2, side: 1, ai: 'defend', fen: '3a1a3/9/b1P2k3/9/2b1C4/9/9/4K4/9/C8 w',
          story: 'Gió đông đã nổi. Hai cỗ Pháo là hai mồi lửa, chỉ chờ châm đúng chỗ.' },
        { id: '4-3', name: 'Đại phá quân Tào', type: 'handicap', par: 55, side: 1, ai: 'hard', fen: 'rnbakabn1/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w',
          story: 'Lửa cháy rực sông, quân Tào rối loạn và thiếu một cỗ Xe. Nhưng Tào Tháo vẫn là tay cờ cao.' },
      ],
    },
    {
      id: 'c5', year: 234, name: 'Ngũ Trượng Nguyên', stage: 'ngu-truong', foe: 'tu-ma-y',
      intro: 'Lần Bắc phạt cuối cùng. Gia Cát Lượng đóng quân ở Ngũ Trượng Nguyên, Tư Mã Ý cố thủ không ra. Đêm ấy một ngôi sao lớn rơi xuống doanh trại.',
      levels: [
        { id: '5-1', name: 'Giữ vững doanh trại', type: 'survive', n: 12, keep: 4, side: 1, ai: 'hard', fen: 'rnbakab1r/9/6nc1/p1p1p1p1p/9/9/P3P3P/1C7/9/RNcAKAB2 w',
          story: 'Tư Mã Ý bất ngờ đánh úp, một cỗ Pháo đã lọt vào sát trại. Quân ta thiếu Xe, thiếu Mã: giữ cho được mười hai nước.' },
        { id: '5-2', name: 'Đèn thất tinh', type: 'mate', n: 3, side: 1, ai: 'defend', fen: '3a5/8C/P2a1k2b/6p1r/2b6/9/1NR6/9/9/3K5 w',
          story: 'Khổng Minh lập đàn, thắp bảy ngọn đèn cầu sao. Có khi một nước đi lặng lẽ lại quyết định cả thế trận.' },
        { id: '5-3', name: 'Trận cuối', type: 'handicap', par: 60, side: 1, ai: 'hard', fen: 'r1bakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w',
          story: 'Ván cờ cuối cùng với Tư Mã Ý, kỳ phùng địch thủ. Ngụy quân chỉ thiếu một con Mã, mọi nước đi đều phải tính kỹ.' },
      ],
    },
    // ---- Ngoại truyện: back to three famous battles, against the computer's longest think ----
    {
      id: 'c6', year: 219, name: 'Định Quân Sơn', stage: 'dinh-quan', foe: 'ha-hau-uyen', part: 'Ngoại truyện',
      intro: 'Lưu Bị tranh Hán Trung với Tào Tháo. Lão tướng Hoàng Trung theo kế Pháp Chính chiếm ngọn núi đối diện, chờ quân Hạ Hầu Uyên mỏi mệt rồi từ trên cao đổ xuống.',
      levels: [
        { id: '6-1', name: 'Pháp Chính phất cờ', type: 'mate', n: 3, side: 1, ai: 'defend', fen: '4ka3/9/R1C2a3/2C2P3/2b6/9/9/5A3/6p2/3K5 w',
          story: 'Pháp Chính đứng trên đỉnh núi chờ thời. Hai cỗ Pháo chung một đường như hai lá cờ hiệu: chỉ cần phất đúng lá cờ, quân Ngụy không còn đường lui.' },
        { id: '6-2', name: 'Lấy nhàn đợi mỏi', type: 'survive', n: 18, keep: 6, side: 1, ai: 'master', fen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/1NBAKABN1 w',
          story: 'Quân ta trên núi không có lấy một cỗ Xe, Hạ Hầu Uyên dốc toàn lực đánh lên. Giữ vững mười tám nước cho quân địch mỏi mệt.' },
        { id: '6-3', name: 'Chém Hạ Hầu Uyên', type: 'handicap', par: 60, side: 1, ai: 'master', fen: 'rnbakabnr/9/7c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w',
          story: 'Hoàng Trung từ trên núi đổ xuống như thác, quân Ngụy rối loạn, mất một cỗ Pháo. Nhưng Hạ Hầu Uyên vẫn là danh tướng, và máy nghĩ lâu hơn mọi trận trước.' },
      ],
    },
    {
      id: 'c7', year: 225, name: 'Nam chinh', stage: 'nam-man', foe: 'manh-hoach', part: 'Ngoại truyện',
      intro: 'Phương Nam nổi loạn. Gia Cát Lượng dẫn quân vượt sông Lô giữa tháng năm, khí độc bốc trên mặt nước, để bắt Mạnh Hoạch bảy lần, tha bảy lần, cho đến khi vua Nam Man thật lòng quy phục.',
      levels: [
        { id: '7-1', name: 'Vượt sông Lô', type: 'survive', n: 16, keep: 7, side: 1, ai: 'master', fen: 'r1bakab1r/9/1cn1c1n2/p1p1p1p1p/9/2P6/P3P1P1P/1C5C1/4A4/1NB1KAB2 w',
          story: 'Quân ta mới qua được nửa sông, Xe chưa sang, một con Mã còn kẹt bờ bên kia. Pháo của Mạnh Hoạch đã đặt giữa trận: cầm cự mười sáu nước.' },
        { id: '7-2', name: 'Hỏa thiêu Đằng giáp', type: 'mate', n: 3, side: 1, ai: 'defend', fen: '2bk5/9/b1C2a3/9/4C4/9/6R2/9/9/4KA3 w',
          story: 'Quân Đằng giáp đao thương không thủng. Khổng Minh nhử chúng vào hang Bàn Xà: phải dám đưa mồi, lửa mới bùng lên được.' },
        { id: '7-3', name: 'Thất cầm Mạnh Hoạch', type: 'duel', par: 70, side: 1, ai: 'master', fen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w',
          story: 'Lần thứ bảy đối mặt. Không ai chấp ai, quân hai bên đủ cả: thắng được ván này thì Mạnh Hoạch mới chịu phục.' },
      ],
    },
    {
      id: 'c8', year: 228, name: 'Không thành kế', stage: 'tay-thanh', foe: 'tu-ma-y', part: 'Ngoại truyện',
      intro: 'Lần Bắc phạt đầu tiên. Khổng Minh thu phục Khương Duy ở Thiên Thủy, nhưng Mã Tốc làm mất Nhai Đình. Tư Mã Ý kéo mười lăm vạn quân đến Tây Thành, nơi chỉ còn vài nghìn lính già.',
      levels: [
        { id: '8-1', name: 'Thu phục Khương Duy', type: 'mate', n: 3, side: 1, ai: 'defend', fen: '5kb2/1N2a4/8b/9/2R6/9/9/4K4/4A4/9 w',
          story: 'Khương Duy trí dũng song toàn, đánh thẳng thì không bắt được. Có khi phải lui một bước mới tiến được ba bước.' },
        { id: '8-2', name: 'Tiếng đàn trên thành', type: 'survive', n: 15, keep: 4, side: 1, ai: 'master', fen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/4P1P2/4C4/9/2BAKAB2 w',
          story: 'Cổng thành mở toang, trong thành chỉ còn một cỗ Pháo, hai tên lính và mấy quân giữ cung. Khổng Minh vẫn ung dung gảy đàn: giữ thành mười lăm nước, đừng để Tư Mã Ý nhìn ra sơ hở.' },
        { id: '8-3', name: 'Kỳ phùng địch thủ', type: 'duel', par: 70, side: -1, ai: 'master', fen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w',
          story: 'Tư Mã Ý đã lui quân, nhưng ván cờ giữa hai người chưa bao giờ dứt. Lần này bạn cầm quân Đen, đi sau, quân hai bên ngang nhau.' },
      ],
    },
  ];
  const LEVELS = CHAPTERS.flatMap(c => c.levels.map(l => Object.assign(l, { chapter: c.id })));
  const byId = Object.assign(Object.create(null), Object.fromEntries(LEVELS.map(l => [l.id, l])));
  const chapterById = Object.assign(Object.create(null), Object.fromEntries(CHAPTERS.map(c => [c.id, c])));
  const MAX_STARS = LEVELS.length * 3;

  // rewards: finishing a chapter (every battle won at least once), or collecting stars
  const TITLES = {
    'dao-vien': 'Huynh đệ kết nghĩa', 'ho-lao': 'Anh hùng Hổ Lao', 'truong-ban': 'Hổ tướng Trường Bản',
    'xich-bich': 'Đô đốc Xích Bích', 'ngu-truong': 'Ngọa Long', 'vo-song': 'Thiên hạ vô song',
    'dinh-quan': 'Lão tướng Định Quân', 'nam-man': 'Bình Nam đại tướng', 'tay-thanh': 'Thần cơ diệu toán', 'nhat-thong': 'Nhất thống thiên hạ',
  };
  const REWARDS = [
    { chapter: 'c1', title: 'dao-vien', stage: 'dao-vien' },
    { chapter: 'c2', title: 'ho-lao' },
    { chapter: 'c3', title: 'truong-ban' },
    { chapter: 'c4', title: 'xich-bich', hero: 'chu-du' },
    { chapter: 'c5', title: 'ngu-truong', hero: 'tu-ma-y' },
    { chapter: 'c6', title: 'dinh-quan', stage: 'dinh-quan', hero: 'ha-hau-uyen' },
    { chapter: 'c7', title: 'nam-man', stage: 'nam-man', hero: 'manh-hoach' },
    { chapter: 'c8', title: 'tay-thanh', stage: 'tay-thanh', hero: 'khuong-duy' },
    { stars: 15, hero: 'hoang-trung' },
    { stars: 30, hero: 'ma-sieu' },
    { stars: 45, title: 'vo-song' },             // every star of the first five chapters: kept at 45 for those who have it
    { stars: 60, hero: 'chuc-dung' },
    { stars: MAX_STARS, title: 'nhat-thong' },
  ];

  // ---------- deciding a battle ----------
  // Replays moves from the battle's position. → { over, win, reason, mine, theirs, pieces }
  // mine / theirs: moves made by the player / the computer; pieces: the player's pieces left besides the general.
  function judge(lv, moves) {
    const pos = X.Pos.fromFen(lv.fen), keys = [], seq = [];
    let quiet = 0, mine = 0, theirs = 0;
    const count = () => pos.b.reduce((n, p) => n + (Math.sign(p) === lv.side && Math.abs(p) !== X.K ? 1 : 0), 0);
    const done = (win, reason) => ({ over: true, win, reason, mine, theirs, pieces: count(), plies: seq.length });
    // one move's legality, without listing every legal move (the Worker replays whole games within its CPU budget)
    const legal = m => {
      const out = []; pos.gen(out, false);
      if (!out.includes(m)) return false;
      const c = pos.make(m), ok = !pos.checked(-pos.turn); pos.unmake(m, c);
      return ok;
    };
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i], mover = pos.turn;
      if (!Number.isInteger(m) || !legal(m)) return { over: true, win: false, reason: 'illegal', mine, theirs, pieces: count(), plies: seq.length };
      keys.push(pos.key());
      const cap = pos.make(m);
      seq.push(m); quiet = cap ? 0 : quiet + 1;
      if (mover === lv.side) mine++; else theirs++;
      const last = i === moves.length - 1;
      const st = X.status(pos, keys, quiet, seq);
      let end = null;
      if (st.over) end = done(lv.type === 'survive' ? st.winner !== -lv.side : st.winner === lv.side, st.reason);
      else if (lv.type === 'mate' && mover === lv.side && mine >= lv.n + 2) end = done(false, 'limit');
      else if (lv.type === 'survive' && mover !== lv.side && theirs >= lv.n) end = done(true, 'held');
      else if (seq.length >= 400) end = done(false, 'limit');
      if (end) return last ? end : { over: true, win: false, reason: 'illegal', mine, theirs, pieces: count(), plies: seq.length };
    }
    return { over: false, win: false, reason: '', mine, theirs, pieces: count(), plies: seq.length };
  }
  // the extra goal of a battle (the third star)
  const extra = (lv, r) => lv.type === 'mate' ? r.mine <= lv.n : lv.type === 'survive' ? r.pieces >= lv.keep : r.mine <= lv.par;
  function stars(lv, r, help) { return r.over && r.win ? 1 + (help ? 0 : 1) + (extra(lv, r) ? 1 : 0) : 0; }

  // ---------- what a player has opened ----------
  // progress: { [level id]: stars }
  function unlocked(progress) {
    const got = id => (progress && progress[id]) | 0;
    const total = LEVELS.reduce((n, l) => n + Math.min(3, got(l.id)), 0);
    const levels = new Set();
    LEVELS.forEach((l, i) => { if (i === 0 || got(LEVELS[i - 1].id) > 0) levels.add(l.id); });
    const chapters = new Set(CHAPTERS.filter(c => c.levels.every(l => got(l.id) > 0)).map(c => c.id));
    const heroes = new Set(), stages = new Set(), titles = [];
    for (const r of REWARDS) {
      if (r.chapter ? !chapters.has(r.chapter) : total < r.stars) continue;
      if (r.hero) heroes.add(r.hero);
      if (r.stage) stages.add(r.stage);
      if (r.title) titles.push(r.title);
    }
    return { total, levels, chapters, heroes, stages, titles };
  }
  // how a reward is earned, for locked heroes and stages
  function requirement(kind, id) {
    const r = REWARDS.find(x => x[kind] === id);
    if (!r) return '';
    return r.chapter ? `Hoàn thành chương ${chapterById[r.chapter].name} trong Chiến dịch` : `Đạt ${r.stars} sao trong Chiến dịch`;
  }

  // ---------- words for the page ----------
  function goal(lv) {
    if (lv.type === 'mate') return `Chiếu bí trong ${lv.n} nước`;
    if (lv.type === 'survive') return `Cầm cự ${lv.n} nước, không để bị chiếu bí`;
    return lv.side > 0 ? 'Thắng ván cờ (bạn cầm quân Đỏ, đi trước)' : 'Thắng ván cờ (bạn cầm quân Đen, đi sau)';
  }
  function starGoals(lv) {
    return [
      lv.type === 'mate' ? `Chiếu bí trong tối đa ${lv.n + 2} nước` : lv.type === 'survive' ? `Cầm cự đủ ${lv.n} nước` : 'Thắng ván cờ',
      'Không đi lại, không xem gợi ý',
      lv.type === 'mate' ? `Chiếu bí đúng ${lv.n} nước` : lv.type === 'survive' ? `Còn ít nhất ${lv.keep} quân (không tính Tướng)` : `Thắng trong ${lv.par} nước`,
    ];
  }
  const TYPE = { mate: ['Cờ thế', '勢'], survive: ['Thủ thành', '守'], handicap: ['Chấp quân', '讓'], duel: ['Quyết chiến', '決'] };

  const next = id => { const i = LEVELS.findIndex(l => l.id === id); return i >= 0 && i < LEVELS.length - 1 ? LEVELS[i + 1] : null; };
  return {
    AI, CHAPTERS, LEVELS, TITLES, REWARDS, MAX_STARS, TYPE,
    level: id => (typeof id === 'string' && id in byId ? byId[id] : null), chapter: id => chapterById[id] || null, next,
    judge, stars, extra, unlocked, requirement, goal, starGoals,
  };
})();
if (typeof module === 'object' && module.exports) module.exports = CAMPAIGN;
