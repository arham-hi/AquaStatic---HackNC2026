"use client";
// Create post: natural language by default → AI/local interpretation preview → edit → publish. Manual form as a tab.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Wand2, AlertTriangle, ArrowLeft, Send, Clock, Flame } from "lucide-react";
import { api } from "@/lib/client";
import { useSession, useUI } from "@/components/shell/providers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, Textarea, Input, Select, Label, Badge, Tabs, TabsList, TabsTrigger, TabsContent, Chip } from "@/components/ui/primitives";
import { LocationPicker } from "./location-picker";
import { CATEGORIES, TYPE_META } from "@/lib/categories";
import { getLocation } from "@/lib/locations";
import { POST_CATEGORIES, type PostCategory, type Post, type Match } from "@/lib/db/schema";
import type { ParseResult } from "@/lib/ai/types";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "Need a USB-C laptop charger at Davis Library for the next hour",
  "I have an extra graphing calculator at the Union until 4",
  "Found a black water bottle outside Sitterson Hall",
  "Free bagels in the Pit from the Chemistry Club",
  "Can someone help me with Physics 118 tonight at the UL?",
];

type Draft = {
  type: "request" | "offer" | "event" | "alert" | "notice" | "news";
  category: PostCategory; title: string; summary: string; locationId: string | null; locationNote: string;
  urgency: "low" | "soon" | "urgent"; expiry: "30m" | "1h" | "3h" | "today" | "custom"; customExpiry: string;
  keywords: string[]; item: string; subject: string; powerClass: "laptop" | "phone" | "cable" | null; lostOrFound: "lost" | "found" | null; durationMinutes: number | null; destination: string;
};

function toDraft(p: ParseResult): Draft {
  const expiry: Draft["expiry"] = p.durationMinutes == null ? (p.category === "lost_found" ? "today" : "1h") : p.durationMinutes <= 30 ? "30m" : p.durationMinutes <= 75 ? "1h" : p.durationMinutes <= 200 ? "3h" : "today";
  return { type: p.type, category: p.category, title: p.title, summary: p.summary, locationId: p.locationId, locationNote: p.locationNote ?? "", urgency: p.urgency, expiry, customExpiry: "", keywords: p.keywords, item: p.item ?? "", subject: p.subject ?? "", powerClass: p.powerClass, lostOrFound: p.lostOrFound, durationMinutes: p.durationMinutes, destination: p.destination ?? "" };
}
const blankDraft = (): Draft => ({ type: "request", category: "borrowing", title: "", summary: "", locationId: null, locationNote: "", urgency: "low", expiry: "1h", customExpiry: "", keywords: [], item: "", subject: "", powerClass: null, lostOrFound: null, durationMinutes: null, destination: "" });

export function CreatePostDialog() {
  const { createState, setCreateOpen, focusMap } = useUI();
  const { ensureUser, user } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<"nl" | "manual">("nl");
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [ex, setEx] = useState(0);

  useEffect(() => {
    if (createState.open) {
      setMode("nl"); setParsed(null); setDraft(null); setText(createState.prefill ?? "");
      setEx(Math.floor(Math.random() * EXAMPLES.length));
    }
  }, [createState.open, createState.prefill]);

  const interpret = async () => {
    if (text.trim().length < 3) return;
    setParsing(true);
    try {
      const r = await api.post<{ parsed: ParseResult }>("/api/posts/parse", { text: text.trim() });
      setParsed(r.parsed);
      setDraft(toDraft(r.parsed));
    } catch (e) { toast.error((e as Error).message); } finally { setParsing(false); }
  };

  const needsLocation = useMemo(() => !!draft && ["borrowing", "tutoring", "study", "lost_found", "free_food"].includes(draft.category) && !draft.locationId, [draft]);
  const needsDestination = !!draft && draft.category === "ride" && !draft.destination.trim();
  const canPublish = !!draft && draft.title.trim().length >= 3 && !needsLocation && !needsDestination && (draft.expiry !== "custom" || !!draft.customExpiry) && (mode === "nl" ? text.trim().length >= 3 : draft.summary.trim().length >= 3);

  const publish = async () => {
    if (!draft || !canPublish) return;
    setPublishing(true);
    try {
      await ensureUser();
      const body = {
        description: mode === "nl" ? text.trim() : draft.summary.trim(), type: draft.type, category: draft.category, title: draft.title.trim(), summary: draft.summary.trim() || undefined,
        locationId: draft.locationId, locationNote: draft.locationNote.trim() || null, urgency: draft.urgency, expiry: draft.expiry,
        expiresAt: draft.expiry === "custom" ? new Date(draft.customExpiry).getTime() : undefined, keywords: draft.keywords.slice(0, 12),
        attributes: { item: draft.item || null, subject: draft.subject || null, powerClass: draft.powerClass, durationMinutes: draft.durationMinutes, destination: draft.destination || null, lostOrFound: draft.lostOrFound },
        isDemo: !!user?.isDemo,
      };
      const r = await api.post<{ post: Post; matches: Match[] }>("/api/posts", body);
      setCreateOpen(false);
      const loc = getLocation(r.post.locationId);
      toast.success(`Posted: ${r.post.title}`, { description: r.matches.length ? `We found ${r.matches.length} possible match${r.matches.length > 1 ? "es" : ""}. Check Connect.` : loc ? `Now live on the map at ${loc.name}.` : "Now live in the feed.", action: r.matches.length ? { label: "View match", onClick: () => router.push(`/connect?match=${r.matches[0].id}`) } : undefined });
      if (loc) focusMap({ lat: loc.lat, lng: loc.lng, label: loc.name, itemId: `post:${r.post.id}` });
    } catch (e) { toast.error((e as Error).message); } finally { setPublishing(false); }
  };

  const D = draft;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <Dialog open={createState.open} onOpenChange={setCreateOpen}>
      <DialogContent title={D ? "Review your post" : "What's happening?"} description={D ? "We structured your message. Fix anything that's off, then publish." : "Describe it like you'd text a friend. We'll place it on the map."} className="max-w-xl">
        {!D ? (
          <Tabs value={mode} onValueChange={(v) => { setMode(v as "nl" | "manual"); if (v === "manual") setDraft(blankDraft()); }}>
            <TabsList className="mb-3"><TabsTrigger value="nl"><Sparkles className="size-3.5" /> Natural language</TabsTrigger><TabsTrigger value="manual">Manual form</TabsTrigger></TabsList>
            <TabsContent value="nl" className="space-y-3">
              <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={4} placeholder={`e.g. "${EXAMPLES[ex]}"`} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void interpret(); }} />
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.slice(0, 3).map((s) => <Chip key={s} onClick={() => setText(s)}>{s.length > 46 ? s.slice(0, 44) + "…" : s}</Chip>)}
              </div>
              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-xs text-fg-faint">{text.length}/500 · ⌘↵ to interpret</span>
                <Button onClick={interpret} loading={parsing} disabled={text.trim().length < 3}><Wand2 /> Interpret</Button>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-4">
            {parsed && (
              <div className="rounded-xl border border-border bg-fg/[0.03] px-3 py-2 text-xs text-fg-muted flex items-start gap-2">
                <Sparkles className="size-3.5 text-carolina mt-0.5 shrink-0" />
                <span>Interpreted by <b className="text-fg">{parsed.provider === "gemini" ? "Gemini" : "local parser"}</b> · confidence {Math.round(parsed.confidence * 100)}%{parsed.missing.length ? ` · please confirm: ${parsed.missing.join(", ")}` : ""}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1 space-y-1.5">
                <Label>Type</Label>
                <div className="flex gap-1.5 flex-wrap">
                  {(["request", "offer", "event", "alert", "notice"] as const).map((t) => <Chip key={t} active={D.type === t} onClick={() => set("type", t)}>{TYPE_META[t].label}</Chip>)}
                </div>
              </div>
              <div className="col-span-2 sm:col-span-1 space-y-1.5">
                <Label htmlFor="cat">Category</Label>
                <Select id="cat" value={D.category} onChange={(e) => set("category", e.target.value as PostCategory)}>
                  {POST_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORIES[c].label}</option>)}
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="title">Title</Label>
                <Input id="title" value={D.title} onChange={(e) => set("title", e.target.value)} maxLength={80} />
              </div>
              {mode === "manual" && (
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="desc">Details</Label>
                  <Textarea id="desc" value={D.summary} onChange={(e) => set("summary", e.target.value)} maxLength={500} rows={3} placeholder="What, where, until when?" />
                </div>
              )}
              <div className="col-span-2 space-y-1.5">
                <Label>Location {needsLocation && <span className="text-amber normal-case font-medium">· pick a campus place so people can find you</span>}</Label>
                <LocationPicker value={D.locationId} onChange={(id) => set("locationId", id)} />
              </div>
              <div className="col-span-2 sm:col-span-1 space-y-1.5">
                <Label htmlFor="note">Where exactly (optional)</Label>
                <Input id="note" value={D.locationNote} onChange={(e) => set("locationNote", e.target.value)} placeholder="3rd floor, by the windows" maxLength={80} />
              </div>
              {(D.category === "borrowing" || D.category === "giveaway" || D.category === "lost_found" || D.category === "free_food") && (
                <div className="col-span-2 sm:col-span-1 space-y-1.5">
                  <Label htmlFor="item">Item</Label>
                  <Input id="item" value={D.item} onChange={(e) => set("item", e.target.value)} placeholder="USB-C laptop charger" maxLength={60} />
                </div>
              )}
              {D.category === "ride" && (
                <div className="col-span-2 sm:col-span-1 space-y-1.5">
                  <Label htmlFor="dest">Going to</Label>
                  <Input id="dest" value={D.destination} onChange={(e) => set("destination", e.target.value)} placeholder="RDU Airport, Harris Teeter…" maxLength={60} />
                </div>
              )}
              {(D.category === "tutoring" || D.category === "study") && (
                <div className="col-span-2 sm:col-span-1 space-y-1.5">
                  <Label htmlFor="subj">Subject</Label>
                  <Input id="subj" value={D.subject} onChange={(e) => set("subject", e.target.value)} placeholder="Calculus II" maxLength={60} />
                </div>
              )}
              <div className="col-span-2 space-y-1.5">
                <Label><Clock className="inline size-3 mr-1" />Expires</Label>
                <div className="flex gap-1.5 flex-wrap">
                  {([["30m", "30 min"], ["1h", "1 hour"], ["3h", "3 hours"], ["today", "Today"], ["custom", "Custom"]] as const).map(([v, l]) => <Chip key={v} active={D.expiry === v} onClick={() => set("expiry", v)}>{l}</Chip>)}
                </div>
                {D.expiry === "custom" && <Input type="datetime-local" value={D.customExpiry} onChange={(e) => set("customExpiry", e.target.value)} className="mt-2 max-w-xs" aria-label="Custom expiry" />}
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label><Flame className="inline size-3 mr-1" />Urgency</Label>
                <div className="flex gap-1.5">
                  {(["low", "soon", "urgent"] as const).map((u) => <Chip key={u} active={D.urgency === u} onClick={() => set("urgency", u)} className={cn(D.urgency === u && u === "urgent" && "bg-red border-red")}>{u}</Chip>)}
                </div>
              </div>
            </div>
            {D.type === "alert" && (
              <div className="rounded-xl bg-amber-soft text-amber px-3 py-2 text-xs flex gap-2"><AlertTriangle className="size-4 shrink-0" /> Community alerts are shown as unverified reports, never as official UNC notices. For emergencies call 911; official alerts come from alertcarolina.unc.edu.</div>
            )}
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button variant="ghost" onClick={() => { setDraft(null); setParsed(null); }}><ArrowLeft /> Back</Button>
              <div className="flex items-center gap-2">
                {D.keywords.slice(0, 3).map((k) => <Badge key={k}>{k}</Badge>)}
                <Button onClick={publish} loading={publishing} disabled={!canPublish}><Send /> Publish</Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
