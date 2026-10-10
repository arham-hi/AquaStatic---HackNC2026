import { useState } from "react";
import { createPost } from "./api.js";

const HINTS = [
  "Need a charger at Davis Library",
  "Free pizza in the Pit",
  "Road blocked on Franklin Street",
  "Found AirPods near the Union",
];

export default function Submit() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true); setErr(null);
    try { await createPost(text); setText(""); }
    catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  }

  return (
    <form className="submit" onSubmit={submit}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`What's happening? e.g. "${HINTS[Math.floor(Date.now() / 10000) % HINTS.length]}"`}
        maxLength={500}
        autoFocus
      />
      <button disabled={busy || !text.trim()}>{busy ? "…" : "Post"}</button>
      {err && <div className="error">{err}</div>}
    </form>
  );
}
