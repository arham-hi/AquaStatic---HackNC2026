import { RadioPage } from "@/components/radio/radio-page";
import { SharedTally } from "@/components/feed/shared-tally";

export const metadata = { title: "Radio" };

export default function Radio() {
  return (<><div className="mx-auto max-w-6xl px-4 sm:px-6 pt-6 -mb-2"><SharedTally /></div><RadioPage /></>);
}
