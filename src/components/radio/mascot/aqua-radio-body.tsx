"use client";
// Aqua's body: the glossy radio shell, face plate, speaker grille, top knobs, antenna, display and LED.
// All geometry is procedural — rounded boxes, spheres, cylinders, toruses.

import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";

export type BodyRig = {
  knobL: THREE.Group | null;
  knobR: THREE.Group | null;
  antenna: THREE.Group | null;
  antennaTip: THREE.MeshStandardMaterial | null;
  grille: (THREE.Mesh | null)[];
  ledMat: THREE.MeshStandardMaterial | null;
  displayMat: THREE.MeshBasicMaterial | null;
  displayFrame: THREE.Mesh | null;
  armL: THREE.Group | null;
  armR: THREE.Group | null;
  footL: THREE.Mesh | null;
  footR: THREE.Mesh | null;
};

const SHELL = "#34b6e6";
const PLATE = "#c8ecfc";
const DARK = "#0e3a55";

export function AquaRadioBody({ rig, tex }: { rig: BodyRig; tex: { on: THREE.Texture; idle: THREE.Texture } }) {
  return (
    <group>
      {/* shell */}
      <RoundedBox args={[2.6, 1.9, 1.3]} radius={0.3} smoothness={10} castShadow>
        <meshPhysicalMaterial color={SHELL} roughness={0.28} clearcoat={1} clearcoatRoughness={0.22} />
      </RoundedBox>

      {/* glossy front face plate */}
      <RoundedBox args={[2.28, 1.56, 0.22]} radius={0.12} smoothness={6} position={[0, 0.02, 0.57]}>
        <meshPhysicalMaterial color={PLATE} roughness={0.18} clearcoat={1} clearcoatRoughness={0.1} transparent opacity={0.96} />
      </RoundedBox>

      {/* speaker grille: inset panel + animated bars */}
      <RoundedBox args={[1.6, 0.44, 0.1]} radius={0.1} smoothness={5} position={[0, -0.6, 0.68]}>
        <meshStandardMaterial color={DARK} roughness={0.55} />
      </RoundedBox>
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[-0.56 + i * 0.14, -0.6, 0.74]} ref={(o) => { rig.grille[i] = o; }}>
          <capsuleGeometry args={[0.038, 0.2, 6, 10]} />
          <meshStandardMaterial color="#9ee2fb" emissive="#2f9fd8" emissiveIntensity={0.25} roughness={0.35} />
        </mesh>
      ))}

      {/* two top knobs — they slowly turn while music plays */}
      {[-0.72, 0.72].map((x, i) => (
        <group key={x} position={[x, 0.97, -0.12]} ref={(o) => { rig[i === 0 ? "knobL" : "knobR"] = o; }}>
          <mesh castShadow>
            <cylinderGeometry args={[0.17, 0.19, 0.13, 24]} />
            <meshPhysicalMaterial color="#e8f7ff" roughness={0.3} clearcoat={1} clearcoatRoughness={0.15} />
          </mesh>
          <mesh position={[0.1, 0.075, 0]}>
            <boxGeometry args={[0.12, 0.02, 0.045]} />
            <meshStandardMaterial color="#0e3a55" roughness={0.4} />
          </mesh>
        </group>
      ))}

      {/* antenna: pivot at the base so animation can sway the whole rod */}
      <group position={[0.9, 0.88, -0.2]} ref={(o) => { rig.antenna = o; }}>
        <mesh position={[0, 0.06, 0]}>
          <sphereGeometry args={[0.09, 16, 12]} />
          <meshPhysicalMaterial color="#1899d3" roughness={0.3} clearcoat={1} />
        </mesh>
        <mesh position={[0, 0.55, 0]} rotation={[0.14, 0, 0.1]}>
          <cylinderGeometry args={[0.024, 0.034, 1.05, 10]} />
          <meshStandardMaterial color="#d9edf7" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0.06, 1.08, -0.08]}>
          <sphereGeometry args={[0.085, 16, 12]} />
          <meshStandardMaterial color="#7fdcff" emissive="#35c0f0" emissiveIntensity={0.9} ref={(o) => { rig.antennaTip = o; }} />
        </mesh>
      </group>

      {/* front display: frame + swap-able AQUA FM / ON AIR face */}
      <mesh position={[0, 0.68, 0.685]} ref={(o) => { rig.displayFrame = o; }}>
        <boxGeometry args={[1.16, 0.42, 0.05]} />
        <meshStandardMaterial color={DARK} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.68, 0.715]}>
        <planeGeometry args={[1.04, 0.33]} />
        <meshBasicMaterial map={tex.idle} toneMapped={false} ref={(o) => { rig.displayMat = o; }} />
      </mesh>

      {/* status LED */}
      <mesh position={[-0.95, 0.68, 0.72]}>
        <sphereGeometry args={[0.055, 14, 10]} />
        <meshStandardMaterial color="#46c8ff" emissive="#46c8ff" emissiveIntensity={1} ref={(o) => { rig.ledMat = o; }} />
      </mesh>

      {/* little arms — pivot at the shoulder */}
      {[1, -1].map((side) => (
        <group key={side} position={[side * 1.34, -0.05, 0]} ref={(o) => { rig[side === 1 ? "armR" : "armL"] = o; }}>
          <mesh position={[side * 0.05, -0.22, 0]} rotation={[0, 0, side * 0.35]} castShadow>
            <capsuleGeometry args={[0.105, 0.3, 6, 12]} />
            <meshPhysicalMaterial color="#2aa9dd" roughness={0.3} clearcoat={1} clearcoatRoughness={0.2} />
          </mesh>
          <mesh position={[side * 0.14, -0.42, 0.02]}>
            <sphereGeometry args={[0.115, 14, 10]} />
            <meshPhysicalMaterial color="#c8ecfc" roughness={0.25} clearcoat={1} />
          </mesh>
        </group>
      ))}

      {/* floating feet */}
      {[1, -1].map((side) => (
        <mesh key={side} position={[side * 0.58, -1.18, 0.05]} scale={[1, 0.55, 0.85]} ref={(o) => { rig[side === 1 ? "footR" : "footL"] = o; }}>
          <sphereGeometry args={[0.24, 18, 12]} />
          <meshPhysicalMaterial color="#1f9fd6" roughness={0.32} clearcoat={1} />
        </mesh>
      ))}
    </group>
  );
}
