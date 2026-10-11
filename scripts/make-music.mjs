// Generates Aqua FM's instrumental music bed as small WAV loops in public/music/.
// Everything is synthesized here — no samples, no third-party audio, no license risk.
// Run: node scripts/make-music.mjs

import fs from "node:fs";
import path from "node:path";

const RATE = 22050;
const OUT = path.resolve(process.cwd(), "public", "music");

// Deterministic PRNG so the tracks are identical on every machine.
const rng = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function pad(sr, t, freq, start, dur) {
  // Soft two-oscillator pad voice with a slow swell.
  const x = t - start;
  if (x < 0 || x > dur) return 0;
  const env = Math.min(1, x / 1.2) * Math.min(1, (dur - x) / 1.6);
  const v = Math.sin(2 * Math.PI * freq * x) + 0.5 * Math.sin(2 * Math.PI * freq * 2.005 * x) + 0.25 * Math.sin(2 * Math.PI * (freq * 0.5) * x);
  return v * env * 0.16;
}

function pluck(sr, t, freq, start) {
  // Short bell-ish arpeggio note.
  const x = t - start;
  if (x < 0 || x > 1.1) return 0;
  const env = Math.exp(-5.2 * x) * Math.min(1, x / 0.008);
  const v = Math.sin(2 * Math.PI * freq * x) + 0.4 * Math.sin(2 * Math.PI * freq * 3.01 * x) * Math.exp(-9 * x);
  return v * env * 0.30;
}

function bass(sr, t, freq, start, dur) {
  const x = t - start;
  if (x < 0 || x > dur) return 0;
  const env = Math.min(1, x / 0.4) * Math.min(1, (dur - x) / 0.8);
  return Math.sin(2 * Math.PI * freq * x) * env * 0.20;
}

/** chord: midi notes; bars of `beats` beats at `bpm`. */
function render({ seed, chords, bars, bpm, out, arpDensity = 0.8 }) {
  const rand = rng(seed);
  const beat = 60 / bpm;
  const barLen = beat * 4;
  const total = bars * chords.length * barLen;
  const n = Math.floor(total * RATE);
  const data = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const bar = Math.floor(t / barLen);
    const chord = chords[bar % chords.length];
    const chordStart = bar * barLen;
    let s = 0;
    // Pad: all chord tones swell for the whole bar.
    for (const note of chord) s += pad(RATE, t, midi(note), chordStart, barLen);
    // Bass: root an octave+ down.
    s += bass(RATE, t, midi(chord[0] - 12), chordStart, barLen);
    data[i] = s;
  }
  // Arpeggio: 8th-note plucks over chord tones.
  for (let bar = 0; bar < bars * chords.length; bar++) {
    const chord = chords[bar % chords.length];
    const up = chord.map((m) => m + 12);
    for (let e = 0; e < 8; e++) {
      if (rand() > arpDensity && e % 2 === 1) continue;
      const note = up[Math.floor(rand() * up.length)] + (rand() < 0.15 ? 12 : 0);
      const t = bar * barLen + e * beat * 0.5;
      const idx = Math.floor(t * RATE);
      for (let k = 0; k < Math.floor(1.2 * RATE) && idx + k < n; k++) data[idx + k] += pluck(RATE, (idx + k) / RATE, midi(note), t);
    }
  }
  // Gentle limiter + fade-in/out so the loop doesn't click.
  const fade = Math.floor(0.35 * RATE);
  let peak = 0.001;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  const gain = 0.86 / peak;
  for (let i = 0; i < n; i++) {
    let g = gain;
    if (i < fade) g *= i / fade;
    if (i > n - fade) g *= (n - i) / fade;
    data[i] = Math.tanh(data[i] * g);
  }
  writeWav(path.join(OUT, out), data);
  console.log(`${out}: ${(total).toFixed(1)}s, ${(n * 2 / 1e6).toFixed(2)} MB`);
}

function writeWav(file, f32) {
  const buf = Buffer.alloc(44 + f32.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + f32.length * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(f32.length * 2, 40);
  for (let i = 0; i < f32.length; i++) buf.writeInt16LE(Math.max(-1, Math.min(1, f32[i])) * 32767, 44 + i * 2);
  fs.writeFileSync(file, buf);
}

fs.mkdirSync(OUT, { recursive: true });

// Track 1 — "Aqua Drift": Cmaj7 → Am7 → Fmaj7 → G6, calm lo-fi.
render({
  seed: 7, bpm: 92, bars: 4, out: "aqua-drift.wav", arpDensity: 0.85,
  chords: [
    [48, 52, 55, 59], // C E G B
    [45, 48, 52, 55], // A C E G
    [41, 45, 48, 52], // F A C E
    [43, 47, 50, 52], // G B D E
  ],
});

// Track 2 — "Static Tide": Am9 → Fmaj7 → Cmaj7 → Em7, slightly deeper.
render({
  seed: 21, bpm: 84, bars: 4, out: "static-tide.wav", arpDensity: 0.7,
  chords: [
    [45, 48, 52, 59], // A C E B
    [41, 45, 48, 52], // F A C E
    [48, 52, 55, 59], // C E G B
    [40, 43, 47, 50], // E G B D
  ],
});
