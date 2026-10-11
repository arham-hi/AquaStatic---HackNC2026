"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Moon, ShieldCheck, Sun, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Card, Chip, EmptyState, Input, Label, Skeleton, Switch } from "@/components/ui/primitives";
import { LocationPicker } from "@/components/posts/location-picker";
import { useSession, useUI } from "@/components/shell/providers";
import { useLive } from "@/hooks/useLive";
import { api } from "@/lib/client";
import { INTERESTS, INTEREST_LABELS } from "@/lib/constants";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Post } from "@/lib/db/schema";

const EMOJIS = ["🐏", "🔌", "⚡", "📐", "🧮", "🍕", "📚", "🎧", "🚌", "🌊", "🏀", "🎨"];
const SUBJECT_SUGGESTIONS = ["Calculus", "Calculus II", "Chemistry", "Physics", "Statistics", "Computer Science", "Writing", "Economics", "Biology", "Spanish"];
const STATUS_TONE: Record<string, "neutral" | "carolina" | "mint" | "amber" | "red"> = { open: "carolina", matched: "amber", in_progress: "amber", fulfilled: "mint", resolved: "mint", expired: "neutral", deleted: "red" };

export function ProfileView() {
  const { user, loading, demoMode, ensureUser } = useSession();
  const [creating, setCreating] = useState(false);

  if (loading) return <div className="space-y-3"><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>;
  if (!user) {
    return (
      <EmptyState icon={UserRound} title="You're browsing as a guest" body="Create a lightweight profile to post, match, and message. No email or phone required."
        action={<Button loading={creating} onClick={async () => { setCreating(true); try { await ensureUser(); } catch (e) { toast.error((e as Error).message); } finally { setCreating(false); } }}>Create my profile</Button>} />
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <ProfileForm key={user.id} />
        <ActivityCard />
      </div>
      <div className="space-y-4">
        <PrivacyCard />
        {demoMode && <DemoProfilesCard />}
      </div>
    </div>
  );
}

function ProfileForm() {
  const { user, refresh } = useSession();
  const { theme, setTheme } = useUI();
  const [name, setName] = useState(user?.displayName ?? "");
  const [avatar, setAvatar] = useState(user?.avatar ?? "🐏");
  const [interests, setInterests] = useState<string[]>(user?.interests ?? []);
  const [subjects, setSubjects] = useState<string[]>(user?.helpSubjects ?? []);
  const [subjectDraft, setSubjectDraft] = useState("");
  const [area, setArea] = useState<string | null>(user?.preferredArea ?? null);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({ matches: true, messages: true, events: true, ...(user?.notificationPrefs ?? {}) });
  const [saving, setSaving] = useState(false);

  const addSubject = (raw: string) => {
    const s = raw.trim().slice(0, 40);
    if (!s || subjects.some((x) => x.toLowerCase() === s.toLowerCase()) || subjects.length >= 12) return;
    setSubjects([...subjects, s]);
    setSubjectDraft("");
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.patch("/api/me", { displayName: name.trim(), avatar: avatar.trim() || "🐏", interests, helpSubjects: subjects, preferredArea: area, notificationPrefs: prefs });
      await refresh();
      toast.success("Profile saved");
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };

  return (
    <Card className="space-y-5">
      <div className="flex items-center gap-3">
        <Avatar emoji={avatar} name={name} size={56} />
        <div className="min-w-0 flex-1">
          <Label htmlFor="displayName">Display name</Label>
          <Input id="displayName" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} minLength={2} placeholder="How should people see you?" />
        </div>
      </div>

      <div>
        <Label>Avatar</Label>
        <div className="mt-1.5 flex flex-wrap gap-1.5 items-center">
          {EMOJIS.map((e) => <Chip key={e} active={avatar === e} onClick={() => setAvatar(e)} aria-label={`Avatar ${e}`} className="text-base px-2.5">{e}</Chip>)}
          <Input value={avatar} onChange={(e) => setAvatar(e.target.value)} maxLength={8} aria-label="Custom emoji avatar" className="w-20 h-8 text-center" />
        </div>
      </div>

      <div>
        <Label>Interests</Label>
        <p className="text-xs text-fg-muted mb-1.5">Shapes your briefings and event alerts.</p>
        <div className="flex flex-wrap gap-1.5">
          {INTERESTS.map((i) => <Chip key={i} active={interests.includes(i)} onClick={() => setInterests(interests.includes(i) ? interests.filter((x) => x !== i) : [...interests, i])}>{INTEREST_LABELS[i]}</Chip>)}
        </div>
      </div>

      <div>
        <Label htmlFor="subject">Subjects I can help with</Label>
        <div className="mt-1.5 flex flex-wrap gap-1.5 mb-2">
          {subjects.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-full bg-carolina-soft text-carolina px-2.5 h-8 text-xs font-medium">
              {s}<button type="button" onClick={() => setSubjects(subjects.filter((x) => x !== s))} aria-label={`Remove ${s}`} className="rounded-full p-0.5 hover:bg-carolina/15"><X className="size-3" /></button>
            </span>
          ))}
          <Input id="subject" value={subjectDraft} onChange={(e) => setSubjectDraft(e.target.value)} placeholder="Type a subject, press Enter" className="h-8 w-56" maxLength={40}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubject(subjectDraft); } }} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SUBJECT_SUGGESTIONS.filter((s) => !subjects.includes(s)).map((s) => <button key={s} type="button" onClick={() => addSubject(s)} className="text-xs text-fg-muted hover:text-carolina rounded-full border border-dashed border-border-strong px-2.5 h-7">+ {s}</button>)}
        </div>
      </div>

      <div>
        <Label>Preferred campus area</Label>
        <p className="text-xs text-fg-muted mb-1.5">Used to rank nearby matches. Never shown as your live location.</p>
        <LocationPicker value={area} onChange={setArea} placeholder="Where do you usually study?" />
      </div>

      <div>
        <Label>Notify me about</Label>
        <div className="mt-1.5 divide-y divide-border rounded-xl border border-border">
          {([["matches", "Match suggestions and acceptances"], ["messages", "New messages"], ["events", "Events near my area"]] as const).map(([k, label]) => (
            <label key={k} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm cursor-pointer">
              <span>{label}</span>
              <Switch checked={prefs[k] !== false} onCheckedChange={(v) => setPrefs({ ...prefs, [k]: v })} aria-label={label} />
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-fg-muted">Theme</span>
          <div className="inline-flex rounded-xl bg-fg/5 p-1">
            {(["light", "dark"] as const).map((t) => (
              <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)} className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium capitalize", theme === t ? "bg-bg-elev shadow-sm text-fg" : "text-fg-muted")}>
                {t === "light" ? <Sun className="size-4" /> : <Moon className="size-4" />}{t}
              </button>
            ))}
          </div>
        </div>
        <Button loading={saving} disabled={name.trim().length < 2} onClick={save}>Save changes</Button>
      </div>
    </Card>
  );
}

function PrivacyCard() {
  return (
    <Card className="space-y-2">
      <div className="flex items-center gap-2 font-semibold text-sm"><ShieldCheck className="size-4 text-mint" /> Privacy</div>
      <div className="text-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-fg-faint mb-1">Public</div>
        <ul className="list-disc pl-5 text-fg-muted space-y-0.5"><li>Display name and avatar</li><li>Your posts and the campus venue you pick for them</li></ul>
      </div>
      <div className="text-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-fg-faint mb-1">Never shared</div>
        <ul className="list-disc pl-5 text-fg-muted space-y-0.5"><li>Precise or live location</li><li>Phone number or iMessage handle</li><li>Email address</li></ul>
      </div>
    </Card>
  );
}

function ActivityCard() {
  const live = useLive<{ posts: (Omit<Post, "createdAt" | "updatedAt" | "startsAt" | "expiresAt"> & { createdAt: string })[] }>("/api/posts?mine=1", { scopes: ["posts", "matches"] });
  const posts = live.data?.posts ?? [];
  return (
    <Card className="space-y-3">
      <div className="font-semibold text-sm">My activity</div>
      {live.loading && !live.data ? <Skeleton className="h-10" /> : posts.length === 0 ? <p className="text-sm text-fg-muted">No posts yet. Tap + to ask for or offer something.</p> : (
        <ul className="divide-y divide-border">
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/connect?post=${p.id}`} className="flex items-center gap-3 py-2 text-sm hover:text-carolina">
                <span className="truncate flex-1 font-medium">{p.title}</span>
                <Badge tone={STATUS_TONE[p.status] ?? "neutral"} className="capitalize">{p.status.replace("_", " ")}</Badge>
                <span className="text-[11px] text-fg-faint shrink-0">{timeAgo(new Date(p.createdAt))}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DemoProfilesCard() {
  const { user, switchDemoUser } = useSession();
  const demo = useLive<{ users: { id: string; displayName: string; avatar: string }[] }>("/api/demo", { interval: 30000 });
  return (
    <Card className="space-y-3">
      <div className="font-semibold text-sm">Demo profiles</div>
      <div className="flex flex-wrap gap-1.5">
        {(demo.data?.users ?? []).map((u) => <Chip key={u.id} active={user?.id === u.id} onClick={() => switchDemoUser(u.id)}>{u.avatar} {u.displayName}</Chip>)}
      </div>
      <Button variant="ghost" size="sm" onClick={() => switchDemoUser(null)}>Sign out</Button>
    </Card>
  );
}
