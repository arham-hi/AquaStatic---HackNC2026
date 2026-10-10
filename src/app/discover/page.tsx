import { Suspense } from "react";
import { DiscoverPage } from "@/components/feed/discover-page";

export const metadata = { title: "Discover" };

export default function Discover() {
  return <Suspense fallback={null}><DiscoverPage /></Suspense>;
}
