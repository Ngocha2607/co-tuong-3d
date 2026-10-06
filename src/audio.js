// audio.js — every sound is synthesised with Web Audio: wood clicks, steel clashes, the catapult's boom,
// war drums for a check, a gong to open the battle, and a quiet pentatonic zither in the background.
'use strict';
const SFX = (() => {
  let ac = null, master = null, musicGain = null, on = true, musicOn = true, musicT = null;
  try { on = localStorage.getItem('cotuong_sound') !== '0'; musicOn = localStorage.getItem('cotuong_music') !== '0'; } catch (e) { }

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ac.createGain(); master.gain.value = on ? 0.8 : 0; master.connect(ac.destination);
    musicGain = ac.createGain(); musicGain.gain.value = musicOn ? 0.22 : 0; musicGain.connect(master);
    startMusic();
  }
  const now = () => ac.currentTime;
  function env(g, t, a, d, peak) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function tone(freq, type, t, a, d, peak, dest = master, bend) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (bend) o.frequency.exponentialRampToValueAtTime(bend, t + a + d);
    env(g, t, a, d, peak); o.connect(g); g.connect(dest); o.start(t); o.stop(t + a + d + 0.05);
  }
  let noiseBuf = null;
  function noise(t, d, peak, filter, freq, q = 1) {
    if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1; }
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = filter; f.frequency.value = freq; f.Q.value = q;
    env(g, t, 0.005, d, peak); s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + d + 0.05);
  }
  const play = fn => { if (!ac || !on) return; try { fn(now()); } catch (e) { } };

  const S = {
    init,
    get on() { return on; }, get musicOn() { return musicOn; },
    toggle() { on = !on; try { localStorage.setItem('cotuong_sound', on ? '1' : '0'); } catch (e) { } if (master) master.gain.value = on ? 0.8 : 0; return on; },
    toggleMusic() { musicOn = !musicOn; try { localStorage.setItem('cotuong_music', musicOn ? '1' : '0'); } catch (e) { } if (musicGain) musicGain.gain.value = musicOn ? 0.22 : 0; return musicOn; },
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

  // a soft guzheng-like pluck walking a pentatonic scale
  const SCALE = [293.66, 329.63, 392, 440, 493.88, 587.33, 659.25, 783.99];
  function pluck(f, t, p) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
    o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f * 2.005;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(600, t + 1.4);
    env(g, t, 0.004, 1.8, p); o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(musicGain);
    o.start(t); o2.start(t); o.stop(t + 2); o2.stop(t + 2);
  }
  let idx = 3;
  function startMusic() {
    if (musicT) return;
    const tick = () => {
      if (ac && musicOn && on) {
        const t = now() + 0.05;
        idx = Math.max(0, Math.min(SCALE.length - 1, idx + [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)]));
        pluck(SCALE[idx], t, 0.5);
        if (Math.random() < 0.35) pluck(SCALE[Math.max(0, idx - 3)] / 2, t + 0.01, 0.3);
        if (Math.random() < 0.25) pluck(SCALE[Math.min(SCALE.length - 1, idx + 1)], t + 0.32, 0.25);
      }
      musicT = setTimeout(tick, 900 + Math.random() * 1400);
    };
    tick();
  }
  return S;
})();
