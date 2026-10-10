"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Radio, Sparkles } from "lucide-react";
import { Page } from "@/components/shell/app-shell";
import { useSession } from "@/components/shell/providers";
import { Badge, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { useLive } from "@/hooks/useLive";
import { api } from "@/lib/client";
import { FORMATS, type ClientBriefing } from "./formats";
import { GeneratePanel, type GenerateInput } from "./generate-panel";
import { History } from "./history";
import { Player } from "./player";

export function RadioPage() {
  const { user, ensureUser } = useSession();
  const history = useLive<{ briefings: ClientBriefing[] }>("/api/briefings", { interval: 8000, scopes: ["briefings"] });
  const health = useLive<{ elevenlabs: boolean; gemini: boolean }>("/api/health", { interval: 60_000 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fresh, setFresh] = useState<ClientBriefing | null>(null); // just-generated, until history catches up
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const seeded = useRef(false);
  const playerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (user && !seeded.current) { seeded.current = true; setInterests(user.interests); } }, [user]);

  const list = useMemo(() => history.data?.briefings ?? [], [history.data]);
  const selected = useMemo(() => {
    const all = fresh ? [fresh, ...list.filter((b) => b.id !== fresh.id)] : list;
    return (selectedId && all.find((b) => b.id === selectedId)) || all[0] || null;
  }, [fresh, list, selectedId]);

  const saveInterests = async (next: string[]) => {
    setInterests(next);
    try { await ensureUser(); await api.patch("/api/me", { interests: next }); } catch (e) { toast.error((e as Error).message); }
  };

  const generate = async (input: GenerateInput) => {
    setGenerating(true); setGenError(null);
    try {
      const { briefing } = await api.post<{ briefing: ClientBriefing }>("/api/briefings", { ...input, interests });
      setFresh(briefing); setSelectedId(briefing.id);
      void history.refresh();
      toast.success(`${FORMATS[briefing.format].label} is ready`);
      requestAnimationFrame(() => playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      const msg = (e as Error).message || "Couldn't generate a briefing";
      setGenError(msg); toast.error(msg);
    } finally { setGenerating(false); }
  };

  return (
    <Page
      title="Aqua Static Radio"
      subtitle="Personalized campus audio, written only from what's actually posted right now."
      actions={health.data && (
        <div className="hidden sm:flex items-center gap-1.5">
          <Badge tone={health.data.gemini ? "violet" : "neutral"}>{health.data.gemini ? "Gemini writing" : "Local writer"}</Badge>
          <Badge tone={health.data.elevenlabs ? "mint" : "neutral"}>{health.data.elevenlabs ? "ElevenLabs voice" : "Browser voice"}</Badge>
        </div>
      )}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start">
        <section aria-label="Now playing" className="min-w-0">
          {selected ? (
            <div ref={playerRef} className="scroll-mt-20"><Player key={selected.id} briefing={selected} elevenlabs={health.data?.elevenlabs ?? null} /></div>
          ) : history.loading ? (
            <div className="card rounded-[22px] p-6 space-y-4"><Skeleton className="h-5 w-40" /><Skeleton className="h-8 w-3/4" /><Skeleton className="h-20" /><Skeleton className="h-12 w-56" /></div>
          ) : (
            <EmptyState icon={Radio} title="Nothing on air yet" body="Generate your first briefing and we'll turn today's posts, events and alerts into a show you can listen to or read." className="py-16 glass rounded-[22px]"
              action={<Button onClick={() => document.getElementById("radio-generate")?.scrollIntoView({ behavior: "smooth", block: "start" })}><Sparkles />Generate your first briefing</Button>} />
          )}
        </section>
        <aside className="min-w-0 space-y-5">
          <GeneratePanel id="radio-generate" interests={interests} onInterests={saveInterests} onGenerate={generate} generating={generating} error={genError} />
          <History briefings={list} loading={history.loading} error={history.error} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
        </aside>
      </div>
    </Page>
  );
}
