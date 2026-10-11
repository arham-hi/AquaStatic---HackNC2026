// Soft radial blob texture used for cheap fake contact shadows under 3D map props
// (walkers, buses). Much gentler than real shadow maps and basically free to render.
import * as THREE from "three";

let texture: THREE.CanvasTexture | null = null;

export function softShadowTexture() {
  if (texture) return texture;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, "rgba(32, 60, 84, 0.34)");
  grad.addColorStop(0.55, "rgba(32, 60, 84, 0.15)");
  grad.addColorStop(1, "rgba(32, 60, 84, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
