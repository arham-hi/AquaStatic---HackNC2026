// Shared "how open should Aqua's mouth be" signal for every speaking path.
//   ElevenLabs MP3  → real waveform RMS read off the stream's AnalyserNode
//   browser speech  → procedural syllable clock kicked by word-boundary events
// Both produce a 0..1 target; followVoice() applies the attack/release envelope.

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const FLOOR = 0.014; // RMS below this is room tone / codec noise, not speech
const GAIN = 4.2; // comfortable speech (~0.05–0.2 RMS) maps to obvious jaw travel
const CURVE = 0.8; // mild perceptual lift so quiet syllables still register

/** Raw 0..1 RMS of an analyser's current waveform (time domain — unaffected by smoothingTimeConstant). */
export function rawRms(an: AnalyserNode | null, buf: Uint8Array<ArrayBuffer>): number {
  if (!an) return 0;
  an.getByteTimeDomainData(buf);
  let s = 0;
  const n = Math.min(an.fftSize, buf.length);
  for (let i = 0; i < n; i++) { const d = (buf[i] - 128) / 128; s += d * d; }
  return Math.sqrt(s / n);
}

/** Waveform RMS → normalized mouth-energy target (0..1). */
export const rmsToVoice = (rms: number) => (rms <= FLOOR ? 0 : Math.pow(clamp01((rms - FLOOR) * GAIN), CURVE));

/** Live MP3 sample → mouth-energy target. */
export const voiceTarget = (an: AnalyserNode | null, buf: Uint8Array<ArrayBuffer>) => rmsToVoice(rawRms(an, buf));

/**
 * Speech clock for browser TTS: layered syllable sines gated into phrases, plus a bump
 * on each word boundary so the mouth lands on real word starts. Callers only invoke
 * this while speechSynthesis is actually speaking — there is no waveform to analyse.
 */
export function speechClockTarget(kickAt: number, now = performance.now()): number {
  const t = now / 1000;
  const kick = Math.max(0, 1 - (now - kickAt) / 450);
  const syll = Math.max(0, Math.sin(t * 10.7) * 0.6 + Math.sin(t * 17.3) * 0.4);
  const gate = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.3) * 0.7 + Math.sin(t * 5.1) * 0.3);
  return clamp01((0.25 + 0.75 * syll) * gate + kick * 0.55);
}

// Per-tick envelope constants for ~60fps rAF samplers: snap open on a syllable, ease
// shut inside one, and return to the resting smile quickly once speech stops.
const ATTACK = 0.55;
const RELEASE = 0.16;
const REST = 0.5;

/** Attack/release follower. `speaking` = a voice source is live; when false the mouth heads to rest. */
export function followVoice(cur: number, target: number, speaking: boolean): number {
  const k = !speaking ? REST : target > cur ? ATTACK : RELEASE;
  const next = cur + (target - cur) * k;
  return next < 0.008 ? 0 : next;
}
