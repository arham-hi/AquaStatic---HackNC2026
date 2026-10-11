// Deterministic campus-language parser. Runs when Gemini is not configured (and as a safety net when it fails).
// It recognizes request/offer intent, categories, items, subjects, locations, durations and urgency.

import { findLocationInText } from "@/lib/locations";
import type { ParsedPost, QueryIntent } from "./types";
import type { PostCategory } from "@/lib/db/schema";

const has = (t: string, ...words: (string | RegExp)[]) =>
  words.some((w) => (typeof w === "string" ? t.includes(w) : w.test(t)));

const STOP = new Set("i a an the and or to for of at in on my me is it its im rn now with can someone anyone anybody does do have has need got want like some any from near by until till by around about this that there here please pls thanks".split(" "));

export function keywordsOf(text: string, extra: string[] = []): string[] {
  const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  return Array.from(new Set([...extra.map((e) => e.toLowerCase()), ...words])).slice(0, 12);
}

const ITEM_PATTERNS: { re: RegExp; item: string; powerClass?: ParsedPost["powerClass"] }[] = [
  { re: /usb[\s-]?c (laptop )?charger|laptop charger|macbook charger|usb[\s-]?c (power )?(adapter|brick)/, item: "USB-C laptop charger", powerClass: "laptop" },
  { re: /lightning (cable|charger)|iphone charger|phone charger/, item: "phone charger", powerClass: "phone" },
  { re: /usb[\s-]?c cable|charging cable|usb cable/, item: "USB-C cable", powerClass: "cable" },
  { re: /\bcharger\b/, item: "charger", powerClass: "laptop" },
  { re: /graphing calculator|ti[\s-]?84|ti[\s-]?nspire|\bcalculator\b/, item: "graphing calculator" },
  { re: /\bairpods?\b/, item: "AirPods" },
  { re: /water bottle|hydro ?flask|\bbottle\b/, item: "water bottle" },
  { re: /\bwallet\b/, item: "wallet" },
  { re: /\bkeys?\b/, item: "keys" },
  { re: /\bumbrella\b/, item: "umbrella" },
  { re: /\blaptop\b/, item: "laptop" },
  { re: /\bbike\b|\bbicycle\b/, item: "bike" },
  { re: /\bjacket\b|\bhoodie\b/, item: "jacket" },
  { re: /one ?card|student id|\bid card\b/, item: "OneCard" },
  { re: /\btextbook\b|\bbook\b/, item: "textbook" },
  { re: /\bpizza\b/, item: "pizza" },
  { re: /desk chair|office chair|gaming chair|\bchair\b/, item: "desk chair" },
  { re: /\bcouch\b|\bsofa\b|\bfuton\b/, item: "couch" },
  { re: /mini ?fridge|\bfridge\b/, item: "mini fridge" },
  { re: /\bmicrowave\b/, item: "microwave" },
  { re: /\bdesk\b/, item: "desk" },
  { re: /\blamp\b/, item: "lamp" },
  { re: /\bmattress\b/, item: "mattress" },
  { re: /\bbookshelf\b|\bshelf\b|\bshelves\b/, item: "shelf" },
  { re: /\brug\b/, item: "rug" },
  { re: /\bmonitor\b/, item: "monitor" },
  { re: /\btv\b|\btelevision\b/, item: "TV" },
  { re: /\bbox fan\b|\bfan\b/, item: "fan" },
  { re: /\bprinter\b/, item: "printer" },
];

const SUBJECTS: [RegExp, string][] = [
  [/calc(ulus)?\s*(ii|2|two)|math\s*232/, "Calculus II"],
  [/calc(ulus)?\s*(iii|3|three)|math\s*233/, "Calculus III"],
  [/calc(ulus)?\s*(i|1|one)?\b|math\s*231/, "Calculus"],
  [/\bchem(istry)?\b|chem\s*10[12]/, "Chemistry"],
  [/\bphysics\b|phys\s*11[48]/, "Physics"],
  [/\bbio(logy)?\b|biol\s*101/, "Biology"],
  [/\bstat(istic)?s?\b|stor\s*155/, "Statistics"],
  [/comp\s*(110|210|301|311|401|410|411|421|455|550)|\bcoding\b|\bprogramming\b|\bcs\b|data structures/, "Computer Science"],
  [/\becon(omics)?\b/, "Economics"],
  [/\bspanish\b|\bfrench\b|\bgerman\b|\bchinese\b/, "Language"],
  [/\bwriting\b|\bessay\b|engl\s*105/, "Writing"],
  [/\baccounting\b|\bbusi\b/, "Business"],
];

const DURATION_RE = /(\d+)\s*(min|mins|minutes|hr|hrs|hour|hours)\b/;
const UNTIL_RE = /(?:until|till|til|'til)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/;
const AT_RE = /(?:around|at|@|by)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/;

/** Minutes from now until a clock time like "around 6" or "at 3pm" (today, campus time); null if none. */
function minutesUntilClock(t: string, re: RegExp, now: number): number | null {
  const u = re.exec(t);
  if (!u) return null;
  let h = Number(u[1]);
  if (h > 23) return null;
  const min = Number(u[2] ?? 0);
  const ap = u[3];
  const nowNy = new Date(new Date(now).toLocaleString("en-US", { timeZone: "America/New_York" }));
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (!ap && h < nowNy.getHours() && h <= 11) h += 12; // "around 6" at 2pm means 6pm
  const target = new Date(nowNy);
  target.setHours(h, min, 0, 0);
  const diff = Math.round((target.getTime() - nowNy.getTime()) / 60000);
  return diff > 0 && diff < 24 * 60 ? diff : null;
}

const DESTINATIONS: [RegExp, string][] = [
  [/\brdu\b|\bairport\b/, "RDU Airport"], [/harris teeter|\bht\b/, "Harris Teeter"], [/trader joe'?s/, "Trader Joe's"], [/\btarget\b/, "Target"],
  [/\bwalmart\b/, "Walmart"], [/\bcostco\b/, "Costco"], [/\bsouthpoint\b/, "Southpoint Mall"], [/\bwhole foods\b/, "Whole Foods"],
  [/\bfood lion\b/, "Food Lion"], [/\bdurham\b/, "Durham"], [/\braleigh\b/, "Raleigh"], [/\bgreensboro\b/, "Greensboro"], [/\bcharlotte\b/, "Charlotte"],
  [/\bduke\b/, "Duke"], [/\bnc state\b|\bncsu\b/, "NC State"], [/\bgrocery\b|\bgroceries\b/, "the grocery store"], [/\bamtrak\b|train station/, "Durham Amtrak"],
];

export function parseDestination(t: string): string | null {
  for (const [re, name] of DESTINATIONS) if (re.test(t)) return name;
  const m = /\b(?:ride|lift|carpool|drive|driving|going|heading)\s+(?:to|into)\s+(?:the\s+)?([a-z][a-z0-9' &-]{2,40}?)(?=\s+(?:around|at|on|this|tonight|tomorrow|tmrw|by|for|in|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thurs|fri|sat|sun|,)|[.!?,]|$)/.exec(t);
  return m ? m[1].trim().replace(/\b\w/g, (c) => c.toUpperCase()) : null;
}

export function parseDurationMinutes(t: string, now = Date.now()): number | null {
  const m = DURATION_RE.exec(t);
  if (m) {
    const n = Number(m[1]);
    return m[2].startsWith("h") ? n * 60 : n;
  }
  if (/\ban hour\b|\bnext hour\b|\bfor the hour\b/.test(t)) return 60;
  if (/\bhalf an hour\b|\bhalf hour\b/.test(t)) return 30;
  if (/\bcouple (of )?hours\b/.test(t)) return 120;
  const u = UNTIL_RE.exec(t);
  if (u) {
    let h = Number(u[1]);
    const min = Number(u[2] ?? 0);
    const ap = u[3];
    const nowNy = new Date(new Date(now).toLocaleString("en-US", { timeZone: "America/New_York" }));
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (!ap && h < nowNy.getHours() && h <= 11) h += 12; // "until 5" at 2pm means 5pm
    const target = new Date(nowNy);
    target.setHours(h, min, 0, 0);
    const diff = Math.round((target.getTime() - nowNy.getTime()) / 60000);
    if (diff > 0 && diff < 24 * 60) return diff;
  }
  if (/\btonight\b/.test(t)) return 5 * 60;
  if (/\btoday\b|\bthis afternoon\b|\bthis evening\b/.test(t)) return 4 * 60;
  return null;
}

export function parseStartsInMinutes(t: string, now = Date.now()): number | null {
  const m = /\bin\s+(\d+)\s*(min|mins|minutes|hr|hrs|hour|hours)\b/.exec(t);
  if (m) return m[2].startsWith("h") ? Number(m[1]) * 60 : Number(m[1]);
  const clock = minutesUntilClock(t, AT_RE, now);
  if (clock != null) return /\btomorrow\b|\btmrw\b/.test(t) ? clock + 24 * 60 : clock;
  if (/\btonight\b/.test(t)) return 60;
  if (/\btomorrow\b|\btmrw\b/.test(t)) return 24 * 60;
  return null;
}

export function detectCategory(t: string): PostCategory {
  if (has(t, /\b(lost|found|missing|left (my|a)|someone'?s)\b/) && has(t, /\b(airpods?|wallet|keys?|bottle|phone|laptop|jacket|hoodie|umbrella|id|onecard|card|bag|backpack|calculator|glasses|watch|earbuds)\b/)) return "lost_found";
  if (has(t, /\blost my\b|\bfound (a|an|some|someone)\b/)) return "lost_found";
  if (has(t, /free (food|pizza|donuts|bagels|coffee|snacks|lunch|dinner|breakfast|boba|cookies)|\bleftover\b|\bfree pizza\b/)) return "free_food";
  // Giveaways: furniture and stuff people would otherwise toss, especially at move-out.
  if (has(t, /\bgiving away\b|\bgive away\b|\bgiveaway\b|\bfree to a good home\b|\bcome get it\b|\bmoving out\b|\bfirst come first serve\b|\btake it off my hands\b|\bfree (couch|sofa|chair|desk|fridge|mini ?fridge|microwave|lamp|mattress|shelf|rug|monitor|tv|fan|printer|futon)\b|\banyone want (a|an|my|this|these)\b/) || (has(t, /\b(couch|sofa|futon|mini ?fridge|microwave|mattress|lamp|rug|shelf|bookshelf|desk chair|office chair)\b/) && !has(t, /\bborrow\b|\blend\b/))) return "giveaway";
  if (has(t, /\bride\b|\bcarpool\b|\bdrive me\b|\buber\b|\blyft\b|\blift to\b|\bdriving to\b|\bairport\b|\brdu\b|\bgas money\b|\bgrocery\b/)) return "ride";
  if (has(t, /\btutor(ing)?\b|\bhelp (me )?(with|understand)\b|\bexplain\b|\bhomework\b|\bpset\b|\bproblem set\b|\bexam\b|\bmidterm\b|\bfinal\b/) || SUBJECTS.some(([re]) => re.test(t))) {
    if (has(t, /\bstudy (group|buddy|session|partner)\b|\bstudying\b|\bstudy with\b|\bgrind\b/)) return "study";
    return "tutoring";
  }
  if (has(t, /\bstudy\b|\bstudying\b|\bgrind\b/)) return "study";
  if (has(t, /\bbus\b|\bshuttle\b|\broute\b|\bp2p\b|\btransit\b|\bparking\b/)) return "transit";
  if (has(t, /\bblocked\b|\bclosed\b|\bclosure\b|\bconstruction\b|\bpower outage\b|\bflood(ing|ed)?\b|\bpolice\b|\bsiren\b|\bevacuat/)) return "alert";
  if (has(t, /\bevent\b|\bconcert\b|\bshow\b|\bopen mic\b|\bgame\b|\bmeeting\b|\bclub\b|\bfair\b|\bworkshop\b|\bperformance\b|\btailgate\b|\bwatch party\b/)) return "event";
  if (ITEM_PATTERNS.some((p) => p.re.test(t)) || has(t, /\bborrow\b|\blend\b|\bspare\b|\bextra\b/)) return "borrowing";
  if (has(t, /\bnews\b|\bannounce/)) return "news";
  return "other";
}

export function detectType(t: string, category: PostCategory): ParsedPost["type"] {
  const offerish = has(t, /\bi have\b|\bi've got\b|\bi got\b|\bgot (a|an) (extra|spare)\b|\bi can\b|\bhappy to\b|\bwilling to\b|\boffering\b|\bgiving away\b|\bfound\b|\bif anyone (needs|wants)\b|\banybody (needs|wants)\b|\bfeel free\b|\bcome (grab|get)\b/);
  const requestish = has(t, /\bi need\b|\bneed (a|an|some|help)\b|\blooking for\b|\bdoes anyone\b|\banyone (have|got|has|know|want|wanna|down)\b|\bcan (someone|anyone|anybody)\b|\bcould (someone|anyone)\b|\bhelp me\b|\bwho has\b|\bforgot my\b|\blost my\b|\bany(one|body) selling\b|\bcan i borrow\b|\bwanna\b|\bwant to\b/);
  if (category === "lost_found") return /\bfound\b/.test(t) && !/\blost\b/.test(t) ? "offer" : "request";
  if (category === "free_food") return requestish && !offerish ? "request" : "offer";
  if (category === "ride") return has(t, /\bi(\'m| am)? driving\b|\bhave (a )?(seat|seats|room|space)\b|\bcan (drive|take|give)\b|\boffering a ride\b|\bgot room\b/) ? "offer" : "request";
  if (category === "giveaway") return has(t, /\blooking for\b|\bdoes anyone have\b|\banyone (have|got|giving)\b|\bi need\b|\bneed (a|an)\b|\bi want(ed)? (a|an)\b/) && !offerish && !has(t, /\banyone want\b|\bwho wants\b/) ? "request" : "offer";
  if (category === "alert") return "alert";
  if (category === "event") return has(t, /\banyone (want|wanna|down)\b|\blooking for\b/) ? "request" : "event";
  if (category === "news") return "news";
  if (category === "transit") return requestish ? "request" : "notice";
  if (offerish && !requestish) return "offer";
  if (requestish) return "request";
  if (category === "study") return "offer"; // "studying at Wilson if anyone wants to join"
  return "request";
}

export function detectUrgency(t: string, category: PostCategory): ParsedPost["urgency"] {
  if (has(t, /\burgent\b|\basap\b|\bright now\b|\bemergency\b|\bimmediately\b|\bdying\b|\b\d{1,2}%\b/)) return "urgent";
  if (category === "alert") return "urgent";
  if (has(t, /\brn\b|\bnow\b|\bsoon\b|\btonight\b|\bin (an|\d+) (hour|hr|min)/)) return "soon";
  return "low";
}

function titleFor(type: ParsedPost["type"], category: PostCategory, item: string | null, subject: string | null, locName: string | null, raw: string, dest: string | null = null): string {
  const where = locName ? ` at ${locName}` : "";
  if (category === "lost_found") return `${type === "offer" ? "Found" : "Lost"}: ${item ?? "item"}${where}`;
  if (category === "borrowing") return type === "offer" ? `Spare ${item ?? "item"} available${where}` : `Need a ${item ?? "item"}${where}`;
  if (category === "giveaway") return type === "offer" ? `Free: ${item ?? "item"}${where}` : `Looking for a free ${item ?? "item"}${where}`;
  if (category === "tutoring") return type === "offer" ? `Can help with ${subject ?? "coursework"}${where}` : `Help wanted: ${subject ?? "coursework"}${where}`;
  if (category === "study") return type === "offer" ? `Studying ${subject ?? ""}${where}`.replace(/\s+/g, " ").trim() : `Study buddy for ${subject ?? "class"}${where}`;
  if (category === "free_food") return `Free ${item ?? "food"}${where}`;
  if (category === "ride") return type === "offer" ? `Offering a ride${dest ? ` to ${dest}` : ""}` : `Looking for a ride${dest ? ` to ${dest}` : ""}`;
  if (category === "alert") return `Heads up${where}`;
  if (category === "transit") return `Transit notice${where}`;
  if (category === "event") return raw.length > 60 ? raw.slice(0, 57).trim() + "…" : raw;
  return raw.length > 60 ? raw.slice(0, 57).trim() + "…" : raw;
}

export function parsePostLocal(raw: string, now = Date.now()): ParsedPost {
  const t = raw.toLowerCase().replace(/\s+/g, " ").trim();
  const category = detectCategory(t);
  const type = detectType(t, category);
  const loc = findLocationInText(t);
  const itemHit = ITEM_PATTERNS.find((p) => p.re.test(t));
  const subject = SUBJECTS.find(([re]) => re.test(t))?.[1] ?? null;
  const durationMinutes = parseDurationMinutes(t, now);
  const startsInMinutes = parseStartsInMinutes(t, now);
  const destination = category === "ride" ? parseDestination(t) : null;
  const urgency = detectUrgency(t, category);
  const needsLocation = ["borrowing", "giveaway", "tutoring", "study", "lost_found", "free_food", "alert", "event"].includes(category);
  const missing: ParsedPost["missing"] = [];
  if (needsLocation && !loc) missing.push("location");
  if (category === "ride" && !destination) missing.push("item");
  if ((category === "borrowing" || category === "giveaway") && !itemHit) missing.push("item");
  const noteMatch = /\b(\d+)(st|nd|rd|th) floor\b|\bbasement\b|\bentrance\b|\bfront desk\b|\blobby\b/.exec(t);
  const extra = [itemHit?.item, subject, destination, category.replace("_", " ")].filter(Boolean) as string[];
  const confidence = Math.min(1, 0.45 + (loc ? 0.2 : 0) + (itemHit || subject ? 0.2 : 0) + (durationMinutes ? 0.1 : 0));
  return {
    type,
    category,
    title: titleFor(type, category, itemHit?.item ?? null, subject, loc?.name ?? null, raw.trim(), destination),
    summary: raw.trim().length > 180 ? raw.trim().slice(0, 177) + "…" : raw.trim(),
    keywords: keywordsOf(raw, extra),
    locationId: loc?.id ?? null,
    locationNote: noteMatch ? noteMatch[0] : null,
    item: itemHit?.item ?? null,
    subject,
    powerClass: itemHit?.powerClass ?? null,
    lostOrFound: category === "lost_found" ? (type === "offer" ? "found" : "lost") : null,
    durationMinutes,
    destination,
    startsInMinutes,
    urgency,
    confidence,
    missing,
  };
}

export function interpretQueryLocal(q: string): QueryIntent {
  const t = q.toLowerCase();
  const loc = findLocationInText(t);
  const timeframe: QueryIntent["timeframe"] = /\btonight\b/.test(t) ? "tonight" : /\btoday\b/.test(t) ? "today" : /\bweek(end)?\b/.test(t) ? "week" : /\bnow\b|\brn\b|\bright now\b|\bcurrently\b/.test(t) ? "now" : "any";
  const keywords = keywordsOf(q);
  const intent: QueryIntent["intent"] =
    /\bi (need|have|found|lost|can)\b|\bi (want|wanna|would like) (to )?(borrow|post|make|create|host|throw|hold|start|organize)\b|\bi'?m (giving|offering|hosting|throwing|organizing|looking for)\b|\bcan i post\b|\bpost (this|that|a|an|my|it|something)\b|\b(post|create|make|add|schedule|list|put up|put on|announce)\b[^?]{0,50}\b(event|post|listing|request|offer|party|meetup|meeting|open mic|study|workshop|show|concert|sale|giveaway|board|connect|map)\b|\b(hosting|throwing|organizing|planning)\b[^?]{0,40}\b(party|event|meetup|meeting|session|open mic|show|game|fundraiser|drive|sale|dinner)\b|\bhelp me (post|create|write)\b/.test(t) ? "create_post"
      : /\bfree food\b|\bfood\b|\bpizza\b|\bsnacks?\b|\beat\b/.test(t) ? "food"
      : /\bbus\b|\btransit\b|\broute\b|\bshuttle\b/.test(t) ? "transit"
      : /\balerts?\b|\bsafety\b|\bemergency\b|\bclosed\b|\bclosure\b/.test(t) ? "alerts"
      : /\bnews\b|\bheadlines?\b|\bannouncements?\b/.test(t) ? "news"
      : /\bevents?\b|\bhappening tonight\b|\bshows?\b|\bconcerts?\b|\bgames?\b/.test(t) ? "events"
      : /\bcharger\b|\bcalculator\b|\bborrow\b|\bhelp me\b|\btutor\b|\bcalc\b|\bchem\b|\bphysics\b|\bsomeone who can\b|\bwho can help\b/.test(t) ? (/\bneed(s)? help\b|\brequests?\b|\bwho needs\b/.test(t) ? "find_help" : "find_offers")
      : /\brequests?\b|\bneeds?\b|\bhelp requests?\b/.test(t) ? "find_help"
      : loc ? "near_location"
      : /\bwhat'?s (happening|going on|up)\b|\bhappening\b|\bgoing on\b|\banything\b|\bsummar/.test(t) ? "whats_happening"
      : "unknown";
  const category = detectCategory(t);
  return { intent, locationId: loc?.id ?? null, category: category === "other" ? null : category, timeframe, keywords };
}
