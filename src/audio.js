// audio.js — every sound is synthesised with Web Audio: wood clicks, steel clashes, the catapult's boom,
// war drums for a check, a gong to open the battle. The one recording: the music, a guzheng track for each
// battlefield, music/<stage id>.mp3.
'use strict';
const SFX = (() => {
  let ac = null, master = null, musicGain = null, on = true, musicOn = true, musicVol = 0.6;
  try {
    on = localStorage.getItem('cotuong_sound') !== '0'; musicOn = localStorage.getItem('cotuong_music') !== '0';
    const v = parseFloat(localStorage.getItem('cotuong_music_vol')); if (v >= 0 && v <= 1) musicVol = v;
  } catch (e) { }
  // the music's volume slider (0..1) on a square curve, so its lower half stays usable; 0.6 is the old fixed level
  const musicLevel = () => musicOn ? 0.6 * musicVol * musicVol : 0;
  const musicHeard = () => on && musicOn && musicVol > 0;
  function applyMusic(glide) {
    if (!musicGain) return;
    const g = musicGain.gain, t = ac.currentTime;
    g.cancelScheduledValues(t);
    if (glide) g.setTargetAtTime(musicLevel(), t, 0.05); else g.setValueAtTime(musicLevel(), t);
  }

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ac.createGain(); master.gain.value = on ? 0.8 : 0; master.connect(ac.destination);
    musicGain = ac.createGain(); musicGain.gain.value = musicLevel(); musicGain.connect(master);
    if (trackWant) music(trackWant);
  }
  const now = () => ac.currentTime;
  function env(g, t, a, d, peak) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function tone(freq, type, t, a, d, peak, dest = master, bend) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (bend) o.frequency.exponentialRampToValueAtTime(bend, t + a + d);
    env(g, t, a, d, peak); o.connect(g); g.connect(dest); o.start(t); o.stop(t + a + d + 0.05);
  }
  let noiseBuf = null;
  function whiteNoise() {
    if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1; }
    return noiseBuf;
  }
  function noise(t, d, peak, filter, freq, q = 1, dest = master) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = whiteNoise(); f.type = filter; f.frequency.value = freq; f.Q.value = q;
    env(g, t, 0.005, d, peak); s.connect(f); f.connect(g); g.connect(dest); s.start(t); s.stop(t + d + 0.05);
  }
  const play = fn => { if (!ac || !on) return; try { fn(now()); } catch (e) { } };

  const S = {
    init, music,
    get on() { return on; }, get musicOn() { return musicOn; }, get musicVol() { return musicVol; },
    toggle() { on = !on; try { localStorage.setItem('cotuong_sound', on ? '1' : '0'); } catch (e) { } if (master) master.gain.value = on ? 0.8 : 0; playTrack(); return on; },
    toggleMusic() { musicOn = !musicOn; try { localStorage.setItem('cotuong_music', musicOn ? '1' : '0'); } catch (e) { } applyMusic(); playTrack(); return musicOn; },
    setMusicVol(v) {
      musicVol = Math.max(0, Math.min(1, v)); try { localStorage.setItem('cotuong_music_vol', String(musicVol)); } catch (e) { }
      applyMusic(true);                                     // glides, so dragging the slider doesn't crackle
      playTrack(); return musicVol;
    },
    pick: () => play(t => { tone(900, 'triangle', t, 0.002, 0.05, 0.12); noise(t, 0.03, 0.08, 'bandpass', 2500, 2); }),
    place: () => play(t => { tone(180, 'sine', t, 0.002, 0.12, 0.5, master, 120); noise(t, 0.06, 0.25, 'bandpass', 1400, 1.5); }),
    step: () => play(t => { noise(t, 0.05, 0.08, 'lowpass', 500); }),
    gallop: () => play(t => { for (let i = 0; i < 3; i++) { tone(140, 'sine', t + i * 0.09, 0.002, 0.06, 0.18, master, 90); noise(t + i * 0.09, 0.04, 0.06, 'lowpass', 600); } }),
    roll: () => play(t => { noise(t, 0.45, 0.12, 'lowpass', 300); tone(70, 'sawtooth', t, 0.05, 0.4, 0.05); }),
    whoosh: () => play(t => { noise(t, 0.3, 0.16, 'bandpass', 900, 0.8); }),
    clash: () => play(t => {
      for (const [f, d] of [[1870, 0.5], [2630, 0.35], [3310, 0.3], [4420, 0.25]]) tone(f, 'square', t, 0.001, d, 0.05);
      noise(t, 0.12, 0.4, 'highpass', 3000); tone(220, 'triangle', t, 0.001, 0.15, 0.25, master, 110);
    }),
    thud: () => play(t => { tone(90, 'sine', t, 0.003, 0.3, 0.6, master, 40); noise(t, 0.2, 0.25, 'lowpass', 400); }),
    boom: () => play(t => { tone(70, 'sine', t, 0.005, 0.7, 0.9, master, 28); noise(t, 0.8, 0.6, 'lowpass', 900); noise(t, 0.15, 0.3, 'highpass', 2000); }),
    drum: () => play(t => { for (const [dt, p] of [[0, 0.9], [0.22, 0.7], [0.42, 1]]) { tone(95, 'sine', t + dt, 0.003, 0.4, p, master, 48); noise(t + dt, 0.08, 0.3 * p, 'lowpass', 300); } }),
    gong: () => play(t => { for (const [f, d, p] of [[110, 3.2, 0.35], [163, 2.6, 0.2], [247, 2.2, 0.12], [329, 1.6, 0.08], [412, 1.2, 0.05]]) tone(f, 'sine', t, 0.01, d, p, master, f * 0.98); noise(t, 0.3, 0.1, 'bandpass', 600, 1); }),
    win: () => play(t => { [392, 440, 523, 587, 659, 784].forEach((f, i) => tone(f, 'triangle', t + i * 0.12, 0.005, 0.7, 0.18)); }),
    lose: () => play(t => { [392, 349, 294, 262].forEach((f, i) => tone(f, 'triangle', t + i * 0.22, 0.01, 0.8, 0.16)); }),
    error: () => play(t => { tone(160, 'square', t, 0.002, 0.12, 0.08); }),
  };

  // ---------- music ----------
  // each battlefield has its own track, music/<stage id>.mp3, cut from one guzheng album; a missing file is silence.
  // An <audio> element streams it (a whole decoded track would weigh tens of MB) through the music volume,
  // and a change of stage fades the old track out before the new one fades in.
  let trackEl = null, trackGain = null, trackWant = '', trackUrl = '', trackOk = false, trackRun = 0;
  const noTrack = new Set();                                // stages whose file is missing: asked for once
  function fadeTrack(to, secs) {
    const g = trackGain.gain, t = now();
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(to, t + secs);
  }
  function music(id) {
    trackWant = id || '';
    if (!ac) return;                                        // starts once the page is allowed to play sound
    const url = trackWant && !noTrack.has(trackWant) ? `music/${trackWant}.mp3` : '';
    if (url === trackUrl) return;
    if (!trackEl) {
      trackEl = new Audio(); trackEl.loop = true; trackEl.preload = 'auto';
      trackGain = ac.createGain(); trackGain.gain.value = 0;
      ac.createMediaElementSource(trackEl).connect(trackGain); trackGain.connect(musicGain);
      trackEl.addEventListener('playing', () => { trackOk = true; fadeTrack(TRACK_LEVEL, 1.5); });
      trackEl.addEventListener('error', () => {
        if (!trackEl.getAttribute('src')) return;           // emptied on purpose
        noTrack.add(trackEl.dataset.stage); trackUrl = ''; trackOk = false;
      });
    }
    const run = ++trackRun, fade = trackOk ? 0.8 : 0;
    trackUrl = url;
    fadeTrack(0, fade || 0.01);
    setTimeout(() => {
      if (run !== trackRun) return;
      trackOk = false;
      if (!url) { trackEl.pause(); trackEl.removeAttribute('src'); trackEl.load(); return; }
      trackEl.dataset.stage = trackWant; trackEl.src = url;
      playTrack();
    }, fade * 1000);
  }
  // the element only runs while music is heard
  function playTrack() {
    if (!trackEl || !trackEl.getAttribute('src')) return;
    if (musicHeard()) trackEl.play().catch(() => { });
    else trackEl.pause();
  }
  const TRACK_LEVEL = 0.9;
  return S;
})();
