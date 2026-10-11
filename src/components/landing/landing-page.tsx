"use client";
// Landing: the front door. Cursor parallax over a bubble field, Aqua hosting live,
// a real-time ticker of campus posts, and glossy feature cards that tilt and gleam.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useMotionValue, useMotionTemplate, useReducedMotion, useSpring, useTransform } from "framer-motion";
import {
  ArrowRight, Bus, ChevronDown, HeartHandshake, Leaf, Map as MapIcon, MessagesSquare,
  Moon, Plus, Radio, Search, Send, Sparkles, Sun, Waves, Zap,
} from "lucide-react";
import { useLive } from "@/hooks/useLive";
import { useUI } from "@/components/shell/providers";
import { Logo } from "@/components/shell/nav";
import { AquaMascot } from "@/components/radio/mascot/aqua-mascot";
import type { MascotFx, StationLevels } from "@/components/radio/use-station";
import { cn } from "@/lib/utils";
import type { FeedItem } from "@/lib/services/feed";

type MarkersResponse = {
  markers: FeedItem[];
  counts: { live: number; requests: number; offers: number; alerts: number; last24h: number; shared: number };
};

const KIND_COLOR: Record<string, string> = {
  request: "#0e9fde", offer: "#2fbf8f", alert: "#e5484d", event: "#8b5cf6", news: "#f0a21b", notice: "#f0a21b", transit: "#22b8cf",
};

/* ------------------------------------------------------------------ hero */

export function LandingPage() {
  const { openAssistant, openCreate, theme, setTheme } = useUI();
  const router = useRouter();
  const reduced = useReducedMotion();
  const feed = useLive<MarkersResponse>("/api/map/markers", { interval: 5000, scopes: ["posts", "matches", "sources"] });
  const counts = feed.data?.counts;

  // Hero pointer parallax — springs keep it buttery, refs keep re-renders at zero.
  const px = useMotionValue(0), py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 55, damping: 16 }), sy = useSpring(py, { stiffness: 55, damping: 16 });
  const farX = useTransform(sx, (v) => v * -34), farY = useTransform(sy, (v) => v * -20);
  const midX = useTransform(sx, (v) => v * -18), midY = useTransform(sy, (v) => v * -10);
  const nearX = useTransform(sx, (v) => v * 10), nearY = useTransform(sy, (v) => v * 7);

  useEffect(() => {
    if (reduced || !window.matchMedia("(pointer: fine)").matches) return;
    const move = (e: PointerEvent) => {
      px.set(e.clientX / window.innerWidth - 0.5);
      py.set(e.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [px, py, reduced]);

  const ask = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = new FormData(e.currentTarget).get("q")?.toString().trim();
    if (!text) return;
    if (/\?$|^(what|any|who|is|are|where|when|find|show|does)\b/i.test(text)) openAssistant(text);
    else router.push(`/connect?q=${encodeURIComponent(text)}`);
    e.currentTarget.reset();
  };

  const ease: [number, number, number, number] = [0.2, 0.8, 0.2, 1];
  const rise = (d = 0) => ({ initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.65, delay: d, ease } });

  return (
    <div className="relative overflow-x-clip">
      {/* ============================== HERO ============================== */}
      <section className="relative flex min-h-dvh flex-col">
        {/* parallax glows */}
        <motion.div aria-hidden style={{ x: farX, y: farY }} className="pointer-events-none absolute -top-32 -left-24 size-[520px] rounded-full bg-[radial-gradient(circle,rgba(120,205,255,0.5),transparent_65%)] blur-2xl" />
        <motion.div aria-hidden style={{ x: midX, y: midY }} className="pointer-events-none absolute top-1/3 -right-40 size-[560px] rounded-full bg-[radial-gradient(circle,rgba(120,235,180,0.4),transparent_65%)] blur-2xl" />
        <motion.div aria-hidden style={{ x: nearX, y: nearY }} className="pointer-events-none absolute -bottom-24 left-1/4 size-[420px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.65),transparent_60%)] blur-xl dark:opacity-25" />

        {/* landing header — the app TopBar stays out of the way on purpose */}
        <header className="relative z-20 flex items-center justify-between gap-3 px-5 sm:px-8 pt-5">
          <Logo />
          <nav className="hidden sm:flex items-center gap-1 text-sm font-medium text-fg-muted" aria-label="Landing">
            {[["Map", "/map"], ["Radio", "/radio"], ["Connect", "/connect"], ["Impact", "/impact"]].map(([label, href]) => (
              <Link key={href} href={href} className="rounded-full px-3 py-1.5 hover:text-fg hover:bg-fg/5 transition-colors">{label}</Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme"
              className="aero-account-control grid size-10 place-items-center rounded-full text-fg-muted hover:text-fg">
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <Link href="/map" className="aero-button btn-aero hidden sm:inline-flex items-center gap-1.5 rounded-full px-4 h-10 text-sm font-semibold text-white">
              Enter <ArrowRight className="size-4" />
            </Link>
          </div>
        </header>

        {/* hero body */}
        <div className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-6 px-5 sm:px-8 py-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <motion.div {...rise(0)} className="mb-5 inline-flex items-center gap-2 rounded-full glass px-3.5 py-1.5 text-xs font-semibold text-fg-muted">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-mint" />
              </span>
              {counts ? `${counts.live} things live on campus right now` : "Chapel Hill, live"}
            </motion.div>

            <motion.h1 {...rise(0.08)} className="text-[clamp(2.6rem,7vw,5.2rem)] font-semibold leading-[1.02] tracking-[-0.05em] text-balance">
              Your campus.
              <br />
              <span className="text-liquid">In real time.</span>
            </motion.h1>

            <motion.p {...rise(0.16)} className="mt-5 max-w-lg text-base sm:text-lg leading-relaxed text-fg-muted">
              Aqua Static is a living 3D map of UNC-Chapel Hill. Say what you need or can offer in plain English,
              an AI turns it into a pin, and a matching engine connects you with someone nearby.
            </motion.p>

            {/* ask / post box — same routing the app search uses */}
            <motion.form {...rise(0.24)} onSubmit={ask} role="search"
              className="aero-search mt-7 flex max-w-lg items-center gap-2 rounded-full px-4">
              <Search className="size-4 shrink-0 text-fg-faint" />
              <input name="q" aria-label="Ask about campus or say what you need"
                placeholder='Try "who has a charger at Davis?"'
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-faint" />
              <button type="submit" aria-label="Ask"
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-carolina-soft/40 px-3 text-xs font-semibold text-carolina transition-colors hover:bg-carolina-soft">
                <Send className="size-3.5" /> Ask
              </button>
            </motion.form>

            <motion.div {...rise(0.32)} className="mt-5 flex flex-wrap items-center gap-3">
              <Link href="/map" className="aero-button btn-aero inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-semibold text-white">
                <Waves className="size-4.5" /> Enter the live map
              </Link>
              <button type="button" onClick={() => openCreate()} className="aero-button btn-grass inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-semibold text-white">
                <Plus className="size-4.5" /> Post what&apos;s up
              </button>
              <button type="button" onClick={() => openAssistant()} className="aero-button glass inline-flex h-12 items-center gap-2 rounded-full px-5 text-[15px] font-semibold text-carolina-deep">
                <Sparkles className="size-4" /> Ask Aqua
              </button>
            </motion.div>
          </div>

          {/* Aqua, floating over the hero and watching your cursor */}
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.15, ease }}
            className="relative mx-auto w-full max-w-[420px]">
            <div aria-hidden className="absolute inset-x-8 top-10 bottom-0 rounded-full bg-[radial-gradient(ellipse,rgba(140,215,250,0.45),transparent_70%)] blur-2xl" />
            <div className="animate-drift relative">
              <HeroMascot />
            </div>
            <motion.p {...rise(0.5)} className="mt-1 text-center text-xs font-medium text-fg-faint">
              Aqua, your campus host — click for a wave
            </motion.p>
          </motion.div>
        </div>

        <PoppableField />

        {/* live ticker of real campus posts */}
        <div className="relative z-10 border-t border-border/60 bg-bg-elev/40 backdrop-blur-md">
          <Ticker items={feed.data?.markers ?? []} />
        </div>

        <motion.div aria-hidden animate={reduced ? undefined : { y: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="absolute bottom-20 left-1/2 z-10 -translate-x-1/2 text-fg-faint">
          <ChevronDown className="size-5" />
        </motion.div>
      </section>

      {/* ============================== STATS ============================== */}
      <section className="relative mx-auto max-w-6xl px-5 sm:px-8 pt-14 pb-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat value={counts?.live ?? null} label="live on the map" icon={<Zap className="size-4" />} tint="text-carolina" />
          <Stat value={counts ? counts.requests + counts.offers : null} label="open asks &amp; offers" icon={<HeartHandshake className="size-4" />} tint="text-mint" />
          <Stat value={counts?.last24h ?? null} label="in the last 24h" icon={<MapIcon className="size-4" />} tint="text-violet" />
          <Stat value={counts?.shared ?? null} label="items kept in use" icon={<Leaf className="size-4" />} tint="text-amber" />
        </div>
      </section>

      {/* ============================== HOW ============================== */}
      <section className="relative mx-auto max-w-6xl px-5 sm:px-8 py-14">
        <SectionHead eyebrow="How it works" title="From a text to a pin in seconds" />
        <div className="grid gap-4 md:grid-cols-3">
          <Step n="01" icon={<MessagesSquare className="size-6" />} title="Say it like a text"
            body={'"Need a USB-C charger at Davis for an hour." No forms, no categories to pick — just say it.'} />
          <Step n="02" icon={<Sparkles className="size-6" />} title="AI makes it a post"
            body="Gemini reads the intent, checks the spot against a campus registry, and drafts a structured pin for your review." />
          <Step n="03" icon={<HeartHandshake className="size-6" />} title="Get matched nearby"
            body="A plain-code, explainable score pairs asks with offers. Both sides accept, a chat opens, done." />
        </div>
      </section>

      {/* ============================== FEATURES ============================== */}
      <section className="relative mx-auto max-w-6xl px-5 sm:px-8 py-14">
        <SectionHead eyebrow="Explore" title="Four ways in" />
        <div className="grid gap-4 sm:grid-cols-2" style={{ perspective: 1200 }}>
          <TiltCard href="/map" accent="#0e9fde" icon={<MapIcon className="size-6" />} title="The living map"
            body="3D buildings, walking pedestrians, category pins and filters — the whole campus breathing in real time."
            cta="Open the map" />
          <TiltCard href="/radio" accent="#8b5cf6" icon={<Radio className="size-6" />} title="Aqua FM"
            body="An AI radio station narrates what's happening — briefings written from real campus records, voiced live."
            cta="Tune in" />
          <TiltCard href="/map?buses=1" accent="#22b8cf" icon={<Bus className="size-6" />} title="Real transit"
            body="All 22 Chapel Hill Transit routes and ~520 stops on the same map, with a link to the official live tracker."
            cta="See routes" />
          <TiltCard href="/connect" accent="#2fbf8f" icon={<HeartHandshake className="size-6" />} title="Connect"
            body="Browse asks, offers, events and lost &amp; found — save what matters and accept a match to start a chat."
            cta="Browse posts" />
        </div>
      </section>

      {/* ============================== CTA ============================== */}
      <section className="relative mx-auto max-w-6xl px-5 sm:px-8 py-14">
        <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease }}
          className="glass-strong relative overflow-hidden rounded-[32px] px-6 py-14 text-center sm:px-12">
          <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[130%] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(ellipse,rgba(140,215,250,0.4),transparent_70%)]" />
          <h2 className="relative text-3xl sm:text-4xl font-semibold tracking-tight text-balance">Campus doesn&apos;t wait.</h2>
          <p className="relative mx-auto mt-3 max-w-md text-fg-muted">Jump in, drop a pin, and see who&apos;s out there.</p>
          <div className="relative mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/map" className="aero-button btn-aero inline-flex h-12 items-center gap-2 rounded-full px-7 text-[15px] font-semibold text-white">
              Enter Aqua Static <ArrowRight className="size-4.5" />
            </Link>
            <button type="button" onClick={() => openCreate()} className="aero-button glass inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-semibold text-carolina-deep">
              <Plus className="size-4.5" /> Make a post
            </button>
          </div>
        </motion.div>
      </section>

      {/* ============================== FOOTER ============================== */}
      <footer className="relative border-t border-border/60 px-5 sm:px-8 py-10 pb-28 md:pb-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-center">
          <Logo />
          <p className="text-xs text-fg-faint max-w-md">
            Built for HackNC 2026 · Map data © OpenStreetMap, tiles by OpenFreeMap · Transit: Chapel Hill Transit GTFS
          </p>
          <p className="text-xs font-medium text-fg-muted">Arhem Hussain Inamdar · Aadee Chheda · Arya Pathare · Nia Spence</p>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ mascot */

function HeroMascot() {
  const levels = useRef<StationLevels>({ voice: 0, music: 0 });
  const fx = useRef<MascotFx>(null);
  const reduced = useReducedMotion();

  // A gentle music level so Aqua pulses like it's mid-broadcast.
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      levels.current.music = 0.45 + 0.3 * Math.sin((t - t0) / 850);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  return <AquaMascot state="music" levels={levels} fx={fx} className="relative h-[320px] w-full sm:h-[420px] lg:h-[480px]" />;
}

/* ------------------------------------------------------------------ bubbles you can pop */

const POP_BUBBLES = [
  { size: 84, left: "4%", top: "58%", delay: "-2s" },
  { size: 46, left: "10%", top: "30%", delay: "-5s" },
  { size: 30, left: "44%", top: "18%", delay: "-1s" },
  { size: 62, left: "88%", top: "66%", delay: "-4s" },
  { size: 38, left: "80%", top: "12%", delay: "-7s" },
  { size: 26, left: "58%", top: "72%", delay: "-3s" },
] as const;

function PoppableField() {
  const [popped, setPopped] = useState<number[]>([]);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
      {POP_BUBBLES.map((b, i) =>
        popped.includes(i) ? (
          <span key={i} className="bubble-pop-ring" style={{ width: b.size, height: b.size, left: b.left, top: b.top }} />
        ) : (
          <span key={i} onClick={() => setPopped((p) => [...p, i])}
            className="bubble pointer-events-auto cursor-pointer transition-transform hover:scale-110"
            style={{ width: b.size, height: b.size, left: b.left, top: b.top, animationDelay: b.delay }} />
        ),
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ ticker */

function Ticker({ items }: { items: FeedItem[] }) {
  const rows = items.slice(0, 10);
  const row = (key: string) => (
    <div key={key} className="flex w-max items-center gap-6 pr-6">
      {rows.map((it) => (
        <Link key={`${key}:${it.id}`} href={`/map?item=${encodeURIComponent(it.id)}`}
          className="flex items-center gap-2 whitespace-nowrap text-xs font-medium text-fg-muted transition-colors hover:text-fg">
          <span className="size-1.5 rounded-full" style={{ background: KIND_COLOR[it.type] ?? "#8b9fb0" }} />
          <span className="max-w-[280px] truncate">{it.title}</span>
          {it.locationName && <span className="text-fg-faint">· {it.locationName}</span>}
        </Link>
      ))}
    </div>
  );
  return (
    <div className="flex items-center gap-3 py-2.5 pl-5 sm:pl-8" aria-label="Live campus activity">
      <span className="shrink-0 rounded-full bg-mint-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-mint">Live</span>
      <div className="relative flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_6%,black_94%,transparent)]">
        {rows.length ? (
          <div className="marquee-track flex w-max">
            {row("a")}{row("b")}
          </div>
        ) : (
          <p className="text-xs text-fg-faint">The map is quiet — post something to wake it up.</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ bits */

function AnimatedNumber({ value }: { value: number | null }) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 55, damping: 16 });
  const text = useTransform(spring, (v) => Math.round(v).toLocaleString());
  useEffect(() => { if (value != null) mv.set(value); }, [value, mv]);
  return value == null ? <span>—</span> : <motion.span>{text}</motion.span>;
}

function Stat({ value, label, icon, tint }: { value: number | null; label: string; icon: ReactNode; tint: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
      className="glass rounded-3xl px-5 py-4">
      <div className={cn("mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide", tint)}>{icon}{label}</div>
      <div className="text-3xl font-semibold tracking-tight tabular-nums"><AnimatedNumber value={value} /></div>
    </motion.div>
  );
}

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }} className="mb-7">
      <div className="aero-eyebrow">{eyebrow}</div>
      <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">{title}</h2>
    </motion.div>
  );
}

function Step({ n, icon, title, body }: { n: string; icon: ReactNode; title: string; body: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
      className="card relative overflow-hidden rounded-3xl p-6">
      <span aria-hidden className="absolute -right-2 -top-5 text-[88px] font-bold leading-none text-carolina/10 select-none">{n}</span>
      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-carolina-soft/50 text-carolina">{icon}</div>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">{body}</p>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ tilt card */

function TiltCard({ href, accent, icon, title, body, cta }: { href: string; accent: string; icon: ReactNode; title: string; body: string; cta: string }) {
  const reduced = useReducedMotion();
  const rx = useMotionValue(0), ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 260, damping: 22 }), sry = useSpring(ry, { stiffness: 260, damping: 22 });
  const gx = useMotionValue(50), gy = useMotionValue(50);
  const glare = useMotionTemplate`radial-gradient(340px circle at ${gx}% ${gy}%, rgba(255,255,255,0.4), transparent 55%)`;

  const move = (e: React.PointerEvent<HTMLAnchorElement>) => {
    if (reduced) return;
    const r = e.currentTarget.getBoundingClientRect();
    const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
    rx.set((0.5 - v) * 9); ry.set((u - 0.5) * 11);
    gx.set(u * 100); gy.set(v * 100);
  };
  const leave = () => { rx.set(0); ry.set(0); gx.set(50); gy.set(50); };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }} style={{ transformStyle: "preserve-3d" }}>
      <motion.div style={{ rotateX: srx, rotateY: sry, transformStyle: "preserve-3d" }} className="h-full">
        <Link href={href} onPointerMove={move} onPointerLeave={leave}
          className="glass group relative flex h-full flex-col overflow-hidden rounded-3xl p-6 transition-shadow hover:shadow-lg">
          <motion.div aria-hidden style={{ background: glare }} className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <div className="mb-5 grid size-12 place-items-center rounded-2xl text-white shadow-md" style={{ background: `linear-gradient(150deg, ${accent}, ${accent}cc)` }}>
            {icon}
          </div>
          <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-fg-muted">{body}</p>
          <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: accent }}>
            {cta} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </span>
        </Link>
      </motion.div>
    </motion.div>
  );
}
