import { Suspense } from "react";
import { ConnectPage } from "@/components/connect/connect-page";

export const metadata = { title: "Connect" };

export default function Connect() {
  return <Suspense fallback={null}><ConnectPage /></Suspense>;
}
