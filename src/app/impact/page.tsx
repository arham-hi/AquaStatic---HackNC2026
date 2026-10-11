import { Suspense } from "react";
import { ImpactPage } from "@/components/impact/impact-page";

export const metadata = { title: "AquaImpact" };

export default function Impact() {
  return <Suspense fallback={null}><ImpactPage /></Suspense>;
}
