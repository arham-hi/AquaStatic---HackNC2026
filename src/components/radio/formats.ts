import { Zap, Radio, Mic, Newspaper, Mail, type LucideIcon } from "lucide-react";
import type { Briefing, BriefingFormat } from "@/lib/db/schema";
import type { GenerateBriefingInput } from "@/lib/services/briefings";

// Mirror of INTERESTS/INTEREST_LABELS in lib/services/briefings (that module pulls in better-sqlite3, so it can't be
// imported by value from a client bundle). `satisfies` keeps the two lists in lockstep at compile time.
export type Interest = GenerateBriefingInput["interests"][number];
export const INTEREST_LABELS = {
  academics: "Academics", social: "Social events", free_food: "Free food", sports: "Sports", career: "Career events",
  community: "Community needs", transit: "Transit", news: "Local news", culture: "Campus culture",
} satisfies Record<Interest, string>;
export const INTERESTS = Object.keys(INTEREST_LABELS) as Interest[];

/** Briefing as it arrives over JSON (Date → ISO string). */
export type ClientBriefing = Omit<Briefing, "createdAt"> & { createdAt: string };

export const FORMATS: Record<BriefingFormat, { label: string; blurb: string; icon: LucideIcon; text: boolean; topic?: boolean }> = {
  flash: { label: "Campus Flash", blurb: "30–60 sec headlines", icon: Zap, text: false },
  radio: { label: "Campus Radio", blurb: "2–3 min show", icon: Radio, text: false },
  podcast: { label: "Podcast Deep Dive", blurb: "3–5 min on one topic", icon: Mic, text: false, topic: true },
  digest: { label: "Text Digest", blurb: "Skimmable sections", icon: Newspaper, text: true },
  letter: { label: "Carolina Letter", blurb: "A note from campus", icon: Mail, text: true },
  station: { label: "Station segment", blurb: "Live on Aqua FM", icon: Radio, text: false },
};

export const WPM = 150;
export const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function fmtClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function briefingAsText(b: ClientBriefing): string {
  const body = b.segments.length ? b.segments.map((s) => `${s.title}\n${"-".repeat(s.title.length)}\n${s.text}`).join("\n\n") : b.script;
  const sources = b.sources.length ? `\n\nSources\n-------\n${b.sources.map((s) => `- ${s.title}${s.href ? ` — ${s.href}` : ""}`).join("\n")}` : "";
  return `${b.title}\n${new Date(b.createdAt).toLocaleString()}\n\n${body}${sources}\n`;
}
