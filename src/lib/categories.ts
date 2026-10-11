// Visual identity per category/type. Shared by map markers, feed cards, badges and legends. Client-safe.
import {
  Plug, GraduationCap, BookOpen, Search, Pizza, Car, CalendarDays, Newspaper, Siren, Bus, Sparkles, HandHelping, Gift, Armchair, type LucideIcon,
} from "lucide-react";
import type { PostCategory } from "@/lib/db/schema";

export type CategoryMeta = { id: PostCategory; label: string; color: string; icon: LucideIcon; blurb: string; green?: string };

export const CATEGORIES: Record<PostCategory, CategoryMeta> = {
  borrowing: { id: "borrowing", label: "Borrow & lend", color: "#4b9cd3", icon: Plug, blurb: "Chargers, calculators, umbrellas", green: "Reuse: borrowed, not bought" },
  giveaway: { id: "giveaway", label: "Giveaway", color: "#16a34a", icon: Armchair, blurb: "Furniture, fridges, anything you'd otherwise toss", green: "Rehomed: not landfilled" },
  tutoring: { id: "tutoring", label: "Tutoring", color: "#8b5cf6", icon: GraduationCap, blurb: "Help with a class" },
  study: { id: "study", label: "Study groups", color: "#6366f1", icon: BookOpen, blurb: "Study together" },
  lost_found: { id: "lost_found", label: "Lost & found", color: "#f0a21b", icon: Search, blurb: "Lost or found items", green: "Reuse: returned, not replaced" },
  free_food: { id: "free_food", label: "Free food", color: "#2fbf8f", icon: Pizza, blurb: "Giveaways and leftovers", green: "Less waste: eaten, not binned" },
  ride: { id: "ride", label: "Rides", color: "#14b8a6", icon: Car, blurb: "Carpools and lifts", green: "Shared ride" },
  event: { id: "event", label: "Events", color: "#0ea5e9", icon: CalendarDays, blurb: "Campus happenings" },
  news: { id: "news", label: "News", color: "#64748b", icon: Newspaper, blurb: "Campus and local news" },
  alert: { id: "alert", label: "Alerts", color: "#e5484d", icon: Siren, blurb: "Safety and disruptions" },
  transit: { id: "transit", label: "Transit", color: "#f97316", icon: Bus, blurb: "Buses and roads" },
  other: { id: "other", label: "Other", color: "#94a3b8", icon: Sparkles, blurb: "Everything else" },
};

export const TYPE_META: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  request: { label: "Request", icon: HandHelping, tone: "bg-carolina-soft text-carolina" },
  offer: { label: "Offer", icon: Gift, tone: "bg-mint-soft text-mint" },
  event: { label: "Event", icon: CalendarDays, tone: "bg-[rgba(14,165,233,0.14)] text-[#0ea5e9]" },
  news: { label: "News", icon: Newspaper, tone: "bg-[rgba(100,116,139,0.14)] text-fg-muted" },
  alert: { label: "Alert", icon: Siren, tone: "bg-red-soft text-red" },
  notice: { label: "Notice", icon: Bus, tone: "bg-amber-soft text-amber" },
};

export const TRUST_META = {
  official: { label: "Official source", tone: "bg-mint-soft text-mint" },
  community: { label: "Community report", tone: "bg-carolina-soft text-carolina" },
  demo: { label: "DEMO", tone: "bg-amber-soft text-amber" },
} as const;

export const categoryMeta = (c: string) => CATEGORIES[c as PostCategory] ?? CATEGORIES.other;

/** Categories where a completed exchange kept something useful in circulation or shared a real resource. */
export const REUSE_CATEGORIES = ["borrowing", "giveaway", "lost_found", "ride", "free_food"] as const;
