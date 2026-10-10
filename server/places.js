// Known campus landmarks. Coordinates are approximate; good enough for pins.
// Add more here and both the AI parser and the fallback parser pick them up.
export const PLACES = {
  "Davis Library": [35.9110, -79.0482],
  "Undergraduate Library": [35.9103, -79.0486],
  "Wilson Library": [35.9095, -79.0488],
  "Student Union": [35.9098, -79.0472],
  "The Pit": [35.9102, -79.0478],
  "Lenoir Dining Hall": [35.9103, -79.0469],
  "Chase Dining Hall": [35.9050, -79.0500],
  "Old Well": [35.9120, -79.0510],
  "Polk Place": [35.9108, -79.0502],
  "Franklin Street": [35.9132, -79.0558],
  "Morehead Planetarium": [35.9139, -79.0517],
  "Sitterson Hall": [35.9095, -79.0530],
  "Phillips Hall": [35.9113, -79.0516],
  "Hamilton Hall": [35.9090, -79.0500],
  "Kenan Stadium": [35.9067, -79.0479],
  "Dean Smith Center": [35.8998, -79.0440],
  "Carmichael Arena": [35.9080, -79.0445],
  "Rams Head": [35.9050, -79.0455],
  "Granville Towers": [35.9123, -79.0580],
};

export const CAMPUS_CENTER = [35.9105, -79.0495];

export const CATEGORIES = ["food", "help", "lost_found", "alert", "event", "transit", "other"];
export const KINDS = ["need", "offer", "info"];

// Aliases so "UL", "the union", "franklin" etc. resolve in the fallback parser.
const ALIASES = {
  "davis": "Davis Library",
  "ul": "Undergraduate Library",
  "undergrad": "Undergraduate Library",
  "wilson": "Wilson Library",
  "union": "Student Union",
  "pit": "The Pit",
  "lenoir": "Lenoir Dining Hall",
  "chase": "Chase Dining Hall",
  "old well": "Old Well",
  "polk": "Polk Place",
  "franklin": "Franklin Street",
  "morehead": "Morehead Planetarium",
  "sitterson": "Sitterson Hall",
  "phillips": "Phillips Hall",
  "hamilton": "Hamilton Hall",
  "kenan": "Kenan Stadium",
  "dean dome": "Dean Smith Center",
  "smith center": "Dean Smith Center",
  "carmichael": "Carmichael Arena",
  "rams": "Rams Head",
  "granville": "Granville Towers",
};

export function findPlace(text) {
  const t = " " + text.toLowerCase() + " ";
  for (const name of Object.keys(PLACES)) if (t.includes(name.toLowerCase())) return name;
  for (const [alias, name] of Object.entries(ALIASES)) {
    // word-boundary match so "ul" doesn't hit "could"
    if (new RegExp(`\\b${alias}\\b`).test(t)) return name;
  }
  return null;
}
