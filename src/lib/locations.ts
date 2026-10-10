// Campus location registry. Shared by the parser, the map, autocomplete and matching.
// Coordinates come from OpenStreetMap building centroids (approximate to ~20m, good for pins).
// Add a place here and every part of the app picks it up; `npm run setup` syncs it into the DB.

export type LocationCategory = "library" | "dining" | "landmark" | "academic" | "athletics" | "residence" | "street" | "transit" | "student_life";

export type CampusLocation = {
  id: string;
  name: string;
  aliases: string[];
  lat: number;
  lng: number;
  category: LocationCategory;
};

export const CAMPUS_CENTER: [number, number] = [-79.0505, 35.9107]; // [lng, lat]

export const LOCATIONS: CampusLocation[] = [
  { id: "davis-library", name: "Davis Library", aliases: ["davis", "davis lib"], lat: 35.9108, lng: -79.0481, category: "library" },
  { id: "undergraduate-library", name: "R.B. House Undergraduate Library", aliases: ["ul", "undergraduate library", "undergrad library", "undergrad", "house library", "the ul"], lat: 35.9101, lng: -79.0487, category: "library" },
  { id: "wilson-library", name: "Wilson Library", aliases: ["wilson"], lat: 35.9096, lng: -79.0489, category: "library" },
  { id: "health-sciences-library", name: "Health Sciences Library", aliases: ["hsl"], lat: 35.9083, lng: -79.0523, category: "library" },
  { id: "the-pit", name: "The Pit", aliases: ["pit"], lat: 35.9103, lng: -79.0479, category: "student_life" },
  { id: "carolina-union", name: "Carolina Union", aliases: ["union", "student union", "fpg union", "the union"], lat: 35.9102, lng: -79.0474, category: "student_life" },
  { id: "student-stores", name: "UNC Student Stores", aliases: ["student stores", "bookstore"], lat: 35.9105, lng: -79.0484, category: "student_life" },
  { id: "lenoir", name: "Lenoir Dining Hall", aliases: ["lenoir", "top of lenoir"], lat: 35.9104, lng: -79.0469, category: "dining" },
  { id: "chase", name: "Chase Dining Hall", aliases: ["chase"], lat: 35.9050, lng: -79.0501, category: "dining" },
  { id: "rams-head", name: "Rams Head Plaza", aliases: ["rams head", "rams", "rams head dining"], lat: 35.9051, lng: -79.0455, category: "dining" },
  { id: "polk-place", name: "Polk Place", aliases: ["polk", "the quad", "quad"], lat: 35.9108, lng: -79.0503, category: "landmark" },
  { id: "mccorkle-place", name: "McCorkle Place", aliases: ["mccorkle", "upper quad"], lat: 35.9128, lng: -79.0515, category: "landmark" },
  { id: "old-well", name: "Old Well", aliases: ["the well"], lat: 35.9120, lng: -79.0512, category: "landmark" },
  { id: "bell-tower", name: "Morehead-Patterson Bell Tower", aliases: ["bell tower"], lat: 35.9089, lng: -79.0490, category: "landmark" },
  { id: "coker-arboretum", name: "Coker Arboretum", aliases: ["arboretum", "coker"], lat: 35.9138, lng: -79.0488, category: "landmark" },
  { id: "franklin-street", name: "Franklin Street", aliases: ["franklin", "downtown", "e franklin", "east franklin", "west franklin"], lat: 35.9133, lng: -79.0558, category: "street" },
  { id: "top-of-the-hill", name: "Top of the Hill", aliases: ["topo", "top of hill"], lat: 35.9134, lng: -79.0562, category: "street" },
  { id: "south-road", name: "South Road", aliases: ["south rd"], lat: 35.9095, lng: -79.0470, category: "street" },
  { id: "cameron-avenue", name: "Cameron Avenue", aliases: ["cameron ave", "cameron"], lat: 35.9113, lng: -79.0530, category: "street" },
  { id: "morehead-planetarium", name: "Morehead Planetarium", aliases: ["planetarium", "morehead"], lat: 35.9139, lng: -79.0516, category: "landmark" },
  { id: "memorial-hall", name: "Memorial Hall", aliases: ["memorial"], lat: 35.9121, lng: -79.0505, category: "academic" },
  { id: "sitterson-hall", name: "Sitterson Hall", aliases: ["sitterson", "cs building", "brooks building", "fred brooks"], lat: 35.9097, lng: -79.0530, category: "academic" },
  { id: "phillips-hall", name: "Phillips Hall", aliases: ["phillips", "math building"], lat: 35.9113, lng: -79.0517, category: "academic" },
  { id: "chapman-hall", name: "Chapman Hall", aliases: ["chapman"], lat: 35.9112, lng: -79.0527, category: "academic" },
  { id: "hamilton-hall", name: "Hamilton Hall", aliases: ["hamilton"], lat: 35.9097, lng: -79.0497, category: "academic" },
  { id: "greenlaw-hall", name: "Greenlaw Hall", aliases: ["greenlaw"], lat: 35.9113, lng: -79.0493, category: "academic" },
  { id: "dey-hall", name: "Dey Hall", aliases: ["dey"], lat: 35.9113, lng: -79.0498, category: "academic" },
  { id: "murphey-hall", name: "Murphey Hall", aliases: ["murphey"], lat: 35.9113, lng: -79.0486, category: "academic" },
  { id: "carroll-hall", name: "Carroll Hall", aliases: ["carroll", "hussman"], lat: 35.9095, lng: -79.0513, category: "academic" },
  { id: "peabody-hall", name: "Peabody Hall", aliases: ["peabody"], lat: 35.9101, lng: -79.0524, category: "academic" },
  { id: "genome-sciences", name: "Genome Sciences Building", aliases: ["genome", "gsb"], lat: 35.9079, lng: -79.0526, category: "academic" },
  { id: "kenan-flagler", name: "Kenan-Flagler Business School", aliases: ["kenan flagler", "mccoll", "business school", "kfbs"], lat: 35.9033, lng: -79.0463, category: "academic" },
  { id: "campus-y", name: "Campus Y", aliases: ["the y"], lat: 35.9113, lng: -79.0510, category: "student_life" },
  { id: "hanes-art-center", name: "Hanes Art Center", aliases: ["hanes art", "hanes"], lat: 35.9139, lng: -79.0528, category: "academic" },
  { id: "kenan-stadium", name: "Kenan Memorial Stadium", aliases: ["kenan stadium", "kenan", "the stadium", "football stadium"], lat: 35.9069, lng: -79.0479, category: "athletics" },
  { id: "dean-dome", name: "Dean E. Smith Center", aliases: ["dean dome", "smith center", "dean smith center"], lat: 35.8999, lng: -79.0438, category: "athletics" },
  { id: "carmichael-arena", name: "Carmichael Arena", aliases: ["carmichael"], lat: 35.9079, lng: -79.0446, category: "athletics" },
  { id: "src", name: "Student Recreation Center", aliases: ["src", "rec center", "the gym"], lat: 35.9083, lng: -79.0472, category: "athletics" },
  { id: "fetzer-hall", name: "Fetzer Hall", aliases: ["fetzer", "fetzer gym"], lat: 35.9080, lng: -79.0462, category: "athletics" },
  { id: "woollen-gym", name: "Woollen Gym", aliases: ["woollen"], lat: 35.9086, lng: -79.0455, category: "athletics" },
  { id: "hinton-james", name: "Hinton James Residence Hall", aliases: ["hinton james", "hojo"], lat: 35.9028, lng: -79.0433, category: "residence" },
  { id: "ehringhaus", name: "Ehringhaus Residence Hall", aliases: ["ehringhaus", "e-haus", "ehaus"], lat: 35.9035, lng: -79.0416, category: "residence" },
  { id: "craige", name: "Craige Residence Hall", aliases: ["craige"], lat: 35.9035, lng: -79.0449, category: "residence" },
  { id: "granville-towers", name: "Granville Towers", aliases: ["granville"], lat: 35.9122, lng: -79.0583, category: "residence" },
  { id: "cobb", name: "Cobb Residence Hall", aliases: ["cobb"], lat: 35.9120, lng: -79.0466, category: "residence" },
  { id: "varsity-theatre", name: "Varsity Theatre", aliases: ["varsity"], lat: 35.9132, lng: -79.0538, category: "street" },
  { id: "unc-hospitals", name: "UNC Hospitals", aliases: ["hospital", "unc hospital", "medical center"], lat: 35.9044, lng: -79.0514, category: "landmark" },
  { id: "friday-center", name: "Friday Center", aliases: ["friday", "william and ida friday center"], lat: 35.9088, lng: -79.0109, category: "landmark" },
  { id: "student-union-transit", name: "Student Union Bus Stop (South Rd)", aliases: ["union stop", "south road stop", "union bus stop"], lat: 35.9098, lng: -79.0475, category: "transit" },
  { id: "morrison-stop", name: "Morrison Residence Hall Stop", aliases: ["morrison", "morrison stop"], lat: 35.9052, lng: -79.0436, category: "transit" },
];

const BY_ID = new Map(LOCATIONS.map((l) => [l.id, l]));
export const getLocation = (id: string | null | undefined) => (id ? BY_ID.get(id) ?? null : null);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Needle = { loc: CampusLocation; re: RegExp; len: number };
const NEEDLES: Needle[] = LOCATIONS.flatMap((loc) =>
  [loc.name, ...loc.aliases].map((n) => ({ loc, re: new RegExp(`(^|[^a-z0-9])${esc(n.toLowerCase())}(?=$|[^a-z0-9])`, "i"), len: n.length })),
).sort((a, b) => b.len - a.len); // longest alias first so "undergrad library" beats "library"

/** Find the most specific campus location mentioned in free text. */
export function findLocationInText(text: string): CampusLocation | null {
  const t = text.toLowerCase();
  for (const n of NEEDLES) if (n.re.test(t)) return n.loc;
  // generic fallbacks
  if (/\blibrary\b/.test(t)) return BY_ID.get("davis-library") ?? null;
  return null;
}

/** Prefix / substring search for autocomplete. */
export function searchLocations(q: string, limit = 8): CampusLocation[] {
  const s = q.trim().toLowerCase();
  if (!s) return LOCATIONS.slice(0, limit);
  const scored = LOCATIONS.map((l) => {
    const names = [l.name, ...l.aliases].map((x) => x.toLowerCase());
    let score = 0;
    for (const n of names) {
      if (n === s) score = Math.max(score, 3);
      else if (n.startsWith(s)) score = Math.max(score, 2);
      else if (n.includes(s)) score = Math.max(score, 1);
    }
    return { l, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.l.name.localeCompare(b.l.name));
  return scored.slice(0, limit).map((x) => x.l);
}

/** Great-circle distance in meters. */
export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Snap a coordinate to the nearest registry location within `maxMeters`. */
export function nearestLocation(lat: number, lng: number, maxMeters = 150): CampusLocation | null {
  let best: CampusLocation | null = null;
  let bestD = Infinity;
  for (const l of LOCATIONS) {
    const d = distanceMeters(lat, lng, l.lat, l.lng);
    if (d < bestD) { bestD = d; best = l; }
  }
  return bestD <= maxMeters ? best : null;
}
