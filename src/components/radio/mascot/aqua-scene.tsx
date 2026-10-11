"use client";
// The WebGL stage for Aqua. Procedurally generated environment lighting (no network HDRIs),
// capped pixel ratio, and a frameloop that sleeps while the tab is hidden.

import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { AquaModel } from "./aqua-model";
import type { AquaAnim } from "./aqua-expressions";

function useVisible() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const fn = () => setVisible(document.visibilityState === "visible");
    fn();
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, []);
  return visible;
}

export default function AquaScene({ anim }: { anim: AquaAnim }) {
  const visible = useVisible();
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 7.0], fov: 35 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      frameloop={visible ? "always" : "never"}
      style={{ background: "transparent" }}
      aria-hidden
    >
      <hemisphereLight args={["#cfeaff", "#d8f3cf", 0.75]} />
      <directionalLight position={[3.5, 5.5, 4]} intensity={1.5} color="#fff7ea" />
      <directionalLight position={[-4, 2.5, -3]} intensity={0.5} color="#8fd4ff" />
      <pointLight position={[0, 0.6, 3]} intensity={0.35} color="#bff0ff" />

      {/* generated environment for glossy clearcoat highlights — no external HDR download */}
      <Environment resolution={128} frames={1}>
        <Lightformer intensity={2.4} position={[0, 5, 2]} scale={[9, 4, 1]} color="#ffffff" />
        <Lightformer intensity={1.2} position={[-5, 1, 1]} rotation={[0, Math.PI / 2, 0]} scale={[7, 3, 1]} color="#bfe9ff" />
        <Lightformer intensity={0.9} position={[5, 1, 1]} rotation={[0, -Math.PI / 2, 0]} scale={[7, 3, 1]} color="#d2f7e8" />
      </Environment>

      {/* the camera looks at the origin — drop the whole rig so Aqua's midline sits there */}
      <group position={[0, -1.9, 0]}>
        <AquaModel anim={anim} />
        <ContactShadows position={[0, -0.02, 0]} opacity={0.38} scale={7} blur={2.6} far={2.4} color="#1d6f9e" />
      </group>
    </Canvas>
  );
}
