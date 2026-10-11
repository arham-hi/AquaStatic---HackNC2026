"use client";
// Per-frame animation for Aqua. Mutates object3D refs directly — zero React re-renders.
// States: idle | tuning | music | talking | alert | muted, plus transient fx (bounce | celebrate | wave).

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AquaAnim } from "./aqua-expressions";
import type { BodyRig } from "./aqua-radio-body";
import type { FaceRig } from "./aqua-face";

export type Rig = {
  root: THREE.Group | null;
  inner: THREE.Group | null;
  head: THREE.Group | null;
  glow: THREE.Sprite | null;
  bubbles: (THREE.Mesh | null)[];
  bubbleBase: { x: number; y: number; z: number; s: number; ph: number }[];
  notes: (THREE.Sprite | null)[];
  body: BodyRig;
  face: FaceRig;
};

export const makeRig = (): Rig => ({
  root: null, inner: null, head: null, glow: null,
  bubbles: [], notes: [],
  bubbleBase: [
    { x: -1.85, y: 0.3, z: 0.3, s: 0.1, ph: 0 },
    { x: 1.95, y: 0.7, z: 0.1, s: 0.14, ph: 1.4 },
    { x: -1.7, y: 1.1, z: -0.3, s: 0.07, ph: 2.6 },
    { x: 1.75, y: -0.5, z: 0.4, s: 0.08, ph: 3.8 },
    { x: -2.0, y: -0.6, z: -0.2, s: 0.12, ph: 5.1 },
  ],
  body: {
    knobL: null, knobR: null, antenna: null, antennaTip: null, grille: [],
    ledMat: null, displayMat: null, displayFrame: null, armL: null, armR: null, footL: null, footR: null,
  },
  face: {
    eyeL: null, eyeR: null, pupilL: null, pupilR: null, happyL: null, happyR: null,
    browL: null, browR: null, mouthSmile: null, mouthOpen: null, tongue: null, cheekL: null, cheekR: null,
  },
});

const LED_COLORS: Record<string, string> = {
  idle: "#46c8ff", tuning: "#ffffff", music: "#3ee6c4", talking: "#ff5a5a", alert: "#ffb02e", muted: "#8a99a6",
  listening: "#b78cff", thinking: "#ffd166", error: "#ff4444",
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (a: number, b: number, x: number) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const BASE_Y = 1.32; // body center height above the contact shadow

export function useAquaAnimation(rig: Rig, anim: AquaAnim, displayTex: { on: THREE.Texture; idle: THREE.Texture }) {
  const sm = useRef({
    open: 0, happy: 0, blinkT: 9, nextBlink: 1.8, eyeW: 1, tiltZ: 0, headX: 0, headY: 0,
    armL: -0.45, armR: 0.45, browL: 0, browR: 0, cheek: 0.4, squash: 0, ledPulse: 0,
  });

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const s = anim.state;
    const v = clamp01(anim.levels.current.voice);
    const m = clamp01(anim.levels.current.music);
    const damp = anim.reduced ? 0.25 : 1;
    const talking = s === "talking" || s === "alert";
    const energy = talking ? v : s === "music" ? m : 0;
    const fx = anim.fx.current;
    const fp = fx ? (performance.now() - fx.t0) / 1000 : 99;
    const celebrating = fx?.name === "celebrate" && fp < 1.15;
    const bouncing = fx?.name === "bounce" && fp < 0.7;
    const waving = fx?.name === "wave" && fp < 1.3;
    const S = sm.current;
    const k = Math.min(1, dt * 12); // frame-rate independent-ish smoothing

    // ---- voice → jaw: levels.voice arrives noise-floored, normalized and envelope-followed
    // by the audio samplers; here we just ease it (snappy attack, soft release, quick rest).
    const openTarget = s === "muted" ? 0 : talking ? clamp01(v * 1.15) : 0;
    S.open = lerp(S.open, openTarget, openTarget > S.open ? k * 2.2 : talking ? k * 0.7 : k * 1.6);
    const o = S.open;

    // ---- root: bob + dance + jump ----
    const bobAmp = (s === "idle" ? 0.05 : s === "music" ? 0.085 : s === "alert" ? 0.012 : s === "error" ? 0.008 : talking ? 0.025 + o * 0.035 : 0.02) * damp;
    const bobSpd = s === "music" ? 2.7 : talking ? 2.1 : s === "thinking" ? 0.8 : 1.35;
    const jump = celebrating ? Math.sin((Math.PI * fp) / 1.15) * 0.42 : bouncing ? Math.sin((Math.PI * fp) / 0.7) * 0.24 : 0;
    if (rig.root) {
      rig.root.position.y = BASE_Y + bobAmp * Math.sin(t * bobSpd) + jump;
      const tiltTarget = s === "music" ? Math.sin(t * 2.7) * 0.055 : s === "thinking" ? 0.09 : talking ? Math.sin(t * 1.9) * 0.018 : 0;
      S.tiltZ = lerp(S.tiltZ, tiltTarget * damp, k * 0.6);
      rig.root.rotation.z = S.tiltZ;
      rig.root.rotation.y = Math.sin(t * 0.5) * 0.03 * damp;
    }
    // squash & stretch on jumps
    S.squash = lerp(S.squash, ((bouncing || celebrating) ? Math.sin(Math.PI * Math.min(1, fp)) * 0.08 : 0) + (talking ? o * 0.05 * damp : 0), k);
    if (rig.inner) rig.inner.scale.set(1 + S.squash * 0.7, 1 - S.squash, 1 + S.squash * 0.7);

    // ---- head/face tilt: hover + cursor proximity ----
    const px = anim.pointer.current.x, py = anim.pointer.current.y;
    const wantX = anim.hover.current ? -py * 0.1 : s === "listening" ? 0.07 : s === "thinking" ? -0.05 : 0;
    const wantY = anim.pointer.current.active ? px * (anim.hover.current ? 0.16 : 0.07) : 0;
    S.headX = lerp(S.headX, wantX * damp + (anim.reduced ? 0 : wantX * 0), k * 0.5);
    S.headY = lerp(S.headY, wantY, k * 0.5);
    if (rig.head) {
      rig.head.rotation.x = S.headX + o * 0.05 * damp; // chin dips a little with each syllable
      rig.head.rotation.y = S.headY;
    }

    // ---- blink ----
    S.blinkT += dt / 0.16;
    if (t > S.nextBlink) { S.blinkT = 0; S.nextBlink = t + 2.0 + Math.random() * 3.2 - (talking ? 0.4 : 0); }
    const blink = S.blinkT < 1 ? Math.sin(Math.min(1, S.blinkT) * Math.PI) : 0;
    const eyeWTarget = celebrating || s === "tuning" || anim.hover.current ? 1.13 : s === "muted" ? 0.55 : s === "error" ? 0.68 : s === "alert" ? 0.92 : s === "listening" ? 1.08 : 1;
    S.eyeW = lerp(S.eyeW, eyeWTarget, k * 0.4);
    const eyeY = Math.max(0.04, S.eyeW * (1 - blink));
    const happyTarget = celebrating ? 1 : 0;
    S.happy = lerp(S.happy, happyTarget, k * 0.8);
    const normalEye = 1 - S.happy;
    for (const [eye, pupil, hap] of [[rig.face.eyeL, rig.face.pupilL, rig.face.happyL], [rig.face.eyeR, rig.face.pupilR, rig.face.happyR]] as const) {
      if (eye) {
        eye.scale.set(normalEye || 0.001, Math.max(0.001, eyeY * normalEye || 0.001), 1);
      }
      if (hap) hap.scale.setScalar(Math.max(0.001, S.happy));
      if (pupil) {
        const drift = talking ? Math.sin(t * 0.9) * 0.012 : 0;
        let tx = anim.pointer.current.active && !anim.reduced ? px * 0.07 : 0;
        let ty = anim.pointer.current.active && !anim.reduced ? py * 0.05 : 0;
        if (s === "thinking") { tx = 0.055; ty = 0.055; } // eyes drift up-right, classic thinking pose
        pupil.position.x = lerp(pupil.position.x, tx + drift, k);
        pupil.position.y = lerp(pupil.position.y, ty + (talking ? Math.cos(t * 1.3) * 0.008 : 0), k);
      }
    }

    // ---- brows ----
    const browIn = s === "alert" ? 0.34 : s === "error" ? 0.2 : talking ? 0.12 : 0;
    const browUp = celebrating || s === "tuning" ? 0.22 : 0;
    const browLUp = s === "thinking" ? 0.16 : 0; // one raised brow while thinking
    S.browL = lerp(S.browL, -browIn + browUp - browLUp, k * 0.5);
    S.browR = lerp(S.browR, browIn - browUp, k * 0.5);
    if (rig.face.browL) { rig.face.browL.rotation.z = S.browL; rig.face.browL.position.y = 0.68 + browUp * 0.1 + browLUp * 0.08; }
    if (rig.face.browR) { rig.face.browR.rotation.z = S.browR; rig.face.browR.position.y = 0.68 + browUp * 0.1; }

    // ---- mouth: resting smile → open oval → big rounded "O", driven by the voice level ----
    if (rig.face.mouthOpen) {
      const g = rig.face.mouthOpen;
      const wide = lerp(0.98, 0.72, o * o); // width tapers as the opening rounds
      const tall = 0.12 + Math.pow(o, 0.85) * 1.55; // height does most of the talking
      g.scale.set(wide, Math.max(0.001, tall), 1);
      g.position.y = -0.14 - o * 0.12; // jaw drops while speaking
    }
    if (rig.face.mouthSmile) {
      // the smile lingers through small openings, then hands off to the open mouth
      const handOff = 1 - smoothstep(0.06, 0.45, o);
      const smileScale = Math.max(0.001, (1 + S.happy * 0.35 + (anim.hover.current ? 0.15 : 0)) * handOff);
      rig.face.mouthSmile.scale.setScalar(smileScale);
    }
    if (rig.face.tongue) rig.face.tongue.position.y = -0.05 - o * 0.03 + Math.sin(t * 9.5) * 0.012 * o * damp;

    // ---- cheeks glow with the voice ----
    S.cheek = lerp(S.cheek, celebrating ? 0.9 : talking ? 0.5 + o * 0.4 : 0.4, k * 0.5);
    if (rig.face.cheekL) rig.face.cheekL.opacity = S.cheek;
    if (rig.face.cheekR) rig.face.cheekR.opacity = S.cheek;

    // ---- speaker grille bars ride the same energy ----
    const e = Math.max(0.07, Math.min(1, energy * 1.15));
    rig.body.grille.forEach((bar, i) => {
      if (!bar) return;
      const target = 0.5 + e * (0.55 + 0.45 * Math.sin(t * 10 + i * 1.9)) * damp + (1 - damp) * 0.1;
      bar.scale.y = lerp(bar.scale.y, target, k * 1.4);
    });

    // ---- antenna sway ----
    if (rig.body.antenna) {
      const sway =
        Math.sin(t * 2.1) * 0.045 +
        (s === "music" ? Math.sin(t * 5.4) * 0.07 * Math.max(0.3, m) : 0) +
        (s === "tuning" ? Math.sin(t * 14) * 0.09 : 0) +
        (anim.hover.current ? -0.07 : 0);
      rig.body.antenna.rotation.z = (s === "alert" ? sway * 0.3 : s === "listening" ? sway - 0.05 : sway) * damp - 0.12;
      rig.body.antenna.rotation.x = Math.sin(t * 1.7) * 0.03 * damp;
    }
    if (rig.body.antennaTip) rig.body.antennaTip.emissiveIntensity = 0.7 + Math.sin(t * 3) * 0.3 + energy * 0.6;

    // ---- knobs turn with the music ----
    const knobSpd = (s === "music" ? 1.4 : s === "talking" ? 0.3 : 0.12) * damp;
    if (rig.body.knobL) rig.body.knobL.rotation.y += dt * knobSpd;
    if (rig.body.knobR) rig.body.knobR.rotation.y -= dt * knobSpd * 0.8;

    // ---- arms: rest, gesture while talking, wave/celebrate on fx ----
    const armRest = -0.45;
    const talkGesture = talking ? Math.sin(t * 2.4) * 0.18 : 0;
    const armLTarget = celebrating ? -2.3 : armRest + (s === "talking" ? talkGesture * 0.5 : 0) + (anim.hover.current ? -0.25 : 0);
    const armRTarget = waving ? 2.1 + Math.sin(t * 16) * 0.4 : celebrating ? 2.3 : -armRest + (s === "talking" ? talkGesture : 0);
    S.armL = lerp(S.armL, armLTarget, k * 0.7);
    S.armR = lerp(S.armR, armRTarget, k * 0.9);
    if (rig.body.armL) rig.body.armL.rotation.z = S.armL * damp + armRest * (1 - damp);
    if (rig.body.armR) rig.body.armR.rotation.z = S.armR * damp + -armRest * (1 - damp);

    // ---- floating feet ----
    if (rig.body.footL) rig.body.footL.position.y = -1.18 + Math.sin(t * 1.6 + 1.2) * 0.035 * damp;
    if (rig.body.footR) rig.body.footR.position.y = -1.18 + Math.sin(t * 1.6) * 0.035 * damp;

    // ---- LED + display ----
    if (rig.body.ledMat) {
      rig.body.ledMat.emissive.set(LED_COLORS[s] ?? "#46c8ff");
      rig.body.ledMat.color.set(LED_COLORS[s] ?? "#46c8ff");
      rig.body.ledMat.emissiveIntensity = s === "muted" ? 0.35 : 0.9 + Math.sin(t * (talking ? 8 : 2.4)) * 0.35 + energy * 0.5;
    }
    if (rig.body.displayMat) {
      const want = s === "idle" ? displayTex.idle : displayTex.on;
      if (rig.body.displayMat.map !== want) { rig.body.displayMat.map = want; rig.body.displayMat.needsUpdate = true; }
    }

    // ---- ambient bubbles ----
    rig.bubbles.forEach((b, i) => {
      const base = rig.bubbleBase[i];
      if (!b || !base) return;
      b.position.y = base.y + Math.sin(t * 0.9 + base.ph) * 0.16 * damp + (celebrating ? Math.sin(Math.PI * Math.min(1, fp)) * 0.5 : 0);
      b.position.x = base.x + Math.sin(t * 0.6 + base.ph * 2) * 0.08;
      const bs = base.s * (1 + Math.sin(t * 1.4 + base.ph) * 0.12 + (celebrating ? 0.4 : 0));
      b.scale.setScalar(Math.max(0.001, bs));
    });

    // ---- music notes float up while music plays ----
    rig.notes.forEach((n, i) => {
      if (!n) return;
      const ph = i / rig.notes.length;
      const p = (t * 0.22 + ph) % 1;
      const on = s === "music" && !anim.reduced;
      const mat = n.material as THREE.SpriteMaterial;
      mat.opacity = lerp(mat.opacity, on ? Math.sin(p * Math.PI) * 0.9 : 0, k * 0.4);
      n.position.set(-1.3 + ph * 2.6 + Math.sin(t * 1.1 + i * 2) * 0.14, -0.6 + p * 2.4, -0.3 - ph * 0.4);
      const sc = 0.32 + Math.sin(t + i) * 0.03;
      n.scale.set(sc, sc, 1);
    });

    // ---- soft halo ----
    if (rig.glow) {
      const gm = rig.glow.material as THREE.SpriteMaterial;
      gm.opacity = 0.5 + Math.sin(t * 1.1) * 0.08 + energy * 0.15;
      const gs = 4.4 + Math.sin(t * 1.2) * 0.15;
      rig.glow.scale.set(gs, gs * 0.9, 1);
    }
  });
}
