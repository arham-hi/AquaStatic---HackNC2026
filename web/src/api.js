// Thin wrapper over the server API. Vite proxies /api to the server in dev.

const json = (r) => (r.ok ? r.json() : r.json().then((e) => Promise.reject(new Error(e.error || r.statusText))));

export const getPosts = (hours = 24) => fetch(`/api/posts?hours=${hours}`).then(json);
export const createPost = (text) =>
  fetch("/api/posts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) }).then(json);
export const getDigest = (hours = 3) => fetch(`/api/digest?hours=${hours}`).then(json);
export const getPlaces = () => fetch("/api/places").then(json);
export const seed = (reset = false) => fetch(`/api/seed${reset ? "?reset=1" : ""}`, { method: "POST" }).then(json);

// Returns an object URL for an MP3, or null if server-side audio is unavailable.
export async function speak(text) {
  const r = await fetch("/api/speak", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
  if (!r.ok) return null;
  return URL.createObjectURL(await r.blob());
}

// Subscribe to live events. Returns an unsubscribe function.
export function subscribe({ onPost, onMatch }) {
  const es = new EventSource("/api/stream");
  es.addEventListener("post", (e) => onPost(JSON.parse(e.data)));
  es.addEventListener("match", (e) => onMatch(JSON.parse(e.data)));
  return () => es.close();
}
