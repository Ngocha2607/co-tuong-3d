// game.js — the match: menu, playing against the computer (search in a Web Worker), the campaign's battles,
// online rooms over a WebSocket to the Cloudflare Worker, the move list, banners and the end screen.
// VIEW draws, XQ rules, CAMPAIGN judges the battles and CAMPAIGN_UI keeps their progress. The three-kingdom game
// (SG, sanguo.js) is played on this device only: each kingdom is a person or the computer.
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
    fen0: XQ.START,                           // where this game started (a campaign battle has its own position)
    lv: null, help: false,                    // campaign: the battle, and whether undo or a hint was used
  };
  const vsAI = () => G.mode === 'ai' || G.mode === 'campaign';
  // heroes and stages given by the campaign can be used once earned (the others are always free)
  const heroAllowed = id => !id || (HEROES.valid(id) && (!HEROES.byId[id].campaign || CAMPAIGN_UI.unlocked().heroes.has(id)));
  const stageAllowed = id => STAGES.valid(id) && (!STAGES.byId[id].campaign || CAMPAIGN_UI.unlocked().stages.has(id));
  const myHero = () => heroAllowed(pref.hero) ? pref.hero : '';
  const myStage = () => stageAllowed(pref.stage) ? pref.stage : 'room';
  // a signed-in player's hero and stage follow them: each pick is saved to the account
  const savePick = fields => { if (ACCOUNT.user) ACCOUNT.save(fields).catch(e => toast(e.status === 403 ? e.message : 'Chưa lưu được lựa chọn lên tài khoản')); };
  let pref = { side: 1, level: 1, army: false, tc: 0, hero: '', stage: 'room', panelMin: false, sgSeats: [0, 1, 1], sgLevel: 1 };
  try { pref = Object.assign(pref, JSON.parse(localStorage.getItem('cotuong_pref')) || {}); } catch (e) { }
  if (!Array.isArray(pref.sgSeats) || pref.sgSeats.length !== 3 || pref.sgSeats.some(v => v !== 0 && v !== 1)) pref.sgSeats = [0, 1, 1];
  if (!HEROES.valid(pref.hero)) pref.hero = '';
  if (!STAGES.valid(pref.stage)) pref.stage = 'room';
  const savePref = () => { try { localStorage.setItem('cotuong_pref', JSON.stringify(pref)); } catch (e) { } };

  // ---------- game record ----------
  function reset() { G.pos = XQ.Pos.fromFen(G.fen0); G.moves = []; G.keys = []; G.log = []; G.quiet = 0; G.captured = []; G.over = null; }
  function record(m) {
    const pos = G.pos, text = XQ.notation(pos, m), side = Math.sign(pos.b[XQ.from(m)]);
    G.keys.push(pos.key());
    const cap = pos.make(m);
    G.moves.push(m); G.log.push({ text, side, cap });
    if (cap) { G.captured.push(cap); G.quiet = 0; } else G.quiet++;
    return cap;
  }
  function rebuild(moves) { reset(); for (const m of moves) record(m); }
  const kingOf = side => G.pos.kings[side > 0 ? 0 : 1];
  const legalFrom = s => G.pos.legal().filter(m => XQ.from(m) === s).map(XQ.to);

  // animations run one after another, in the order the moves were made
  let chain = Promise.resolve();
  const enqueue = fn => { G.animating++; chain = chain.then(fn).catch(e => console.error(e)).then(() => { G.animating--; if (!G.animating) updateStatus(); }); return chain; };

  // apply a move to the record now, animate it when its turn comes
  function commit(m, fast) {
    // against the clock the animations cost the player time: no close-ups, and none at all when time runs short
    const timed = G.mode === 'online' && !!G.clock;
    const opts = { fast: fast || (timed && G.you && clockOf(G.you) < 60000), closeUp: !timed };
    const mover = G.pos.turn;
    if (timed && mover === G.you) { G.clock.left[mover] = clockOf(mover); G.clock.running = 0; G.clock.at = performance.now(); }   // the server's reply restarts it
    if (G.mode === 'online' && mover === G.you && G.drawOffer === -G.you) G.drawOffer = 0;   // playing on turns the offer down
    record(m);
    const st = XQ.status(G.pos, G.keys, G.quiet, G.moves), turn = G.pos.turn, king = kingOf(turn), gen = G.gen;
    renderMoves();
    enqueue(async () => {
      if (gen !== G.gen) return;                           // a new game started meanwhile
      await VIEW.play(m, opts);
      if (gen !== G.gen) return;
      VIEW.check(-1);
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
      res(XQ.think(p, { time: Math.min(job.time || 900, 1200), depth: job.depth, noise: job.noise, history: h }));
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
    ask({ fen: G.fen0, moves: G.moves.slice(), time: L.time, depth: L.depth, noise: L.noise ? (Math.random() * 1e9) | 1 : 0 }).then(r => {
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
    disconnect(); stopSeek(); resetOnline();
    G.mode = 'ai'; G.me = pref.side; G.level = pref.level; G.gen = (G.gen || 0) + 1; aiId++; G.thinking = false;
    G.fen0 = XQ.START; G.lv = null; VIEW.setLayout('classic'); VIEW.setStage(myStage());
    const rivals = HEROES.list.filter(h => h.id !== pref.hero);  // the computer may lead with a hero still to earn
    G.heroes = { [G.me]: myHero(), [-G.me]: rivals[(Math.random() * rivals.length) | 0].id };
    VIEW.setHeroes(G.heroes);
    reset(); clearSel();
    VIEW.setMenu(false); VIEW.setViewer(G.me); VIEW.setBoard(G.pos.b, []); VIEW.lastMove(-1, -1); VIEW.check(-1); VIEW.hint(-1, -1);
    showMenu(false); showEnd(false); renderMoves(); layoutMode();
    SFX.init(); SFX.gong(); banner('Khai cuộc', 'open');
    updateStatus();
    if (G.me < 0) setTimeout(() => { if (G.mode === 'ai' && !G.moves.length) aiMove(); }, 900);
  }
  // a campaign battle: its own position, side, opponent hero, stage and computer strength
  function startCampaign(id) {
    const lv = CAMPAIGN.level(id);
    if (!lv || !CAMPAIGN_UI.unlocked().levels.has(id)) return;
    const ch = CAMPAIGN.chapter(lv.chapter);
    disconnect(); stopSeek(); resetOnline();
    G.mode = 'campaign'; G.lv = lv; G.fen0 = lv.fen; G.me = lv.side; G.help = false; VIEW.setLayout('classic');
    G.gen = (G.gen || 0) + 1; aiId++; G.thinking = false;
    G.heroes = { [G.me]: myHero(), [-G.me]: ch.foe };
    VIEW.setHeroes(G.heroes); VIEW.setStage(ch.stage);
    reset(); clearSel();
    VIEW.setMenu(false); VIEW.setViewer(G.me); VIEW.setBoard(G.pos.b, []); VIEW.lastMove(-1, -1); VIEW.check(-1); VIEW.hint(-1, -1);
    showMenu(false); showEnd(false); CAMPAIGN_UI.close(); renderMoves(); layoutMode();
    SFX.init(); SFX.gong(); banner(lv.name, 'open');
    toast(CAMPAIGN.goal(lv));
    updateStatus();
    if (G.pos.turn !== G.me) setTimeout(() => { if (G.mode === 'campaign' && G.lv === lv && !G.moves.length) aiMove(); }, 900);
  }
  // a battle is decided (CAMPAIGN.judge): stars, progress, what it opened
  function endCampaign(r) {
    if (G.over && G.over.shown) return;
    const lv = G.lv, winner = r.win ? G.me : -G.me;
    aiId++; G.thinking = false;
    G.over = { winner: r.reason === 'held' || r.reason === 'limit' || (lv.type === 'survive' && r.win) ? 0 : winner, reason: r.reason, shown: true, camp: r, stars: CAMPAIGN.stars(lv, r, G.help), lv };
    VIEW.check(-1); clearSel();
    const onBoard = r.reason === 'checkmate' || r.reason === 'stalemate';
    if (onBoard) VIEW.defeat(kingOf(-winner));
    if (r.win) { VIEW.heroShadow(G.me, true); SFX.win(); } else SFX.lose();
    updateStatus();
    const lvNow = lv;
    (r.win ? CAMPAIGN_UI.record(lv, G.moves.slice(), G.help) : Promise.resolve(null)).then(res => {
      if (G.over && G.over.lv === lvNow) { G.over.saved = res; if (!$('#end').hidden) renderEnd(); }
    });
    setTimeout(() => showEnd(true), onBoard ? 1300 : 300);
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
    VIEW.setBoard(G.pos.b, G.captured); clearSel(); VIEW.hint(-1, -1);
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
    ask({ fen: G.fen0, moves: G.moves.slice(), time: G.mode === 'campaign' ? 1500 : 900 }).then(r => {
      b.disabled = false; b.textContent = 'Gợi ý';
      if (!r.move || G.pos.turn !== G.me) return;
      VIEW.hint(XQ.from(r.move), XQ.to(r.move));
      toast('Gợi ý: ' + XQ.notation(G.pos, r.move));
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
    VIEW.check(-1); clearSel();
    const viewer = G.mode === 'online' ? G.you : G.me, onBoard = !['resign', 'time', 'abandon', 'aborted', 'agreement', 'perpetual-check', 'perpetual-chase'].includes(st.reason);
    if (st.winner && onBoard) VIEW.defeat(kingOf(-st.winner));
    if (st.winner) VIEW.heroShadow(st.winner, true);
    if (!st.winner) SFX.gong(); else if (!viewer || st.winner === viewer) SFX.win(); else SFX.lose();
    updateStatus();
    setTimeout(() => showEnd(true), onBoard ? 1300 : 200);
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
    if (G.mode !== 'online') return;
    if (G.clock) renderClocks();
    if (G.deadline && !G.over) updateStatus();
  }, 200);

  // ---------- online ----------
  const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const cleanRoom = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const roomLink = () => `${location.origin}${location.pathname}?room=${G.room}`;
  const wsBase = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
  let retryT = null;
  function resetOnline() { G.rated = false; G.info = { 1: null, '-1': null }; G.tc = null; G.clock = null; G.deadline = null; G.drawOffer = 0; G.heroes = { 1: '', '-1': '' }; VIEW.setHeroes(G.heroes); }
  // tc: time control asked for by the player opening a friendly room ('' = untimed)
  function goOnline(room, tc = '') {
    disconnect(); stopSeek(); resetOnline();
    G.mode = 'online'; G.room = room; G.you = 0; G.wantTc = tc; G.gen = (G.gen || 0) + 1; aiId++;
    G.fen0 = XQ.START; G.lv = null; VIEW.setLayout('classic'); VIEW.setStage(myStage());
    G.players = { 1: false, '-1': false }; G.rematch = { 1: false, '-1': false };
    history.replaceState(null, '', roomLink());
    reset(); clearSel(); VIEW.setMenu(false); VIEW.setBoard(G.pos.b, []); VIEW.lastMove(-1, -1); VIEW.check(-1); VIEW.hint(-1, -1);
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
    const ws = new WebSocket(`${wsBase()}/ws?room=${G.room}`);
    G.ws = ws; G.netState = 'connecting'; updateStatus();
    ws.onopen = () => { G.netState = 'ok'; ws.send(JSON.stringify({ t: 'hello', token: token(), tc: G.wantTc, hero: myHero() })); };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } onNet(m); };
    ws.onclose = () => {
      if (G.ws !== ws) return;
      G.netState = 'lost'; updateStatus();
      if (G.mode === 'online') retryT = setTimeout(connect, 1800);
    };
  }
  function disconnect() { clearTimeout(retryT); if (G.ws) { const w = G.ws; G.ws = null; try { w.close(); } catch (e) { } } }
  const send = o => { if (G.ws && G.ws.readyState === 1) G.ws.send(JSON.stringify(o)); };
  function onNet(m) {
    switch (m.t) {
      case 'state': {
        const firstSeat = !G.you && m.you;
        G.you = m.you; G.me = m.you || 1; G.players = m.players || G.players; G.rematch = m.rematch || { 1: false, '-1': false };
        G.rated = !!m.rated; G.info = m.info || { 1: null, '-1': null }; G.tc = m.tc || null; G.drawOffer = m.drawOffer || 0; setTiming(m);
        G.gen = (G.gen || 0) + 1; chain = Promise.resolve(); G.animating = 0;
        rebuild(m.moves || []);
        G.heroes = m.heroes || { 1: '', '-1': '' }; VIEW.setHeroes(G.heroes);
        VIEW.setViewer(G.me, false); VIEW.setBoard(G.pos.b, G.captured); clearSel(); VIEW.hint(-1, -1);
        const lm = G.moves[G.moves.length - 1]; VIEW.lastMove(lm ? XQ.from(lm) : -1, lm ? XQ.to(lm) : -1);
        const st = XQ.status(G.pos, G.keys, G.quiet, G.moves); VIEW.check(!m.over && st.check ? kingOf(G.pos.turn) : -1);
        G.over = m.over ? Object.assign({}, m.over, { shown: true }) : null;
        showEnd(!!m.over); renderMoves(); updateStatus();
        if (!G.moves.length && !m.over && (firstSeat || m.fresh)) {
          SFX.gong(); banner(G.you ? `Bạn cầm quân ${SIDE[G.you]}` : 'Bạn đang xem trận', 'open');
          const opp = G.you && G.info[-G.you];
          if (G.rated && opp) toast(`Trận xếp hạng: gặp ${opp.name} · ${opp.rating} điểm`);
        }
        break;
      }
      case 'move':
        setTiming(m);
        if ('draw' in m) G.drawOffer = m.draw;
        if (m.ply === G.moves.length) { commit(m.m); }
        else if (m.ply > G.moves.length) send({ t: 'sync' });
        break;
      case 'presence':
        G.players = m.players; if (m.info) G.info = m.info;
        if (m.heroes) { G.heroes = m.heroes; VIEW.setHeroes(m.heroes); }
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
    }
  }

  // ---------- ranked queue ----------
  let lobby = null, seekT = null;
  function seek() {
    if (!ACCOUNT.user) { toast('Đăng nhập Google để chơi xếp hạng'); showEnd(false); showMenu(true); return; }
    stopSeek(); SFX.init(); showEnd(false);
    const t0 = Date.now(), ws = new WebSocket(`${wsBase()}/ws/lobby`);
    lobby = ws;
    $('#seek').hidden = false; $('#seekInfo').textContent = 'Đang vào hàng chờ…'; $('#seekTime').textContent = '0:00';
    seekT = setInterval(() => { $('#seekTime').textContent = mmss(Date.now() - t0); }, 500);
    ws.onopen = () => ws.send(JSON.stringify({ t: 'seek' }));
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.t === 'seeking') $('#seekInfo').textContent = m.n > 1 ? `${m.n} kỳ thủ đang tìm trận. Đang chờ người có điểm gần bạn…` : 'Lúc này chỉ có bạn đang tìm trận. Chờ thêm chút nhé.';
      else if (m.t === 'match') { stopSeek(); goOnline(m.room); }
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
  // G.sg: { pos, keys (before each move), quiet, log, captured ([piece as drawn, taker]), seats (0 a person, 1 the
  // computer, by kingdom), hist (what to go back to for each move), level, viewer }
  const SG_LEVELS = [
    { name: 'Dễ', time: 300, depth: 2, noise: true },
    { name: 'Thường', time: 1000, depth: 4 },
    { name: 'Khó', time: 2600 },
  ];
  const KNAME = SG.NAMES, RULERS = ['luu-bi', 'ton-quyen', 'tao-thao'];
  const sgShow = pc => (pc ? 20 + 10 * SG.OWN(pc) + SG.T(pc) : 0);       // a piece as models.js draws it
  const sgBoard = () => Int8Array.from(G.sg.pos.b, sgShow);
  const sgPeople = () => [0, 1, 2].filter(k => G.sg.seats[k] === 0);
  const sgSolo = () => { const p = sgPeople(); return p.length === 1 ? p[0] : -1; };
  const sgMoves = () => G.sg.log.filter(x => x.m);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // a person's general takes their chosen hero (the first person's, with others at the table), the rest their rulers
  function sgHeroes() {
    const first = sgPeople()[0], h = {};
    for (let k = 0; k < 3; k++) h[k] = k === first && myHero() ? myHero() : RULERS[k];
    return h;
  }
  function sgStart() {
    disconnect(); stopSeek(); resetOnline();
    const seats = pref.sgSeats.slice(), people = seats.map((v, k) => (v ? -1 : k)).filter(k => k >= 0);
    G.mode = 'sanguo'; G.gen = (G.gen || 0) + 1; aiId++; G.thinking = false; G.lv = null; G.over = null;
    G.sg = { pos: SG.Pos.start(), keys: [], quiet: 0, log: [], captured: [], seats, hist: [], level: pref.sgLevel, viewer: people.length ? people[0] : 0 };
    VIEW.setLayout('sanguo'); VIEW.setStage(myStage());
    G.heroes = sgHeroes(); VIEW.setHeroes(G.heroes);
    clearSel(); VIEW.setMenu(false); VIEW.setViewer(G.sg.viewer); VIEW.setBoard(sgBoard(), []);
    VIEW.lastMove(-1, -1); VIEW.check(-1); VIEW.hint(-1, -1);
    showMenu(false); showEnd(false); renderMoves(); layoutMode();
    SFX.init(); SFX.gong(); banner('Tam Quốc tranh hùng', 'open');
    if (people.length === 1) toast(`Bạn cầm quân ${KNAME[people[0]]}. Thục đi trước, rồi Ngô, rồi Ngụy.`);
    updateStatus();
    const gen = G.gen;
    setTimeout(() => { if (G.mode === 'sanguo' && G.gen === gen && !sgMoves().length) sgNext(); }, 900);
  }
  // whose turn now: the computer thinks; with several people at the table the board turns to the one to play
  function sgNext() {
    const sg = G.sg, k = sg.pos.turn;
    if (G.over) return;
    if (sg.seats[k]) { sgAI(); return; }
    if (sgPeople().length > 1 && k !== sg.viewer) { sg.viewer = k; VIEW.setViewer(k); banner(`Lượt ${KNAME[k]}`, 'open'); }
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
  // play a move: the record now, the animation in turn; kingdoms left without a move fall to the mover
  function sgCommit(m) {
    const sg = G.sg, before = sg.pos, mover = before.turn, cap = before.b[SG.to(m)], text = SG.notation(before, m);
    sg.hist.push({ pos: before, keys: sg.keys.length, quiet: sg.quiet, log: sg.log.length, captured: sg.captured.length });
    sg.keys.push(before.key());
    const r = SG.play(before, m);
    sg.pos = r.pos; sg.quiet = cap ? 0 : sg.quiet + 1;
    if (cap) sg.captured.push([sgShow(cap), mover]);
    sg.log.push({ k: mover, m, text, cap: !!cap });
    for (const f of r.falls) { sg.log.push({ fall: f }); sg.captured.push([20 + 10 * f.k + SG.K, f.by]); }
    const st = SG.status(sg.pos, sg.keys, sg.quiet), gen = G.gen, people = sgPeople();
    // with people at the table, the game is over for them when the last of their kingdoms falls
    const lost = people.length && !people.some(k => sg.pos.alive[k]);
    G.lastMover = mover; renderMoves();
    enqueue(async () => {
      if (gen !== G.gen) return;
      await VIEW.play(m, { via: SG.via(m) });              // along the bends of the lines, not across them
      if (gen !== G.gen) return;
      VIEW.check(-1);
      for (const f of r.falls) {
        VIEW.defeat(f.king); VIEW.heroShadow(f.by); SFX.drum();
        banner(`${KNAME[f.k]} diệt vong!`, 'check');
        toast(`${f.mate ? 'Bị chiếu bí' : 'Hết nước đi'}: tàn quân ${KNAME[f.k]} về tay ${KNAME[f.by]}`);
        await sleep(1600);
        if (gen !== G.gen) return;
      }
      if (r.falls.length) VIEW.setBoard(sgBoard(), sg.captured);   // the fallen general leaves, his army changes colours
      if (st.over) { sgEnd(st); return; }
      if (lost) { sgEnd({ over: true, winner: -1, reason: 'fallen', k: r.falls.length ? r.falls[r.falls.length - 1].k : people[0] }); return; }
      if (st.checks.length) {
        const k = st.checks.includes(sg.pos.turn) ? sg.pos.turn : st.checks[0], king = sg.pos.kings[k];
        VIEW.check(king); VIEW.alarm(king); VIEW.heroShadow(mover); SFX.drum();
        banner(sg.seats[k] === 0 && people.length === 1 ? 'Chiếu tướng!' : `${KNAME[k]} bị chiếu!`, 'check');
      }
      if (st.repeat === 1) toast('Thế cờ lặp lại lần 2. Lần 3 thì hòa');
      sgNext();
    });
    updateStatus();
  }
  function sgEnd(st) {
    if (G.over && G.over.shown) return;
    aiId++; G.thinking = false;
    const [title, sub, result] = sgEndText(st);
    G.over = Object.assign({}, st, { shown: true, sg: true, title, sub, result });
    VIEW.check(-1); clearSel();
    if (st.winner >= 0) VIEW.heroShadow(st.winner, true);
    if (result === 'win') SFX.win(); else if (result === 'lose') SFX.lose(); else SFX.gong();
    updateStatus();
    setTimeout(() => showEnd(true), 1000);
  }
  function sgEndText(st) {
    const sg = G.sg, people = sgPeople(), solo = sgSolo(), rounds = `sau ${Math.ceil(sgMoves().length / 3)} vòng`;
    if (st.reason === 'unite') {
      const w = st.winner, name = KNAME[w];
      if (solo >= 0) return w === solo ? ['Nhất thống thiên hạ!', `${name} thu phục cả hai nước ${rounds}`, 'win'] : ['Thất bại', `${name} thống nhất thiên hạ ${rounds}`, 'lose'];
      return [`${name} thống nhất thiên hạ!`, `Hai nước kia đã diệt vong ${rounds}`, !people.length || people.includes(w) ? 'win' : 'lose'];
    }
    if (st.reason === 'fallen') return ['Thất bại', `${KNAME[st.k]} đã mất nước ${rounds}`, 'lose'];
    if (st.reason === 'resign') return ['Thất bại', `${KNAME[st.k]} xin hàng ${rounds}`, 'lose'];
    const left = [0, 1, 2].filter(k => sg.pos.alive[k]).map(k => KNAME[k]).join(', ');
    return [sg.pos.living() === 3 ? 'Thế chân vạc' : 'Hòa cờ', `${REASON[st.reason]} · ${left} bất phân thắng bại`, 'draw'];
  }
  // back to the last position a person was to play in, before their last move
  function sgUndo() {
    const sg = G.sg;
    if (G.animating) return;
    let i = sg.hist.length - 1;
    while (i >= 0 && sg.seats[sg.hist[i].pos.turn]) i--;
    if (i < 0) return;
    aiId++; G.thinking = false;
    const h = sg.hist[i];
    sg.hist.length = i; sg.pos = h.pos; sg.keys.length = h.keys; sg.quiet = h.quiet; sg.log.length = h.log; sg.captured.length = h.captured;
    G.over = null; G.gen = (G.gen || 0) + 1;
    if (sgPeople().length > 1) { sg.viewer = sg.pos.turn; VIEW.setViewer(sg.viewer); }
    VIEW.setBoard(sgBoard(), sg.captured); clearSel(); VIEW.hint(-1, -1);
    const lm = sgMoves().pop(); VIEW.lastMove(lm ? SG.from(lm.m) : -1, lm ? SG.to(lm.m) : -1);
    VIEW.check(sg.pos.inCheck() ? sg.pos.kings[sg.pos.turn] : -1);
    showEnd(false); renderMoves(); updateStatus(); SFX.pick();
  }
  function sgHint() {
    const sg = G.sg;
    if (G.over || sg.seats[sg.pos.turn] || G.thinking || G.animating) return;
    const b = $('#bHint'), at = sg.pos; b.disabled = true; b.textContent = 'Đang tìm…';
    ask({ sg: SG.pack(at), time: 1200 }).then(r => {
      b.disabled = false; b.textContent = 'Gợi ý';
      if (!r.move || G.mode !== 'sanguo' || G.sg.pos !== at) return;
      VIEW.hint(SG.from(r.move), SG.to(r.move));
      toast('Gợi ý: ' + SG.notation(at, r.move));
    });
  }
  // the only person left at the table gives up the game; with several, the kingdom to move gives up and its army
  // leaves the board
  function sgResign() {
    const sg = G.sg, alive = sgPeople().filter(k => sg.pos.alive[k]), k = sg.pos.turn;
    if (G.over || !alive.length) return;
    if (alive.length === 1) { sgEnd({ over: true, winner: -1, reason: 'resign', k: alive[0] }); return; }
    if (sg.seats[k] || G.animating || G.thinking) { toast('Xin hàng khi đến lượt nước mình'); return; }
    sg.hist.push({ pos: sg.pos, keys: sg.keys.length, quiet: sg.quiet, log: sg.log.length, captured: sg.captured.length });
    const p = sg.pos.clone(); p.fall(k, -1); sg.pos = p;
    sg.log.push({ fall: { k, by: -1 } });
    VIEW.setBoard(sgBoard(), sg.captured); clearSel(); VIEW.check(-1);
    banner(`${KNAME[k]} xin hàng`, 'check'); renderMoves();
    const st = SG.status(sg.pos, sg.keys, sg.quiet);
    if (st.over) { sgEnd(st); return; }
    sgNext();
  }
  function sgTap(s) {
    const sg = G.sg, pos = sg.pos, me = pos.turn;
    if (G.over || G.thinking || G.animating || sg.seats[me]) return;
    if (G.sel >= 0 && G.targets.includes(s)) { const m = SG.mv(G.sel, s); clearSel(); VIEW.hint(-1, -1); sgCommit(m); return; }
    const pc = pos.b[s];
    if (pc && SG.OWN(pc) === me && s !== G.sel) {
      const t = pos.legal().filter(m => SG.from(m) === s).map(SG.to);
      G.sel = s; G.targets = t; VIEW.select(s, t); SFX.pick();
      if (!t.length) toast('Quân này không có nước đi hợp lệ');
    } else if (G.sel >= 0) clearSel();
    else if (pc) SFX.error();
  }
  const sgCanAct = () => G.mode === 'sanguo' && !G.over && !G.thinking && !G.animating && !G.sg.seats[G.sg.pos.turn];
  function sgStatus() {
    const sg = G.sg, pos = sg.pos, turn = pos.turn, solo = sgSolo();
    let text;
    if (G.over) text = G.over.title;
    else if (G.animating && !G.thinking) text = `${KNAME[G.lastMover]} đang đi quân…`;
    else if (G.thinking) text = `Máy ${KNAME[turn]} đang tính nước…`;
    else if (sg.seats[turn]) text = `Máy ${KNAME[turn]} chuẩn bị đi…`;
    else text = solo >= 0 ? `Lượt bạn · ${KNAME[turn]}` : `Lượt ${KNAME[turn]}`;
    const st = $('#status'); st.textContent = text; st.classList.toggle('mine', sgCanAct());
    // the three kingdoms in the panel: Shu in the red slot, Wu in the green one, Wei in the black one
    ['#plRed', '#plGreen', '#plBlack'].forEach((id, k) => {
      const el = $(id), hero = HEROES.byId[G.heroes[k]];
      el.hidden = false;
      el.querySelector('.chip').textContent = hero ? hero.han : SG.SEAL[k]; el.querySelector('.chip').title = hero ? hero.name : '';
      el.querySelector('.lab').textContent = KNAME[k];
      el.querySelector('.nm small').textContent = hero ? hero.name : '';
      el.querySelector('.who').textContent = !pos.alive[k] ? 'Đã mất nước' : sg.seats[k] ? `Máy · ${(SG_LEVELS[sg.level] || SG_LEVELS[1]).name}` : solo >= 0 ? 'Bạn' : 'Người';
      el.querySelector('.who').title = '';
      el.classList.toggle('turn', !G.over && pos.alive[k] && (G.animating ? G.lastMover : turn) === k);
      el.classList.toggle('out', !pos.alive[k]);
      el.classList.remove('away');
    });
    const people = sgPeople();
    $('#bUndo').disabled = !sg.hist.some(h => !sg.seats[h.pos.turn]);
    $('#bHint').disabled = !!G.over || !!sg.seats[turn];
    $('#bResign').disabled = !!G.over || !people.some(k => pos.alive[k]);
    $('#bResign').textContent = $('#bResign').classList.contains('warn') ? 'Chắc chắn?' : 'Xin hàng';
    $('#bDraw').hidden = true; $('#drawAsk').hidden = true; $('#room').hidden = true; $('#goal').hidden = true;
    $('#bNew').textContent = 'Ván mới';
    renderClocks();
  }

  // ---------- input on the board ----------
  function clearSel() { G.sel = -1; G.targets = []; VIEW.select(-1, []); }
  const myTurn = () => G.mode !== 'menu' && !G.over && !G.thinking && G.pos.turn === G.me && (G.mode !== 'online' || G.you === G.me);
  const canAct = () => myTurn() && !G.animating;
  VIEW.onTap = s => {
    SFX.init();
    if (G.mode === 'sanguo') { sgTap(s); return; }
    if (!canAct()) return;
    if (G.sel >= 0 && G.targets.includes(s)) {
      const m = XQ.mv(G.sel, s); clearSel(); VIEW.hint(-1, -1);
      if (G.mode === 'online') send({ t: 'move', m, ply: G.moves.length });
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
    if (s < 0) return false;
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
    for (let i = 0; i < G.log.length; i += 2) {
      const a = G.log[i], b = G.log[i + 1];
      const cell = x => x ? `<span class="mv ${x.side > 0 ? 'r' : 'b'}${x.cap ? ' cap' : ''}">${x.text}</span>` : '<span class="mv"></span>';
      h += `<li><em>${i / 2 + 1}</em>${cell(a)}${cell(b)}</li>`;
    }
    ol.innerHTML = h || '<li class="empty">Chưa có nước nào. Đỏ đi trước.</li>';
    ol.scrollTop = ol.scrollHeight;
    $('#moveCount').textContent = G.log.length ? `${Math.ceil(G.log.length / 2)} nước` : '';
  }
  function updateStatus() {
    if (G.mode === 'sanguo') { sgStatus(); return; }
    const st = $('#status'), turn = G.pos.turn;
    let text = '';
    if (G.mode === 'menu') text = '';
    else if (G.over) text = endText()[0];
    else if (G.animating && !G.thinking) text = vsAI() ? (G.lastMover === G.me ? 'Máy chuẩn bị đi…' : 'Máy đang đi quân…')
      : G.lastMover === G.you ? 'Đã đi, chờ đối thủ…' : G.you ? 'Đối thủ đang đi quân…' : `${SIDE[G.lastMover]} đang đi quân…`;
    else if (vsAI()) text = G.thinking ? 'Máy đang tính nước…' : turn === G.me ? `Lượt bạn · ${SIDE[G.me]}` : 'Máy chuẩn bị đi…';
    else if (G.mode === 'online') {
      if (G.netState === 'connecting') text = 'Đang kết nối phòng…';
      else if (G.netState === 'lost') text = 'Mất kết nối, đang nối lại…';
      else if (G.deadline && !G.over) text = deadlineText();
      else if (G.you && !G.players[-G.you]) text = 'Đang chờ đối thủ vào phòng…';
      else if (!G.you) text = `Đang xem · Lượt ${SIDE[turn]}`;
      else text = turn === G.you ? `Lượt bạn · ${SIDE[G.you]}` : 'Lượt đối thủ';
    }
    st.textContent = text;
    st.classList.toggle('mine', !G.over && !G.animating && myTurn());
    for (const side of [1, -1]) {
      const el = $(side > 0 ? '#plRed' : '#plBlack'), hero = HEROES.byId[G.mode === 'menu' ? '' : G.heroes[side]];
      const chip = el.querySelector('.chip');
      chip.textContent = hero ? hero.han : side > 0 ? '帥' : '將'; chip.title = hero ? hero.name : '';
      const foe = G.mode === 'campaign' && side !== G.me && CAMPAIGN.chapter(G.lv.chapter).foeName;
      el.querySelector('.lab').textContent = SIDE[side];
      el.querySelector('.nm small').textContent = hero ? hero.name : foe || ARMY[side];
      let who = '';
      if (G.mode === 'ai') who = side === G.me ? 'Bạn' : `Máy · ${LEVELS[G.level].name}`;
      else if (G.mode === 'campaign') who = side === G.me ? 'Bạn' : 'Máy';
      else if (G.mode === 'online') who = whoOnline(side);
      el.querySelector('.who').innerHTML = who;
      const ttl = G.mode === 'online' && G.info[side] && CAMPAIGN.TITLES[G.info[side].title];
      el.querySelector('.who').title = ttl ? `Danh hiệu: ${ttl}` : '';
      el.classList.toggle('turn', !G.over && G.mode !== 'menu' && (G.animating ? -G.lastMover : turn) === side);
      el.classList.toggle('away', G.mode === 'online' && !G.players[side]);
      el.classList.remove('out');
    }
    $('#plGreen').hidden = true;
    $('#bResign').textContent = $('#bResign').classList.contains('warn') ? 'Chắc chắn?' : 'Xin thua';
    $('#bUndo').disabled = !vsAI() || !G.moves.length;
    $('#bHint').disabled = !vsAI() || !!G.over;
    $('#bResign').disabled = !!G.over || G.mode === 'menu' || (G.mode === 'online' && !G.you);
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
    $('#bNew').textContent = G.mode === 'campaign' ? 'Đánh lại' : G.mode !== 'online' ? 'Ván mới' : G.rated ? 'Trận mới' : 'Đấu lại';
    renderGoal();
    renderClocks();
  }
  // the battle's objective and how far along it is, in the side panel
  function renderGoal() {
    const box = $('#goal');
    box.hidden = G.mode !== 'campaign';
    if (G.mode !== 'campaign') return;
    const lv = G.lv, r = CAMPAIGN.judge(lv, G.moves);
    $('#goalName').textContent = `${lv.id} · ${lv.name}`;
    $('#goalText').textContent = CAMPAIGN.goal(lv);
    $('#goalCount').textContent = lv.type === 'mate' ? `Nước của bạn: ${r.mine}/${lv.n} (tối đa ${lv.n + 2})`
      : lv.type === 'survive' ? `Đã cầm cự: ${Math.min(r.theirs, lv.n)}/${lv.n} nước · còn ${r.pieces} quân`
      : `Nước của bạn: ${r.mine} · thắng trong ${lv.par} nước được thêm ★`;
    $('#goalHelp').hidden = !G.help;
  }
  // a player's name (signed in) or role, with the rating in ranked games; names are escaped, this goes in as HTML
  function whoOnline(side) {
    const p = G.info[side];
    if (!p) return side === G.you ? 'Bạn' : G.players[side] ? (G.you ? 'Đối thủ' : 'Người chơi') : 'Chưa vào';
    return ACCOUNT.esc(p.name) + (side === G.you ? ' (bạn)' : '') + (G.rated && p.rating ? ` <small>${p.rating}</small>` : '');
  }
  function layoutMode() {
    document.body.dataset.mode = G.mode;
    VIEW.setInset(G.mode !== 'menu' && innerWidth > 760 ? 332 : 0);
    $('#bUndo').hidden = $('#bHint').hidden = !(vsAI() || (G.mode === 'sanguo' && sgPeople().length));
  }
  function showMenu(on) {
    $('#menu').hidden = !on;
    $('#bResume').hidden = !(on && G.mode !== 'menu');
    if (on) { menuView('home'); VIEW.setMenu(G.mode === 'menu'); }
  }
  // the menu's pages: 'home' lists the ways to play, the others hold each one's options
  function menuView(name) {
    document.querySelectorAll('#menu .view').forEach(v => { v.hidden = v.dataset.view !== name; });
    $('#menu').scrollTop = 0;
  }
  function renderEnd() {
    const [title, sub] = endText();
    $('#endTitle').textContent = title; $('#endSub').textContent = sub;
    const viewer = G.mode === 'online' ? G.you : G.me;
    const result = !G.over ? '' : G.over.sg ? G.over.result : !G.over.winner ? 'draw' : !viewer || G.over.winner === viewer ? 'win' : 'lose';
    $('#end').dataset.result = result; $('#end .han').textContent = { win: '勝', lose: '敗', draw: '和' }[result] || '';
    const again = $('#bAgain');
    again.hidden = G.mode === 'online' && !G.you;
    if (G.mode === 'online' && G.rated) {
      again.textContent = 'Tìm trận mới'; again.disabled = false;
      $('#endNote').textContent = ratingNote();
    } else if (G.mode === 'online') {
      const mine = G.rematch[G.you], theirs = G.rematch[-G.you];
      again.textContent = mine ? 'Đang chờ đối thủ…' : theirs ? 'Đồng ý đấu lại' : 'Đấu lại (đổi bên)';
      again.disabled = !!mine;
      $('#endNote').textContent = theirs && !mine ? 'Đối thủ muốn đấu lại.' : mine ? 'Đã gửi lời mời đấu lại.' : '';
    } else { again.textContent = 'Ván mới'; again.disabled = false; $('#endNote').textContent = ''; }
    $('#bEndUndo').hidden = !(G.mode === 'ai' || (G.mode === 'sanguo' && sgPeople().length && G.sg.hist.some(h => !G.sg.seats[h.pos.turn])));
    renderEndCampaign();
  }
  function renderEndCampaign() {
    const camp = G.mode === 'campaign' && G.over && G.over.camp, box = $('#endStars');
    box.hidden = !camp; $('#bEndRetry').hidden = $('#bEndMap').hidden = !camp;
    if (!camp) return;
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
  function showEnd(on) { if (on) renderEnd(); $('#end').hidden = !on; }
  function again() {
    if (G.mode === 'campaign') {
      const next = G.over && G.over.camp && G.over.camp.win && CAMPAIGN.next(G.lv.id);
      startCampaign(next && CAMPAIGN_UI.unlocked().levels.has(next.id) ? next.id : G.lv.id);
      return;
    }
    if (G.mode === 'online' && G.rated) { seek(); return; }
    if (G.mode === 'online') { send({ t: 'rematch' }); G.rematch[G.you] = true; renderEnd(); return; }
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
  const renderAINote = () => { $('#aiNote').textContent = `Quân ${pref.side > 0 ? 'Đỏ' : 'Đen'} · ${['Dễ', 'Thường', 'Khó'][pref.level] || 'Thường'}`; };
  seg('#segSide', pref.side, v => { pref.side = v; savePref(); renderAINote(); });
  seg('#segLevel', pref.level, v => { pref.level = v; savePref(); renderAINote(); });
  seg('#segTc', pref.tc, v => { pref.tc = v; savePref(); });
  renderAINote();
  // the three-kingdom page: who leads each kingdom, and how strong the computer is
  const renderSgNote = () => {
    const people = pref.sgSeats.map((v, k) => (v ? -1 : k)).filter(k => k >= 0);
    $('#sgNote').textContent = people.length === 1 ? `Bạn cầm ${KNAME[people[0]]}, đấu với hai máy` : people.length ? `${people.length} người chung một máy` : 'Xem ba máy tranh hùng';
  };
  [0, 1, 2].forEach(k => seg('#seat' + k, pref.sgSeats[k], v => { pref.sgSeats[k] = v; savePref(); renderSgNote(); }));
  seg('#segSgLevel', pref.sgLevel, v => { pref.sgLevel = v; savePref(); });
  renderSgNote();
  $('#menu').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (!b) return; SFX.init(); SFX.pick(); menuView(b.dataset.go); });
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#musicPop').hidden) { musicPop(false); $('#bMusic').focus(); return; }
    if (e.key !== 'Escape' || $('#menu').hidden || !$('#campaign').hidden || !$('#ranks').hidden || !$('#seek').hidden) return;
    if ($('#menu .view[data-view="home"]').hidden) menuView('home');
    else if (G.mode !== 'menu') showMenu(false);
  });
  // the home page's line about the picked hero and battlefield
  function renderArmyNote() {
    const h = HEROES.byId[myHero()], s = STAGES.byId[myStage()];
    $('#armyHz').textContent = h ? h.han : '帥';
    $('#armyNote').textContent = `${h ? h.name : 'Tướng quân'} · ${s.name}`;
  }

  // hero picker: the general piece of the player's side becomes this hero
  function renderHeroes() {
    const cur = myHero();
    $('#heroes').innerHTML = [{ id: '', name: 'Tướng quân', han: '帥' }, ...HEROES.list]
      .map(h => {
        const ok = heroAllowed(h.id);
        return `<button type="button" data-id="${h.id}" class="${h.id === cur ? 'on' : ''}${ok ? '' : ' locked'}" aria-pressed="${h.id === cur}"${ok ? '' : ` title="${CAMPAIGN.requirement('hero', h.id)}"`}><span class="hz">${ok ? h.han : '鎖'}</span><span>${h.name}</span></button>`;
      }).join('');
    const h = HEROES.byId[cur];
    $('#heroNote').textContent = h ? `${h.name}${h.kingdom ? ' · nhà ' + h.kingdom : ''}: ${h.look}.`
      : 'Chọn một danh tướng: quân Tướng của bạn sẽ hóa thành người đó, và bóng của họ phủ lên bàn cờ khi bạn chiếu tướng.';
    renderArmyNote();
  }
  $('#heroes').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (!heroAllowed(b.dataset.id)) { SFX.init(); SFX.error(); toast(`${HEROES.byId[b.dataset.id].name}: ${CAMPAIGN.requirement('hero', b.dataset.id)}`); return; }
    pref.hero = b.dataset.id; savePref(); renderHeroes(); savePick({ hero: pref.hero });
    SFX.init(); SFX.pick();
    if (G.mode === 'online') { toast('Chủ tướng mới sẽ ra trận từ phòng online tiếp theo'); return; }
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
    $('#segStage').innerHTML = STAGES.list.map(s => {
      const ok = stageAllowed(s.id);
      return `<button type="button" data-id="${s.id}" class="${s.id === cur ? 'on' : ''}${ok ? '' : ' locked'}" aria-pressed="${s.id === cur}"${ok ? '' : ` title="${CAMPAIGN.requirement('stage', s.id)}"`}><span class="hz">${ok ? s.han : '鎖'}</span><span>${s.name}</span></button>`;
    }).join('');
    $('#stageNote').textContent = STAGES.byId[cur].note;
    renderArmyNote();
  }
  $('#segStage').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.dataset.id === myStage()) return;
    SFX.init();
    if (!stageAllowed(b.dataset.id)) { SFX.error(); toast(`${STAGES.byId[b.dataset.id].name}: ${CAMPAIGN.requirement('stage', b.dataset.id)}`); return; }
    pref.stage = b.dataset.id; savePref(); renderStages(); savePick({ stage: pref.stage });
    SFX.pick(); if (G.mode !== 'campaign') VIEW.setStage(pref.stage);   // a battle keeps its own battlefield
  });
  renderStages();
  // the campaign: its pages live in campaign-ui.js; battles start here
  function renderCampaignEntry() {
    const u = CAMPAIGN_UI.unlocked(), done = CAMPAIGN_UI.progress(), next = CAMPAIGN.LEVELS.find(l => u.levels.has(l.id) && !done[l.id]);
    $('#campNote').textContent = `${u.total}/${CAMPAIGN.MAX_STARS} sao · ` + (next ? `Trận kế tiếp: ${next.name}` : 'Đã thắng mọi trận, hãy săn đủ sao!');
  }
  CAMPAIGN_UI.init({ toast, onStart: startCampaign });
  CAMPAIGN_UI.onChange(() => { renderHeroes(); renderStages(); renderCampaignEntry(); });
  renderCampaignEntry();
  $('#bCampaign').addEventListener('click', () => { SFX.init(); SFX.pick(); CAMPAIGN_UI.open(); });
  $('#bEndRetry').addEventListener('click', () => { if (G.lv) startCampaign(G.lv.id); });
  $('#bEndMap').addEventListener('click', () => { showEnd(false); CAMPAIGN_UI.open(); });
  $('#bRanked').addEventListener('click', seek);
  $('#bSeekCancel').addEventListener('click', stopSeek);
  $('#bRanks').addEventListener('click', () => ACCOUNT.openRanks(0));
  // on signing in: first the campaign progress (it decides what may be picked), then the account's hero and stage;
  // an account that never saved them takes this browser's instead. Renames and the like don't sync again.
  let syncedFor = 0;
  function adoptPicks(u) {
    const send = {};
    if (u.hero == null) send.hero = myHero(); else if (heroAllowed(u.hero)) pref.hero = u.hero;
    if (u.stage == null) send.stage = myStage(); else if (stageAllowed(u.stage)) pref.stage = u.stage;
    savePref(); renderHeroes(); renderStages();
    if (G.mode === 'menu' || G.mode === 'ai') { const side = G.mode === 'ai' ? G.me : 1; G.heroes[side] = myHero(); VIEW.setHeroes({ [side]: myHero() }); updateStatus(); }
    if (G.mode !== 'campaign') VIEW.setStage(myStage());   // a battle keeps its own battlefield
    if (Object.keys(send).length) savePick(send);
  }
  ACCOUNT.onChange(u => {
    const id = u ? u.id : 0;
    if (id !== syncedFor) {
      syncedFor = id;
      CAMPAIGN_UI.sync(u).then(() => { if (u && ACCOUNT.user && ACCOUNT.user.id === id) adoptPicks(ACCOUNT.user); });
    }
    $('#bRanked').disabled = !u;
    $('#rankedNote').textContent = u ? 'Ghép với người có điểm gần bạn. Mỗi bên 10 phút, cộng 5 giây sau mỗi nước.' : 'Đăng nhập Google ở màn hình chính để chơi xếp hạng.';
  });
  $('#bPlayAI').addEventListener('click', () => startAI());
  $('#bPlaySg').addEventListener('click', () => sgStart());
  $('#bCreate').addEventListener('click', () => goOnline(Array.from({ length: 4 }, () => ROOM_CHARS[(Math.random() * ROOM_CHARS.length) | 0]).join(''), TC[pref.tc] || ''));
  const joinTyped = () => { const r = cleanRoom($('#inRoom').value); if (r.length < 4) { toast('Nhập mã phòng 4 ký tự'); $('#inRoom').focus(); return; } goOnline(r); };
  $('#bJoin').addEventListener('click', joinTyped);
  $('#inRoom').addEventListener('keydown', e => { if (e.key === 'Enter') joinTyped(); });
  $('#bResume').addEventListener('click', () => showMenu(false));
  $('#bMenu').addEventListener('click', () => { SFX.init(); showMenu(true); });
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
  $('#bNew').addEventListener('click', () => { if (G.mode === 'campaign') startCampaign(G.lv.id); else if (G.mode === 'sanguo') sgStart(); else if (G.mode === 'online') { if (G.over) again(); else toast('Ván đang diễn ra. Xin thua hoặc chờ hết ván để đấu lại.'); } else startAI(); });
  $('#bAgain').addEventListener('click', again);
  $('#bEndMenu').addEventListener('click', () => { showEnd(false); showMenu(true); });
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
  addEventListener('pointerdown', e => { if (!$('#musicPop').hidden && !e.target.closest('.pop-wrap')) musicPop(false); });
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
  addEventListener('resize', () => VIEW.setInset(G.mode !== 'menu' && innerWidth > 760 ? 332 : 0));

  // test hook (only with #debug in the URL): the engine plays both sides
  if (location.hash === '#debug') window.__ct = {
    G, commit, endGame, startCampaign, sgStart, sgCommit,
    selfPlay() { G.mode = 'debug'; const r = XQ.think(G.pos, { time: 120, history: G.keys.slice() }); if (r.move) commit(r.move); return r.move; },
  };

  // ---------- boot ----------
  async function boot() {
    // the brush font has to be in before the characters are painted on the pieces
    try { await Promise.race([document.fonts.load('bold 64px "LXGW WenKai TC"', '帥將楚漢赤壁呂董虎牢關夏法魏懿蜀吳仕相傌俥炮兵士象馬車砲卒長江淮水' + HEROES.list.map(h => h.han).join('') + STAGES.list.map(s => s.han).join('')), new Promise(r => setTimeout(r, 3500))]); } catch (e) { }
    VIEW.setStage(myStage());
    VIEW.init($('#view'));
    G.heroes[1] = myHero(); VIEW.setHeroes(G.heroes);
    VIEW.setBoard(G.pos.b, []);
    if (pref.army) { VIEW.setArmy(true); $('#bArmy').classList.add('on'); }
    soundIcon(); renderMoves(); updateStatus(); layoutMode();
    $('#boot').remove();
    let info = null;
    try { const r = await fetch('info', { cache: 'no-store' }); if (r.ok) info = await r.json(); } catch (e) { }
    const online = !!info && info.online === true;
    G.online = online;
    $('#rankedBox').hidden = $('#bRanks').hidden = !(online && info.accounts);
    if (online) ACCOUNT.init(info, { toast });
    $('#onlineBox').classList.toggle('off', !online);
    $('#onlineSum').textContent = !online ? 'Cần chạy qua Cloudflare Worker' : info.accounts ? 'Xếp hạng hoặc phòng với bạn bè' : 'Phòng chơi với bạn bè';
    $('#onlineNote').textContent = online ? 'Tạo phòng rồi gửi link cho bạn bè, hoặc nhập mã phòng để vào.' : 'Chơi online cần chạy qua Cloudflare Worker (npm start hoặc bản đã deploy).';
    const invited = cleanRoom(new URLSearchParams(location.search).get('room'));
    if (online && invited.length >= 4) goOnline(invited);
    else showMenu(true);
  }
  boot();
})();
