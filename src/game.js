// game.js — the match: menu, playing against the computer (search in a Web Worker), the campaign's battles and the
// daily puzzle, online rooms over a WebSocket to the Cloudflare Worker, the move list, banners and the end screen;
// and the review of a finished game, move by move with the computer's verdicts (REVIEW, review.js).
// VIEW draws, XQ rules, CAMPAIGN judges the battles and CAMPAIGN_UI keeps their progress, DAILY_UI the daily puzzle's.
// The three-kingdom game (SG, sanguo.js) is played on this device (each kingdom a person or the computer) or online in
// a three-seat room.
'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const LEVELS = [
    { name: 'Dễ', time: 250, depth: 2, noise: true },
    { name: 'Thường', time: 900, depth: 6 },
    { name: 'Khó', time: 2600 },
  ];
  const SIDE = { 1: 'Đỏ', '-1': 'Đen' }, ARMY = { 1: 'Thục', '-1': 'Ngụy' };
  const REASON = { checkmate: 'Chiếu bí', stalemate: 'Hết nước đi', repetition: 'Lặp lại thế cờ ba lần', quiet: '60 nước liền không ăn quân', resign: 'Xin thua', agreement: 'Hai bên đồng ý hòa' };
  const TC = ['', '10+5', '5+3'], TC_NAME = { '600000+5000': '10 phút + 5s', '300000+3000': '5 phút + 3s' };

  const G = {
    mode: 'menu', pos: XQ.Pos.fromFen(XQ.START), moves: [], keys: [], log: [], quiet: 0, captured: [],
    me: 1, level: 1, over: null, sel: -1, targets: [], thinking: false, animating: 0,
    room: '', ws: null, you: 0, players: { 1: false, '-1': false }, rematch: { 1: false, '-1': false }, online: false,
    rated: false, info: { 1: null, '-1': null }, tc: null, clock: null, deadline: null, wantTc: '',
    heroes: { 1: '', '-1': '' },              // hero leading each side (heroes.js), '' = the plain general
    skins: {}, boardSkin: '',                 // online: each side's looks (skins.js, packed) and the room's board
    fen0: XQ.START,                           // where this game started (a campaign battle has its own position)
    lv: null, help: false,                    // campaign: the battle, and whether undo or a hint was used
  };
  const vsAI = () => G.mode === 'ai' || G.mode === 'campaign';
  // heroes and stages given by the campaign can be used once earned (the others are always free)
  const heroAllowed = id => !id || (HEROES.valid(id) && (!HEROES.byId[id].campaign || CAMPAIGN_UI.unlocked().heroes.has(id)));
  const stageAllowed = id => STAGES.valid(id) && (!STAGES.byId[id].campaign || CAMPAIGN_UI.unlocked().stages.has(id));
  const myHero = () => heroAllowed(pref.hero) ? pref.hero : '';
  const myStage = () => stageAllowed(pref.stage) ? pref.stage : 'room';
  // looks (skins.js) open with the campaign's stars, achievements and a top ten season finish
  const skinRecord = () => ({ stars: CAMPAIGN_UI.unlocked().total, ach: ACH_UI.earned, season: !!(ACCOUNT.user && (ACCOUNT.user.titles || []).some(t => String(t).startsWith('s:'))) });
  const skinAllowed = (kind, id) => SKINS.valid(kind, id) && SKINS.earned(kind, id, skinRecord());
  function mySkins() { const s = SKINS.unpack(pref.skin); for (const k of SKINS.NAMES) if (!skinAllowed(k, s[k])) s[k] = SKINS.DEFAULT[k]; return s; }
  // a signed-in player's hero and stage follow them: each pick is saved to the account
  const savePick = fields => { if (ACCOUNT.user) ACCOUNT.save(fields).catch(e => toast(e.status === 403 ? e.message : 'Chưa lưu được lựa chọn lên tài khoản')); };
  let pref = { side: 1, level: 1, army: false, tc: 0, hero: '', stage: 'room', skin: '', panelMin: false, sgSeats: [0, 1, 1], sgLevel: 1, sgTc: 0, game: 'xq', muteEmotes: false };
  try { pref = Object.assign(pref, JSON.parse(localStorage.getItem('cotuong_pref')) || {}); } catch (e) { }
  if (!Array.isArray(pref.sgSeats) || pref.sgSeats.length !== 3 || pref.sgSeats.some(v => v !== 0 && v !== 1)) pref.sgSeats = [0, 1, 1];
  if (!HEROES.valid(pref.hero)) pref.hero = '';
  if (!STAGES.valid(pref.stage)) pref.stage = 'room';
  const savePref = () => { try { localStorage.setItem('cotuong_pref', JSON.stringify(pref)); } catch (e) { } };

  // ---------- game record ----------
  // cờ úp (jieqi.js) against the computer or in a friendly room: G.deal is known here only against the computer;
  // G.turns keeps what each move turned up ({ r, c }), which is all a room tells
  const jqOn = () => G.variant === 'jq' && (G.mode === 'ai' || G.mode === 'online');
  function reset() { G.pos = jqOn() ? JQ.start() : XQ.Pos.fromFen(G.fen0); G.moves = []; G.keys = []; G.log = []; G.quiet = 0; G.captured = []; G.turns = []; G.over = null; }
  function record(m, info) {
    const pos = G.pos, side = Math.sign(pos.b[XQ.from(m)]);
    let text, cap, turned = 0;
    G.keys.push(pos.key());
    if (pos.dark) {
      info = info || (G.deal ? JQ.reveals(pos, m, G.deal) : { r: 0, c: 0 });
      text = JQ.notation(pos, m, info);
      ({ cap, turned } = JQ.apply(pos, m, info));
      G.turns.push(info);
    } else { text = XQ.notation(pos, m); cap = pos.make(m); }
    G.moves.push(m); G.log.push({ text, side, cap });
    if (cap) G.captured.push(cap);
    G.quiet = cap || turned ? 0 : G.quiet + 1;            // turning a piece up can't be undone either
    return cap;
  }
  function rebuild(moves, turns = G.turns) { const t = turns.slice(); reset(); moves.forEach((m, i) => record(m, t[i])); }
  // the position as the computer is given it: an ordinary game from its start and moves; cờ úp as it stands now,
  // without the deal
  const aiJob = () => (G.pos.dark ? { fen: G.pos.fen(), moves: [], keys: G.keys.slice(), dark: JQ.darkList(G.pos) } : { fen: G.fen0, moves: G.moves.slice() });
  const kingOf = side => G.pos.kings[side > 0 ? 0 : 1];
  const legalFrom = s => G.pos.legal().filter(m => XQ.from(m) === s).map(XQ.to);

  // animations run one after another, in the order the moves were made
  let chain = Promise.resolve();
  const enqueue = fn => { G.animating++; chain = chain.then(fn).catch(e => console.error(e)).then(() => { G.animating--; if (!G.animating) updateStatus(); }); return chain; };

  // apply a move to the record now, animate it when its turn comes
  // info: in a room's game of cờ úp, what the move turned up, as the room told it (the player's own move too, which
  // waits for the room: only the room knows the deal)
  function commit(m, fast, info) {
    // against the clock the animations cost the player time: no close-ups, and none at all when time runs short
    const timed = G.mode === 'online' && !!G.clock;
    const opts = { fast: fast || (timed && G.you && clockOf(G.you) < 60000), closeUp: !timed };
    const mover = G.pos.turn;
    if (timed && mover === G.you && !info) { G.clock.left[mover] = clockOf(mover); G.clock.running = 0; G.clock.at = performance.now(); }   // the server's reply restarts it
    if (G.mode === 'online' && mover === G.you && G.drawOffer === -G.you) G.drawOffer = 0;   // playing on turns the offer down
    G.sent = 0;
    record(m, info);
    if (G.pos.dark || info) { const t = G.turns[G.turns.length - 1]; opts.reveal = t.r; opts.taken = t.c; }
    const st = XQ.status(G.pos, G.keys, G.quiet, G.moves), turn = G.pos.turn, king = kingOf(turn), gen = G.gen;
    renderMoves();
    enqueue(async () => {
      if (gen !== G.gen) return;                           // a new game started meanwhile
      await VIEW.play(m, opts);
      if (gen !== G.gen) return;
      VIEW.check(-1);
      if (G.mode === 'lesson') { lessonJudge(m, st); return; }
      if (G.mode === 'campaign') { const r = CAMPAIGN.judge(G.lv, G.moves); if (r.over) { endCampaign(r); return; } }
      if (st.over) { endGame(st); return; }
      if (st.check) { VIEW.check(king); VIEW.alarm(king); VIEW.heroShadow(mover); SFX.drum(); banner('Chiếu tướng!', 'check'); }
      if (st.repeat === 1) toast('Thế cờ lặp lại lần 2. Lần 3: bên chiếu dai hoặc đuổi dai bị xử thua, không thì hòa');
      if (vsAI() && G.pos.turn !== G.me && !G.over && G.animating <= 1) aiMove();
    });
    G.lastMover = mover; updateStatus();
  }

  // ---------- computer player ----------
  let worker = null, reqId = 0, aiId = 0;
  const waiting = new Map();
  function runLocal(job, res) {
    setTimeout(() => {
      if (job.sg) { res(SG.think(SG.unpack(job.sg), { time: Math.min(job.time || 900, 1200), depth: job.depth, noise: job.noise })); return; }
      const p = XQ.Pos.fromFen(job.fen), h = [];
      for (const m of job.moves) { h.push(p.key()); p.make(m); }
      res(XQ.think(p, { time: Math.min(job.time || 900, 1200), depth: job.depth, noise: job.noise, history: h, exclude: job.exclude, full: job.full }));
    }, 30);
  }
  try {
    worker = new Worker('src/ai-worker.js');
    worker.onmessage = e => { const w = waiting.get(e.data.id); if (w) { waiting.delete(e.data.id); w.res(e.data); } };
    worker.onerror = () => { worker = null; for (const w of waiting.values()) runLocal(w.job, w.res); waiting.clear(); };
  } catch (e) { worker = null; }
  function ask(job) {
    return new Promise(res => {
      if (worker) { const id = ++reqId; waiting.set(id, { job, res }); worker.postMessage({ id, ...job }); }
      else runLocal(job, res);
    });
  }
  function aiMove() {
    const id = ++aiId, L = G.mode === 'campaign' ? CAMPAIGN.AI[G.lv.ai] : LEVELS[G.level], t0 = Date.now();
    G.thinking = true; updateStatus();
    ask({ ...aiJob(), time: L.time, depth: L.depth, noise: L.noise ? (Math.random() * 1e9) | 1 : 0 }).then(r => {
      if (id !== aiId || !vsAI() || G.over) return;
      setTimeout(() => {
        if (id !== aiId || !vsAI()) return;
        G.thinking = false;
        if (r.move) commit(r.move);
      }, Math.max(0, 500 - (Date.now() - t0)));
    });
  }

  // ---------- starting games ----------
  function startAI() {
    disconnect(); stopSeek(); resetOnline(); rvClose();
    G.mode = 'ai'; G.me = pref.side; G.level = pref.level; G.gen = (G.gen || 0) + 1; aiId++; G.thinking = false;
    G.variant = pref.jq ? 'jq' : 'xq'; G.deal = pref.jq ? JQ.deal() : null;
    G.fen0 = XQ.START; G.lv = null; VIEW.setLayout('classic'); VIEW.setStage(myStage());
    const rivals = HEROES.list.filter(h => h.id !== pref.hero);  // the computer may lead with a hero still to earn
    G.heroes = { [G.me]: myHero(), [-G.me]: rivals[(Math.random() * rivals.length) | 0].id };
    VIEW.setHeroes(G.heroes);
    reset(); clearSel();
    VIEW.setMenu(false); VIEW.setViewer(G.me); VIEW.setBoard(G.pos.b, [], G.pos.dark); VIEW.lastMove(-1, -1); VIEW.check(-1); VIEW.hint(-1, -1);
    showMenu(false); showEnd(false); renderMoves(); layoutMode();
    SFX.init(); SFX.gong(); banner(G.pos.dark ? 'Cờ úp' : 'Khai cuộc', 'open');
    updateStatus();
    if (G.me < 0) setTimeout(() => { if (G.mode === 'ai' && !G.moves.length) aiMove(); }, 900);
  }
  // a campaign battle: its own position, side, opponent hero, stage and computer strength
  function startCampaign(id) {
    const lv = CAMPAIGN.level(id);
    if (!lv || !CAMPAIGN_UI.unlocked().levels.has(id)) return;
    const ch = CAMPAIGN.chapter(lv.chapter);
    CAMPAIGN_UI.close();
    startBattle(lv, ch.foe, ch.stage);
  }
  // the daily puzzle: today's position, against a general picked at random, on the player's own battlefield
  async function startDaily() {
    const lv = await DAILY_UI.begin();
    DAILY_UI.close();
    const rivals = HEROES.list.filter(h => h.id !== pref.hero);
    startBattle(lv, rivals[(Math.random() * rivals.length) | 0].id, myStage());
  }
  const restartBattle = () => { if (G.lv.daily) startDaily(); else startCampaign(G.lv.id); };
  // learning to play (lessons.js): a step's position, Red to move and one move to find; the computer plays no part.
  // Each lesson done is ticked in the list (Luật chơi, Học chơi), kept on this device.
  let lessonsDone = {};
  try { lessonsDone = JSON.parse(localStorage.getItem('cotuong_lessons')) || {}; } catch (e) { }
  function startLesson(id, i = 0) {
    const l = LESSONS.byId[id], step = l.steps[i];
    disconnect(); stopSeek(); resetOnline(); rvClose();
    G.mode = 'lesson'; G.lesson = { id, i }; G.lv = null; G.fen0 = step.fen; G.me = 1; G.gen = (G.gen || 0) + 1; aiId++; G.thinking = false;
    VIEW.setLayout('classic'); VIEW.setStage(myStage());
    G.heroes = { 1: myHero(), '-1': '' }; VIEW.setHeroes(G.heroes);
    reset(); clearSel();
    VIEW.setMenu(false); if (!i) VIEW.setViewer(1);
    VIEW.setBoard(G.pos.b, [], G.pos.dark); VIEW.lastMove(-1, -1); VIEW.check(G.pos.inCheck() ? kingOf(1) : -1); VIEW.hint(-1, -1);
    showMenu(false); showEnd(false); renderMoves(); layoutMode();
    SFX.init(); if (!i) { SFX.gong(); banner(`Học chơi · ${l.name}`, 'open'); }
    updateStatus();
  }
  // the move made: right, on to the next step (or the next lesson); wrong, why, and the step again
  function lessonJudge(m, st) {
    const { id, i } = G.lesson, l = LESSONS.byId[id], step = l.steps[i], still = () => G.mode === 'lesson' && G.lesson.id === id && G.lesson.i === i;
    if (!LESSONS.done(step, XQ.from(m), XQ.to(m), st)) {
      SFX.error(); toast(step.why || 'Chưa đúng, thử lại nhé');
      setTimeout(() => { if (still()) startLesson(id, i); }, 1300);
      return;
    }
    SFX.win();
    if (i + 1 < l.steps.length) { banner('Đúng rồi!', 'open'); setTimeout(() => { if (still()) startLesson(id, i + 1); }, 1300); return; }
    lessonsDone[id] = 1; try { localStorage.setItem('cotuong_lessons', JSON.stringify(lessonsDone)); } catch (e) { }
    renderLessons(); banner(`Xong bài ${l.name}!`, 'open');
    const next = LESSONS.list[LESSONS.list.indexOf(l) + 1];
    setTimeout(() => {
      if (!still()) return;
      if (next) startLesson(next.id);
      else { toast('Bạn đã biết cách đi của mọi quân. Vào Chơi để đánh với máy!'); G.mode = 'menu'; showMenu(true); }
    }, 1800);
  }
  function renderLessons() {
    $('#lessonList').innerHTML = LESSONS.list.map(l => `<button type="button" data-id="${l.id}" class="${lessonsDone[l.id] ? 'on' : ''}"><span class="hz">${l.han}</span><span>${l.name}${lessonsDone[l.id] ? ' ✓' : ''}</span></button>`).join('');
  }
  // a battle with a position of its own (a campaign level or the daily puzzle), judged by CAMPAIGN.judge
  function startBattle(lv, foe, stage) {
    disconnect(); stopSeek(); resetOnline(); rvClose();
    G.mode = 'campaign'; G.lv = lv; G.fen0 = lv.fen; G.me = lv.side; G.help = false; VIEW.setLayout('classic');
    G.gen = (G.gen || 0) + 1; aiId++; G.thinking = false;
    G.heroes = { [G.me]: myHero(), [-G.me]: foe };
    VIEW.setHeroes(G.heroes); VIEW.setStage(stage);
    reset(); clearSel();
    VIEW.setMenu(false); VIEW.setViewer(G.me); VIEW.setBoard(G.pos.b, [], G.pos.dark); VIEW.lastMove(-1, -1); VIEW.check(-1); VIEW.hint(-1, -1);
    showMenu(false); showEnd(false); renderMoves(); layoutMode();
    SFX.init(); SFX.gong(); banner(lv.daily ? 'Chân Long Kỳ Trận' : lv.name, 'open');
    toast(CAMPAIGN.goal(lv));
    updateStatus();
    if (G.pos.turn !== G.me) setTimeout(() => { if (G.mode === 'campaign' && G.lv === lv && !G.moves.length) aiMove(); }, 900);
  }
  // a battle is decided (CAMPAIGN.judge): stars, progress, what it opened; for the daily puzzle the time and the board
  function endCampaign(r) {
    if (G.over && G.over.shown) return;
    const lv = G.lv, winner = r.win ? G.me : -G.me;
    aiId++; G.thinking = false;
    G.over = { winner: r.reason === 'held' || r.reason === 'limit' || (lv.type === 'survive' && r.win) ? 0 : winner, reason: r.reason, shown: true, camp: r, stars: CAMPAIGN.stars(lv, r, G.help), lv };
    G.over.kept = keepGame();
    VIEW.check(-1); clearSel();
    const onBoard = r.reason === 'checkmate' || r.reason === 'stalemate';
    const finale = onBoard ? VIEW.defeat(kingOf(-winner), true) : 0;
    recordFinale(finale);
    if (r.win) { VIEW.heroShadow(G.me, true); SFX.win(); } else SFX.lose();
    updateStatus();
    const lvNow = lv;
    const keep = !r.win ? Promise.resolve(null) : lv.daily ? DAILY_UI.solved(lv, G.moves.slice(), G.help) : CAMPAIGN_UI.record(lv, G.moves.slice(), G.help);
    keep.then(res => {
      if (G.over && G.over.lv === lvNow) { G.over.saved = res; if (!$('#end').hidden) renderEnd(); }
    });
    setTimeout(() => showEnd(true), onBoard ? Math.max(1300, finale) : 300);
  }
  function undo() {
    if (G.mode === 'sanguo') { sgUndo(); return; }
    if (!vsAI() || G.animating) return;
    aiId++; G.thinking = false;
    if (G.mode === 'campaign') G.help = true;
    let n = G.pos.turn === G.me ? 2 : 1;
    if (G.over && G.over.reason === 'resign') n = 0;
    n = Math.min(n, G.moves.length);
    if (G.me < 0 && G.moves.length - n < 1) n = G.moves.length;   // keep Black's view sane: replay from the start
    if (!n && !G.over) return;
    rebuild(G.moves.slice(0, G.moves.length - n));
    G.gen = (G.gen || 0) + 1;
    VIEW.setBoard(G.pos.b, G.captured, G.pos.dark); clearSel(); VIEW.hint(-1, -1);
    const lm = G.moves[G.moves.length - 1]; VIEW.lastMove(lm ? XQ.from(lm) : -1, lm ? XQ.to(lm) : -1);
    const st = XQ.status(G.pos, G.keys, G.quiet, G.moves); VIEW.check(st.check ? kingOf(G.pos.turn) : -1);
    showEnd(false); renderMoves(); updateStatus(); SFX.pick();
    if (G.pos.turn !== G.me) aiMove();
  }
  function hint() {
    if (G.mode === 'sanguo') { sgHint(); return; }
    if (!vsAI() || G.over || G.pos.turn !== G.me || G.thinking || G.animating) return;
    if (G.mode === 'campaign') { G.help = true; updateStatus(); }
    const b = $('#bHint'); b.disabled = true; b.textContent = 'Đang tìm…';
    ask({ ...aiJob(), time: G.mode === 'campaign' ? 1500 : 900 }).then(r => {
      b.disabled = false; b.textContent = 'Gợi ý';
      if (!r.move || G.pos.turn !== G.me) return;
      VIEW.hint(XQ.from(r.move), XQ.to(r.move));
      toast('Gợi ý: ' + (G.pos.dark ? JQ.notation(G.pos, r.move, { r: 0, c: 0 }) : XQ.notation(G.pos, r.move)));
    });
  }
  let resignArm = 0;
  function resign() {
    if (G.over || G.mode === 'menu' || (G.mode === 'online' && !G.you)) return;
    const b = $('#bResign');
    const word = G.mode === 'sanguo' ? 'Xin hàng' : 'Xin thua';
    if (Date.now() - resignArm > 3000) { resignArm = Date.now(); b.textContent = 'Chắc chắn?'; b.classList.add('warn'); setTimeout(() => { b.classList.remove('warn'); updateStatus(); }, 3000); return; }
    resignArm = 0; b.textContent = word; b.classList.remove('warn');
    if (G.mode === 'sanguo') { sgResign(); return; }
    if (G.mode === 'online') { send({ t: 'resign' }); return; }
    aiId++; G.thinking = false;
    if (G.mode === 'campaign') { endCampaign({ over: true, win: false, reason: 'resign' }); return; }
    endGame({ over: true, winner: -G.me, reason: 'resign' });
  }

  // ---------- end of a game ----------
  function endGame(st) {
    if (G.over && G.over.shown) return;
    G.over = Object.assign({}, st, { shown: true });
    G.over.kept = keepGame();
    VIEW.check(-1); clearSel();
    const viewer = G.mode === 'online' ? G.you : G.me, onBoard = !['resign', 'time', 'abandon', 'noshow', 'aborted', 'agreement', 'perpetual-check', 'perpetual-chase'].includes(st.reason);
    const finale = st.winner && onBoard ? VIEW.defeat(kingOf(-st.winner), true) : 0;
    recordFinale(finale);
    if (st.winner) VIEW.heroShadow(st.winner, true);
    if (!st.winner) SFX.gong(); else if (!viewer || st.winner === viewer) SFX.win(); else SFX.lose();
    updateStatus();
    setTimeout(() => showEnd(true), onBoard ? Math.max(1300, finale) : 200);
  }
  // a finished game goes into the games kept on this device (Ván đã chơi), to be watched again and analysed
  function keepGame() {
    const o = G.over;
    if (!G.moves.length || !o || o.reason === 'aborted' || G.pos.dark) { if (o) o.ach = []; return null; }
    const online = G.mode === 'online', lv = G.lv;
    const me = online ? G.you : G.me, you = ACCOUNT.user ? ACCOUNT.user.name : 'Bạn';
    const name = side => online ? (G.info[side] ? G.info[side].name : side === G.you ? you : G.you ? 'Đối thủ' : SIDE[side])
      : side === G.me ? you : G.mode === 'ai' ? `Máy · ${LEVELS[G.level].name}` : (lv && CAMPAIGN.chapter(lv.chapter) || {}).foeName || (HEROES.byId[G.heroes[side]] || {}).name || 'Máy';
    const kind = online ? (G.rated ? 'ranked' : 'online') : G.mode === 'campaign' ? (lv.daily ? 'daily' : 'campaign') : 'ai';
    o.ach = me ? ACH_UI.check({ fen0: G.fen0, moves: G.moves.slice(), me }) : [];   // feats of the board (achievements-ui.js)
    const title = { ranked: 'Trận xếp hạng', online: G.tour ? `Giải ${G.tour.name}` : `Phòng ${G.room}`, daily: lv && lv.name, campaign: lv && `Chiến dịch ${lv.id} · ${lv.name}`, ai: `Với máy · ${LEVELS[G.level].name}` }[kind];
    try {
      return REVIEW.add({ at: Date.now(), kind, title, fen0: G.fen0, moves: G.moves.slice(), me, names: { 1: name(1), '-1': name(-1) }, winner: o.winner, reason: o.reason, heroes: { ...G.heroes }, room: online && !G.rated ? G.room : '' }).id;
    } catch (e) { return null; }
  }
  // a ranked result: the rating change arrives with the result, or a little later if saving it had to be retried
  function rated(m) {
    if (!G.over || !m.delta) return;
    G.over.delta = m.delta; G.over.rating = m.rating;
    if (!$('#end').hidden) renderEnd();
    ACCOUNT.refresh();
  }
  function ratingNote() {
    const o = G.over;
    if (o.reason === 'aborted') return 'Ván không tính điểm.';
    if (!o.delta) return 'Đang cập nhật điểm xếp hạng…';
    const one = s => `${o.rating[s]} (${ACCOUNT.sign(o.delta[s])})`;
    return G.you ? `Điểm xếp hạng: ${one(G.you)}` : `Đỏ ${one(1)} · Đen ${one(-1)}`;
  }
  function endText() {
    const st = G.over, viewer = G.mode === 'online' ? G.you : G.me;
    if (!st) return ['', ''];
    if (st.sg) return [st.title, st.sub];
    if (st.camp) {
      const r = st.camp, lv = st.lv;
      const why = {
        held: `Đã cầm cự đủ ${lv.n} nước`, limit: lv.type === 'mate' ? `Chưa chiếu bí được sau ${lv.n + 2} nước` : 'Ván cờ kéo quá dài',
        resign: 'Bạn đã rút quân', checkmate: r.win ? 'Chiếu bí' : 'Bạn bị chiếu bí', stalemate: r.win ? 'Đối phương hết nước đi' : 'Bạn hết nước đi',
        repetition: 'Lặp lại thế cờ ba lần', quiet: '60 nước liền không ăn quân',
        'perpetual-check': r.win ? 'Đối phương chiếu dai, phạm luật' : 'Bạn chiếu dai, phạm luật', 'perpetual-chase': r.win ? 'Đối phương đuổi dai, phạm luật' : 'Bạn đuổi dai, phạm luật',
      }[r.reason] || '';
      if (lv.daily) return [r.win ? 'Phá trận!' : 'Chưa phá được trận', `Chân Long Kỳ Trận · Trận ${lv.no} · ${why}`];
      return [r.win ? 'Đại thắng!' : 'Thất bại', `${lv.name} · ${why}`];
    }
    if (st.reason === 'aborted') return ['Ván bị hủy', 'Một bên không đi nước đầu trong 30 giây'];
    let title;
    if (!st.winner) title = 'Hòa cờ';
    else if (!viewer) title = SIDE[st.winner] + ' thắng';
    else title = st.winner === viewer ? 'Chiến thắng!' : 'Thất bại';
    const who = st.winner ? `${SIDE[st.winner]} (${ARMY[st.winner]}) thắng` : 'Hai bên bất phân thắng bại';
    const why = {
      resign: `${SIDE[-st.winner]} xin thua`,
      time: st.winner ? `${SIDE[-st.winner]} hết giờ` : 'Hết giờ, nhưng bên kia không còn quân để chiếu bí',
      'perpetual-check': `${SIDE[-st.winner]} chiếu dai, phạm luật`,
      'perpetual-chase': `${SIDE[-st.winner]} đuổi dai, phạm luật`,
      abandon: `${SIDE[-st.winner]} rời ván quá 60 giây`,
      noshow: `${SIDE[-st.winner]} không vào trận sau 3 phút`,
    }[st.reason] || REASON[st.reason] || '';
    const after = `sau ${Math.ceil(G.moves.length / 2)} nước`;
    return [title, st.reason === 'agreement' ? `${why} ${after}` : `${why} · ${who} ${after}`];
  }

  // ---------- clocks ----------
  // the server sends each clock as it stood when the message left; the page counts down from when it arrived
  function setTiming(m) {
    const t = performance.now();
    if ('clock' in m) G.clock = m.clock ? { left: { ...m.clock.left }, running: m.clock.running, at: t } : null;
    if ('deadline' in m) G.deadline = m.deadline ? { ...m.deadline, until: t + m.deadline.ms } : null;
  }
  function clockOf(side) {
    const c = G.clock;
    if (!c) return Infinity;
    let v = c.left[side];
    if (c.running === side && !G.over) v -= performance.now() - c.at;
    return Math.max(0, v);
  }
  const mmss = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  const fmtClock = ms => ms < 10000 ? (Math.floor(ms / 100) / 10).toFixed(1) : mmss(ms);
  function renderClocks() {
    if (G.mode === 'sanguo') { sgClocks(); return; }
    for (const side of [1, -1]) {
      const el = $(side > 0 ? '#plRed .clk' : '#plBlack .clk'), on = G.mode === 'online' && !!G.clock, v = clockOf(side);
      el.textContent = on ? fmtClock(v) : '';
      el.classList.toggle('run', on && G.clock.running === side && !G.over);
      el.classList.toggle('low', on && v < 30000);
    }
  }
  function deadlineText() {
    const d = G.deadline, s = Math.max(0, Math.ceil((d.until - performance.now()) / 1000));
    const them = G.you ? 'Đối thủ' : SIDE[d.side];
    if (d.kind === 'abort') return d.side === G.you ? `Đi nước đầu trong ${s} giây, không thì ván bị hủy` : `Chờ ${them.toLowerCase()} đi nước đầu · ${s}s`;
    return d.side === G.you ? `Bạn đang mất kết nối · ${s}s` : `${them} mất kết nối · xử thua sau ${s}s`;
  }
  setInterval(() => {
    if (sgNet()) { if (G.sg.net.clock) renderClocks(); if (G.sg.net.deadline && !G.over) updateStatus(); return; }
    if (G.mode !== 'online') return;
    if (G.clock) renderClocks();
    if (G.deadline && !G.over) updateStatus();
  }, 200);

  // ---------- online ----------
  const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const cleanRoom = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  // invitation links: ?room= for an ordinary room, ?tq= for a Tam Quốc one
  const roomLink = () => `${location.origin}${location.pathname}?${G.mode === 'sanguo' ? 'tq' : 'room'}=${G.room}`;
  const wsBase = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
  let retryT = null;
  function resetOnline() { G.tour = null; G.variant = 'xq'; G.deal = null; G.rated = false; G.info = { 1: null, '-1': null }; G.tc = null; G.clock = null; G.deadline = null; G.drawOffer = 0; G.heroes = { 1: '', '-1': '' }; VIEW.setHeroes(G.heroes); }
  // tc: time control asked for by the player opening a friendly room ('' = untimed)
  function goOnline(room, tc = '', jq = false) {
    disconnect(); stopSeek(); resetOnline(); rvClose();
    G.mode = 'online'; G.room = room; G.you = 0; G.wantTc = tc; G.wantJq = jq; G.gen = (G.gen || 0) + 1; aiId++;
    G.fen0 = XQ.START; G.lv = null; VIEW.setLayout('classic'); VIEW.setStage(myStage());
    G.players = { 1: false, '-1': false }; G.rematch = { 1: false, '-1': false };
    history.replaceState(null, '', roomLink());
    reset(); clearSel(); VIEW.setMenu(false); VIEW.setBoard(G.pos.b, [], G.pos.dark); VIEW.lastMove(-1, -1); VIEW.check(-1); VIEW.hint(-1, -1);
    showMenu(false); showEnd(false); renderMoves(); layoutMode();
    SFX.init();
    connect();
  }
  function token() {
    const k = 'cotuong_tok_' + G.room;
    let t = ''; try { t = localStorage.getItem(k) || ''; } catch (e) { }
    if (!t) { t = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(36).padStart(2, '0')).join('').slice(0, 20); try { localStorage.setItem(k, t); } catch (e) { } }
    return t;
  }
  function connect() {
    clearTimeout(retryT);
    const sg = G.mode === 'sanguo', ws = new WebSocket(`${wsBase()}/ws${sg ? '/sg' : ''}?room=${G.room}`);
    G.ws = ws; G.netState = 'connecting'; updateStatus();
    ws.onopen = () => { G.netState = 'ok'; ws.send(JSON.stringify({ t: 'hello', token: token(), tc: G.wantTc, variant: !sg && G.wantJq ? 'jq' : '', hero: myHero(), stage: myStage(), skin: SKINS.pack(mySkins()) })); };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } if (sg) sgNetMsg(m); else onNet(m); };
    ws.onclose = () => {
      if (G.ws !== ws) return;
      G.netState = 'lost'; updateStatus();
      if (G.mode === 'online' || sgNet()) retryT = setTimeout(connect, 1800);
    };
  }
  function disconnect() { clearTimeout(retryT); if (G.ws) { const w = G.ws; G.ws = null; try { w.close(); } catch (e) { } } }
  const send = o => { if (G.ws && G.ws.readyState === 1) G.ws.send(JSON.stringify(o)); };
  function onNet(m) {
    if ('watchers' in m) G.watchers = m.watchers | 0;
    switch (m.t) {
      case 'cheer': onCheer(m); updateStatus(); break;
      case 'state': {
        const firstSeat = !G.you && m.you;
        G.you = m.you; G.me = m.you || 1; G.players = m.players || G.players; G.rematch = m.rematch || { 1: false, '-1': false };
        G.rated = !!m.rated; G.info = m.info || { 1: null, '-1': null }; G.tc = m.tc || null; G.drawOffer = m.drawOffer || 0; setTiming(m);
        G.heroes = m.heroes || { 1: '', '-1': '' }; G.skins = m.skins || {}; G.boardSkin = m.board || '';
        G.variant = m.variant === 'jq' ? 'jq' : 'xq'; G.deal = null; G.sent = 0; G.tour = m.tour || null;
        if (hallUpdate(m)) { updateStatus(); break; }
        G.gen = (G.gen || 0) + 1; chain = Promise.resolve(); G.animating = 0;
        rebuild(m.moves || [], m.turns || []);
        G.heroes = m.heroes || { 1: '', '-1': '' }; VIEW.setHeroes(G.heroes);
        VIEW.setViewer(G.me, false); VIEW.setBoard(G.pos.b, G.captured, G.pos.dark); clearSel(); VIEW.hint(-1, -1);
        const lm = G.moves[G.moves.length - 1]; VIEW.lastMove(lm ? XQ.from(lm) : -1, lm ? XQ.to(lm) : -1);
        const st = XQ.status(G.pos, G.keys, G.quiet, G.moves); VIEW.check(!m.over && st.check ? kingOf(G.pos.turn) : -1);
        G.over = m.over ? Object.assign({}, m.over, { shown: true }) : null;
        showEnd(!!m.over); renderMoves(); updateStatus();
        if (!G.moves.length && !m.over && (firstSeat || m.fresh)) {
          SFX.gong(); banner(G.you ? `Bạn cầm quân ${SIDE[G.you]}${G.pos.dark ? ' · Cờ úp' : ''}` : 'Bạn đang xem trận', 'open');
          const opp = G.you && G.info[-G.you];
          if (G.rated && opp) toast(`Trận xếp hạng: gặp ${opp.name} · ${opp.rating} điểm`);
        }
        break;
      }
      case 'move':
        setTiming(m);
        if ('draw' in m) G.drawOffer = m.draw;
        if (m.ply === G.moves.length) { commit(m.m, false, G.pos.dark ? { r: m.r | 0, c: m.c | 0 } : undefined); }
        else if (m.ply > G.moves.length) send({ t: 'sync' });
        break;
      case 'presence':
        G.players = m.players; if (m.info) G.info = m.info;
        if (m.heroes) { G.heroes = m.heroes; VIEW.setHeroes(m.heroes); }
        if (m.skins) { G.skins = m.skins; G.boardSkin = m.board || ''; }
        setTiming(m); updateStatus(); break;
      case 'over': setTiming(m); enqueue(async () => { endGame(m); rated(m); }); break;
      case 'rated': rated(m); break;
      case 'rematch': G.rematch = m.want; renderEnd(); break;
      case 'draw': {
        const was = G.drawOffer;
        G.drawOffer = m.offer;
        if (G.you && m.offer === -G.you && was !== m.offer) { SFX.pick(); toast('Đối thủ cầu hòa'); }
        else if (G.you && m.declined === -G.you) toast('Đối thủ từ chối hòa');
        updateStatus();
        break;
      }
      case 'error': toast(m.msg || 'Có lỗi xảy ra'); break;
      case 'kicked': leaveRoom(); toast('Chủ phòng đã mời bạn ra khỏi phòng'); break;
      case 'emote': onEmote(m); break;
    }
  }

  // ---------- ranked queue ----------
  let lobby = null, seekT = null;
  // v: 'xq' an ordinary game, 'sg' a Tam Quốc game with two others
  function seek(v = 'xq') {
    if (!ACCOUNT.user) { toast('Đăng nhập Google để chơi xếp hạng'); showEnd(false); showMenu(true); return; }
    stopSeek(); SFX.init(); showEnd(false);
    const t0 = Date.now(), ws = new WebSocket(`${wsBase()}/ws/lobby`);
    lobby = ws;
    $('#seek').hidden = false; $('#seekInfo').textContent = 'Đang vào hàng chờ…'; $('#seekTime').textContent = '0:00';
    seekT = setInterval(() => { $('#seekTime').textContent = mmss(Date.now() - t0); }, 500);
    $('#seek h2').textContent = v === 'sg' ? 'Đang tìm hai đối thủ' : 'Đang tìm đối thủ';
    ws.onopen = () => ws.send(JSON.stringify({ t: 'seek', v }));
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.t === 'seeking') $('#seekInfo').textContent = v === 'sg'
        ? (m.n > 1 ? `${m.n} kỳ thủ đang chờ trận Tam Quốc. Cần đủ ba người có điểm gần nhau…` : 'Lúc này chỉ có bạn chờ trận Tam Quốc. Cần thêm hai người nữa.')
        : (m.n > 1 ? `${m.n} kỳ thủ đang tìm trận. Đang chờ người có điểm gần bạn…` : 'Lúc này chỉ có bạn đang tìm trận. Chờ thêm chút nhé.');
      else if (m.t === 'match') { stopSeek(); if (m.v === 'sg') sgOnline(m.room); else goOnline(m.room); }
      else if (m.t === 'cancelled') { stopSeek(); if (m.why === 'elsewhere') toast('Bạn đang tìm trận ở một tab khác'); }
    };
    ws.onclose = () => { if (lobby === ws) { stopSeek(); toast('Không vào được hàng chờ. Thử đăng nhập lại nhé.'); ACCOUNT.refresh(); } };
  }
  function stopSeek() {
    clearInterval(seekT); $('#seek').hidden = true;
    if (!lobby) return;
    const w = lobby; lobby = null;
    try { if (w.readyState === 1) w.send(JSON.stringify({ t: 'cancel' })); w.close(); } catch (e) { }
  }

  // ---------- Tam Quốc: three kingdoms on one board (sanguo.js) ----------
  // G.sg: { pos, keys (before each move), quiet, log, captured ([piece as drawn, taker]), seats (on this device: 0 a
  // person, 1 the computer, by kingdom), hist (what to go back to for each move), level, viewer, net }.
  // net is set for a game online (worker/sg-room.js referees it): { room, you (kingdom, -1 watching), players, info,
  // rated, tc, clock, deadline, rematch, n (entries of the room's history applied here) }.
  const SG_LEVELS = [
    { name: 'Dễ', time: 300, depth: 2, noise: true },
    { name: 'Thường', time: 1000, depth: 4 },
    { name: 'Khó', time: 2600 },
  ];
  const KNAME = SG.NAMES, RULERS = ['luu-bi', 'ton-quyen', 'tao-thao'], PL = ['#plRed', '#plGreen', '#plBlack'];
  const OUT_WHY = { resign: 'xin hàng', time: 'hết giờ', abandon: 'bỏ ván' };
  const sgShow = pc => (pc ? 20 + 10 * SG.OWN(pc) + SG.T(pc) : 0);       // a piece as models.js draws it
  const sgBoard = () => Int8Array.from(G.sg.pos.b, sgShow);
  const sgNet = () => G.mode === 'sanguo' && G.sg.net;
  // the kingdoms this device plays, and those the computer plays
  const sgPeople = () => (G.sg.net ? (G.sg.net.you >= 0 ? [G.sg.net.you] : []) : [0, 1, 2].filter(k => G.sg.seats[k] === 0));
  const sgAIk = k => !G.sg.net && G.sg.seats[k] === 1;
  const sgSolo = () => { const p = sgPeople(); return p.length === 1 ? p[0] : -1; };
  const sgMoves = () => G.sg.log.filter(x => x.m);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const sgFresh = (seats, net) => ({ pos: SG.Pos.start(), keys: [], quiet: 0, log: [], captured: [], seats, hist: [], level: pref.sgLevel, viewer: 0, net });
  // a person's general takes their chosen hero (the first person's, with others at the table), the rest their rulers
  function sgHeroes() {
    const first = sgPeople()[0], h = {};
    for (let k = 0; k < 3; k++) h[k] = k === first && myHero() ? myHero() : RULERS[k];
    return h;
  }
  function sgShowBoard() {
    const sg = G.sg;
    VIEW.setBoard(sgBoard(), sg.captured); clearSel(); VIEW.hint(-1, -1);
    const lm = sgMoves().pop(); VIEW.lastMove(lm ? SG.from(lm.m) : -1, lm ? SG.to(lm.m) : -1);
    VIEW.check(!G.over && sg.pos.inCheck() ? sg.pos.kings[sg.pos.turn] : -1);
  }
  // a game on this device
  function sgStart() {
    disconnect(); stopSeek(); resetOnline(); rvClose();
    G.mode = 'sanguo'; G.gen = (G.gen || 0) + 1; aiId++; G.thinking = false; G.lv = null; G.over = null;
    G.sg = sgFresh(pref.sgSeats.slice(), null);
    const people = sgPeople(); G.sg.viewer = people.length ? people[0] : 0;
    VIEW.setLayout('sanguo'); VIEW.setStage(myStage());
    G.heroes = sgHeroes(); VIEW.setHeroes(G.heroes);
    VIEW.setMenu(false); VIEW.setViewer(G.sg.viewer); sgShowBoard();
    showMenu(false); showEnd(false); renderMoves(); layoutMode();
    SFX.init(); SFX.gong(); banner('Tam Quốc tranh hùng', 'open');
    if (people.length === 1) toast(`Bạn cầm quân ${KNAME[people[0]]}. Luật chơi: nút quyển sách ở góc trên.`);
    updateStatus();
    const gen = G.gen;
    setTimeout(() => { if (G.mode === 'sanguo' && G.gen === gen && !sgMoves().length) sgNext(); }, 900);
  }
  // a game online: a friendly room (tc: time control asked for by whoever opens it) or a ranked one from the Lobby
  function sgOnline(room, tc = '') {
    disconnect(); stopSeek(); resetOnline(); rvClose();
    G.mode = 'sanguo'; G.room = room; G.wantTc = tc; G.gen = (G.gen || 0) + 1; aiId++; G.thinking = false; G.lv = null; G.over = null;
    G.sg = sgFresh([0, 0, 0], { room, you: -1, players: [false, false, false], info: [null, null, null], rated: false, tc: null, clock: null, deadline: null, rematch: [false, false, false], n: 0 });
    history.replaceState(null, '', roomLink());
    VIEW.setLayout('sanguo'); VIEW.setStage(myStage());
    G.heroes = { 0: RULERS[0], 1: RULERS[1], 2: RULERS[2] }; VIEW.setHeroes(G.heroes);
    VIEW.setMenu(false); VIEW.setViewer(0); sgShowBoard();
    showMenu(false); showEnd(false); renderMoves(); layoutMode();
    SFX.init();
    connect();
  }
  // whose turn now: the computer thinks; with several people at this table the board turns to the one to play
  function sgNext() {
    const sg = G.sg, k = sg.pos.turn;
    if (G.over) return;
    if (sgAIk(k)) { sgAI(); return; }
    if (!sg.net && sgPeople().length > 1 && k !== sg.viewer) { sg.viewer = k; VIEW.setViewer(k); banner(`Lượt ${KNAME[k]}`, 'open'); }
    updateStatus();
  }
  function sgAI() {
    const sg = G.sg, id = ++aiId, lvl = SG_LEVELS[sg.level] || SG_LEVELS[1], t0 = Date.now(), gen = G.gen;
    G.thinking = true; updateStatus();
    ask({ sg: SG.pack(sg.pos), time: lvl.time, depth: lvl.depth, noise: lvl.noise ? (Math.random() * 1e9) | 1 : 0 }).then(r => {
      if (id !== aiId || G.mode !== 'sanguo' || G.gen !== gen || G.over) return;
      setTimeout(() => {
        if (id !== aiId || G.mode !== 'sanguo' || G.gen !== gen) return;
        G.thinking = false;
        if (r.move) sgCommit(r.move);
      }, Math.max(0, 400 - (Date.now() - t0)));
    });
  }

  // ---------- the record: a move, or a kingdom leaving the game ----------
  const sgSnapshot = sg => sg.hist.push({ pos: sg.pos, keys: sg.keys.length, quiet: sg.quiet, log: sg.log.length, captured: sg.captured.length });
  function sgFalls(sg, falls) { for (const f of falls) { sg.log.push({ fall: f }); sg.captured.push([20 + 10 * f.k + SG.K, f.by]); } }
  function sgRecord(m) {
    const sg = G.sg, before = sg.pos, mover = before.turn, cap = before.b[SG.to(m)], text = SG.notation(before, m);
    sgSnapshot(sg);
    sg.keys.push(before.key());
    const r = SG.play(before, m);
    sg.pos = r.pos; sg.quiet = cap ? 0 : sg.quiet + 1;
    if (cap) sg.captured.push([sgShow(cap), mover]);
    sg.log.push({ k: mover, m, text, cap: !!cap });
    sgFalls(sg, r.falls);
    if (sg.net) sg.net.n++;
    return { r, mover };
  }
  function sgRecordOut(k, why) {
    const sg = G.sg;
    sgSnapshot(sg);
    const r = SG.drop(sg.pos, k);
    sg.pos = r.pos;
    sg.log.push({ fall: { k, by: -1, why } });
    sgFalls(sg, r.falls);
    if (sg.net) sg.net.n++;
    return { r };
  }
  // after the board has caught up with the record: falls, the end, checks, and on to the next turn
  async function sgAfter(r, mover, gen) {
    const sg = G.sg, people = sgPeople();
    for (const f of r.falls) {
      VIEW.defeat(f.king); if (f.by >= 0) VIEW.heroShadow(f.by); SFX.drum();
      banner(`${KNAME[f.k]} diệt vong!`, 'check');
      toast(`${f.mate ? 'Bị chiếu bí' : 'Hết nước đi'}: ${f.by >= 0 ? `tàn quân ${KNAME[f.k]} về tay ${KNAME[f.by]}` : `${KNAME[f.k]} rút quân`}`);
      await sleep(1600);
      if (gen !== G.gen) return;
    }
    if (r.falls.length) VIEW.setBoard(sgBoard(), sg.captured);     // the fallen general leaves, his army changes colours
    const st = SG.status(sg.pos, sg.keys, sg.quiet);
    if (st.over) { sgEnd(st); return; }
    if (!sg.net && people.length && !people.some(k => sg.pos.alive[k])) {   // nobody left at this table
      sgEnd({ over: true, winner: -1, reason: 'fallen', k: r.falls.length ? r.falls[r.falls.length - 1].k : people[0] }); return;
    }
    if (sg.net && r.falls.some(f => f.k === sg.net.you)) toast('Bạn đã mất nước. Có thể ở lại xem hai nước kia phân thắng bại.');
    if (st.checks.length) {
      const k = st.checks.includes(sg.pos.turn) ? sg.pos.turn : st.checks[0], king = sg.pos.kings[k];
      VIEW.check(king); VIEW.alarm(king); if (mover >= 0) VIEW.heroShadow(mover); SFX.drum();
      banner(people.length === 1 && k === people[0] ? 'Chiếu tướng!' : `${KNAME[k]} bị chiếu!`, 'check');
    }
    if (st.repeat === 1) toast('Thế cờ lặp lại lần 2. Lần 3 thì hòa');
    sgNext();
  }
  // play a move: the record now, the animation in turn
  function sgCommit(m) {
    const sg = G.sg, net = sg.net, gen = G.gen;
    // against the clock the animations cost time: no close-ups, none at all when one's own time runs short
    const timed = !!(net && net.clock), mover = sg.pos.turn;
    const opts = { via: SG.via(m), closeUp: !timed, fast: timed && net.you >= 0 && sgClockOf(net.you) < 60000 };
    if (timed && mover === net.you) { net.clock.left[mover] = sgClockOf(mover); net.clock.running = -1; net.clock.at = performance.now(); }   // the server's reply restarts it
    const { r } = sgRecord(m);
    G.lastMover = mover; renderMoves();
    enqueue(async () => {
      if (gen !== G.gen) return;
      await VIEW.play(m, opts);                             // along the bends of the lines, not across them
      if (gen !== G.gen) return;
      VIEW.check(-1);
      await sgAfter(r, mover, gen);
    });
    updateStatus();
  }
  // a kingdom leaves the game (resigned, out of time, walked away): its army leaves the board
  function sgOut(k, why) {
    const gen = G.gen, { r } = sgRecordOut(k, why);
    renderMoves();
    enqueue(async () => {
      if (gen !== G.gen) return;
      VIEW.check(-1); VIEW.setBoard(sgBoard(), G.sg.captured); clearSel();
      banner(`${KNAME[k]} ${OUT_WHY[why] || 'rút lui'}`, 'check'); SFX.drum();
      await sleep(1200);
      if (gen !== G.gen) return;
      await sgAfter(r, -1, gen);
    });
    updateStatus();
  }

  // ---------- the end ----------
  function sgEnd(st) {
    if (G.over && G.over.shown) { if (st.places && !G.over.places) Object.assign(G.over, { places: st.places }); return; }
    aiId++; G.thinking = false;
    const [title, sub, result] = sgEndText(st);
    G.over = Object.assign({}, st, { shown: true, sg: true, title, sub, result });
    VIEW.check(-1); clearSel();
    if (st.winner >= 0) VIEW.heroShadow(st.winner, true);
    if (result === 'win') SFX.win(); else if (result === 'lose') SFX.lose(); else SFX.gong();
    updateStatus();
    setTimeout(() => { if (G.mode === 'sanguo' && G.over && G.over.sg) showEnd(true); }, 1000);
  }
  function sgEndText(st) {
    const sg = G.sg, people = sgPeople(), solo = sgSolo(), rounds = `sau ${Math.ceil(sgMoves().length / 3)} vòng`;
    if (st.reason === 'aborted') return ['Ván bị hủy', 'Có nước không đi nước đầu trong 30 giây', 'draw'];
    if (st.reason === 'unite') {
      const w = st.winner, name = KNAME[w];
      if (solo >= 0) return w === solo ? ['Nhất thống thiên hạ!', `${name} thu phục cả hai nước ${rounds}`, 'win'] : ['Thất bại', `${name} thống nhất thiên hạ ${rounds}`, 'lose'];
      return [`${name} thống nhất thiên hạ!`, `Hai nước kia đã diệt vong ${rounds}`, !people.length || people.includes(w) ? 'win' : 'lose'];
    }
    if (st.reason === 'fallen') return ['Thất bại', `${KNAME[st.k]} đã mất nước ${rounds}`, 'lose'];
    if (st.reason === 'resign') return ['Thất bại', `${KNAME[st.k]} xin hàng ${rounds}`, 'lose'];
    const left = [0, 1, 2].filter(k => sg.pos.alive[k]).map(k => KNAME[k]).join(', ');
    if (solo >= 0 && !sg.pos.alive[solo]) return ['Thất bại', `${KNAME[solo]} đã mất nước · ${left} hòa nhau`, 'lose'];
    return [sg.pos.living() === 3 ? 'Thế chân vạc' : 'Hòa cờ', `${REASON[st.reason]} · ${left} bất phân thắng bại`, 'draw'];
  }
  // a ranked result: the rating changes arrive with it, or a little later
  function sgRated(m) {
    if (!G.over || !m.delta) return;
    G.over.delta = m.delta; G.over.rating = m.rating;
    if (!$('#end').hidden) renderEnd();
    ACCOUNT.refresh();
  }

  // ---------- on this device: undo, hints, resigning ----------
  // back to the last position a person was to play in, before their last move
  function sgUndo() {
    const sg = G.sg;
    if (G.animating || sg.net) return;
    let i = sg.hist.length - 1;
    while (i >= 0 && sg.seats[sg.hist[i].pos.turn]) i--;
    if (i < 0) return;
    aiId++; G.thinking = false;
    const h = sg.hist[i];
    sg.hist.length = i; sg.pos = h.pos; sg.keys.length = h.keys; sg.quiet = h.quiet; sg.log.length = h.log; sg.captured.length = h.captured;
    G.over = null; G.gen = (G.gen || 0) + 1;
    if (sgPeople().length > 1) { sg.viewer = sg.pos.turn; VIEW.setViewer(sg.viewer); }
    sgShowBoard();
    showEnd(false); renderMoves(); updateStatus(); SFX.pick();
  }
  function sgHint() {
    const sg = G.sg;
    if (G.over || sg.net || sg.seats[sg.pos.turn] || G.thinking || G.animating) return;
    const b = $('#bHint'), at = sg.pos; b.disabled = true; b.textContent = 'Đang tìm…';
    ask({ sg: SG.pack(at), time: 1200 }).then(r => {
      b.disabled = false; b.textContent = 'Gợi ý';
      if (!r.move || G.mode !== 'sanguo' || G.sg.pos !== at) return;
      VIEW.hint(SG.from(r.move), SG.to(r.move));
      toast('Gợi ý: ' + SG.notation(at, r.move));
    });
  }
  // online: my kingdom leaves the game. Here: the only person left gives up the game; with several, the kingdom to
  // move gives up and its army leaves the board
  function sgResign() {
    const sg = G.sg;
    if (G.over) return;
    if (sg.net) { if (sg.net.you >= 0 && sg.pos.alive[sg.net.you]) send({ t: 'resign' }); return; }
    const alive = sgPeople().filter(k => sg.pos.alive[k]), k = sg.pos.turn;
    if (!alive.length) return;
    if (alive.length === 1) { sgEnd({ over: true, winner: -1, reason: 'resign', k: alive[0] }); return; }
    if (sg.seats[k] || G.animating || G.thinking) { toast('Xin hàng khi đến lượt nước mình'); return; }
    sgOut(k, 'resign');
  }
  function sgTap(s) {
    const sg = G.sg, pos = sg.pos, me = pos.turn;
    if (!sgCanAct()) return;
    if (G.sel >= 0 && G.targets.includes(s)) {
      const m = SG.mv(G.sel, s); clearSel(); VIEW.hint(-1, -1);
      if (sg.net) send({ t: 'move', m, ply: sg.net.n });
      sgCommit(m);
      return;
    }
    const pc = pos.b[s];
    if (pc && SG.OWN(pc) === me && s !== G.sel) {
      const t = pos.legal().filter(m => SG.from(m) === s).map(SG.to);
      G.sel = s; G.targets = t; VIEW.select(s, t); SFX.pick();
      if (!t.length) toast('Quân này không có nước đi hợp lệ');
    } else if (G.sel >= 0) clearSel();
    else if (pc) SFX.error();
  }
  const sgCanAct = () => G.mode === 'sanguo' && !G.over && !G.thinking && !G.animating && sgPeople().includes(G.sg.pos.turn)
    && (!G.sg.net || (G.netState === 'ok' && (G.sg.net.n > 0 || G.sg.net.players.every(Boolean))));   // online: three at the table to begin

  // ---------- online: messages from the room ----------
  function sgNetMsg(m) {
    const sg = G.sg, net = sg && sg.net;
    if (!net) return;
    if ('watchers' in m) G.watchers = m.watchers | 0;
    switch (m.t) {
      case 'cheer': onCheer(m); break;
      case 'state': {
        const first = net.you < 0 && m.you >= 0;
        Object.assign(net, { you: m.you, players: m.players, info: m.info, rated: !!m.rated, tc: m.tc || null, rematch: m.rematch });
        sgTiming(m);
        G.gen = (G.gen || 0) + 1; chain = Promise.resolve(); G.animating = 0;
        G.sg = sgFresh([0, 0, 0], net); net.n = 0;
        for (const h of m.hist) typeof h === 'number' ? sgRecord(h) : sgRecordOut(h.out, h.why);
        G.sg.viewer = m.you >= 0 ? m.you : 0;
        sgHeroesNet(m.heroes); net.heroesRaw = m.heroes; net.skins = m.skins || []; net.board = m.board || '';
        if (hallUpdate(m)) { updateStatus(); break; }
        VIEW.setViewer(G.sg.viewer, false);
        G.over = null;
        if (m.over) { const [title, sub, result] = sgEndText(m.over); G.over = Object.assign({}, m.over, { shown: true, sg: true, title, sub, result }); }
        sgShowBoard(); showEnd(!!m.over); renderMoves(); updateStatus();
        if (!sgMoves().length && !m.over && (first || m.fresh)) {
          SFX.gong(); banner(m.you >= 0 ? `Bạn cầm quân ${KNAME[m.you]}` : 'Bạn đang xem trận', 'open');
          const others = [0, 1, 2].filter(k => k !== m.you && net.info[k]);
          if (net.rated && others.length) toast(`Trận xếp hạng Tam Quốc: ${others.map(k => `${KNAME[k]} ${net.info[k].name} · ${net.info[k].rating}`).join(', ')}`);
        }
        break;
      }
      case 'move':
        sgTiming(m);
        if (m.ply === net.n) sgCommit(m.m); else if (m.ply > net.n) send({ t: 'sync' });
        break;
      case 'out':
        sgTiming(m);
        if (m.ply === net.n) sgOut(m.k, m.why); else if (m.ply > net.n) send({ t: 'sync' });
        break;
      case 'presence':
        net.players = m.players; if (m.info) net.info = m.info;
        if (m.heroes) sgHeroesNet(m.heroes);
        if (m.skins) { net.skins = m.skins; net.board = m.board || ''; }
        sgTiming(m); updateStatus(); break;
      case 'over': sgTiming(m); enqueue(async () => { sgEnd(m); sgRated(m); }); break;
      case 'rated': sgRated(m); break;
      case 'rematch': net.rematch = m.want; renderEnd(); break;
      case 'error': toast(m.msg || 'Có lỗi xảy ra'); break;
      case 'kicked': leaveRoom(); toast('Chủ phòng đã mời bạn ra khỏi phòng'); break;
      case 'emote': onEmote(m); break;
    }
  }
  // each player brings their hero; a kingdom without one is led by its ruler
  function sgHeroesNet(h) { G.heroes = { 0: h[0] || RULERS[0], 1: h[1] || RULERS[1], 2: h[2] || RULERS[2] }; VIEW.setHeroes(G.heroes); }
  // clocks as the room sent them, counted down from when the message arrived
  function sgTiming(m) {
    const net = G.sg.net, t = performance.now();
    if ('clock' in m) net.clock = m.clock ? { left: m.clock.left.slice(), running: m.clock.running, at: t } : null;
    if ('deadline' in m) net.deadline = m.deadline ? { ...m.deadline, until: t + m.deadline.ms } : null;
  }
  function sgClockOf(k) {
    const c = G.sg.net && G.sg.net.clock;
    if (!c) return Infinity;
    let v = c.left[k];
    if (c.running === k && !G.over) v -= performance.now() - c.at;
    return Math.max(0, v);
  }
  function sgDeadlineText() {
    const net = G.sg.net, d = net.deadline, s = Math.max(0, Math.ceil((d.until - performance.now()) / 1000)), name = KNAME[d.side];
    if (d.kind === 'abort') return d.side === net.you ? `Đi nước đầu trong ${s} giây, không thì ván bị hủy` : `Chờ ${name} đi nước đầu · ${s}s`;
    return d.side === net.you ? `Bạn đang mất kết nối · ${s}s` : `${name} mất kết nối · rời ván sau ${s}s`;
  }
  // a player's name (signed in) or role, with the rating in ranked games; names are escaped, this goes in as HTML
  function sgWho(k) {
    const net = G.sg.net, p = net.info[k];
    if (!p) return k === net.you ? 'Bạn' : net.players[k] ? 'Người chơi' : 'Chưa vào';
    return ACCOUNT.esc(p.name) + (k === net.you ? ' (bạn)' : '') + (net.rated && p.rating ? ` <small>${p.rating}</small>` : '');
  }

  // ---------- the panel ----------
  function sgStatus() {
    const sg = G.sg, net = sg.net, pos = sg.pos, turn = pos.turn, solo = sgSolo();
    let text;
    if (G.over) text = G.over.title;
    else if (net && G.netState === 'connecting') text = 'Đang kết nối phòng…';
    else if (net && G.netState === 'lost') text = 'Mất kết nối, đang nối lại…';
    else if (net && net.deadline) text = sgDeadlineText();
    else if (net && !net.players.every(Boolean) && !sgMoves().length) text = `Đang chờ đủ ba người vào phòng (${net.players.filter(Boolean).length}/3)…`;
    else if (G.animating && !G.thinking) text = `${KNAME[G.lastMover]} đang đi quân…`;
    else if (G.thinking) text = `Máy ${KNAME[turn]} đang tính nước…`;
    else if (sgAIk(turn)) text = `Máy ${KNAME[turn]} chuẩn bị đi…`;
    else if (net && net.you < 0) text = `Đang xem · Lượt ${KNAME[turn]}`;
    else if (net && !pos.alive[net.you]) text = `Bạn đã mất nước · Lượt ${KNAME[turn]}`;
    else text = solo === turn ? `Lượt bạn · ${KNAME[turn]}` : `Lượt ${KNAME[turn]}`;
    const st = $('#status'); st.textContent = text + watchText(); st.classList.toggle('mine', sgCanAct());
    // the three kingdoms in the panel: Shu in the red slot, Wu in the green one, Wei in the black one
    PL.forEach((id, k) => {
      const el = $(id), hero = HEROES.byId[G.heroes[k]], who = el.querySelector('.who');
      el.hidden = false;
      el.querySelector('.chip').textContent = hero ? hero.han : SG.SEAL[k]; el.querySelector('.chip').title = hero ? hero.name : '';
      el.querySelector('.lab').textContent = KNAME[k];
      el.querySelector('.nm small').textContent = hero ? hero.name : '';
      if (!pos.alive[k]) who.textContent = 'Đã mất nước';
      else if (net) who.innerHTML = sgWho(k);
      else who.textContent = sgAIk(k) ? `Máy · ${(SG_LEVELS[sg.level] || SG_LEVELS[1]).name}` : solo >= 0 ? 'Bạn' : 'Người';
      const ttl = net && net.info[k] && TITLES.text(net.info[k].title);
      who.title = ttl ? `Danh hiệu: ${ttl}` : '';
      el.classList.toggle('turn', !G.over && pos.alive[k] && (G.animating ? G.lastMover : turn) === k);
      el.classList.toggle('out', !pos.alive[k]);
      el.classList.toggle('away', !!net && !net.players[k]);
    });
    const people = sgPeople();
    $('#bUndo').disabled = !!net || !sg.hist.some(h => !sg.seats[h.pos.turn]);
    $('#bHint').disabled = !!G.over || !!net || !!sg.seats[turn];
    $('#bResign').disabled = !!G.over || !people.some(k => pos.alive[k]);
    $('#bResign').textContent = $('#bResign').classList.contains('warn') ? 'Chắc chắn?' : 'Xin hàng';
    $('#bDraw').hidden = true; $('#drawAsk').hidden = true; $('#goal').hidden = true;
    const room = $('#room');
    room.hidden = !net;
    if (net) {
      const tc = net.tc ? TC_NAME[`${net.tc.base}+${net.tc.inc}`] || '' : '';
      $('#roomKind').textContent = net.rated ? `Xếp hạng Tam Quốc · ${tc}` : tc ? `Phòng Tam Quốc · ${tc}` : 'Phòng Tam Quốc';
      $('#roomCode').textContent = G.room; $('#roomLink').textContent = roomLink();
      $('#roomCode').hidden = $('#roomLink').hidden = $('#bCopy').hidden = net.rated;
    }
    $('#bNew').textContent = !net ? 'Ván mới' : net.rated ? 'Trận mới' : 'Đấu lại';
    renderClocks();
  }
  function sgClocks() {
    const net = G.sg.net, on = !!(net && net.clock);
    PL.forEach((id, k) => {
      const el = $(id + ' .clk'), v = sgClockOf(k);
      el.textContent = on && G.sg.pos.alive[k] ? fmtClock(v) : '';
      el.classList.toggle('run', on && net.clock.running === k && !G.over);
      el.classList.toggle('low', on && v < 30000);
    });
  }
  // the end screen, online: rematch (everyone moves one seat round) or a new ranked game, and rating changes
  function sgRenderEnd() {
    const net = G.sg.net, again = $('#bAgain'), o = G.over;
    again.hidden = net.you < 0; again.disabled = false;
    if (net.rated) {
      again.textContent = 'Tìm trận mới';
      const me = net.you;
      $('#endNote').textContent = o.reason === 'aborted' ? 'Ván không tính điểm.' : !o.delta ? 'Đang cập nhật điểm xếp hạng…'
        : me >= 0 ? `Điểm Tam Quốc: ${o.rating[me]} (${ACCOUNT.sign(o.delta[me])})` : [0, 1, 2].map(k => `${KNAME[k]} ${o.rating[k]} (${ACCOUNT.sign(o.delta[k])})`).join(' · ');
    } else {
      const want = net.rematch.filter(Boolean).length, mine = net.you >= 0 && net.rematch[net.you];
      again.textContent = mine ? 'Đang chờ những người khác…' : 'Đấu lại (xoay ghế)';
      again.disabled = mine;
      $('#endNote').textContent = want ? `${want}/3 người muốn đấu lại.` : '';
    }
  }

  // ---------- the hall (sảnh chờ) of a friendly room, before each game: worker/hall.js ----------
  // G.hall: { phase, host, ready, seated, stage } as the room last sent it. While the phase is 'lobby' the board is put
  // away and the players' generals stand on pedestals (VIEW.setHall); everyone picks a general, the host picks the
  // battlefield and the time, the others say they are ready, the host starts.
  let hallTab = 'hero';                                     // the dock's tab: 'hero', 'stage' or 'room'
  let hallOpen = false, hallRaf = 0, kickArm = { side: null, at: 0 };   // kickArm: a 'Mời ra' pressed once, to confirm
  const hallOf = m => ({ phase: m.phase || 'play', host: m.host, ready: m.ready || {}, seated: m.seated || {}, stage: m.stage || '', public: m.public !== false });
  const inHall = () => hallOpen && (G.mode === 'online' || sgNet());
  // the room as the hall shows it, for either game: seats left to right and who this page is
  function hallModel() {
    const h = G.hall;
    if (G.mode === 'sanguo') {
      const net = G.sg.net;
      return { ...h, kind: '3 người chơi · Tam Quốc', sides: [0, 1, 2], me: net.you >= 0 ? net.you : null, players: net.players, info: net.info,
        label: k => KNAME[k], piece: k => 20 + 10 * k + SG.K, hero: k => G.heroes[k], raw: k => (net.heroesRaw || [])[k] || '' };
    }
    return { ...h, kind: `2 người chơi · ${G.variant === 'jq' ? 'Cờ úp' : 'Cờ tướng'}`, sides: [1, -1], me: G.you || null, players: G.players, info: G.info,
      label: k => `${SIDE[k]} · ${ARMY[k]}`, piece: k => k * XQ.K, hero: k => G.heroes[k] || '', raw: k => G.heroes[k] || '' };
  }
  // what still keeps the game from starting (as the server will judge it)
  function hallWaiting(r) {
    if (r.sides.some(k => !r.seated[k])) return 'Chờ đủ người vào phòng';
    if (r.sides.some(k => !r.players[k])) return 'Có người đang mất kết nối';
    if (r.sides.some(k => k !== r.host && !r.ready[k])) return 'Chờ mọi người sẵn sàng';
    return '';
  }
  // called with each state from the room: true while the room is in its hall (the board then waits)
  function hallUpdate(m) {
    G.hall = hallOf(m);
    // a room opened by a challenge between friends stays out of the public list
    if (G.privateRoom === G.room && G.hall.phase === 'lobby' && G.hall.public && hallModel().me !== null && hallModel().me === G.hall.host) {
      send({ t: 'public', on: false }); G.privateRoom = '';
    }
    if (G.hall.phase !== 'lobby') {
      if (hallOpen) hallClose();
      VIEW.setStage(G.hall.stage || myStage());               // the game is played where the host chose
      return false;
    }
    G.over = null; showEnd(false);
    if (!hallOpen) {
      hallOpen = true; document.body.classList.add('in-hall'); $('#hall').hidden = false; VIEW.setInset(0);   // no side panel here
      SFX.init(); SFX.gong();
      const loop = () => { if (!hallOpen) return; hallPlaceCards(); hallRaf = requestAnimationFrame(loop); };
      hallRaf = requestAnimationFrame(loop);
    }
    VIEW.setStage(G.hall.stage || myStage());
    renderHall();
    return true;
  }
  function hallClose() {
    hallOpen = false; cancelAnimationFrame(hallRaf);
    document.body.classList.remove('in-hall'); $('#hall').hidden = true; $('#hallCards').innerHTML = '';
    $('#hallHeroes').innerHTML = $('#hallStages').innerHTML = '';
    VIEW.setHall(null); layoutMode();
  }
  function renderHall() {
    const r = hallModel(), me = r.me, host = me !== null && me === r.host, waiting = hallWaiting(r);
    VIEW.setHall(r.sides.map(k => (r.seated[k] ? { piece: r.piece(k), hero: r.hero(k), ready: k !== r.host && r.ready[k] } : { empty: true })));
    // a card under each pedestal: name, side, and where they stand
    $('#hallCards').innerHTML = r.sides.map(k => {
      const p = r.info[k], seated = r.seated[k], hero = HEROES.byId[r.hero(k)];
      const name = !seated ? 'Đang chờ…' : (p ? ACCOUNT.esc(p.name) : k === me ? 'Bạn' : 'Người chơi') + (k === me && p ? ' (bạn)' : '');
      const tag = !seated ? ['wait', 'Ghế trống'] : !r.players[k] ? ['away', 'Mất kết nối'] : k === r.host ? ['host', '主 Chủ phòng'] : r.ready[k] ? ['ready', 'Sẵn sàng'] : ['', 'Chưa sẵn sàng'];
      const kick = host && seated && k !== me ? `<button class="kick" type="button" data-side="${k}">${kickArm.side === k && Date.now() - kickArm.at < 3000 ? 'Chắc chắn?' : 'Mời ra'}</button>` : '';
      return `<div class="hcard${k === me ? ' you' : ''}${seated ? '' : ' empty'}"><b>${name}</b><small>${r.label(k)}${seated ? ' · ' + (hero ? hero.name : 'Tướng quân') : ''}</small><span class="tag ${tag[0]}">${tag[1]}</span>${kick}</div>`;
    }).join('');
    hallPlaceCards();
    $('#hallKind').textContent = `Sảnh chờ · ${r.kind}`;
    $('#hallCode').textContent = G.room;
    $('#status').textContent = waiting ? `Sảnh chờ · ${waiting.toLowerCase()}` : host ? 'Sảnh chờ · có thể bắt đầu' : 'Sảnh chờ · chờ chủ phòng bắt đầu';
    $('#status').classList.toggle('mine', host && !waiting);
    // the dock: one's own general (a seat is needed), the battlefield (the host's to set) in the other tab
    // tabs: one's own general (a seat is needed); the battlefield and the room's settings, the host's to set
    const stage = STAGES.byId[r.stage] || STAGES.byId[myStage()], tabs = { hero: me !== null, stage: host, room: host };
    if (!tabs[hallTab]) hallTab = tabs.hero ? 'hero' : 'stage';
    for (const [t, id] of [['hero', '#hallTabHero'], ['stage', '#hallTabStage'], ['room', '#hallTabRoom']]) { $(id).hidden = !tabs[t]; $(id).classList.toggle('on', hallTab === t); }
    $('#hallRoomOpts').hidden = !(tabs.room && hallTab === 'room');
    hallStrip($('#hallHeroes'), tabs.hero && hallTab === 'hero', () => heroPicks(r.raw(me)));
    hallStrip($('#hallStages'), tabs.stage && hallTab === 'stage', () => stagePicks(stage.id));
    $('#hallStageNote').textContent = `Bối cảnh: ${stage.name}${host ? '' : ' · chủ phòng chọn'}`;
    const tc = G.mode === 'sanguo' ? G.sg.net.tc : G.tc;
    $('#hallTc').querySelectorAll('button').forEach(b => b.classList.toggle('on', (TC[+b.dataset.v] || '') === (tc ? `${tc.base / 60000}+${tc.inc / 1000}` : '')));
    $('#hallInfo').textContent = `${r.public ? 'Công khai' : 'Riêng tư'} · ${tc ? TC_NAME[`${tc.base}+${tc.inc}`] : 'Không giờ'}${G.mode === 'online' && G.variant === 'jq' ? ' · Cờ úp' : ''}`;
    $('#hallVariant').closest('label').hidden = G.mode !== 'online';
    $('#hallVariant').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v === (G.variant === 'jq' ? 1 : 0)));
    $('#hallInfo').title = r.public ? 'Phòng hiện trong danh sách phòng đang mở: ai cũng vào được' : 'Chỉ ai có link hoặc mã phòng mới vào được';
    $('#hallPublic').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v === (r.public ? 1 : 0)));

    // the button: start (host), ready or not (the others); people watching only watch
    const go = $('#bHallGo');
    go.hidden = $('#bHallEmote').hidden = me === null;
    if (host) { go.textContent = 'Bắt đầu'; go.disabled = !!waiting; go.classList.add('primary'); go.classList.remove('gold'); }
    else if (me !== null) { const on = !!r.ready[me]; go.textContent = on ? 'Đã sẵn sàng' : 'Sẵn sàng'; go.title = on ? 'Bấm để hủy sẵn sàng' : ''; go.disabled = false; go.classList.toggle('gold', on); go.classList.toggle('primary', !on); }
    $('#hallWait').textContent = me === null ? 'Phòng đã đủ người, bạn đang xem.' : host ? (waiting || 'Mọi người đã sẵn sàng!') : r.ready[me] ? 'Chờ chủ phòng bắt đầu… (bấm để hủy)' : '';
  }
  // a strip of seals in the dock: shown or not, redrawn without losing where it was scrolled to; the first time it
  // shows, the picked one is brought into view
  function hallStrip(el, on, html) {
    el.hidden = !on;
    if (!on) return;
    const x = el.scrollLeft, first = !el.children.length;
    el.innerHTML = html();
    if (first) { const b = el.querySelector('.on'); if (b) el.scrollLeft = b.offsetLeft - el.clientWidth / 2 + b.offsetWidth / 2; }
    else el.scrollLeft = x;
  }
  function hallPlaceCards() {
    const spots = VIEW.hallSpots(), cards = $('#hallCards').children;
    for (let i = 0; i < cards.length && i < spots.length; i++) { cards[i].style.left = spots[i].x + 'px'; cards[i].style.top = spots[i].y + 'px'; }
  }
  // the pickers, shared with the menu's: generals, battlefields
  const heroPicks = cur => [{ id: '', name: 'Tướng quân', han: '帥' }, ...HEROES.list].map(h => {
    const ok = heroAllowed(h.id);
    return `<button type="button" data-id="${h.id}" class="${h.id === cur ? 'on' : ''}${ok ? '' : ' locked'}" aria-pressed="${h.id === cur}"${ok ? '' : ` title="${CAMPAIGN.requirement('hero', h.id)}"`}><span class="hz">${ok ? h.han : '鎖'}</span><span>${h.name}</span></button>`;
  }).join('');
  const stagePicks = cur => STAGES.list.map(s => {
    const ok = stageAllowed(s.id);
    return `<button type="button" data-id="${s.id}" class="${s.id === cur ? 'on' : ''}${ok ? '' : ' locked'}" aria-pressed="${s.id === cur}"${ok ? '' : ` title="${CAMPAIGN.requirement('stage', s.id)}"`}><span class="hz">${ok ? s.han : '鎖'}</span><span>${s.name}</span></button>`;
  }).join('');
  // ---------- emotes (emotes.js): set phrases across the board in an online room ----------
  // A seated player opens the picker from the panel (or the hall); what anyone says comes back from the room and
  // shows as a bubble by that player's card while their general raises the weapon. pref.muteEmotes hides the others'.
  const emoteSide = () => (G.mode === 'online' ? G.you || null : sgNet() && G.sg.net.you >= 0 ? G.sg.net.you : null);
  // the hero whose battle cry a side gives: a Tam Quốc kingdom without one has its ruler
  const cryHero = (side, hero) => hero || (G.mode === 'sanguo' ? RULERS[side] : '');
  let emoteAt = 0;
  function emotePop(open, anchor) {
    const pop = $('#emotePop'), side = emoteSide();
    if (!open || (side === null && !watching())) { pop.hidden = true; return; }
    if (side === null) {                                    // watching: cheers, and Cố lên … for each side
      const sides = G.mode === 'sanguo' ? [0, 1, 2] : [1, -1];
      pop.innerHTML = sides.map(k => `<button type="button" class="cry" data-cheer="len" data-for="${k}">${EMOTES.cheerText('len', sideName(k))}</button>`).join('')
        + EMOTES.CHEERS.map(l => `<button type="button" data-cheer="${l.id}">${l.text}</button>`).join('')
        + `<label class="mute"><input type="checkbox" id="emoteMute"${pref.muteEmotes ? ' checked' : ''}> Ẩn biểu cảm của người khác</label>`;
      return placePop(pop, anchor);
    }
    const id = cryHero(side, G.mode === 'sanguo' ? (G.sg.net.heroesRaw || [])[side] : G.heroes[side]), hero = HEROES.byId[id];
    pop.innerHTML = `<button type="button" class="cry" data-emote="cry"><span class="hz">${hero ? hero.han : '帥'}</span><span>${ACCOUNT.esc(EMOTES.text('cry', id))}</span></button>`
      + EMOTES.LINES.map(l => `<button type="button" data-emote="${l.id}">${l.text}</button>`).join('')
      + `<label class="mute"><input type="checkbox" id="emoteMute"${pref.muteEmotes ? ' checked' : ''}> Ẩn biểu cảm của người khác</label>`;
    placePop(pop, anchor);
  }
  // over the button that opened it, kept on the screen
  function placePop(pop, anchor) {
    pop.hidden = false;
    const r = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    pop.style.top = (r.top - h - 8 >= 8 ? r.top - h - 8 : r.bottom + 8) + 'px';
  }
  $('#emotePop').addEventListener('click', e => {
    const b = e.target.closest('[data-emote], [data-cheer]'); if (!b) return;
    SFX.init();
    if (Date.now() - emoteAt < EMOTES.GAP_MS) { toast('Chờ một chút rồi nói tiếp'); return; }
    emoteAt = Date.now(); emotePop(false);
    send(b.dataset.cheer ? { t: 'cheer', id: b.dataset.cheer, for: +b.dataset.for } : { t: 'emote', id: b.dataset.emote });
  });
  $('#emotePop').addEventListener('change', e => { if (e.target.id === 'emoteMute') { pref.muteEmotes = e.target.checked; savePref(); } });
  for (const id of ['#bEmote', '#bHallEmote']) $(id).addEventListener('click', e => { SFX.init(); SFX.pick(); emotePop($('#emotePop').hidden, e.currentTarget); });
  // watching an online game (a room's page without a seat)
  const watching = () => (G.mode === 'online' && !G.you && !!G.ws) || (sgNet() && G.sg.net.you < 0);
  const sideName = k => (G.mode === 'sanguo' ? KNAME[k] : SIDE[k]);
  const watchText = () => (G.watchers > 0 && (G.mode === 'online' || sgNet()) ? ` · ${G.watchers} người xem` : '');
  // a cheer from someone watching: it rises over the board, and the side cheered on raises its arms
  function onCheer(m) {
    if (pref.muteEmotes && !watching()) return;
    const sides = G.mode === 'sanguo' ? [0, 1, 2] : [1, -1];
    if (m.id === 'len' && !sides.includes(m.for)) return;
    const text = EMOTES.cheerText(m.id, sideName(m.for)); if (!text) return;
    const el = document.createElement('div');
    el.className = 'cheer'; el.textContent = text;
    el.style.left = (18 + Math.random() * 64) + '%';
    $('#bubbles').appendChild(el);
    setTimeout(() => el.remove(), 3200);
    if (m.id === 'len') VIEW.cheer(m.for, -1);
    SFX.pick();
  }
  function onEmote(m) {
    if (pref.muteEmotes && m.side !== emoteSide()) return;
    const text = EMOTES.text(m.id, cryHero(m.side, m.hero));
    if (!text) return;
    bubble(m.side, text, m.id === 'cry');
    VIEW.cheer(m.side, inHall() ? hallModel().sides.indexOf(m.side) : -1);
    if (m.id === 'cry') SFX.drum(); else SFX.pick();
  }
  // a speech bubble by a player's card: to the left of the side panel's card, above it on a phone and in the hall
  function bubble(side, text, cry) {
    const anchor = inHall() ? $('#hallCards').children[hallModel().sides.indexOf(side)] : $(G.mode === 'sanguo' ? PL[side] : side > 0 ? '#plRed' : '#plBlack');
    if (!anchor) return;
    for (const o of $('#bubbles').querySelectorAll(`[data-side="${side}"]`)) o.remove();   // one at a time each
    const b = document.createElement('div'), r = anchor.getBoundingClientRect(), beside = !inHall() && innerWidth > 760;
    b.className = 'bubble' + (cry ? ' cry' : '') + (beside ? ' left' : ''); b.dataset.side = side; b.textContent = I18N.tr(text);   // in its own words before it is measured
    $('#bubbles').appendChild(b);
    const w = b.offsetWidth, h = b.offsetHeight;
    const x = beside ? r.left - w - 12 : r.left + r.width / 2 - w / 2, y = beside ? r.top + r.height / 2 - h / 2 : r.top - h - 10;
    b.style.left = Math.max(8, Math.min(innerWidth - w - 8, x)) + 'px'; b.style.top = Math.max(8, y) + 'px';
    setTimeout(() => b.classList.add('gone'), 3200); setTimeout(() => b.remove(), 3700);
  }

  // leave the room for the menu: the room is told, and frees the seat (a game under way is given up)
  function leaveRoom() {
    if (G.ws && G.ws.readyState === 1) send({ t: 'leave' });
    disconnect(); if (hallOpen) hallClose();
    G.mode = 'menu'; G.over = null; G.hall = null; G.fen0 = XQ.START;
    history.replaceState(null, '', location.pathname);
    VIEW.setLayout('classic'); reset(); clearSel();
    G.heroes = { 1: myHero(), '-1': '' }; VIEW.setHeroes(G.heroes);
    VIEW.setBoard(G.pos.b, [], G.pos.dark); VIEW.setStage(myStage());
    showEnd(false); renderMoves(); layoutMode(); updateStatus(); showMenu(true);
  }

  // ---------- watching a finished game again, with the computer's verdicts (review.js) ----------
  // G.rv: { g (fen0, moves, names, me, winner, reason, title, heroes), id (in the games kept here, which keep the
  // analysis too) or key (a ranked game from the server: its analysis is kept for this visit), every position worked
  // out once (boards, caps, checks, legalN, log), n, ply (being looked at), shown (on the board), moving (a move
  // animating), evals and vs (the searches so far and the verdicts from them), busy, run, timer (playing on its own),
  // from ('end', 'history', 'profile'), room (a friendly room to go back to) }.
  const rvCache = new Map();
  const RV_WHY = { ...REASON, time: 'Hết giờ', abandon: 'Bỏ ván', 'perpetual-check': 'Chiếu dai', 'perpetual-chase': 'Đuổi dai', held: 'Cầm cự đủ số nước', limit: 'Hết số nước cho phép' };
  const rvDone = () => G.rv.evals.length > G.rv.n && G.rv.evals.every(Boolean);
  const rvTurn = i => XQ.Pos.fromFen(G.rv.g.fen0).turn * (i % 2 ? -1 : 1);
  function rvOpen(g, from = '') {
    const game = typeof g.moves === 'string' ? REVIEW.unpack(g) : g;
    // every position of the game, once; a move that is not legal (a damaged record) ends it there
    const pos = XQ.Pos.fromFen(game.fen0), king = () => pos.kings[pos.turn > 0 ? 0 : 1];
    const boards = [pos.b.slice()], caps = [[]], checks = [pos.inCheck() ? king() : -1], log = [], moves = [];
    let legal = pos.legal(); const legalN = [legal.length];
    for (const m of game.moves) {
      if (!legal.includes(m)) break;
      const text = XQ.notation(pos, m), side = pos.turn, cap = pos.make(m);
      moves.push(m); log.push({ text, side, cap });
      caps.push(cap ? caps[caps.length - 1].concat(cap) : caps[caps.length - 1]);
      boards.push(pos.b.slice()); checks.push(pos.inCheck() ? king() : -1);
      legal = pos.legal(); legalN.push(legal.length);
    }
    disconnect(); stopSeek(); resetOnline(); rvClose();
    G.mode = 'review'; G.gen = (G.gen || 0) + 1; aiId++; G.thinking = false; G.over = null; G.lv = null;
    chain = Promise.resolve(); G.animating = 0;
    G.fen0 = game.fen0; reset(); clearSel();
    const evals = (g.id ? REVIEW.evalsOf(g) : rvCache.get(g.key)) || [];
    G.rv = {
      g: { ...game, moves }, id: g.id || '', key: g.key || '', boards, caps, checks, legalN, log, n: moves.length, ply: 0, shown: -1, moving: false,
      evals, vs: REVIEW.verdicts(game.fen0, moves, evals), busy: false, run: 0, timer: 0, from, room: from === 'end' && game.room ? game.room : '',
    };
    history.replaceState(null, '', location.pathname);
    VIEW.setLayout('classic'); G.heroes = { 1: '', '-1': '', ...(game.heroes || {}) }; VIEW.setHeroes(G.heroes);
    VIEW.setMenu(false); VIEW.setViewer(game.me || 1);
    closePages(); showMenu(false); showEnd(false); layoutMode();
    rvShow(0); renderMoves(); updateStatus();
    SFX.init();
    if (!rvDone()) rvAnalyse();
  }
  function rvClose() {
    const rv = G.rv;
    if (!rv) return;
    clearInterval(rv.timer); rv.run++; rvKeep(rv);
    G.rv = null; VIEW.hint(-1, -1);
  }
  // back where the review was opened from: the friendly room (the seat is still ours), the list of games, the menu
  function rvExit() {
    const rv = G.rv;
    if (!rv) return;
    const { room, from } = rv;
    rvClose();
    if (room) { goOnline(room); return; }
    G.mode = 'menu'; G.fen0 = XQ.START; reset(); clearSel();
    G.heroes = { 1: myHero(), '-1': '' }; VIEW.setHeroes(G.heroes);
    VIEW.setViewer(1, true);                                 // a game watched from Black's side leaves the menu's board Red-side down
    VIEW.setBoard(G.pos.b, [], G.pos.dark); VIEW.lastMove(-1, -1); VIEW.check(-1); VIEW.hint(-1, -1); VIEW.setStage(myStage());
    renderMoves(); layoutMode(); updateStatus(); showMenu(true);
    if (from === 'history') openHistory();
  }
  // the analysis so far goes with the game
  function rvKeep(rv = G.rv) {
    if (rv.id) REVIEW.saveEvals(rv.id, rv.evals); else if (rv.key) rvCache.set(rv.key, rv.evals.slice());
  }

  // ---------- the board, a position at a time ----------
  function rvShow(i) {
    const rv = G.rv;
    VIEW.setBoard(rv.boards[i], rv.caps[i]); rv.shown = i; rvMarks();
  }
  // the last move, a check, and where a poor move should have gone
  function rvMarks() {
    const rv = G.rv, i = rv.shown, m = rv.g.moves[i - 1], v = rv.vs[i - 1];
    VIEW.lastMove(m ? XQ.from(m) : -1, m ? XQ.to(m) : -1);
    VIEW.check(rv.checks[i]);
    if (v && v.best && ['blunder', 'mistake', 'inaccuracy'].includes(v.mark)) VIEW.hint(XQ.from(v.best), XQ.to(v.best)); else VIEW.hint(-1, -1);
  }
  // to position i: one step forward is played out by the warriors, anything else is laid out at once; while a move
  // is under way the board catches up with the latest ask when it is over
  async function rvGo(i, animate = false) {
    const rv = G.rv;
    if (!rv) return;
    i = Math.max(0, Math.min(rv.n, i));
    if (i === rv.ply && i === rv.shown) return;
    rv.ply = i; rvRender();
    if (rv.moving) return;
    if (animate && i === rv.shown + 1) {
      rv.moving = true; VIEW.hint(-1, -1); VIEW.check(-1);
      // the moments worth a close look: a fine move, a blunder, and the mate that ended the game
      const v = rv.vs[i - 1], mate = i === rv.n && rv.g.reason === 'checkmate' && rv.g.winner;
      const cinema = !pref.cinema ? '' : mate ? 'mate' : v && (v.mark === 'good' || v.mark === 'blunder') ? v.mark : '';
      if (cinema) banner({ good: 'Nước hay!', blunder: 'Nước hớ!', mate: 'Chiếu bí!' }[cinema], cinema === 'blunder' ? 'check' : 'open');
      await VIEW.play(rv.g.moves[i - 1], { closeUp: false, cinema });
      if (cinema === 'mate' && G.rv === rv) { SFX.drum(); VIEW.defeat(rv.boards[i].indexOf(XQ.K * -rv.g.winner), true); }
      rv.moving = false;
      if (G.rv !== rv) return;
      rv.shown = i;
      if (rv.ply !== i) rvShow(rv.ply); else rvMarks();
    } else rvShow(i);
  }
  function rvStep(d) { rvAuto(false); rvGo(G.rv.ply + d, d === 1); }
  // playing on its own, a move every 1.4 seconds
  function rvAuto(on) {
    const rv = G.rv;
    clearInterval(rv.timer); rv.timer = 0;
    if (on) {
      if (rv.ply >= rv.n) rvGo(0);
      rv.timer = setInterval(() => {
        if (G.rv !== rv || rv.moving) return;
        if (rv.ply >= rv.n) { rvAuto(false); return; }
        rvGo(rv.ply + 1, true);
      }, 1400);
    }
    rvRender();
  }

  // ---------- the computer's verdicts ----------
  // every position searched in turn (about half a minute for a whole game, less per position the longer it is);
  // where the move played was the computer's own choice, the second best too, to tell a good find from the obvious
  async function rvAnalyse() {
    const rv = G.rv;
    if (!rv || rv.busy || rvDone()) return;
    rv.busy = true;
    const run = rv.run, g = rv.g, n = rv.n, time = Math.round(Math.max(160, Math.min(700, 26000 / (n + 1) / 1.35)));
    rvRender();
    for (let i = 0; i <= n; i++) {
      if (rv.evals[i]) continue;
      const job = { fen: g.fen0, moves: g.moves.slice(0, i), time, full: true }, r = await ask(job);
      if (G.rv !== rv || run !== rv.run) return;
      const e = { s: r.score, b: r.move };
      if (i < n && r.move === g.moves[i] && rv.legalN[i] > 2) {
        e.a = (await ask({ ...job, exclude: [r.move] })).score;
        if (G.rv !== rv || run !== rv.run) return;
      }
      rv.evals[i] = e;
      rv.vs = REVIEW.verdicts(g.fen0, g.moves, rv.evals);
      if (i % 12 === 11) rvKeep();
      rvRender();
      if (rv.shown === i + 1 || rv.shown === i) rvMarks();
    }
    rv.busy = false; rvKeep(); renderMoves(); updateStatus(); rvMarks();
    toast('Đã phân tích xong: chọn từng nước để xem lời bình');
  }

  // ---------- the panel ----------
  function rvStatus() {
    const rv = G.rv, g = rv.g, turn = rvTurn(rv.ply), done = rvDone();
    $('#status').textContent = `Xem lại · ${g.title || 'Ván cờ'}`; $('#status').classList.remove('mine');
    for (const side of [1, -1]) {
      const el = $(side > 0 ? '#plRed' : '#plBlack'), hero = HEROES.byId[G.heroes[side]], acc = done ? REVIEW.accuracy(rv.vs, side) : null;
      el.querySelector('.chip').textContent = hero ? hero.han : side > 0 ? '帥' : '將'; el.querySelector('.chip').title = hero ? hero.name : '';
      el.querySelector('.lab').textContent = SIDE[side];
      el.querySelector('.nm small').textContent = hero ? hero.name : ARMY[side];
      el.querySelector('.who').innerHTML = ACCOUNT.esc((g.names || {})[side] || '') + (acc != null ? ` <small>${acc}%</small>` : '');
      el.querySelector('.who').title = acc != null ? `Độ chính xác ${acc}%` : '';
      el.classList.toggle('turn', rv.ply < rv.n && turn === side);
      el.classList.remove('away', 'out');
    }
    $('#plGreen').hidden = true; $('#room').hidden = true; $('#goal').hidden = true; $('#drawAsk').hidden = true; $('#bDraw').hidden = true;
    $('#bNew').textContent = rv.room ? 'Về phòng' : 'Thoát xem lại';
    renderClocks();
    rvRender();
  }
  function rvEndText() {
    const g = G.rv.g, why = RV_WHY[g.reason] || '';
    return `Kết thúc: ${g.winner ? `${SIDE[g.winner]} thắng` : g.reason === 'held' ? 'giữ được thành' : 'hòa'}${why ? ` · ${why}` : ''}`;
  }
  function rvRender() {
    const rv = G.rv;
    if (!rv) return;
    const n = rv.n, i = rv.ply, v = rv.vs[i - 1], e = rv.evals[i], done = rvDone(), got = rv.evals.filter(Boolean).length;
    $('#rvPly').textContent = i ? `Nước ${Math.ceil(i / 2)} · ${i}/${n}` : `Thế đầu · 0/${n}`;
    let say;
    if (!i) say = 'Thế cờ ban đầu. Dùng các nút dưới đây, phím ← → hoặc chạm vào biên bản để đi từng nước.';
    else {
      const x = rv.log[i - 1], mk = v ? REVIEW.MARK[v.mark][0] : '';
      say = `<b class="${x.side > 0 ? 'r' : 'b'}">${SIDE[x.side]}: ${x.text}${mk ? ` <i class="mk ${v.mark}">${mk}</i>` : ''}</b> ${v ? ACCOUNT.esc(REVIEW.comment(v)) : rv.busy ? 'Đang phân tích…' : ''}`;
    }
    if (e) say += ` <small>${REVIEW.standText(e.s, rvTurn(i))}</small>`;
    if (i === n) say += ` <small>${rvEndText()}</small>`;
    $('#rvSay').innerHTML = say;
    $('#rvChart').hidden = !got;
    if (got) $('#rvChart').innerHTML = REVIEW.chart(rv.g.fen0, rv.g.moves, rv.evals, rv.vs, i);
    // each side's play in sum, once the whole game is analysed
    $('#rvSum').hidden = !done;
    if (done) $('#rvSum').innerHTML = [1, -1].map(side => {
      const c = REVIEW.counts(rv.vs, side), acc = REVIEW.accuracy(rv.vs, side);
      return `<div class="${side > 0 ? 'r' : 'b'}"><b>${SIDE[side]}</b><span class="acc">${acc == null ? '–' : acc + '%'}</span>`
        + `<span title="Nước hay">! ${c.good}</span><span title="Chưa chính xác">?! ${c.inaccuracy}</span><span title="Sai lầm">? ${c.mistake}</span><span title="Nước hớ">?? ${c.blunder}</span></div>`;
    }).join('');
    const an = $('#bAnalyse');
    an.hidden = done; an.disabled = rv.busy;
    an.textContent = rv.busy ? `Máy đang chấm từng nước… ${Math.round((100 * got) / (n + 1))}%` : got ? 'Phân tích tiếp' : 'Phân tích ván';
    $('#rvFirst').disabled = $('#rvPrev').disabled = !i; $('#rvNext').disabled = $('#rvLast').disabled = i >= n;
    $('#rvPlay').classList.toggle('on', !!rv.timer); $('#rvPlay').setAttribute('aria-label', rv.timer ? 'Dừng' : 'Tự chạy');
    $('#rvPlay').innerHTML = rv.timer ? '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>';
    renderMoves();
  }

  // ---------- the games kept on this device (Ván đã chơi) ----------
  function openHistory() { $('#history').hidden = false; renderHistory(); }
  function renderHistory() {
    const list = REVIEW.list(), box = $('#hiList');
    $('#hiSum').textContent = list.length ? `${list.length} ván gần nhất trên máy này` : 'Chưa có ván nào';
    if (!list.length) { box.innerHTML = '<li class="empty"><p class="note">Đánh xong một ván cờ tướng (với máy, chiến dịch, Chân Long Kỳ Trận hay online) là ván đó được lưu ở đây, để xem lại từng nước và nhờ máy phân tích.</p></li>'; return; }
    box.innerHTML = list.map(g => {
      const me = g.me, won = g.reason === 'held' || (me && g.winner === me) ? 1 : me && g.winner === -me ? -1 : 0;
      const res = !me ? ['draw', '觀'] : won > 0 ? ['win', '勝'] : won < 0 ? ['lose', '敗'] : ['draw', '和'];
      const plies = g.moves ? String(g.moves).split(',').length : 0, names = g.names || {};
      const who = me ? `${SIDE[me]} · gặp ${ACCOUNT.esc(names[-me] || '')}` : `${ACCOUNT.esc(names[1] || '')} – ${ACCOUNT.esc(names[-1] || '')}`;
      let acc = null;
      if (g.evals && me) { const u = REVIEW.unpack(g); acc = REVIEW.accuracy(REVIEW.verdicts(u.fen0, u.moves, REVIEW.evalsOf(g)), me); }
      const at = new Date(g.at), when = `${at.toLocaleDateString('vi-VN')} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
      return `<li class="${res[0]}"><span class="r">${res[1]}</span><span class="vs"><b>${ACCOUNT.esc(g.title || 'Ván cờ')}</b><br><small>${who} · ${Math.ceil(plies / 2)} nước · ${when}</small></span>`
        + `<span class="d"><button class="btn" type="button" data-open="${g.id}">Xem lại</button>${acc != null ? `<small>Chính xác ${acc}%</small>` : ''}</span></li>`;
    }).join('');
  }
  $('#hiList').addEventListener('click', e => {
    const b = e.target.closest('[data-open]'); if (!b) return;
    const g = REVIEW.get(b.dataset.open);
    SFX.init(); SFX.pick();
    if (g) rvOpen(g, 'history'); else renderHistory();
  });
  $('#bHistoryClose').addEventListener('click', () => { $('#history').hidden = true; });
  // a ranked game from a profile: fetched, then watched like the others
  ACCOUNT.onReplay(async id => {
    try {
      const r = await fetch('api/game/' + id, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json(), u = ACCOUNT.user, me = u ? (u.id === j.red.id ? 1 : u.id === j.black.id ? -1 : 0) : 0;
      SFX.init();
      rvOpen({ key: 'game:' + id, fen0: XQ.START, moves: j.moves, me, names: { 1: j.red.name, '-1': j.black.name }, winner: j.winner, reason: j.reason, title: `Xếp hạng · ${j.red.name} – ${j.black.name}` }, 'profile');
    } catch (e) { toast('Không tải được ván cờ này'); }
  });
  // the controls
  $('#rvFirst').addEventListener('click', () => { rvAuto(false); rvGo(0); });
  $('#rvPrev').addEventListener('click', () => rvStep(-1));
  $('#rvPlay').addEventListener('click', () => { SFX.init(); rvAuto(!G.rv.timer); });
  $('#rvNext').addEventListener('click', () => { SFX.init(); rvStep(1); });
  $('#rvLast').addEventListener('click', () => { rvAuto(false); rvGo(G.rv.n); });
  // the review's camera moments (rvGo), on unless turned off
  const cinemaBtn = () => { $('#rvCinema').classList.toggle('on', !!pref.cinema); $('#rvCinema').setAttribute('aria-pressed', !!pref.cinema); };
  if (pref.cinema === undefined) pref.cinema = true;
  cinemaBtn();
  $('#rvCinema').addEventListener('click', () => { SFX.init(); SFX.pick(); pref.cinema = !pref.cinema; savePref(); cinemaBtn(); toast(pref.cinema ? 'Bật camera điện ảnh: nước hay, nước hớ và chiếu bí được quay cận cảnh' : 'Tắt camera điện ảnh'); });
  $('#rvFlip').addEventListener('click', () => { const v = -(G.rv.viewer || G.rv.g.me || 1); G.rv.viewer = v; VIEW.setViewer(v); rvShow(G.rv.shown); });
  $('#bAnalyse').addEventListener('click', () => rvAnalyse());
  $('#rvChart').addEventListener('click', e => {
    const r = e.currentTarget.getBoundingClientRect();
    rvAuto(false); rvGo(Math.round(((e.clientX - r.left) / r.width) * G.rv.n));
  });
  $('#moves').addEventListener('click', e => {
    const m = e.target.closest('[data-ply]');
    if (m && G.mode === 'review') { rvAuto(false); rvGo(+m.dataset.ply); }
  });
  addEventListener('keydown', e => {
    if (G.mode !== 'review' || !$('#menu').hidden || e.target.closest('input, textarea, select')) return;
    const k = { ArrowLeft: () => rvStep(-1), ArrowRight: () => rvStep(1), Home: () => rvGo(0), End: () => rvGo(G.rv.n), ' ': () => rvAuto(!G.rv.timer) }[e.key];
    if (k) { e.preventDefault(); if (e.key === 'Home' || e.key === 'End') rvAuto(false); k(); }
  });

  // ---------- input on the board ----------
  function clearSel() { G.sel = -1; G.targets = []; VIEW.select(-1, []); }
  const myTurn = () => G.mode !== 'menu' && !G.over && !G.thinking && G.pos.turn === G.me && (G.mode !== 'online' || G.you === G.me);
  const canAct = () => myTurn() && !G.animating && !(G.sent && performance.now() - G.sent < 4000);
  // the scene took its effects down a step on a slow device (scene.js setQuality)
  VIEW.onQuality = q => toast(q === 'low' ? 'Máy hơi chậm: đã tắt bóng đổ để chơi mượt hơn' : 'Máy hơi chậm: đã giảm hiệu ứng để chơi mượt hơn');
  VIEW.onTap = s => {
    SFX.init();
    if (G.mode === 'review') return;
    if (G.mode === 'sanguo') { sgTap(s); return; }
    if (!canAct()) return;
    if (G.sel >= 0 && G.targets.includes(s)) {
      const m = XQ.mv(G.sel, s); clearSel(); VIEW.hint(-1, -1);
      if (G.mode === 'online') send({ t: 'move', m, ply: G.moves.length });
      if (G.mode === 'online' && G.pos.dark) { G.sent = performance.now(); SFX.pick(); return; }
      commit(m);
      return;
    }
    const pc = G.pos.b[s];
    if (pc && Math.sign(pc) === G.me && s !== G.sel) {
      const t = legalFrom(s);
      G.sel = s; G.targets = t; VIEW.select(s, t); SFX.pick();
      if (!t.length) toast('Quân này không có nước đi hợp lệ');
    } else if (G.sel >= 0) { clearSel(); }
    else if (pc) SFX.error();
  };
  VIEW.onHover(s => {
    if (s < 0 || G.mode === 'review') return false;
    if (G.mode === 'sanguo') return sgCanAct() && ((G.sg.pos.b[s] && SG.OWN(G.sg.pos.b[s]) === G.sg.pos.turn) || G.targets.includes(s));
    return canAct() && ((G.pos.b[s] && Math.sign(G.pos.b[s]) === G.me) || G.targets.includes(s));
  });

  // ---------- interface ----------
  function toast(text) {
    const t = $('#toast'); t.textContent = text; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function banner(text, kind) {
    const b = $('#banner'); b.innerHTML = `<span>${text}</span>`; b.dataset.kind = kind;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }
  function renderMoves() {
    const ol = $('#moves'); let h = '';
    if (G.mode === 'sanguo') {
      let n = 0;
      for (const x of G.sg.log) {
        if (x.fall) h += `<li class="tri fall"><em>✕</em><span>${KNAME[x.fall.k]} ${x.fall.by < 0 ? 'xin hàng, rút quân khỏi bàn' : `diệt vong, tàn quân về ${KNAME[x.fall.by]}`}</span></li>`;
        else h += `<li class="tri"><em>${++n}</em><span class="mv k${x.k}${x.cap ? ' cap' : ''}"><b>${KNAME[x.k]}</b> ${x.text}</span></li>`;
      }
      ol.innerHTML = h || '<li class="empty">Chưa có nước nào. Thục đi trước, rồi Ngô, rồi Ngụy.</li>';
      ol.scrollTop = ol.scrollHeight;
      $('#moveCount').textContent = n ? `${Math.ceil(n / 3)} vòng` : '';
      return;
    }
    if (G.mode === 'review') {
      // each move can be picked; the computer's mark beside it, the one looked at stands out
      const rv = G.rv;
      const cell = k => {
        const x = rv.log[k]; if (!x) return '<span class="mv"></span>';
        const v = rv.vs[k], mk = v ? REVIEW.MARK[v.mark][0] : '';
        return `<span class="mv ${x.side > 0 ? 'r' : 'b'}${x.cap ? ' cap' : ''}${k + 1 === rv.ply ? ' at' : ''}" data-ply="${k + 1}">${x.text}${mk ? `<i class="mk ${v.mark}">${mk}</i>` : ''}</span>`;
      };
      for (let i = 0; i < rv.log.length; i += 2) h += `<li><em>${i / 2 + 1}</em>${cell(i)}${cell(i + 1)}</li>`;
      ol.innerHTML = h || '<li class="empty">Ván này chưa có nước nào.</li>';
      // the move looked at is kept in view, once each time it changes (the list may be scrolled meanwhile)
      const at = ol.querySelector('.at');
      if (rv.scrolled !== rv.ply) {
        rv.scrolled = rv.ply;
        if (!at) ol.scrollTop = 0;
        else { const r = at.getBoundingClientRect(), o = ol.getBoundingClientRect(); if (r.top < o.top || r.bottom > o.bottom) ol.scrollTop += r.top - o.top - o.height / 2; }
      }
      $('#moveCount').textContent = rv.n ? `${Math.ceil(rv.n / 2)} nước` : '';
      return;
    }
    for (let i = 0; i < G.log.length; i += 2) {
      const a = G.log[i], b = G.log[i + 1];
      const cell = x => x ? `<span class="mv ${x.side > 0 ? 'r' : 'b'}${x.cap ? ' cap' : ''}">${x.text}</span>` : '<span class="mv"></span>';
      h += `<li><em>${i / 2 + 1}</em>${cell(a)}${cell(b)}</li>`;
    }
    ol.innerHTML = h || '<li class="empty">Chưa có nước nào. Đỏ đi trước.</li>';
    ol.scrollTop = ol.scrollHeight;
    $('#moveCount').textContent = G.log.length ? `${Math.ceil(G.log.length / 2)} nước` : '';
  }
  // the looks on the board: in a room each player's side wears their own and the board is the host's; elsewhere the
  // player's own side wears theirs (both sides on the menu), the computer's the plain ones
  function applySkins() {
    const mine = mySkins(), s = { board: mine.board, pieces: {}, army: {} };
    const wear = (k, o) => { s.pieces[k] = o.pieces; s.army[k] = o.army; };
    const net = G.mode === 'sanguo' && G.sg && G.sg.net;
    if (G.mode === 'online') { for (const k of [1, -1]) wear(k, SKINS.unpack(G.skins[k])); if (G.boardSkin) s.board = G.boardSkin; }
    else if (net) { [0, 1, 2].forEach(k => wear(k, SKINS.unpack((net.skins || [])[k]))); if (net.board) s.board = net.board; }
    else if (G.mode === 'sanguo') for (const k of sgPeople()) wear(k, mine);
    else for (const k of G.mode === 'menu' ? [1, -1] : [G.me]) wear(k, mine);
    VIEW.setSkins(s);
  }
  function updateStatus() {
    applySkins();
    $('#bEmote').hidden = emoteSide() === null && !watching();   // emotes: the seated players of an online room; cheers: those watching
    $('#bEmote').textContent = emoteSide() === null ? 'Cổ vũ' : 'Biểu cảm';
    if (emoteSide() === null && !watching()) $('#emotePop').hidden = true;
    if (inHall()) { renderHall(); return; }
    if (G.mode === 'sanguo') { sgStatus(); return; }
    if (G.mode === 'review') { rvStatus(); return; }
    const st = $('#status'), turn = G.pos.turn;
    let text = '';
    if (G.mode === 'menu') text = '';
    else if (G.over) text = endText()[0];
    else if (G.animating && !G.thinking) text = vsAI() ? (G.lastMover === G.me ? 'Máy chuẩn bị đi…' : 'Máy đang đi quân…')
      : G.lastMover === G.you ? 'Đã đi, chờ đối thủ…' : G.you ? 'Đối thủ đang đi quân…' : `${SIDE[G.lastMover]} đang đi quân…`;
    else if (vsAI()) text = G.thinking ? 'Máy đang tính nước…' : turn === G.me ? `Lượt bạn · ${SIDE[G.me]}` : 'Máy chuẩn bị đi…';
    else if (G.mode === 'lesson') text = 'Học chơi';
    else if (G.mode === 'online') {
      if (G.netState === 'connecting') text = 'Đang kết nối phòng…';
      else if (G.netState === 'lost') text = 'Mất kết nối, đang nối lại…';
      else if (G.deadline && !G.over) text = deadlineText();
      else if (G.you && !G.players[-G.you]) text = 'Đang chờ đối thủ vào phòng…';
      else if (!G.you) text = `Đang xem · Lượt ${SIDE[turn]}`;
      else text = turn === G.you ? `Lượt bạn · ${SIDE[G.you]}` : 'Lượt đối thủ';
    }
    if (text && G.pos.dark && !G.over && G.mode !== 'menu') text = 'Cờ úp · ' + text;
    if (text && G.mode === 'online') text += watchText();
    st.textContent = text;
    st.classList.toggle('mine', !G.over && !G.animating && myTurn());
    for (const side of [1, -1]) {
      const el = $(side > 0 ? '#plRed' : '#plBlack'), hero = HEROES.byId[G.mode === 'menu' ? '' : G.heroes[side]];
      const chip = el.querySelector('.chip');
      chip.textContent = hero ? hero.han : side > 0 ? '帥' : '將'; chip.title = hero ? hero.name : '';
      const foe = G.mode === 'campaign' && side !== G.me && (CAMPAIGN.chapter(G.lv.chapter) || {}).foeName;
      el.querySelector('.lab').textContent = SIDE[side];
      el.querySelector('.nm small').textContent = hero ? hero.name : foe || ARMY[side];
      let who = '';
      if (G.mode === 'ai') who = side === G.me ? 'Bạn' : `Máy · ${LEVELS[G.level].name}`;
      else if (G.mode === 'campaign') who = side === G.me ? 'Bạn' : 'Máy';
      else if (G.mode === 'lesson') who = side === G.me ? 'Bạn' : '';
      else if (G.mode === 'online') who = whoOnline(side);
      el.querySelector('.who').innerHTML = who;
      const ttl = G.mode === 'online' && G.info[side] && TITLES.text(G.info[side].title);
      el.querySelector('.who').title = ttl ? `Danh hiệu: ${ttl}` : '';
      el.classList.toggle('turn', !G.over && G.mode !== 'menu' && (G.animating ? -G.lastMover : turn) === side);
      el.classList.toggle('away', G.mode === 'online' && !G.players[side]);
      el.classList.remove('out');
    }
    $('#plGreen').hidden = true;
    $('#bResign').textContent = $('#bResign').classList.contains('warn') ? 'Chắc chắn?' : 'Xin thua';
    $('#bUndo').disabled = !vsAI() || !G.moves.length;
    $('#bHint').disabled = !vsAI() || !!G.over;
    $('#bResign').disabled = !!G.over || G.mode === 'menu' || G.mode === 'lesson' || (G.mode === 'online' && !G.you);
    // draw offers (online): mine pending, theirs waiting for an answer
    const canDraw = G.mode === 'online' && !!G.you && !G.over, mine = canDraw && G.drawOffer === G.you, theirs = canDraw && G.drawOffer === -G.you;
    const bDraw = $('#bDraw');
    bDraw.hidden = G.mode !== 'online' || theirs;   // their offer is answered in #drawAsk
    bDraw.disabled = !canDraw || mine;
    bDraw.textContent = mine ? 'Đã cầu hòa' : 'Cầu hòa';
    $('#drawAsk').hidden = !theirs;
    const room = $('#room');
    room.hidden = G.mode !== 'online';
    if (G.mode === 'online') {
      const tc = G.tc ? TC_NAME[`${G.tc.base}+${G.tc.inc}`] || '' : '';
      $('#roomKind').textContent = G.rated ? `Trận xếp hạng · ${tc}` : tc ? `Phòng · ${tc}` : 'Phòng';
      $('#roomCode').textContent = G.room; $('#roomLink').textContent = roomLink();
      $('#roomCode').hidden = $('#roomLink').hidden = $('#bCopy').hidden = G.rated;
    }
    $('#bNew').textContent = G.mode === 'campaign' ? 'Đánh lại' : G.mode === 'lesson' ? 'Làm lại' : G.mode !== 'online' ? 'Ván mới' : G.rated ? 'Trận mới' : 'Đấu lại';
    renderGoal();
    renderClocks();
  }
  // the battle's objective and how far along it is, in the side panel
  function renderGoal() {
    const box = $('#goal');
    box.hidden = G.mode !== 'campaign' && G.mode !== 'lesson';
    if (G.mode === 'lesson') {
      const l = LESSONS.byId[G.lesson.id];
      $('#goalName').textContent = `${l.name} · Bước ${G.lesson.i + 1}/${l.steps.length}`;
      $('#goalText').textContent = l.steps[G.lesson.i].say;
      $('#goalCount').textContent = 'Chạm vào một quân để xem nó đi được những đâu.';
      $('#goalHelp').hidden = true;
      return;
    }
    if (G.mode !== 'campaign') return;
    const lv = G.lv, r = CAMPAIGN.judge(lv, G.moves);
    $('#goalName').textContent = lv.daily ? `Chân Long Kỳ Trận · Trận ${lv.no}` : `${lv.id} · ${lv.name}`;
    $('#goalText').textContent = CAMPAIGN.goal(lv);
    $('#goalCount').textContent = lv.type === 'mate' ? `Nước của bạn: ${r.mine}/${lv.n} (tối đa ${lv.n + 2})`
      : lv.type === 'survive' ? `Đã cầm cự: ${Math.min(r.theirs, lv.n)}/${lv.n} nước · còn ${r.pieces} quân`
      : `Nước của bạn: ${r.mine} · thắng trong ${lv.par} nước được thêm ★`;
    $('#goalHelp').hidden = !G.help;
    $('#goalHelp').textContent = lv.daily ? 'Đã dùng Đi lại hoặc Gợi ý: không vào bảng nhanh nhất' : 'Đã dùng Đi lại hoặc Gợi ý: tối đa 2 sao';
  }
  // a player's name (signed in) or role, with the rating in ranked games; names are escaped, this goes in as HTML
  function whoOnline(side) {
    const p = G.info[side];
    if (!p) return side === G.you ? 'Bạn' : G.players[side] ? (G.you ? 'Đối thủ' : 'Người chơi') : 'Chưa vào';
    return ACCOUNT.esc(p.name) + (side === G.you ? ' (bạn)' : '') + (G.rated && p.rating ? ` <small>${p.rating}</small>` : '');
  }
  function layoutMode() {
    document.body.dataset.mode = G.mode;
    // what friends see, and the room they can come and watch
    FRIENDS.setStatus(G.mode === 'menu' || G.mode === 'review' ? 'online' : 'playing', G.mode === 'online' ? 'xq:' + G.room : sgNet() ? 'sg:' + G.room : '');
    frameBoard();
    $('#bUndo').hidden = $('#bHint').hidden = !(vsAI() || (G.mode === 'sanguo' && !G.sg.net && sgPeople().length));
  }
  // the board's framing: clear of the side panel in a game (on the right); over the menu, risen clear of the home
  // page's dock, or else clear of the menu's column (on the left), as wide as the page shown in it
  function frameBoard() {
    const menu = !$('#menu').hidden, home = menu && curView === 'home' && !document.body.dataset.page;
    if (hallOpen) VIEW.setInset(0);
    else if (G.mode !== 'menu') VIEW.setInset(innerWidth > 760 ? 332 : 0);
    else if (home) VIEW.setInset(0, Math.max(0, Math.round(innerHeight - $('#menu .dock').getBoundingClientRect().top)));
    else if (!menu || innerWidth <= 760) VIEW.setInset(0);
    else VIEW.setInset(-Math.round($(`#${document.body.dataset.page || 'menu'} .card`).getBoundingClientRect().right));
  }
  function showMenu(on) {
    $('#menu').hidden = !on;
    document.body.classList.toggle('in-menu', on);
    if (!on) mePop(false);
    frameBoard();
    $('#bResume').hidden = !(on && G.mode !== 'menu');
    $('#bResume').textContent = G.mode === 'review' ? 'Tiếp tục xem lại' : 'Tiếp tục ván đang chơi';
    if (on) { menuView('home'); VIEW.setMenu(G.mode === 'menu'); }
  }
  // the menu's pages: 'home' lists the ways to play, the others hold each one's options
  let curView = 'home';
  function menuView(name) {
    document.querySelectorAll('#menu .view').forEach(v => { v.hidden = v.dataset.view !== name; });
    $('#menu').dataset.at = curView = name; navMark(); frameBoard();   // the home page's column is wider
    $('#menu .legal').hidden = name !== 'home';             // the legal links only beside the short home page
    $('#menu').scrollTop = 0;
    clearTimeout(roomsT); loadRooms();
  }
  // ---------- the open friendly rooms (worker/lobby.js, rooms.js) ----------
  // The Phòng chơi page of each game: a filter (a free seat, playing, all, each with how many rooms it holds), a search
  // by code or host's name, a page of rooms at a time with Xem thêm for more, and Vào nhanh into the best free seat.
  // Fetched every few seconds while that page is open; the home page only shows each game's counts, less often.
  let roomsT = 0, roomsAsk = 0;
  const ROOM_STATUS = { waiting: 'Chờ kiện tướng', playing: 'Đang chiến đấu' }, TC_LABEL = { '10+5': '10′ + 5s', '5+3': '5′ + 3s' };
  const ROOM_F = ['open', 'playing', 'all'], ROOM_PAGE = 20;
  const roomUi = {   // by game: the filter picked, how many rooms are shown, and the page's elements
    xq: { f: 0, n: ROOM_PAGE, list: '#roomList', sum: '#roomSum', filter: '#roomFilter', more: '#roomMore', quick: '#roomQuick', input: '#inRoom', note: '#xqRoomsNote', join: goOnline },
    sg: { f: 0, n: ROOM_PAGE, list: '#sgRoomList', sum: '#sgRoomSum', filter: '#sgRoomFilter', more: '#sgRoomMore', quick: '#sgRoomQuick', input: '#inSgRoom', note: '#sgRoomsNote', join: code => sgOnline(code) },
  };
  const askRooms = async q => (await fetch('rooms?' + new URLSearchParams(q), { cache: 'no-store' })).json();
  async function loadRooms() {
    const page = ['home', 'xq-rooms', 'sg-rooms', 'xq-ranked', 'sg-ranked'].find(v => !$(`#menu .view[data-view="${v}"]`).hidden);
    if ($('#menu').hidden || !page || !G.online) return;
    const id = ++roomsAsk, home = page === 'home', live = /ranked$/.test(page), ui = home || live ? null : roomUi[page.slice(0, 2)];
    try {
      if (home) {   // just how many rooms each game has open, beside its Phòng chơi
        const rs = await Promise.all(['xq', 'sg'].map(v => askRooms({ v, n: 0 })));
        if (id !== roomsAsk) return;                        // a newer question went out meanwhile
        rs.forEach(({ counts: c }, i) => { $(roomUi[i ? 'sg' : 'xq'].note).textContent = c.all ? `${c.all} phòng${c.open ? ` · ${c.open} còn chỗ` : ''}` : 'Mời bạn bè'; });
      } else if (live) {   // the ranked games under way, to watch
        const v = page.slice(0, 2), r = await (await fetch('live?v=' + v, { cache: 'no-store' })).json();
        if (id !== roomsAsk) return;
        renderLive(v, r);
      } else {
        const r = await askRooms({ v: page.slice(0, 2), f: ROOM_F[ui.f], q: $(ui.input).value.trim(), n: ui.n });
        if (id !== roomsAsk) return;
        renderRooms(ui, r);
      }
    } catch (e) {
      if (ui) $(ui.list).innerHTML = '<p class="note">Không tải được danh sách phòng.</p>';
      if (live) $(page[0] === 's' ? '#sgLiveList' : '#liveList').innerHTML = '<p class="note">Không tải được danh sách ván.</p>';
    }
    clearTimeout(roomsT); roomsT = setTimeout(loadRooms, home ? 15000 : live ? 8000 : 4000);
  }
  // ranked games under way: the players with their ratings, the strongest first, and how long they have been at it
  function renderLive(v, { games, total }) {
    const box = $(v === 'sg' ? '#sgLiveList' : '#liveList');
    $(v === 'sg' ? '#sgLiveSum' : '#liveSum').textContent = total ? `${total} ván` : '';
    const ago = at => { const m = Math.max(0, Math.round((Date.now() - at) / 60000)); return m < 1 ? 'vừa bắt đầu' : `bắt đầu ${m} phút trước`; };
    box.innerHTML = games.length ? games.map(g => `<button type="button" class="room-row live" data-code="${cleanRoom(g.code)}" data-v="${g.v === 'sg' ? 'sg' : 'xq'}">`
      + `<span class="st live">Trực tiếp</span><span class="ri"><b>${g.players.map(p => `${ACCOUNT.esc(p.name)} <i>${p.rating | 0}</i>`).join(' – ')}</b>`
      + `<small>Điểm trung bình ${g.avg} · ${ago(g.at)}</small></span><span class="cnt"></span><span class="go">Xem</span></button>`).join('')
      : `<p class="note">Lúc này chưa có ván xếp hạng ${v === 'sg' ? 'Tam Quốc ' : ''}nào đang diễn ra.</p>`;
  }
  function renderRooms(ui, { rooms: list, total, counts: c }) {
    const searching = !!$(ui.input).value.trim();
    $(ui.sum).textContent = `${c.all} phòng · ${c.open} còn chỗ`;
    $(ui.filter).querySelectorAll('button').forEach((b, i) => {
      b.classList.toggle('on', i === ui.f);
      b.innerHTML = `${['Còn chỗ', 'Đang chiến đấu', 'Tất cả'][i]}<i>${c[ROOM_F[i]]}</i>`;
    });
    $(ui.more).hidden = total <= list.length;
    $(ui.more).textContent = `Xem thêm (còn ${total - list.length} phòng)`;
    const box = $(ui.list), y = box.scrollTop;
    if (!list.length) {
      box.innerHTML = `<p class="note">${searching ? 'Không có phòng nào khớp.' : ui.f === 0 ? 'Chưa có phòng nào còn chỗ. Tạo phòng mới, hoặc xem các phòng đang chiến đấu.' : 'Chưa có phòng nào.'}</p>`;
      return;
    }
    box.innerHTML = list.map(r => {
      const code = cleanRoom(r.code), open = r.status === 'waiting' && r.seated < r.max, stage = STAGES.byId[r.stage];
      const bits = [r.host ? `Chủ phòng ${ACCOUNT.esc(r.host)}` : '', r.jq ? 'Cờ úp' : '', stage ? stage.name : '', TC_LABEL[r.tc] || 'Không giờ'].filter(Boolean).join(' · ');
      return `<button type="button" class="room-row" data-code="${code}" data-v="${r.v === 'sg' ? 'sg' : 'xq'}"><span class="st ${r.status === 'playing' ? 'playing' : 'waiting'}">${ROOM_STATUS[r.status] || ''}</span>`
        + `<span class="ri"><b>Phòng ${code}</b><small>${bits}</small></span><span class="cnt">${r.count | 0}/${r.max | 0}</span><span class="go">${open ? 'Vào' : 'Xem'}</span></button>`;
    }).join('');
    box.scrollTop = y;                                      // a refresh keeps the list where it was scrolled to
  }
  for (const [v, ui] of Object.entries(roomUi)) {
    $(ui.filter).addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      SFX.init(); SFX.pick(); ui.f = +b.dataset.v; ui.n = ROOM_PAGE; $(ui.list).scrollTop = 0; loadRooms();
    });
    $(ui.more).addEventListener('click', () => { SFX.init(); SFX.pick(); ui.n += ROOM_PAGE; loadRooms(); });
    let typing = 0;
    $(ui.input).addEventListener('input', () => { clearTimeout(typing); typing = setTimeout(() => { ui.n = ROOM_PAGE; loadRooms(); }, 300); });
    // into the best free seat: the fullest room still in its hall
    $(ui.quick).addEventListener('click', async () => {
      SFX.init(); SFX.pick();
      try {
        const r = (await askRooms({ v, f: 'open', n: 1 })).rooms[0];
        if (r) ui.join(cleanRoom(r.code)); else toast('Chưa có phòng nào còn chỗ. Tạo phòng mới để mời mọi người!');
      } catch (e) { toast('Không tải được danh sách phòng'); }
    });
  }
  $('#menu').addEventListener('click', e => {
    const b = e.target.closest('.room-row'); if (!b || b.dataset.code.length < 4) return;
    SFX.init(); SFX.pick();
    if (b.dataset.v === 'sg') sgOnline(b.dataset.code); else goOnline(b.dataset.code);
  });
  function renderEnd() {
    const [title, sub] = endText();
    $('#endTitle').textContent = title; $('#endSub').textContent = sub;
    const viewer = G.mode === 'online' ? G.you : G.me;
    const result = !G.over ? '' : G.over.sg ? G.over.result : !G.over.winner ? 'draw' : !viewer || G.over.winner === viewer ? 'win' : 'lose';
    $('#end').dataset.result = result; $('#end .han').textContent = { win: '勝', lose: '敗', draw: '和' }[result] || '';
    const again = $('#bAgain');
    again.hidden = G.mode === 'online' && !G.you;
    if (sgNet()) sgRenderEnd();
    else if (G.mode === 'online' && G.tour) {                // a tournament's match: back to its bracket
      again.textContent = 'Về giải đấu'; again.disabled = false; again.hidden = false;
      $('#endNote').textContent = G.tour.name + (G.over && !G.over.winner ? ' · Hòa thì Đen đi tiếp' : '');
    } else if (G.mode === 'online' && G.rated) {
      again.textContent = 'Tìm trận mới'; again.disabled = false;
      $('#endNote').textContent = ratingNote();
    } else if (G.mode === 'online') {
      const mine = G.rematch[G.you], theirs = G.rematch[-G.you];
      again.textContent = mine ? 'Đang chờ đối thủ…' : theirs ? 'Đồng ý đấu lại' : 'Đấu lại (đổi bên)';
      again.disabled = !!mine;
      $('#endNote').textContent = theirs && !mine ? 'Đối thủ muốn đấu lại.' : mine ? 'Đã gửi lời mời đấu lại.' : '';
    } else { again.textContent = 'Ván mới'; again.disabled = false; $('#endNote').textContent = ''; }
    $('#bEndLeave').hidden = !(G.mode === 'online' || sgNet());
    $('#bEndUndo').hidden = !(G.mode === 'ai' || (G.mode === 'sanguo' && !G.sg.net && sgPeople().length && G.sg.hist.some(h => !G.sg.seats[h.pos.turn])));
    $('#bEndReview').hidden = !(G.over && G.over.kept && G.mode !== 'sanguo');
    const ach = (G.over && G.over.ach) || [];
    $('#endAch').hidden = !ach.length;
    $('#endAch').innerHTML = ach.map(id => { const a = ACHIEVEMENTS.byId[id]; return `<span class="medal got"><i>${a.han}</i><span><b>Thành tựu mới: ${ACCOUNT.esc(a.name)}</b><small>${ACCOUNT.esc(a.desc)}</small></span></span>`; }).join('');
    $('#bEndMap').textContent = 'Bản đồ chiến dịch';
    renderEndCampaign();
  }
  function renderEndCampaign() {
    const camp = G.mode === 'campaign' && G.over && G.over.camp, box = $('#endStars');
    box.hidden = !camp; $('#bEndRetry').hidden = $('#bEndMap').hidden = !camp;
    if (!camp) return;
    if (G.lv.daily) { renderEndDaily(); return; }
    const o = G.over, lv = o.lv, next = CAMPAIGN.next(lv.id), saved = o.saved;
    $('#end').dataset.result = camp.win ? 'win' : 'lose';
    $('#end .han').textContent = camp.win ? '勝' : '敗';
    $('#endStarRow').textContent = CAMPAIGN_UI.starRow(o.stars);
    const goals = CAMPAIGN.starGoals(lv), hit = [camp.win, camp.win && !G.help, camp.win && CAMPAIGN.extra(lv, camp)];
    $('#endGoals').innerHTML = goals.map((g, i) => `<li class="${hit[i] ? 'got' : ''}"><span>${hit[i] ? '★' : '☆'}</span>${ACCOUNT.esc(g)}</li>`).join('');
    const nextOpen = next && CAMPAIGN_UI.unlocked().levels.has(next.id);
    const again = $('#bAgain');
    again.hidden = false; again.disabled = false;
    again.textContent = camp.win && nextOpen ? `Trận tiếp: ${next.name}` : 'Đánh lại';
    $('#bEndRetry').hidden = !(camp.win && nextOpen);
    $('#bEndUndo').hidden = camp.win;                     // a lost battle can be taken back a move (one star less)
    $('#endNote').textContent = saved && saved.opened.length ? `Mở khóa: ${saved.opened.join(', ')}!`
      : camp.win && saved && saved.best > o.stars ? `Thành tích tốt nhất của bạn: ${CAMPAIGN_UI.starRow(saved.best)}`
      : camp.win ? ''
      : lv.type === 'mate' ? 'Đánh lại để thử cách khác. Bí quá thì xem Gợi ý ở nước đầu, chỉ mất một sao.'
      : 'Có thể Đi lại vài nước để gỡ, hoặc đánh lại từ đầu. Dùng Đi lại hay Gợi ý chỉ mất một sao.';
  }
  // the daily puzzle's end: the time and tries it took (from the first look this day), the rank, the streak
  function renderEndDaily() {
    const o = G.over, camp = o.camp, s = o.saved;
    $('#endStars').hidden = true; $('#bEndRetry').hidden = true;
    $('#end').dataset.result = camp.win ? 'win' : 'lose';
    $('#end .han').textContent = camp.win ? '陣' : '敗';
    const again = $('#bAgain');
    again.hidden = false; again.disabled = false; again.textContent = camp.win ? 'Phá lại để luyện tay' : 'Thử lại';
    $('#bEndMap').hidden = false; $('#bEndMap').textContent = 'Bảng Chân Long Kỳ Trận';
    $('#bEndUndo').hidden = camp.win;
    $('#endNote').textContent = !camp.win ? `Trận chưa vỡ: phải chiếu bí trong ${o.lv.n} nước. Đồng hồ vẫn chạy, thử đường khác nhé.`
      : !s ? 'Đang ghi kết quả…'
      : !s.first ? 'Bạn đã phá trận hôm nay rồi: lần này để luyện tay.'
      : `Phá trận trong ${DAILY.clock(s.ms)} · ${s.tries > 1 ? `${s.tries} lần thử` : 'ngay lần đầu'}${s.rank ? ` · hạng ${s.rank} hôm nay` : ''} · chuỗi ${s.streak} ngày`;
  }
  function showEnd(on) { if (on) renderEnd(); $('#end').hidden = !on; }
  // ---------- sharing the moment ----------
  // The finale of a checkmate (VIEW.defeat) is recorded from the board's canvas as a short video, offered on the end
  // panel: to the system's share sheet where it takes files, else saved, with the link to the game (to the room,
  // among friends) copied to go with it.
  const clip = { blob: null, run: 0 };
  function recordFinale(ms) {
    const run = ++clip.run, canvas = $('#view');
    clip.blob = null; $('#bEndShare').hidden = true;
    if (!ms || !window.MediaRecorder || !canvas.captureStream) return;
    const type = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
    if (!type) return;
    try {
      const rec = new MediaRecorder(canvas.captureStream(30), { mimeType: type, videoBitsPerSecond: 5e6 }), parts = [];
      rec.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
      rec.onstop = () => { if (run !== clip.run || !parts.length) return; clip.blob = new Blob(parts, { type: type.split(';')[0] }); $('#bEndShare').hidden = false; };
      rec.start();
      setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, ms + 600);
    } catch (e) { }
  }
  async function shareFinale() {
    if (!clip.blob) return;
    const file = new File([clip.blob], `co-tuong-3d-chieu-bi.${clip.blob.type.includes('mp4') ? 'mp4' : 'webm'}`, { type: clip.blob.type });
    const link = G.mode === 'online' && !G.rated && G.room ? roomLink() : location.origin + '/';
    const text = `Chiếu bí trên Cờ Tướng 3D! Vào chơi: ${link}`;
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Cờ Tướng 3D', text }); return; }
    } catch (e) { if (e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('Đã lưu video; lời mời đã chép, dán kèm khi gửi'), () => toast('Đã lưu video'));
    else toast('Đã lưu video');
  }
  $('#bEndShare').addEventListener('click', () => { SFX.init(); SFX.pick(); shareFinale(); });
  function again() {
    if (G.mode === 'campaign' && G.lv.daily) { startDaily(); return; }
    if (G.mode === 'campaign') {
      const next = G.over && G.over.camp && G.over.camp.win && CAMPAIGN.next(G.lv.id);
      startCampaign(next && CAMPAIGN_UI.unlocked().levels.has(next.id) ? next.id : G.lv.id);
      return;
    }
    if (G.mode === 'online' && G.tour) { openTour(G.tour.id); return; }
    if (G.mode === 'online' && G.rated) { seek(); return; }
    if (G.mode === 'online') { send({ t: 'rematch' }); G.rematch[G.you] = true; renderEnd(); return; }
    if (sgNet()) {
      const net = G.sg.net;
      if (net.rated) seek('sg'); else if (net.you >= 0) { send({ t: 'rematch' }); net.rematch[net.you] = true; renderEnd(); }
      return;
    }
    if (G.mode === 'sanguo') { sgStart(); return; }
    startAI();
  }

  // menu controls
  function seg(id, value, onPick) {
    const el = $(id);
    const mark = v => el.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v === v));
    mark(value);
    el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; SFX.init(); SFX.pick(); mark(+b.dataset.v); onPick(+b.dataset.v); });
  }
  // the home page's game cards: beside Đánh với máy, the computer game as set up
  const renderAINote = () => {
    const side = pref.side > 0 ? 'Đỏ' : 'Đen', level = ['Dễ', 'Thường', 'Khó'][pref.level] || 'Thường';
    $('#xqAiNote').textContent = `${pref.jq ? 'Cờ úp · ' : ''}${side} · ${level}`;
  };
  seg('#segSide', pref.side, v => { pref.side = v; savePref(); renderAINote(); });
  seg('#segLevel', pref.level, v => { pref.level = v; savePref(); renderAINote(); });
  seg('#segVariant', pref.jq ? 1 : 0, v => { pref.jq = v; savePref(); renderAINote(); });
  seg('#segRoomVariant', pref.roomJq ? 1 : 0, v => { pref.roomJq = v; savePref(); });
  // day and night on the stages set by day (scene.js): by the clock, or always one of them
  const DAYTIME = ['auto', 'day', 'night'];
  VIEW.setDaytime(DAYTIME[pref.daytime] || 'auto');
  seg('#segDaytime', pref.daytime | 0, v => { pref.daytime = v; savePref(); VIEW.setDaytime(DAYTIME[v]); });
  seg('#segTc', pref.tc, v => { pref.tc = v; savePref(); });
  renderAINote();
  // the three-kingdom page: who leads each kingdom, and how strong the computer is
  const renderSgNote = () => {
    const people = pref.sgSeats.map((v, k) => (v ? -1 : k)).filter(k => k >= 0);
    const who = people.length === 1 ? KNAME[people[0]] : people.length ? `${people.length} người` : 'Ba máy';
    $('#sgAiNote').textContent = `${who} · ${['Dễ', 'Thường', 'Khó'][pref.sgLevel] || 'Thường'}`;
  };
  [0, 1, 2].forEach(k => seg('#seat' + k, pref.sgSeats[k], v => { pref.sgSeats[k] = v; savePref(); renderSgNote(); }));
  seg('#segSgLevel', pref.sgLevel, v => { pref.sgLevel = v; savePref(); renderSgNote(); });
  seg('#segSgTc', pref.sgTc, v => { pref.sgTc = v; savePref(); });
  renderSgNote();
  $('#menu').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (!b) return; SFX.init(); SFX.pick(); menuView(b.dataset.go); });
  // the home dock's tabs: which game its buttons are for, remembered
  function gameTab(v) {
    document.querySelectorAll('#gameTabs button').forEach(b => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    document.querySelectorAll('.dock .game').forEach(g => { g.hidden = g.dataset.game !== v; });
  }
  $('#gameTabs').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.dataset.v === pref.game) return;
    SFX.init(); SFX.pick(); pref.game = b.dataset.v; savePref(); gameTab(pref.game);
  });
  gameTab(pref.game === 'sg' ? 'sg' : 'xq');
  // Chơi ngay plays the computer at once, as set up on that game's Với máy page (its ⚙)
  $('#menu').addEventListener('click', e => { const b = e.target.closest('[data-play]'); if (!b) return; SFX.init(); $(b.dataset.play === 'sg' ? '#bPlaySg' : '#bPlayAI').click(); });
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#musicPop').hidden) { musicPop(false); $('#bMusic').focus(); return; }
    if (e.key === 'Escape' && !$('#mePop').hidden && !e.target.closest('#renameForm')) { mePop(false); $('#navMe').focus(); return; }
    if (e.key === 'Escape' && !$('#rules').hidden) { $('#rules').hidden = true; return; }
    // over the menu Escape steps back out of a flat page too: the briefing to the campaign, the others to the menu
    if (e.key === 'Escape' && document.body.classList.contains('in-menu') && /^(brief|campaign|ranks|daily|history|friends)$/.test(document.body.dataset.page)) {
      if (!$('#brief').hidden) $('#brief').hidden = true; else closePages();
      return;
    }
    if (e.key === 'Escape' && (!$('#daily').hidden || !$('#history').hidden || !$('#friends').hidden)) { closePages(); return; }   // over a game: dialogs
    if (e.key !== 'Escape' || $('#menu').hidden || !$('#campaign').hidden || !$('#ranks').hidden || !$('#seek').hidden) return;
    const back = document.querySelector('#menu .view:not([hidden]) .vhead [data-go]');
    if (back) menuView(back.dataset.go);
    else if (G.mode !== 'menu') showMenu(false);
  });
  // hero picker: the general piece of the player's side becomes this hero
  function renderHeroes() {
    const cur = myHero();
    $('#heroes').innerHTML = heroPicks(cur);
    const h = HEROES.byId[cur];
    $('#heroNote').textContent = h ? `${h.name}${h.kingdom ? ' · nhà ' + h.kingdom : ''}: ${h.look}.`
      : 'Chọn một danh tướng: quân Tướng của bạn sẽ hóa thành người đó, và bóng của họ phủ lên bàn cờ khi bạn chiếu tướng.';
  }
  $('#heroes').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (!heroAllowed(b.dataset.id)) { SFX.init(); SFX.error(); toast(`${HEROES.byId[b.dataset.id].name}: ${CAMPAIGN.requirement('hero', b.dataset.id)}`); return; }
    pref.hero = b.dataset.id; savePref(); renderHeroes(); savePick({ hero: pref.hero });
    SFX.init(); SFX.pick();
    if (inHall()) { send({ t: 'hero', hero: pref.hero }); return; }
    if (G.mode === 'online' || sgNet()) { toast('Chủ tướng mới sẽ ra trận từ phòng online tiếp theo'); return; }
    if (G.mode === 'sanguo') {
      const k = sgPeople()[0];
      if (k === undefined) return;
      G.heroes[k] = myHero() || RULERS[k]; VIEW.setHeroes({ [k]: G.heroes[k] }); VIEW.showHero(k); updateStatus();
      return;
    }
    const side = vsAI() ? G.me : 1;
    G.heroes[side] = myHero(); VIEW.setHeroes({ [side]: myHero() }); VIEW.showHero(side); updateStatus();
  });
  renderHeroes();

  // stage picker: where the board stands; applies at once, in or out of a game
  function renderStages() {
    const cur = myStage();
    $('#segStage').innerHTML = stagePicks(cur);
    $('#stageNote').textContent = STAGES.byId[cur].note;
    renderSkins();
  }
  // looks: the board's, the pieces' and the warriors'; a locked one says what opens it
  function renderSkins() {
    const cur = mySkins();
    for (const kind of SKINS.NAMES) $(`[data-skins="${kind}"]`).innerHTML = SKINS.KINDS[kind].map(s => {
      const ok = skinAllowed(kind, s.id);
      return `<button type="button" data-id="${s.id}" class="${s.id === cur[kind] ? 'on' : ''}${ok ? '' : ' locked'}" aria-pressed="${s.id === cur[kind]}"${ok ? '' : ` title="${SKINS.requirement(kind, s.id)}"`}><span class="hz">${ok ? s.han : '鎖'}</span><span>${s.name}</span></button>`;
    }).join('');
  }
  document.querySelectorAll('[data-skins]').forEach(el => el.addEventListener('click', e => {
    const b = e.target.closest('button'), kind = el.dataset.skins; if (!b) return;
    SFX.init();
    if (!skinAllowed(kind, b.dataset.id)) { SFX.error(); toast(`${SKINS.byId[kind][b.dataset.id].name}: ${SKINS.requirement(kind, b.dataset.id)}`); return; }
    pref.skin = SKINS.pack({ ...mySkins(), [kind]: b.dataset.id }); savePref(); renderSkins(); savePick({ skin: pref.skin });
    if (inHall()) send({ t: 'skin', skin: pref.skin });
    SFX.pick(); applySkins();
  }));
  $('#segStage').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.dataset.id === myStage()) return;
    SFX.init();
    if (!stageAllowed(b.dataset.id)) { SFX.error(); toast(`${STAGES.byId[b.dataset.id].name}: ${CAMPAIGN.requirement('stage', b.dataset.id)}`); return; }
    pref.stage = b.dataset.id; savePref(); renderStages(); savePick({ stage: pref.stage });
    SFX.pick(); if (G.mode !== 'campaign') VIEW.setStage(pref.stage);   // a battle keeps its own battlefield
  });
  renderStages();
  // the campaign: its pages live in campaign-ui.js (opened from the navbar); battles start here
  CAMPAIGN_UI.init({ toast, onStart: startCampaign });
  CAMPAIGN_UI.onChange(() => { renderHeroes(); renderStages(); });
  $('#bEndRetry').addEventListener('click', () => { if (G.lv) restartBattle(); });
  $('#bEndMap').addEventListener('click', () => { showEnd(false); if (G.lv && G.lv.daily) { showMenu(true); DAILY_UI.open(); } else CAMPAIGN_UI.open(); });
  $('#bEndReview').addEventListener('click', () => { const g = G.over && G.over.kept && REVIEW.get(G.over.kept); if (g) rvOpen(g, 'end'); else toast('Không tìm thấy ván này trên máy'); });
  // the daily puzzle: its page (from the navbar, or the home dock's seal), started from there
  DAILY_UI.init({ toast, onStart: startDaily });
  ACH_UI.init({ toast });
  const dailyChip = () => {
    const done = DAILY_UI.solvedToday, n = DAILY_UI.streak();
    $('#dailyNote').textContent = (done ? 'Đã phá trận' : 'Chưa phá trận') + (n ? ` · chuỗi ${n} ngày` : '');
    $('#bDaily').classList.toggle('done', done);
  };
  DAILY_UI.onChange(dailyChip); dailyChip();
  // friends and challenges (friends.js): a challenge accepted opens a new private friendly room for both; whoever
  // challenged goes in first, so they hold the room (and Red), the other a moment later
  // tournaments (tournament-ui.js): a match's room, played or watched; from a match's end, back to its bracket
  TOUR_UI.init({ toast, play: room => { closePages(); goOnline(room); } });
  function openTour(id) { leaveRoom(); FRIENDS.open(); TOUR_UI.show(id); }
  FRIENDS.init({
    toast,
    busy: () => ((G.mode === 'online' && G.you && !G.over && G.moves.length) || (sgNet() && G.sg.net.you >= 0 && !G.over && sgMoves().length)
      ? 'Bạn đang trong một ván online: nhận lời sẽ là xin thua ván này. Bấm Nhận lần nữa nếu chắc chắn.' : ''),
    watch(r) { const [v, code] = r.split(':'); SFX.init(); closePages(); if (v === 'sg') sgOnline(code); else goOnline(code); },
    onGo(room, tc, host) {
      if (G.ws && G.ws.readyState === 1) send({ t: 'leave' });   // a game under way here is given up
      G.privateRoom = room;
      SFX.init(); closePages();
      toast(host ? 'Bạn bè đã nhận lời! Đang vào phòng riêng…' : 'Đang vào phòng riêng…');
      if (host) goOnline(room, tc); else setTimeout(() => goOnline(room), 900);
    },
  });
  $('#bDaily').addEventListener('click', () => { SFX.init(); SFX.pick(); closePages(); DAILY_UI.open(); });
  $('#bRanked').addEventListener('click', () => seek());
  $('#bSeekCancel').addEventListener('click', stopSeek);
  $('#bRanks').addEventListener('click', () => ACCOUNT.openRanks(0));
  // on signing in: first the campaign progress (it decides what may be picked), then the account's hero and stage;
  // an account that never saved them takes this browser's instead. Renames and the like don't sync again.
  let syncedFor = 0;
  function adoptPicks(u) {
    const send = {};
    if (u.hero == null) send.hero = myHero(); else if (heroAllowed(u.hero)) pref.hero = u.hero;
    if (u.stage == null) send.stage = myStage(); else if (stageAllowed(u.stage)) pref.stage = u.stage;
    if (u.skin == null) send.skin = SKINS.pack(mySkins()); else pref.skin = u.skin;
    savePref(); renderHeroes(); renderStages();
    if (G.mode === 'menu' || G.mode === 'ai') { const side = G.mode === 'ai' ? G.me : 1; G.heroes[side] = myHero(); VIEW.setHeroes({ [side]: myHero() }); updateStatus(); }
    if (G.mode !== 'campaign') VIEW.setStage(myStage());   // a battle keeps its own battlefield
    applySkins();
    if (Object.keys(send).length) savePick(send);
  }
  ACCOUNT.onChange(u => {
    const id = u ? u.id : 0;
    if (id !== syncedFor) {
      syncedFor = id;
      CAMPAIGN_UI.sync(u).then(() => { if (u && ACCOUNT.user && ACCOUNT.user.id === id) adoptPicks(ACCOUNT.user); });
      ACH_UI.sync(u);
    }
    $('#bRanked').disabled = $('#bSgRanked').disabled = !u;
    $('#xqRankNote').textContent = u ? `${u.rating} điểm` : 'Cần đăng nhập';
    $('#sgRankNote').textContent = u ? `${u.sg_rating || 1200} điểm` : 'Cần đăng nhập';
    $('#sgRankedNote').textContent = u ? `Ghép ba người có điểm Tam Quốc gần nhau${u.sg_rating ? ` (bạn: ${u.sg_rating})` : ''}. Mỗi nước 10 phút, cộng 5 giây sau mỗi nước.` : 'Đăng nhập Google ở màn hình chính để chơi xếp hạng.';
    $('#rankedNote').textContent = u ? 'Ghép với người có điểm gần bạn. Mỗi bên 10 phút, cộng 5 giây sau mỗi nước.' : 'Đăng nhập Google ở màn hình chính để chơi xếp hạng.';
  });
  $('#bPlayAI').addEventListener('click', () => startAI());
  // the hall's controls
  $('#hallHeroes').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    SFX.init();
    if (!heroAllowed(b.dataset.id)) { SFX.error(); toast(`${HEROES.byId[b.dataset.id].name}: ${CAMPAIGN.requirement('hero', b.dataset.id)}`); return; }
    SFX.pick(); pref.hero = b.dataset.id; savePref(); renderHeroes(); savePick({ hero: pref.hero });
    send({ t: 'hero', hero: pref.hero });
  });
  $('#hallStages').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    SFX.init();
    if (!stageAllowed(b.dataset.id)) { SFX.error(); toast(`${STAGES.byId[b.dataset.id].name}: ${CAMPAIGN.requirement('stage', b.dataset.id)}`); return; }
    SFX.pick(); send({ t: 'stage', stage: b.dataset.id });
  });
  $('#hallPublic').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; SFX.init(); SFX.pick(); send({ t: 'public', on: b.dataset.v === '1' }); });
  $('#hallVariant').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; SFX.init(); SFX.pick(); send({ t: 'variant', on: b.dataset.v === '1' }); });
  $('#hallTc').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; SFX.init(); SFX.pick(); send({ t: 'tc', tc: TC[+b.dataset.v] || '' }); });
  $('#bHallGo').addEventListener('click', () => {
    const r = hallModel();
    SFX.init();
    if (r.me === null) return;
    if (r.me === r.host) send({ t: 'start' }); else { SFX.pick(); send({ t: 'ready', on: !r.ready[r.me] }); }
  });
  $('#bHallLeave').addEventListener('click', leaveRoom);
  document.querySelectorAll('.htabs [data-tab]').forEach(b => b.addEventListener('click', () => { SFX.init(); SFX.pick(); hallTab = b.dataset.tab; renderHall(); }));
  // the host asks a player to leave: press once, then again within 3 seconds
  $('#hallCards').addEventListener('click', e => {
    const b = e.target.closest('.kick'); if (!b) return;
    const side = +b.dataset.side;
    SFX.init();
    if (kickArm.side !== side || Date.now() - kickArm.at > 3000) { kickArm = { side, at: Date.now() }; SFX.pick(); renderHall(); setTimeout(() => { if (inHall()) renderHall(); }, 3100); return; }
    kickArm = { side: null, at: 0 };
    send({ t: 'kick', side });
  });
  $('#bHallCopy').addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(roomLink()).then(() => toast('Đã sao chép link mời')); });
  $('#bPlaySg').addEventListener('click', () => sgStart());
  $('#bSgCreate').addEventListener('click', () => sgOnline(Array.from({ length: 4 }, () => ROOM_CHARS[(Math.random() * ROOM_CHARS.length) | 0]).join(''), TC[pref.sgTc] || ''));
  const joinSg = () => { const r = cleanRoom($('#inSgRoom').value); if (r.length < 4) { toast('Nhập mã phòng 4 ký tự'); $('#inSgRoom').focus(); return; } sgOnline(r); };
  $('#bSgJoin').addEventListener('click', joinSg);
  $('#inSgRoom').addEventListener('keydown', e => { if (e.key === 'Enter') joinSg(); });
  $('#bSgRanked').addEventListener('click', () => seek('sg'));
  $('#bSgRanks').addEventListener('click', () => ACCOUNT.openRanks(2));
  $('#bCreate').addEventListener('click', () => goOnline(Array.from({ length: 4 }, () => ROOM_CHARS[(Math.random() * ROOM_CHARS.length) | 0]).join(''), TC[pref.tc] || '', !!pref.roomJq));
  const joinTyped = () => { const r = cleanRoom($('#inRoom').value); if (r.length < 4) { toast('Nhập mã phòng 4 ký tự'); $('#inRoom').focus(); return; } goOnline(r); };
  $('#bJoin').addEventListener('click', joinTyped);
  $('#inRoom').addEventListener('keydown', e => { if (e.key === 'Enter') joinTyped(); });
  $('#bResume').addEventListener('click', () => showMenu(false));
  $('#bMenu').addEventListener('click', () => { SFX.init(); showMenu(true); });
  // the rules, in a dialog of their own: the tab of the game being played (or looked at in the menu) comes first
  const rulesTab = n => {
    $('#rulesTabs').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v === n));
    document.querySelectorAll('#rules .rpage').forEach(p => { p.hidden = +p.dataset.page !== n; });
  };
  $('#bRules').addEventListener('click', () => {
    SFX.init(); SFX.pick();
    const sg = G.mode === 'sanguo' || (!$('#menu').hidden && (/^sg-/.test(curView) || (curView === 'home' && pref.game === 'sg')));
    rulesTab(sg ? 1 : 0); $('#rules').hidden = false;
  });
  // the navbar over the menu: the ways to play, the campaign, the leaderboard, heroes and battlefields, the rules
  $('#nav').addEventListener('click', e => {
    const b = e.target.closest('[data-nav]'), go = b && b.dataset.nav;
    if (!go) return;
    closePages();
    if (go === 'rules') { $('#bRules').click(); return; }
    SFX.init(); SFX.pick();
    if (go === 'campaign') CAMPAIGN_UI.open();
    else if (go === 'ranks') ACCOUNT.openRanks(0);
    else if (go === 'daily') DAILY_UI.open();
    else if (go === 'friends') FRIENDS.open();
    else if (go === 'history') openHistory();
    else menuView(go);
  });
  // the dialogs that lie flat in the menu's column over the menu (index.html): the first one open is the page shown,
  // and the navbar marks it, or else the menu's own page
  const PAGES = ['seek', 'brief', 'campaign', 'ranks', 'rules', 'daily', 'history', 'friends'];
  function closePages() { CAMPAIGN_UI.close(); DAILY_UI.close(); FRIENDS.close(); $('#ranks').hidden = $('#rules').hidden = $('#history').hidden = true; }
  function navMark() {
    const p = document.body.dataset.page, on = p === 'brief' ? 'campaign' : p && p !== 'seek' ? p : curView === 'army' ? 'army' : 'home';
    document.querySelectorAll('#nav [data-nav]').forEach(b => b.classList.toggle('on', b.dataset.nav === on));
  }
  const pageObserver = new MutationObserver(() => {
    const page = PAGES.find(id => !$('#' + id).hidden);
    if (page) document.body.dataset.page = page; else delete document.body.dataset.page;
    navMark(); frameBoard();
  });
  PAGES.forEach(id => pageObserver.observe($('#' + id), { attributes: true, attributeFilter: ['hidden'] }));
  // the navbar's right end: signed out, the Google button; signed in, the player, with their name, rating, profile,
  // rename and sign-out in a panel
  const mePop = open => { $('#mePop').hidden = !open; $('#navMe').setAttribute('aria-expanded', open); };
  $('#navMe').addEventListener('click', () => { SFX.init(); SFX.pick(); mePop($('#mePop').hidden); });
  $('#bProfile').addEventListener('click', () => { mePop(false); closePages(); ACCOUNT.openRanks(1); });
  ACCOUNT.onChange(u => {
    $('#meWrap').hidden = !u;
    if (u) { $('#navAv').textContent = u.name.slice(0, 1).toUpperCase(); $('#navName').textContent = u.name; } else mePop(false);
  });
  $('#rulesTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { SFX.pick(); rulesTab(+b.dataset.v); } });
  $('#bRulesClose').addEventListener('click', () => { $('#rules').hidden = true; });
  $('#lessonList').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; $('#rules').hidden = true; startLesson(b.dataset.id); });
  renderLessons();
  // a click beside the rules closes them, as a dialog only: lying flat over the menu, beside them is just the scene
  $('#rules').addEventListener('click', e => { if (e.target.id === 'rules' && !document.body.classList.contains('in-menu')) $('#rules').hidden = true; });
  $('#bUndo').addEventListener('click', undo);
  $('#bEndUndo').addEventListener('click', undo);
  $('#bHint').addEventListener('click', hint);
  $('#bResign').addEventListener('click', resign);
  $('#bDraw').addEventListener('click', () => {
    if (G.mode !== 'online' || !G.you || G.over) return;
    if (G.drawOffer !== -G.you) G.drawOffer = G.you;   // an offer; otherwise this accepts theirs
    send({ t: 'draw' }); updateStatus();
  });
  $('#bDrawYes').addEventListener('click', () => send({ t: 'draw' }));
  $('#bDrawNo').addEventListener('click', () => { send({ t: 'draw-no' }); G.drawOffer = 0; updateStatus(); });
  $('#bNew').addEventListener('click', () => { if (G.mode === 'review') rvExit(); else if (G.mode === 'lesson') startLesson(G.lesson.id, G.lesson.i); else if (G.mode === 'campaign') restartBattle(); else if (G.mode === 'sanguo' && !G.sg.net) sgStart(); else if (G.mode === 'online' || G.mode === 'sanguo') { if (G.over) again(); else toast('Ván đang diễn ra. Xin thua hoặc chờ hết ván để đấu lại.'); } else startAI(); });
  $('#bAgain').addEventListener('click', again);
  $('#bEndMenu').addEventListener('click', () => { showEnd(false); showMenu(true); });
  $('#bEndLeave').addEventListener('click', () => { showEnd(false); leaveRoom(); });
  $('#bEndClose').addEventListener('click', () => showEnd(false));
  $('#bCopy').addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(roomLink()).then(() => toast('Đã sao chép link mời')); });
  $('#bArmy').addEventListener('click', () => { pref.army = !VIEW.army; savePref(); VIEW.setArmy(pref.army); $('#bArmy').classList.toggle('on', pref.army); SFX.init(); SFX.pick(); toast(pref.army ? 'Đội quân: mọi quân hiện chiến binh' : 'Quân cờ: chiến binh chỉ hiện khi ra trận'); });
  $('#bCam').addEventListener('click', () => VIEW.resetCamera());
  const soundIcon = () => {
    $('#bSound').classList.toggle('off', !SFX.on); $('#bMusic').classList.toggle('off', !SFX.musicOn || !SFX.musicVol);
    $('#bMusicOn').setAttribute('aria-checked', SFX.musicOn); $('#musicPop').classList.toggle('off', !SFX.musicOn);
    $('#musicVol').value = Math.round(SFX.musicVol * 100); $('#musicVolTxt').textContent = $('#musicVol').value;
  };
  $('#bSound').addEventListener('click', () => { SFX.init(); SFX.toggle(); soundIcon(); });
  // the music button opens its panel: the switch, and a volume slider that also switches the music back on
  const musicPop = open => { $('#musicPop').hidden = !open; $('#bMusic').setAttribute('aria-expanded', open); };
  $('#bMusic').addEventListener('click', () => { SFX.init(); musicPop($('#musicPop').hidden); });
  $('#bMusicOn').addEventListener('click', () => { SFX.toggleMusic(); soundIcon(); });
  $('#musicVol').addEventListener('input', e => {
    const v = +e.target.value / 100;
    if (v > 0 && !SFX.musicOn) SFX.toggleMusic();
    SFX.setMusicVol(v); soundIcon();
  });
  addEventListener('pointerdown', e => {
    if (!$('#musicPop').hidden && !e.target.closest('#bMusic, #musicPop')) musicPop(false);
    if (!$('#mePop').hidden && !e.target.closest('#meWrap')) mePop(false);
    if (!$('#emotePop').hidden && !e.target.closest('#emotePop, #bEmote, #bHallEmote')) emotePop(false);
  });
  $('#bMoves').addEventListener('click', () => document.body.classList.toggle('show-moves'));
  // phones: drag the panel down by its grip or the players row to fold it away to just the players, up to unfold;
  // a tap on the grip toggles it
  const panelMin = on => {
    pref.panelMin = on; savePref(); document.body.classList.toggle('panel-min', on);
    $('#grip').setAttribute('aria-expanded', !on); $('#grip').setAttribute('aria-label', on ? 'Mở rộng bảng' : 'Thu gọn bảng');
  };
  panelMin(pref.panelMin);
  let swipe = null;
  for (const el of [$('#grip'), $('#panel .players')]) {
    el.addEventListener('pointerdown', e => {
      if (innerWidth > 760 || (e.pointerType === 'mouse' && e.button)) return;
      swipe = { id: e.pointerId, y: e.clientY, dy: 0 }; el.setPointerCapture(e.pointerId); $('#panel').classList.add('drag');
    });
    el.addEventListener('pointermove', e => {
      if (!swipe || e.pointerId !== swipe.id) return;
      swipe.dy = e.clientY - swipe.y;
      // follows the finger in the direction it can go, resists the other way
      const min = document.body.classList.contains('panel-min'), d = (swipe.dy > 0) === !min ? swipe.dy : swipe.dy * 0.2;
      $('#panel').style.transform = `translateY(${min ? Math.min(d, 0) * 0.5 : Math.max(d, 0)}px)`;
    });
    const end = e => {
      if (!swipe || e.pointerId !== swipe.id) return;
      const dy = swipe.dy; swipe = null;
      $('#panel').classList.remove('drag'); $('#panel').style.transform = '';
      if (e.type === 'pointercancel') return;
      if (dy > 40) panelMin(true);
      else if (dy < -40) panelMin(false);
      else if (Math.abs(dy) < 6 && el.id === 'grip') panelMin(!pref.panelMin);
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }
  $('#grip').addEventListener('click', e => { if (!e.detail) panelMin(!pref.panelMin); });   // keyboard
  addEventListener('pointerdown', () => SFX.init(), { once: true });
  addEventListener('resize', frameBoard);

  // test hook (only with #debug in the URL): the engine plays both sides
  if (location.hash === '#debug') window.__ct = {
    G, commit, endGame, startCampaign, startDaily, sgStart, sgCommit, rvOpen,
    selfPlay() { G.mode = 'debug'; const r = XQ.think(G.pos, { time: 120, history: G.keys.slice() }); if (r.move) commit(r.move); return r.move; },
  };

  // ---------- boot ----------
  async function boot() {
    // the brush font has to be in before the characters are painted on the pieces
    try { await Promise.race([document.fonts.load('bold 64px "LXGW WenKai TC"', '帥將楚漢赤壁呂董虎牢關夏法魏懿蜀吳仕相傌俥炮兵士象馬車砲卒長江淮水' + HEROES.list.map(h => h.han).join('') + STAGES.list.map(s => s.han).join('')), new Promise(r => setTimeout(r, 3500))]); } catch (e) { }
    VIEW.setStage(myStage());
    VIEW.init($('#view'));
    G.heroes[1] = myHero(); VIEW.setHeroes(G.heroes);
    VIEW.setBoard(G.pos.b, [], G.pos.dark);
    if (pref.army) { VIEW.setArmy(true); $('#bArmy').classList.add('on'); }
    soundIcon(); renderMoves(); updateStatus(); layoutMode();
    $('#boot').remove();
    // the dock's heroes: rendered once, just after the board is up
    setTimeout(() => {
      const art = PORTRAITS.render(400, 340);
      if (art) [['#artXq', art.xq], ['#artSg', art.sg]].forEach(([el, url]) => { $(el).src = url; $(el).hidden = false; });
    }, 50);
    let info = null;
    try { const r = await fetch('info', { cache: 'no-store' }); if (r.ok) info = await r.json(); } catch (e) { }
    const online = !!info && info.online === true;
    G.online = online;
    $('#rankedBox').hidden = $('#bRanks').hidden = $('#sgRankedBox').hidden = $('#navRanks').hidden = !(online && info.accounts);
    document.querySelectorAll('.dock .game').forEach(g => g.classList.toggle('no-rank', !(online && info.accounts)));   // the dock's row fills up
    $('#sgOnlineBox').classList.toggle('off', !online);
    if (online) ACCOUNT.init(info, { toast });
    DAILY_UI.setOnline(online);
    FRIENDS.setOnline(online);
    $('#onlineBox').classList.toggle('off', !online);
    loadRooms();   // a page opened before this was known
    $('#onlineNote').textContent = online ? '' : !navigator.onLine ? 'Đang offline: vẫn đánh với máy, chiến dịch, Chân Long Kỳ Trận và xem lại ván cũ được.'
      : 'Chơi online cần chạy qua Cloudflare Worker (npm start hoặc bản đã deploy).';
    const q = new URLSearchParams(location.search), invited = cleanRoom(q.get('room')), invitedSg = cleanRoom(q.get('tq'));
    if (online && invitedSg.length >= 4) sgOnline(invitedSg);
    else if (online && invited.length >= 4) goOnline(invited);
    else { showMenu(true); if (q.has('daily')) { history.replaceState(null, '', location.pathname); DAILY_UI.open(); } }   // the app's shortcut
    if (/^[A-Z0-9]{6}$/.test(q.get('giai') || '')) { FRIENDS.open(); TOUR_UI.show(q.get('giai')); }   // a tournament's link
    registerSW();
  }

  // ---------- the installable app: sw.js keeps the game's files, so it opens and plays the computer offline ----------
  let installEvt = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('#bInstall').hidden = false; });
  addEventListener('appinstalled', () => { installEvt = null; $('#bInstall').hidden = true; toast('Đã cài Cờ Tướng 3D lên máy'); });
  $('#bInstall').addEventListener('click', async () => {
    if (!installEvt) return;
    installEvt.prompt();
    try { await installEvt.userChoice; } catch (e) { }
    installEvt = null; $('#bInstall').hidden = true;
  });
  // a new version waits until the player says so (a reload mid-game would lose it): the Cập nhật button
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (/^(localhost|127\.|\[::1\])/.test(location.hostname) && !/sw/.test(location.hash)) return;   // `npm start`: fresh files on every reload (#sw to try it)
    const had = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !reloading) { reloading = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js').then(reg => {
      const offer = w => {
        if (!w || !had) return;
        $('#bUpdate').hidden = false; $('#bUpdate').onclick = () => w.postMessage('skip');
        toast('Có bản mới của trò chơi: bấm Cập nhật ở góc trên khi tiện');
      };
      offer(reg.waiting);
      reg.addEventListener('updatefound', () => { const w = reg.installing; if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); }); });
      setInterval(() => reg.update().catch(() => { }), 30 * 60000);
    }).catch(() => { });
  }
  boot();
})();
