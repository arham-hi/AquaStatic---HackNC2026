// Campus time helpers. Storage is epoch ms (UTC); display is America/New_York.
export const CAMPUS_TZ = "America/New_York";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

// Accepts epoch ms, Date, or an ISO string (dates arrive as strings over JSON).
export type TimeLike = number | Date | string;
const toMs = (v: TimeLike) => (typeof v === "number" ? v : typeof v === "string" ? new Date(v).getTime() : v.getTime());

export function fmtTime(ms: TimeLike | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  if (ms == null) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TZ, hour: "numeric", minute: "2-digit", ...opts }).format(new Date(toMs(ms)));
}

export function fmtDateTime(ms: TimeLike | null | undefined): string {
  if (ms == null) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(toMs(ms)));
}

export function fmtDay(ms: TimeLike | null | undefined): string {
  if (ms == null) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TZ, weekday: "long", month: "long", day: "numeric" }).format(new Date(toMs(ms)));
}

export function timeAgo(ms: TimeLike, now = Date.now()): string {
  const d = Math.max(0, now - toMs(ms));
  if (d < MINUTE) return "just now";
  if (d < HOUR) return `${Math.floor(d / MINUTE)}m ago`;
  if (d < DAY) return `${Math.floor(d / HOUR)}h ago`;
  return `${Math.floor(d / DAY)}d ago`;
}

export function timeUntil(ms: TimeLike | null | undefined, now = Date.now()): string {
  if (ms == null) return "";
  const d = toMs(ms) - now;
  if (d <= 0) return "expired";
  if (d < HOUR) return `${Math.max(1, Math.round(d / MINUTE))}m left`;
  if (d < DAY) return `${Math.round(d / HOUR)}h left`;
  return `${Math.round(d / DAY)}d left`;
}

/** Hour of day (0-23) in campus time. */
export function campusHour(now = Date.now()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TZ, hour: "numeric", hour12: false }).format(new Date(now))) % 24;
}

export function greeting(now = Date.now()): string {
  const h = campusHour(now);
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Start of today in campus time, as epoch ms. */
export function startOfCampusDay(now = Date.now()): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TZ, hour: "numeric", minute: "numeric", second: "numeric", hour12: false })
    .formatToParts(new Date(now));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0) % 24;
  return now - (get("hour") * 3600 + get("minute") * 60 + get("second")) * 1000;
}

/** End of today in campus time, as epoch ms. */
export function endOfCampusDay(now = Date.now()): number {
  return startOfCampusDay(now) + DAY - 1000;
}

/** Today at a given hour in campus time (approximate: ignores DST transitions mid-day). */
export function campusTodayAt(hour: number, minute = 0, now = Date.now()): number {
  return startOfCampusDay(now) + hour * HOUR + minute * MINUTE;
}
