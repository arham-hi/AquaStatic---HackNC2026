"use client";
// Aqua's face: big blinking eyes that track the cursor, happy crescents, expressive brows,
// a smile that morphs into an open speaking mouth, and blush cheeks.

import * as THREE from "three";

export type FaceRig = {
  eyeL: THREE.Group | null;
  eyeR: THREE.Group | null;
  pupilL: THREE.Group | null;
  pupilR: THREE.Group | null;
  happyL: THREE.Group | null;
  happyR: THREE.Group | null;
  browL: THREE.Group | null;
  browR: THREE.Group | null;
  mouthSmile: THREE.Group | null;
  mouthOpen: THREE.Group | null;
  tongue: THREE.Mesh | null;
  cheekL: THREE.MeshStandardMaterial | null;
  cheekR: THREE.MeshStandardMaterial | null;
};

const EYE_X = 0.52, EYE_Y = 0.26, EYE_Z = 0.71;

function Eye({ side, rig }: { side: 1 | -1; rig: FaceRig }) {
  return (
    <group position={[side * EYE_X, EYE_Y, EYE_Z]} ref={(o) => { rig[side === 1 ? "eyeR" : "eyeL"] = o; }}>
      {/* white */}
      <mesh scale={[1, 1, 0.55]}>
        <sphereGeometry args={[0.3, 24, 18]} />
        <meshStandardMaterial color="#ffffff" roughness={0.12} />
      </mesh>
      {/* iris + pupil — this group slides to follow the cursor */}
      <group ref={(o) => { rig[side === 1 ? "pupilR" : "pupilL"] = o; }}>
        <mesh position={[0, 0, 0.14]} scale={[1, 1, 0.5]}>
          <sphereGeometry args={[0.165, 20, 14]} />
          <meshStandardMaterial color="#1170aa" roughness={0.2} />
        </mesh>
        <mesh position={[0, 0, 0.2]} scale={[1, 1, 0.4]}>
          <sphereGeometry args={[0.09, 16, 12]} />
          <meshStandardMaterial color="#081c2c" roughness={0.1} />
        </mesh>
        {/* sparkle */}
        <mesh position={[0.055, 0.06, 0.235]}>
          <sphereGeometry args={[0.032, 10, 8]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
        <mesh position={[-0.045, -0.05, 0.235]}>
          <sphereGeometry args={[0.016, 8, 6]} />
          <meshBasicMaterial color="#bfeaff" toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

export function AquaFace({ rig }: { rig: FaceRig }) {
  return (
    <group>
      <Eye side={-1} rig={rig} />
      <Eye side={1} rig={rig} />

      {/* happy crescents (∩ eyes) — scale in for celebration */}
      {[1, -1].map((side) => (
        <group key={side} position={[side * EYE_X, EYE_Y + 0.02, EYE_Z + 0.1]} scale={0.001}
          ref={(o) => { rig[side === 1 ? "happyR" : "happyL"] = o; }}>
          <mesh>
            <torusGeometry args={[0.19, 0.05, 10, 24, Math.PI]} />
            <meshStandardMaterial color="#0a2c42" roughness={0.4} />
          </mesh>
        </group>
      ))}

      {/* brows */}
      {[1, -1].map((side) => (
        <group key={side} position={[side * EYE_X, EYE_Y + 0.42, EYE_Z + 0.05]} ref={(o) => { rig[side === 1 ? "browR" : "browL"] = o; }}>
          <mesh>
            <capsuleGeometry args={[0.045, 0.22, 6, 10]} />
            <meshStandardMaterial color="#0f5f92" roughness={0.35} />
          </mesh>
        </group>
      ))}

      {/* cheeks */}
      {[1, -1].map((side) => (
        <mesh key={side} position={[side * 0.82, -0.06, 0.66]} scale={[1, 0.62, 0.5]}>
          <sphereGeometry args={[0.15, 14, 10]} />
          <meshStandardMaterial color="#ff9fb7" emissive="#ff6f96" emissiveIntensity={0.35} transparent opacity={0.4}
            ref={(o) => { rig[side === 1 ? "cheekR" : "cheekL"] = o; }} />
        </mesh>
      ))}

      {/* resting smile — a ∪ arc that shrinks as the open mouth grows */}
      <group position={[0, -0.1, 0.71]} rotation={[0, 0, Math.PI]} ref={(o) => { rig.mouthSmile = o; }}>
        <mesh>
          <torusGeometry args={[0.15, 0.042, 10, 24, Math.PI]} />
          <meshStandardMaterial color="#0a2c42" roughness={0.4} />
        </mesh>
      </group>

      {/* open speaking mouth — scale.y is driven by voice amplitude */}
      <group position={[0, -0.16, 0.7]} ref={(o) => { rig.mouthOpen = o; }}>
        <mesh scale={[1, 0.15, 1]}>
          <sphereGeometry args={[0.21, 20, 14]} />
          <meshStandardMaterial color="#5b2340" roughness={0.5} />
        </mesh>
        <mesh position={[0, -0.05, 0.05]} scale={[1, 0.5, 0.6]} ref={(o) => { rig.tongue = o; }}>
          <sphereGeometry args={[0.12, 14, 10]} />
          <meshStandardMaterial color="#ff7d9c" roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}
