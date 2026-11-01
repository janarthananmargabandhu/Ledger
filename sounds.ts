// Small sounds made in the browser (no audio files to download). Phones only allow sound after the user taps something.
let ctx: AudioContext | null = null;
const KEY = 'gwj-sound';

export const soundOn = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } };
export const setSoundOn = (on: boolean) => { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* storage blocked */ } };

function ac(): AudioContext | null {
  if (!soundOn()) return null;
  try {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!ctx) ctx = new C();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(a: AudioContext, freq: number, start: number, dur: number, vol: number, type: OscillatorType = 'sine') {
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0, start); g.gain.linearRampToValueAtTime(vol, start + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(a.destination); o.start(start); o.stop(start + dur + 0.02);
}

/** A bright two-note coin clink. */
export function coin() {
  const a = ac(); if (!a) return; const t = a.currentTime;
  tone(a, 1568, t, 0.12, 0.18, 'triangle'); tone(a, 2349, t + 0.07, 0.35, 0.16, 'triangle'); tone(a, 4700, t + 0.07, 0.15, 0.03);
}

/** Water pouring: filtered noise that bubbles. */
export function water() {
  const a = ac(); if (!a) return; const t = a.currentTime, dur = 0.9;
  const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.6;
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
  f.frequency.setValueAtTime(700, t); for (let k = 0; k < 9; k++) f.frequency.setValueAtTime(500 + Math.random() * 900, t + k * 0.1);
  const g = a.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22, t + 0.08); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination); src.start(t); src.stop(t + dur);
  for (let k = 0; k < 4; k++) tone(a, 600 + Math.random() * 500, t + 0.15 + k * 0.17, 0.08, 0.05);
}

/** A rising chime for growing a stage. */
export function chime() {
  const a = ac(); if (!a) return; const t = a.currentTime;
  [523, 659, 784, 1047].forEach((f, i) => tone(a, f, t + i * 0.11, 0.6, 0.12, 'triangle'));
}

/** A soft tick for small taps. */
export function tick() { const a = ac(); if (!a) return; tone(a, 880, a.currentTime, 0.06, 0.06); }
