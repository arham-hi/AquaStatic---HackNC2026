"use client";
// Assembles Aqua's meshes and runs the per-frame animation against them.

import { useMemo } from "react";
import { AquaRadioBody } from "./aqua-radio-body";
import { AquaFace } from "./aqua-face";
import { makeRig, useAquaAnimation } from "./use-aqua-animation";
import { makeDisplayTextures, makeGlowTexture, makeNoteTexture, type AquaAnim } from "./aqua-expressions";

export function AquaModel({ anim }: { anim: AquaAnim }) {
  const rig = useMemo(makeRig, []);
  const displayTex = useMemo(makeDisplayTextures, []);
  const glowTex = useMemo(makeGlowTexture, []);
  const noteTex = useMemo(() => [makeNoteTexture(false), makeNoteTexture(true), makeNoteTexture(false)], []);
  useAquaAnimation(rig, anim, displayTex);

  return (
    <group>
      {/* ambient halo behind the character */}
      <sprite ref={(o) => { rig.glow = o; }} position={[0, 1.35, -1.6]} scale={[4.4, 4, 1]}>
        <spriteMaterial map={glowTex} transparent depthWrite={false} opacity={0.5} />
      </sprite>

      <group ref={(o) => { rig.root = o; }} position={[0, 1.32, 0]}>
        {/* inner group: squash & stretch + pointer tilt */}
        <group ref={(o) => { rig.inner = o; rig.head = o; }}>
          <AquaRadioBody rig={rig.body} tex={displayTex} />
          <AquaFace rig={rig.face} />
        </group>

        {/* little bubble halo */}
        {rig.bubbleBase.map((b, i) => (
          <mesh key={i} position={[b.x, b.y, b.z]} scale={b.s} ref={(o) => { rig.bubbles[i] = o; }}>
            <sphereGeometry args={[1, 18, 14]} />
            <meshPhysicalMaterial color="#bfeaff" transparent opacity={0.4} roughness={0.05} clearcoat={1} />
          </mesh>
        ))}

        {/* floating music notes */}
        {noteTex.map((t, i) => (
          <sprite key={i} ref={(o) => { rig.notes[i] = o; }} scale={0.32}>
            <spriteMaterial map={t} transparent opacity={0} depthWrite={false} />
          </sprite>
        ))}
      </group>
    </group>
  );
}
