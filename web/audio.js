// Highrise audio — everything is synthesized with WebAudio (no asset files).
// Music: a generative lo-fi jazz loop. Ambience: city hum by day, crickets at night.
// SFX: small synth patches for UI / building / money events.

let ac = null;
let master, musicBus, sfxBus, ambBus, musicFilter;
let cityGain, cricketGain;
let night = 0;                      // 0 day … 1 night (drives music density + ambience)
const vol = { music: 0.6, sfx: 0.8, muted: false };
const VOL_KEY = 'highrise-audio';
try { Object.assign(vol, JSON.parse(localStorage.getItem(VOL_KEY) || '{}')); } catch { /* defaults */ }

export const volumes = () => ({ ...vol });
export const started = () => !!ac;

export function setVolume(kind, v) {
  vol[kind] = v;
  localStorage.setItem(VOL_KEY, JSON.stringify(vol));
  applyVolumes();
}
export function toggleMute() {
  vol.muted = !vol.muted;
  localStorage.setItem(VOL_KEY, JSON.stringify(vol));
  applyVolumes();
  return vol.muted;
}
function applyVolumes() {
  if (!ac) return;
  const t = ac.currentTime;
  master.gain.setTargetAtTime(vol.muted ? 0 : 1, t, 0.05);
  musicBus.gain.setTargetAtTime(vol.music * 0.55, t, 0.1);
  sfxBus.gain.setTargetAtTime(vol.sfx * 0.7, t, 0.05);
  ambBus.gain.setTargetAtTime(vol.sfx * 0.5, t, 0.2);
}

/** Must be called from a user gesture (browser autoplay rules). Safe to call repeatedly. */
export function startAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  ac = new (window.AudioContext || window.webkitAudioContext)();
  master = ac.createGain();
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 3;
  master.connect(comp).connect(ac.destination);
  musicBus = ac.createGain(); sfxBus = ac.createGain(); ambBus = ac.createGain();
  musicFilter = ac.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = 5200;
  musicBus.connect(musicFilter).connect(master);
  sfxBus.connect(master);
  ambBus.connect(master);
  applyVolumes();
  startAmbience();
  startMusic();
}

/** Called every frame-ish with game minute-of-day darkness (0..1). */
export function setNight(d) {
  night = d;
  if (!ac) return;
  const t = ac.currentTime;
  cityGain.gain.setTargetAtTime(0.16 * (1 - d) + 0.03, t, 0.5);
  cricketGain.gain.setTargetAtTime(0.05 * Math.max(0, d - 0.3), t, 0.5);
  musicFilter.frequency.setTargetAtTime(5200 - d * 3400, t, 1);
}

// ------------------------------------------------------------------ helpers

let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  return s;
}

function env(g, t, a, peak, d, sustain = 0) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + d);
}

function tone(bus, { type = 'sine', f, f2, t = ac.currentTime, a = 0.005, d = 0.2, peak = 0.3, detune = 0, filter }) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  o.detune.value = detune;
  env(g, t, a, peak, d);
  let node = o;
  if (filter) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filter; node.connect(fl); node = fl; }
  node.connect(g).connect(bus);
  o.start(t);
  o.stop(t + a + d + 0.05);
}

function burst(bus, { t = ac.currentTime, d = 0.15, peak = 0.3, type = 'lowpass', f = 1200, f2, q = 0.8 }) {
  const n = noise();
  const fl = ac.createBiquadFilter();
  fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d);
  const g = ac.createGain();
  env(g, t, 0.003, peak, d);
  n.connect(fl).connect(g).connect(bus);
  n.start(t, Math.random());
  n.stop(t + d + 0.05);
}

const midi = n => 440 * 2 ** ((n - 69) / 12);

// ------------------------------------------------------------------ sound effects

const lastPlayed = {};
export function sfx(name) {
  if (!ac || vol.muted) return;
  const now = ac.currentTime;
  const gap = { cash: 0.25, coin: 0.12, build: 0.05, chime: 0.3, ding: 0.4 }[name] ?? 0.03;
  if (lastPlayed[name] && now - lastPlayed[name] < gap) return;
  lastPlayed[name] = now;
  const b = sfxBus;
  switch (name) {
    case 'click':
      tone(b, { type: 'triangle', f: 1400, f2: 900, d: 0.05, peak: 0.12 });
      break;
    case 'hover':
      tone(b, { type: 'sine', f: 2200, d: 0.03, peak: 0.03 });
      break;
    case 'build':
      tone(b, { type: 'sine', f: 190, f2: 55, d: 0.16, peak: 0.5 });
      burst(b, { d: 0.07, peak: 0.25, f: 2600 });
      tone(b, { type: 'square', f: 2400, d: 0.02, peak: 0.03, t: now + 0.02 });
      break;
    case 'demolish':
      burst(b, { d: 0.45, peak: 0.45, f: 1800, f2: 120 });
      tone(b, { type: 'sawtooth', f: 90, f2: 40, d: 0.35, peak: 0.15, filter: 500 });
      break;
    case 'error':
      tone(b, { type: 'square', f: 196, d: 0.09, peak: 0.08, filter: 1200 });
      tone(b, { type: 'square', f: 185, d: 0.12, peak: 0.08, filter: 1200, t: now + 0.1 });
      break;
    case 'cash':
      burst(b, { d: 0.05, peak: 0.12, type: 'highpass', f: 6000 });
      tone(b, { type: 'triangle', f: 1318.5, d: 0.12, peak: 0.16, t: now + 0.03 });
      tone(b, { type: 'triangle', f: 1975.5, d: 0.35, peak: 0.16, t: now + 0.09 });
      break;
    case 'coin':
      tone(b, { type: 'triangle', f: 2093, d: 0.08, peak: 0.05 });
      break;
    case 'chime':
      [72, 76, 79].forEach((n, i) => tone(b, { type: 'sine', f: midi(n), d: 0.5, peak: 0.12, t: now + i * 0.07 }));
      break;
    case 'sad':
      [67, 63].forEach((n, i) => tone(b, { type: 'triangle', f: midi(n), d: 0.4, peak: 0.1, t: now + i * 0.18, filter: 2000 }));
      break;
    case 'ding':
      tone(b, { type: 'sine', f: 1046.5, d: 0.6, peak: 0.12 });
      tone(b, { type: 'sine', f: 1318.5, d: 0.8, peak: 0.08, t: now + 0.12 });
      break;
    case 'fanfare':
      [60, 64, 67, 72, 76].forEach((n, i) => {
        tone(b, { type: 'triangle', f: midi(n), d: 0.5, peak: 0.16, t: now + i * 0.09 });
        tone(b, { type: 'sine', f: midi(n + 12), d: 0.4, peak: 0.05, t: now + i * 0.09 });
      });
      tone(b, { type: 'sawtooth', f: midi(72), d: 1.2, peak: 0.06, t: now + 0.45, filter: 2400 });
      break;
    case 'start':
      burst(b, { d: 0.9, peak: 0.12, type: 'bandpass', f: 300, f2: 4000, q: 1.5 });
      [55, 62, 67, 71, 74].forEach((n, i) => tone(b, { type: 'sine', f: midi(n), d: 1.4, peak: 0.08, t: now + 0.15 + i * 0.06 }));
      break;
  }
}

// ------------------------------------------------------------------ ambience

function startAmbience() {
  // city: brown-ish noise through a lowpass with a slow wobble
  const n = noise();
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
  const lfo = ac.createOscillator(); lfo.frequency.value = 0.07;
  const lfoG = ac.createGain(); lfoG.gain.value = 140;
  lfo.connect(lfoG).connect(lp.frequency);
  cityGain = ac.createGain(); cityGain.gain.value = 0.1;
  n.connect(lp).connect(cityGain).connect(ambBus);
  n.start(); lfo.start();

  // crickets: amplitude-modulated high sine, chirping in bursts
  const c = ac.createOscillator(); c.frequency.value = 4400;
  const am = ac.createGain(); am.gain.value = 0;
  const trem = ac.createOscillator(); trem.type = 'square'; trem.frequency.value = 28;
  const tremG = ac.createGain(); tremG.gain.value = 0.5;
  const pulse = ac.createOscillator(); pulse.type = 'square'; pulse.frequency.value = 0.9;
  const pulseG = ac.createGain(); pulseG.gain.value = 0.5;
  trem.connect(tremG).connect(am.gain);
  pulse.connect(pulseG).connect(am.gain);
  cricketGain = ac.createGain(); cricketGain.gain.value = 0;
  c.connect(am).connect(cricketGain).connect(ambBus);
  c.start(); trem.start(); pulse.start();
}

// ------------------------------------------------------------------ music

const BPM = 78;
const BEAT = 60 / BPM;
// ii–V–I–vi-ish progression in F, voiced as 7th chords (MIDI notes)
const PROG = [
  { root: 50, notes: [62, 65, 69, 72] }, // Dm9-ish
  { root: 43, notes: [62, 65, 67, 71] }, // G13-ish
  { root: 48, notes: [60, 64, 67, 71] }, // Cmaj7
  { root: 45, notes: [60, 64, 67, 69] }, // Am7
  { root: 46, notes: [62, 65, 69, 72] }, // Bbmaj7
  { root: 45, notes: [60, 64, 67, 72] }, // Am7
  { root: 50, notes: [60, 62, 65, 69] }, // Dm7
  { root: 43, notes: [59, 62, 65, 69] }, // G7
];
let nextTime = 0, step = 0;

function startMusic() {
  nextTime = ac.currentTime + 0.3;
  setInterval(schedule, 40);
}

function schedule() {
  if (!ac || ac.state !== 'running') return;
  while (nextTime < ac.currentTime + 0.25) {
    playStep(step, nextTime);
    nextTime += BEAT / 2; // eighth notes
    step++;
  }
}

function pad(notes, t, dur) {
  for (const n of notes) {
    for (const det of [-6, 6]) {
      const o = ac.createOscillator(); o.type = 'triangle';
      o.frequency.value = midi(n); o.detune.value = det;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.022, t + 0.6);
      g.gain.setValueAtTime(0.022, t + dur - 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
      o.connect(lp).connect(g).connect(musicBus);
      o.start(t); o.stop(t + dur + 0.4);
    }
  }
}

function epiano(n, t, vel) {
  const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = midi(n);
  const o2 = ac.createOscillator(); o2.type = 'sine'; o2.frequency.value = midi(n) * 2.0;
  const g = ac.createGain(), g2 = ac.createGain();
  env(g, t, 0.004, 0.09 * vel, 0.9);
  env(g2, t, 0.002, 0.025 * vel, 0.25);
  o.connect(g).connect(musicBus);
  o2.connect(g2).connect(musicBus);
  o.start(t); o2.start(t); o.stop(t + 1); o2.stop(t + 0.4);
}

function playStep(s, t) {
  const bar = Math.floor(s / 8), beat8 = s % 8;
  const chord = PROG[bar % PROG.length];
  const busy = 1 - night * 0.6;
  // pad + bass at the top of each bar
  if (beat8 === 0) {
    pad(chord.notes, t, BEAT * 4);
    tone(musicBus, { type: 'sine', f: midi(chord.root), d: BEAT * 1.6, peak: 0.16, a: 0.01, t });
  }
  if (beat8 === 4 || (beat8 === 7 && Math.random() < 0.4 * busy)) {
    tone(musicBus, { type: 'sine', f: midi(chord.root + (Math.random() < 0.5 ? 7 : 12)), d: BEAT, peak: 0.11, a: 0.01, t });
  }
  // drums: soft kick, brushed snare, hat (swung)
  const swing = beat8 % 2 ? BEAT * 0.08 : 0;
  if (busy > 0.6) {
    if (beat8 === 0 || (beat8 === 5 && Math.random() < 0.5)) tone(musicBus, { type: 'sine', f: 120, f2: 45, d: 0.18, peak: 0.22, t });
    if (beat8 === 2 || beat8 === 6) burst(musicBus, { t, d: 0.12, peak: 0.05, type: 'bandpass', f: 1800, q: 0.6 });
  }
  if (Math.random() < 0.85 * busy) burst(musicBus, { t: t + swing, d: 0.03, peak: beat8 % 2 ? 0.02 : 0.012, type: 'highpass', f: 7000 });
  // electric piano noodling on chord tones (+ a scale tone now and then)
  if (Math.random() < 0.42 * busy + 0.12) {
    const pool = [...chord.notes, chord.notes[1] + 12, chord.notes[2] + 12];
    const n = pool[(Math.random() * pool.length) | 0] + (Math.random() < 0.15 ? 2 : 0);
    epiano(n + 12, t + swing, 0.6 + Math.random() * 0.4);
  }
}
