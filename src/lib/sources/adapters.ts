// Source adapters for verified, publicly accessible campus feeds. Each returns normalized items.
// Only URLs in SOURCE_DEFS are ever fetched; there is no generic URL-fetch endpoint.

export type SourceKind = "events" | "news" | "alerts";
export type SourceDef = { id: string; name: string; url: string; adapter: "localist" | "engage" | "rss"; kind: SourceKind; homepage: string };

export const SOURCE_DEFS: SourceDef[] = [
  { id: "unc-calendar", name: "UNC Events Calendar", adapter: "localist", kind: "events", url: "https://calendar.unc.edu/api/2/events?days=7&pp=60", homepage: "https://calendar.unc.edu/" },
  { id: "heellife", name: "Heel Life (student orgs)", adapter: "engage", kind: "events", url: "https://heellife.unc.edu/api/discovery/event/search?orderByField=endsOn&orderByDirection=ascending&status=Approved&take=60", homepage: "https://heellife.unc.edu/events" },
  { id: "unc-news", name: "UNC News", adapter: "rss", kind: "news", url: "https://uncnews.unc.edu/feed/", homepage: "https://uncnews.unc.edu/" },
  { id: "dth", name: "The Daily Tar Heel", adapter: "rss", kind: "news", url: "https://www.dailytarheel.com/feed", homepage: "https://www.dailytarheel.com/" },
  { id: "alert-carolina", name: "Alert Carolina (official)", adapter: "rss", kind: "alerts", url: "https://alertcarolina.unc.edu/feed/", homepage: "https://alertcarolina.unc.edu/" },
];

export type RawItem = {
  providerId: string; title: string; summary: string; url: string; imageUrl: string | null;
  publishedAt: number | null; startsAt: number | null; endsAt: number | null;
  locationName: string | null; lat: number | null; lng: number | null;
};

const decode = (s: string) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#8217;/g, "'")
  .replace(/&#8220;|&#8221;/g, '"').replace(/&#8211;|&ndash;/g, "–").replace(/&#8212;|&mdash;/g, "—").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

export const stripHtml = (s: string) => decode(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
export const clip = (s: string, n = 240) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const num = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const when = (v: unknown) => { const t = v ? Date.parse(String(v)) : NaN; return Number.isFinite(t) ? t : null; };

export async function fetchWithTimeout(url: string, ms = 12000, init: RequestInit = {}): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal, headers: { "user-agent": "AquaStatic/1.0 (+hackathon campus app)", accept: "application/json, application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8", ...(init.headers ?? {}) } });
  } finally {
    clearTimeout(t);
  }
}

// ---- Localist (calendar.unc.edu/api/2/events) ----
type LocalistEvent = { id: number; title: string; description_text?: string; localist_url: string; photo_url?: string; location_name?: string; geo?: { latitude?: string | null; longitude?: string | null }; event_instances?: { event_instance: { start: string; end?: string | null } }[]; updated_at?: string };
export function parseLocalist(json: unknown): RawItem[] {
  const events = ((json as { events?: { event: LocalistEvent }[] })?.events ?? []).map((w) => w.event);
  return events.map((e) => {
    const inst = e.event_instances?.[0]?.event_instance;
    return {
      providerId: String(e.id), title: decode(e.title ?? "").trim(), summary: clip(stripHtml(e.description_text ?? "")), url: e.localist_url,
      imageUrl: e.photo_url ?? null, publishedAt: when(e.updated_at), startsAt: when(inst?.start), endsAt: when(inst?.end),
      locationName: e.location_name || null, lat: num(e.geo?.latitude), lng: num(e.geo?.longitude),
    };
  }).filter((i) => i.title && i.url);
}

// ---- CampusLabs Engage (heellife.unc.edu/api/discovery/event/search) ----
type EngageEvent = { id: number | string; name: string; description?: string; startsOn: string; endsOn?: string; location?: string; latitude?: string | null; longitude?: string | null; imagePath?: string | null; organizationName?: string };
export function parseEngage(json: unknown): RawItem[] {
  const value = (json as { value?: EngageEvent[] })?.value ?? [];
  return value.map((e) => ({
    providerId: String(e.id), title: decode(e.name ?? "").trim(),
    summary: clip([e.organizationName ? `${e.organizationName}.` : "", stripHtml(e.description ?? "")].join(" ").trim()),
    url: `https://heellife.unc.edu/event/${e.id}`,
    imageUrl: e.imagePath ? `https://se-images.campuslabs.com/clink/images/${e.imagePath}?preset=med-w` : null,
    publishedAt: null, startsAt: when(e.startsOn), endsAt: when(e.endsOn),
    locationName: e.location || null, lat: num(e.latitude), lng: num(e.longitude),
  })).filter((i) => i.title);
}

// ---- RSS 2.0 / Atom (regex-based; the feeds we allowlist are plain WordPress RSS) ----
const tag = (block: string, name: string) => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i").exec(block);
  return m ? m[1].trim() : "";
};
export function parseRss(xml: string): RawItem[] {
  const items = Array.from(xml.matchAll(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/gi)).map((m) => m[0]);
  return items.map((b) => {
    const title = stripHtml(tag(b, "title"));
    let link = stripHtml(tag(b, "link"));
    if (!link) { const href = /<link[^>]*href="([^"]+)"/i.exec(b); link = href ? href[1] : ""; }
    const guid = stripHtml(tag(b, "guid")) || stripHtml(tag(b, "id")) || link;
    const desc = stripHtml(tag(b, "description") || tag(b, "summary") || tag(b, "content:encoded") || tag(b, "content"));
    const pub = when(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date"));
    const img = /<media:content[^>]*url="([^"]+)"|<enclosure[^>]*url="([^"]+)"/i.exec(b);
    return { providerId: guid || title, title, summary: clip(desc), url: link, imageUrl: img ? (img[1] || img[2]) : null, publishedAt: pub, startsAt: null, endsAt: null, locationName: null, lat: null, lng: null };
  }).filter((i) => i.title && i.url);
}

export async function fetchSource(def: SourceDef, now = Date.now()): Promise<RawItem[]> {
  let url = def.url;
  if (def.adapter === "engage") url += `&endsAfter=${encodeURIComponent(new Date(now).toISOString())}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (def.adapter === "rss") return parseRss(await res.text());
  const json = await res.json();
  return def.adapter === "localist" ? parseLocalist(json) : parseEngage(json);
}
