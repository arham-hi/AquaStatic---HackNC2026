import { Suspense } from "react";
import { HomeMap } from "@/components/map/home-map";

export default function Home() {
  return (
    <Suspense fallback={<div className="h-dvh grid place-items-center text-fg-muted text-sm">Loading Chapel Hill…</div>}>
      <HomeMap />
    </Suspense>
  );
}
