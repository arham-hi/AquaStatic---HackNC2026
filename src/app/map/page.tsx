import type { Metadata } from "next";
import { Suspense } from "react";
import { HomeMap } from "@/components/map/home-map";

export const metadata: Metadata = { title: "Live Map" };

export default function MapPage() {
  return (
    <Suspense fallback={<div className="h-dvh grid place-items-center text-fg-muted text-sm">Loading Chapel Hill…</div>}>
      <HomeMap />
    </Suspense>
  );
}
