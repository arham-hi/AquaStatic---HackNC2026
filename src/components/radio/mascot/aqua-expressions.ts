// Shared types, constants and procedural texture helpers for Aqua the radio host.
// Everything here is generated — no downloaded fonts, images or model files.

import * as THREE from "three";
import type { MutableRefObject } from "react";
import type { MascotState, MascotFx, StationLevels } from "../use-station";

export type { MascotState, MascotFx };

export const CLICK_PHRASES = [
  "Hey there!",
  "You're tuned into Aqua FM!",
  "Something's always happening on campus!",
  "Stay bubbly, Carolina!",
  "Aqua FM — live from the Pit!",
];

/** Mutable inputs the render loop reads each frame. React never re-renders for these. */
export type AquaAnim = {
  state: MascotState;
  levels: MutableRefObject<StationLevels>;
  fx: MutableRefObject<MascotFx>;
  pointer: MutableRefObject<{ x: number; y: number; active: boolean }>; // normalized -1..1 around the character
  hover: MutableRefObject<boolean>;
  reduced: boolean;
};

const tex = (text: string, fg: string, bg: string): THREE.CanvasTexture => {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 160;
  const g = c.getContext("2d")!;
  const r = 46;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(4, 4, 504, 152, r);
  g.fill();
  g.fillStyle = fg;
  g.font = "700 84px ui-rounded, 'SF Pro Rounded', system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 256, 86);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

/** "AQUA FM" (idle) and "ON AIR" (tuned in) faces for the tiny front display. */
export function makeDisplayTextures() {
  const on = tex("● ON AIR", "#ffd9d9", "#7d1f2d");
  const idle = tex("AQUA FM", "#bff0ff", "#0d3a5c");
  return { on, idle };
}

/** Soft radial glow used as the character's ambient halo. */
export function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grad.addColorStop(0, "rgba(160,225,255,0.85)");
  grad.addColorStop(0.45, "rgba(140,215,250,0.32)");
  grad.addColorStop(1, "rgba(140,215,250,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Floating music-note sprites ("♪"/"♫") for the music state. */
export function makeNoteTexture(double = false): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.font = "700 92px ui-rounded, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#2f9fd8";
  g.fillText(double ? "♫" : "♪", 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
