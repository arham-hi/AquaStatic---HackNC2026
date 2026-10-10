// Demo posts. The running server exposes them via POST /api/seed (so clients see them live).
// With a real DATABASE_URL you can also preload directly:  npm run seed  [-- --reset]
import "dotenv/config";

export const SAMPLES = [
  "Need a laptop charger at Davis Library, 3rd floor, USB-C",
  "Free pizza in the Pit from the CS club, come quick",
  "Road blocked on Franklin Street near Top of the Hill, construction",
  "Can someone help me with Calc 2 tonight? I'm at the UL",
  "Found a black water bottle outside Sitterson Hall",
  "Lost my AirPods somewhere near the Student Union",
  "I have a spare USB-C charger at Davis Library if anyone needs it",
  "I can tutor Calc 2 at the UL around 7pm",
  "P2P bus is running 15 minutes late",
  "Open mic night at the Student Union at 8pm",
];

if (process.argv[1]?.endsWith("seed.js")) {
  const db = await import("./db.js");
  const { parsePost, findMatch } = await import("./ai.js");
  await db.init();
  if (!db.usingDb) { console.log("No DATABASE_URL. Start the server and POST /api/seed instead."); process.exit(1); }
  if (process.argv.includes("--reset")) await db.clearAll();
  for (const text of SAMPLES) {
    const post = await db.insertPost(await parsePost(text));
    const m = findMatch(post, await db.livePosts(6));
    if (m) await db.setMatch(post.id, m.id);
    console.log(`${post.kind.padEnd(5)} ${post.category.padEnd(10)} u${post.urgency} ${post.title}${m ? "  <-> matched #" + m.id : ""}`);
  }
  process.exit(0);
}
