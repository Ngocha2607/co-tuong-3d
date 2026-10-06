// game.js — the match: menu, playing against the computer (search in a Web Worker), online rooms over a
// WebSocket to the Cloudflare Worker, the move list, banners and the end screen. VIEW draws, XQ rules.
'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const LEVELS = [
    { name: 'Dễ', time: 250, depth: 2, noise: true },
    { name: 'Thường', time: 900, depth: 6 },
    { name: 'Khó', time: 2600 },
  ];
  const SIDE = { 1: 'Đỏ', '-1': 'Đen' }, ARMY = { 1: 'Thục', '-1': 'Ngụy' };
  const REASON = { checkmate: 'Chiếu bí', stalemate: 'Hết nước đi', repetition: 'Lặp lại thế cờ ba lần', quiet: '60 nước liền không ăn quân', resign: 'Xin thua' };

  const G = {
    mode: 'menu', pos: XQ.Pos.fromFen(XQ.START), moves: [], keys: [], log: [], quiet: 0, captured: [],
    me: 1, level: 1, over: null, sel: -1, targets: [], thinking: false, animating: 0,
    room: '', ws: null, you: 0, players: { 1: false, '-1': false }, rematch: { 1: false, '-1': false }, online: false,
  };
  let pref = { side: 1, level: 1, army: false };
  try { pref = Object.assign(pref, JSON.parse(localStorage.getItem('cotuong_pref')) || {}); } catch (e) { }
  const savePref = () => { try { localStorage.setItem('cotuong_pref', JSON.stringify(pref)); } catch (e) { } };

  // ---------- game record ----------
  function reset() { G.pos = XQ.Pos.fromFen(XQ.START); G.moves = []; G.keys = []; G.log = []; G.quiet = 0; G.captured = []; G.over = null; }
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
    record(m);
    const st = XQ.status(G.pos, G.keys, G.quiet), turn = G.pos.turn, king = kingOf(turn), gen = G.gen;
    renderMoves();
    const mover = -G.pos.turn;
    enqueue(async () => {
      if (gen !== G.gen) return;                           // a new game started meanwhile
      await VIEW.play(m, { fast });
      if (gen !== G.gen) return;
      VIEW.check(-1);
      if (st.over) { endGame(st); return; }
      if (st.check) { VIEW.check(king); VIEW.alarm(king); SFX.drum(); banner('Chiếu tướng!', 'check'); }
      if (G.mode === 'ai' && G.pos.turn !== G.me && !G.over && G.animating <= 1) aiMove();
    });
    G.lastMover = mover; updateStatus();
  }

  // ---------- computer player ----------
  let worker = null, reqId = 0, aiId = 0;
  const waiting = new Map();
  function runLocal(job, res) {
    setTimeout(() => {
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
    const id = ++aiId, L = LEVELS[G.level], t0 = Date.now();
    G.thinking = true; updateStatus();
    ask({ fen: XQ.START, moves: G.moves.slice(), time: L.time, depth: L.depth, noise: L.noise ? (Math.random() * 1e9) | 1 : 0 }).then(r => {
      if (id !== aiId || G.mode !== 'ai' || G.over) return;
      setTimeout(() => {
        if (id !== aiId || G.mode !== 'ai') return;
        G.thinking = false;
        if (r.move) commit(r.move);
      }, Math.max(0, 500 - (Date.now() - t0)));
    });
  }

  // ---------- starting games ----------
  function startAI() {
    disconnect();
    G.mode = 'ai'; G.me = pref.side; G.level = pref.level; G.gen = (G.gen || 0) + 1; aiId++; G.thinking = false;
    reset(); clearSel();
    VIEW.setMenu(false); VIEW.setViewer(G.me); VIEW.setBoard(G.pos.b, []); VIEW.lastMove(-1, -1); VIEW.check(-1); VIEW.hint(-1, -1);
    showMenu(false); showEnd(false); renderMoves(); layoutMode();
    SFX.init(); SFX.gong(); banner('Khai cuộc', 'open');
    updateStatus();
    if (G.me < 0) setTimeout(() => { if (G.mode === 'ai' && !G.moves.length) aiMove(); }, 900);
  }
  function undo() {
    if (G.mode !== 'ai' || G.animating) return;
    aiId++; G.thinking = false;
    let n = G.pos.turn === G.me ? 2 : 1;
    if (G.over && G.over.reason === 'resign') n = 0;
    n = Math.min(n, G.moves.length);
    if (G.me < 0 && G.moves.length - n < 1) n = G.moves.length;   // keep Black's view sane: replay from the start
    if (!n && !G.over) return;
    rebuild(G.moves.slice(0, G.moves.length - n));
    G.gen = (G.gen || 0) + 1;
    VIEW.setBoard(G.pos.b, G.captured); clearSel(); VIEW.hint(-1, -1);
    const lm = G.moves[G.moves.length - 1]; VIEW.lastMove(lm ? XQ.from(lm) : -1, lm ? XQ.to(lm) : -1);
    const st = XQ.status(G.pos, G.keys, G.quiet); VIEW.check(st.check ? kingOf(G.pos.turn) : -1);
    showEnd(false); renderMoves(); updateStatus(); SFX.pick();
    if (G.pos.turn !== G.me) aiMove();
  }
  function hint() {
    if (G.mode !== 'ai' || G.over || G.pos.turn !== G.me || G.thinking || G.animating) return;
    const b = $('#bHint'); b.disabled = true; b.textContent = 'Đang tìm…';
    ask({ fen: XQ.START, moves: G.moves.slice(), time: 900 }).then(r => {
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
    if (Date.now() - resignArm > 3000) { resignArm = Date.now(); b.textContent = 'Chắc chắn?'; b.classList.add('warn'); setTimeout(() => { b.textContent = 'Xin thua'; b.classList.remove('warn'); }, 3000); return; }
    resignArm = 0; b.textContent = 'Xin thua'; b.classList.remove('warn');
    if (G.mode === 'online') { send({ t: 'resign' }); return; }
    aiId++; G.thinking = false;
    endGame({ over: true, winner: -G.me, reason: 'resign' });
  }

  // ---------- end of a game ----------
  function endGame(st) {
    if (G.over && G.over.shown) return;
    G.over = Object.assign({}, st, { shown: true });
    VIEW.check(-1); clearSel();
    const viewer = G.mode === 'online' ? G.you : G.me;
    if (st.winner && st.reason !== 'resign') VIEW.defeat(kingOf(-st.winner));
    if (!st.winner) SFX.gong(); else if (!viewer || st.winner === viewer) SFX.win(); else SFX.lose();
    updateStatus();
    setTimeout(() => showEnd(true), st.reason === 'resign' ? 200 : 1300);
  }
  function endText() {
    const st = G.over, viewer = G.mode === 'online' ? G.you : G.me;
    if (!st) return ['', ''];
    let title;
    if (!st.winner) title = 'Hòa cờ';
    else if (!viewer) title = SIDE[st.winner] + ' thắng';
    else title = st.winner === viewer ? 'Chiến thắng!' : 'Thất bại';
    const who = st.winner ? `${SIDE[st.winner]} (${ARMY[st.winner]}) thắng` : 'Hai bên bất phân thắng bại';
    const why = st.reason === 'resign' ? `${SIDE[-st.winner]} xin thua` : REASON[st.reason] || '';
    return [title, `${why} · ${who} sau ${Math.ceil(G.moves.length / 2)} nước`];
  }

  // ---------- online ----------
  const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const cleanRoom = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const roomLink = () => `${location.origin}${location.pathname}?room=${G.room}`;
  let retryT = null;
  function goOnline(room) {
    disconnect();
    G.mode = 'online'; G.room = room; G.you = 0; G.gen = (G.gen || 0) + 1; aiId++;
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
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?room=${G.room}`);
    G.ws = ws; G.netState = 'connecting'; updateStatus();
    ws.onopen = () => { G.netState = 'ok'; ws.send(JSON.stringify({ t: 'hello', token: token() })); };
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
        G.gen = (G.gen || 0) + 1; chain = Promise.resolve(); G.animating = 0;
        rebuild(m.moves || []);
        VIEW.setViewer(G.me, false); VIEW.setBoard(G.pos.b, G.captured); clearSel(); VIEW.hint(-1, -1);
        const lm = G.moves[G.moves.length - 1]; VIEW.lastMove(lm ? XQ.from(lm) : -1, lm ? XQ.to(lm) : -1);
        const st = XQ.status(G.pos, G.keys, G.quiet); VIEW.check(!m.over && st.check ? kingOf(G.pos.turn) : -1);
        G.over = m.over ? Object.assign({}, m.over, { shown: true }) : null;
        showEnd(!!m.over); renderMoves(); updateStatus();
        if (!G.moves.length && !m.over && (firstSeat || m.fresh)) { SFX.gong(); banner(G.you ? `Bạn cầm quân ${SIDE[G.you]}` : 'Bạn đang xem trận', 'open'); }
        break;
      }
      case 'move':
        if (m.ply === G.moves.length) { commit(m.m); }
        else if (m.ply > G.moves.length) send({ t: 'sync' });
        break;
      case 'presence': G.players = m.players; updateStatus(); break;
      case 'over': enqueue(async () => { endGame(m); }); break;
      case 'rematch': G.rematch = m.want; renderEnd(); break;
      case 'error': toast(m.msg || 'Có lỗi xảy ra'); break;
    }
  }

  // ---------- input on the board ----------
  function clearSel() { G.sel = -1; G.targets = []; VIEW.select(-1, []); }
  const myTurn = () => G.mode !== 'menu' && !G.over && !G.thinking && G.pos.turn === G.me && (G.mode !== 'online' || G.you === G.me);
  const canAct = () => myTurn() && !G.animating;
  VIEW.onTap = s => {
    SFX.init();
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
  VIEW.onHover(s => canAct() && s >= 0 && ((G.pos.b[s] && Math.sign(G.pos.b[s]) === G.me) || G.targets.includes(s)));

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
    const st = $('#status'), turn = G.pos.turn;
    let text = '';
    if (G.mode === 'menu') text = '';
    else if (G.over) text = endText()[0];
    else if (G.animating && !G.thinking) text = G.mode === 'ai' ? (G.lastMover === G.me ? 'Máy chuẩn bị đi…' : 'Máy đang đi quân…')
      : G.lastMover === G.you ? 'Đã đi, chờ đối thủ…' : G.you ? 'Đối thủ đang đi quân…' : `${SIDE[G.lastMover]} đang đi quân…`;
    else if (G.mode === 'ai') text = G.thinking ? 'Máy đang tính nước…' : turn === G.me ? `Lượt bạn · ${SIDE[G.me]}` : 'Máy chuẩn bị đi…';
    else if (G.mode === 'online') {
      if (G.netState === 'connecting') text = 'Đang kết nối phòng…';
      else if (G.netState === 'lost') text = 'Mất kết nối, đang nối lại…';
      else if (G.you && !G.players[-G.you]) text = 'Đang chờ đối thủ vào phòng…';
      else if (!G.you) text = `Đang xem · Lượt ${SIDE[turn]}`;
      else text = turn === G.you ? `Lượt bạn · ${SIDE[G.you]}` : 'Lượt đối thủ';
    }
    st.textContent = text;
    st.classList.toggle('mine', !G.over && !G.animating && myTurn());
    for (const side of [1, -1]) {
      const el = $(side > 0 ? '#plRed' : '#plBlack');
      let who = '';
      if (G.mode === 'ai') who = side === G.me ? 'Bạn' : `Máy · ${LEVELS[G.level].name}`;
      else if (G.mode === 'online') who = side === G.you ? 'Bạn' : G.players[side] ? (G.you ? 'Đối thủ' : 'Người chơi') : 'Chưa vào';
      el.querySelector('.who').textContent = who;
      el.classList.toggle('turn', !G.over && G.mode !== 'menu' && (G.animating ? -G.lastMover : turn) === side);
      el.classList.toggle('away', G.mode === 'online' && !G.players[side]);
    }
    $('#bUndo').disabled = G.mode !== 'ai' || !G.moves.length;
    $('#bHint').disabled = G.mode !== 'ai' || !!G.over;
    $('#bResign').disabled = !!G.over || G.mode === 'menu' || (G.mode === 'online' && !G.you);
    const room = $('#room');
    room.hidden = G.mode !== 'online';
    if (G.mode === 'online') { $('#roomCode').textContent = G.room; $('#roomLink').textContent = roomLink(); }
  }
  function layoutMode() {
    document.body.dataset.mode = G.mode;
    VIEW.setInset(G.mode !== 'menu' && innerWidth > 760 ? 332 : 0);
    $('#bUndo').hidden = $('#bHint').hidden = G.mode !== 'ai';
    $('#bNew').textContent = G.mode === 'online' ? 'Đấu lại' : 'Ván mới';
  }
  function showMenu(on) {
    $('#menu').hidden = !on;
    $('#bResume').hidden = !(on && G.mode !== 'menu');
    if (on) VIEW.setMenu(G.mode === 'menu');
  }
  function renderEnd() {
    const [title, sub] = endText();
    $('#endTitle').textContent = title; $('#endSub').textContent = sub;
    const viewer = G.mode === 'online' ? G.you : G.me;
    const result = !G.over ? '' : !G.over.winner ? 'draw' : !viewer || G.over.winner === viewer ? 'win' : 'lose';
    $('#end').dataset.result = result; $('#end .han').textContent = { win: '勝', lose: '敗', draw: '和' }[result] || '';
    const again = $('#bAgain');
    again.hidden = G.mode === 'online' && !G.you;
    if (G.mode === 'online') {
      const mine = G.rematch[G.you], theirs = G.rematch[-G.you];
      again.textContent = mine ? 'Đang chờ đối thủ…' : theirs ? 'Đồng ý đấu lại' : 'Đấu lại (đổi bên)';
      again.disabled = !!mine;
      $('#endNote').textContent = theirs && !mine ? 'Đối thủ muốn đấu lại.' : mine ? 'Đã gửi lời mời đấu lại.' : '';
    } else { again.textContent = 'Ván mới'; again.disabled = false; $('#endNote').textContent = ''; }
    $('#bEndUndo').hidden = G.mode !== 'ai';
  }
  function showEnd(on) { if (on) renderEnd(); $('#end').hidden = !on; }
  function again() {
    if (G.mode === 'online') { send({ t: 'rematch' }); G.rematch[G.you] = true; renderEnd(); return; }
    startAI();
  }

  // menu controls
  function seg(id, value, onPick) {
    const el = $(id);
    const mark = v => el.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v === v));
    mark(value);
    el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; SFX.init(); SFX.pick(); mark(+b.dataset.v); onPick(+b.dataset.v); });
  }
  seg('#segSide', pref.side, v => { pref.side = v; savePref(); });
  seg('#segLevel', pref.level, v => { pref.level = v; savePref(); });
  $('#bPlayAI').addEventListener('click', () => startAI());
  $('#bCreate').addEventListener('click', () => goOnline(Array.from({ length: 4 }, () => ROOM_CHARS[(Math.random() * ROOM_CHARS.length) | 0]).join('')));
  const joinTyped = () => { const r = cleanRoom($('#inRoom').value); if (r.length < 4) { toast('Nhập mã phòng 4 ký tự'); $('#inRoom').focus(); return; } goOnline(r); };
  $('#bJoin').addEventListener('click', joinTyped);
  $('#inRoom').addEventListener('keydown', e => { if (e.key === 'Enter') joinTyped(); });
  $('#bResume').addEventListener('click', () => showMenu(false));
  $('#bMenu').addEventListener('click', () => { SFX.init(); showMenu(true); });
  $('#bUndo').addEventListener('click', undo);
  $('#bEndUndo').addEventListener('click', undo);
  $('#bHint').addEventListener('click', hint);
  $('#bResign').addEventListener('click', resign);
  $('#bNew').addEventListener('click', () => { if (G.mode === 'online') { if (G.over) again(); else toast('Ván đang diễn ra. Xin thua hoặc chờ hết ván để đấu lại.'); } else startAI(); });
  $('#bAgain').addEventListener('click', again);
  $('#bEndMenu').addEventListener('click', () => { showEnd(false); showMenu(true); });
  $('#bEndClose').addEventListener('click', () => showEnd(false));
  $('#bCopy').addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(roomLink()).then(() => toast('Đã sao chép link mời')); });
  $('#bArmy').addEventListener('click', () => { pref.army = !VIEW.army; savePref(); VIEW.setArmy(pref.army); $('#bArmy').classList.toggle('on', pref.army); SFX.init(); SFX.pick(); toast(pref.army ? 'Đội quân: mọi quân hiện chiến binh' : 'Quân cờ: chiến binh chỉ hiện khi ra trận'); });
  $('#bCam').addEventListener('click', () => VIEW.resetCamera());
  const soundIcon = () => { $('#bSound').classList.toggle('off', !SFX.on); $('#bMusic').classList.toggle('off', !SFX.musicOn); };
  $('#bSound').addEventListener('click', () => { SFX.init(); SFX.toggle(); soundIcon(); });
  $('#bMusic').addEventListener('click', () => { SFX.init(); SFX.toggleMusic(); soundIcon(); });
  $('#bMoves').addEventListener('click', () => document.body.classList.toggle('show-moves'));
  addEventListener('pointerdown', () => SFX.init(), { once: true });
  addEventListener('resize', () => VIEW.setInset(G.mode !== 'menu' && innerWidth > 760 ? 332 : 0));

  // test hook (only with #debug in the URL): the engine plays both sides
  if (location.hash === '#debug') window.__ct = {
    G, commit, endGame,
    selfPlay() { G.mode = 'debug'; const r = XQ.think(G.pos, { time: 120, history: G.keys.slice() }); if (r.move) commit(r.move); return r.move; },
  };

  // ---------- boot ----------
  async function boot() {
    // the brush font has to be in before the characters are painted on the pieces
    try { await Promise.race([document.fonts.load('bold 64px "LXGW WenKai TC"', '帥將楚漢'), new Promise(r => setTimeout(r, 3500))]); } catch (e) { }
    VIEW.init($('#view'));
    VIEW.setBoard(G.pos.b, []);
    if (pref.army) { VIEW.setArmy(true); $('#bArmy').classList.add('on'); }
    soundIcon(); renderMoves(); updateStatus(); layoutMode();
    $('#boot').remove();
    let online = false;
    try { const r = await fetch('info', { cache: 'no-store' }); online = r.ok && (await r.json()).online === true; } catch (e) { }
    G.online = online;
    $('#onlineBox').classList.toggle('off', !online);
    $('#onlineNote').textContent = online ? 'Tạo phòng rồi gửi link cho bạn bè, hoặc nhập mã phòng để vào.' : 'Chơi online cần chạy qua Cloudflare Worker (npm start hoặc bản đã deploy).';
    const invited = cleanRoom(new URLSearchParams(location.search).get('room'));
    if (online && invited.length >= 4) goOnline(invited);
    else showMenu(true);
  }
  boot();
})();
