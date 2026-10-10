import { useState, useRef } from "react";
import { getDigest, speak } from "./api.js";

export default function Digest() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audio = useRef(null);

  async function load() {
    setBusy(true);
    try { setText((await getDigest(3)).text); }
    finally { setBusy(false); }
  }

  async function play() {
    if (playing) { stop(); return; }
    setPlaying(true);
    const url = await speak(text);
    if (url) {
      audio.current = new Audio(url);
      audio.current.onended = () => setPlaying(false);
      audio.current.play();
    } else {
      // Fallback: browser voice when ElevenLabs isn't configured.
      const u = new SpeechSynthesisUtterance(text);
      u.onend = () => setPlaying(false);
      speechSynthesis.speak(u);
    }
  }

  function stop() {
    audio.current?.pause();
    speechSynthesis.cancel();
    setPlaying(false);
  }

  return (
    <div className="digest">
      <div className="row">
        <button onClick={load} disabled={busy}>{busy ? "Thinking…" : "📻 What's happening right now?"}</button>
        {text && <button onClick={play} className={playing ? "live" : ""}>{playing ? "■ Stop" : "▶ Play"}</button>}
      </div>
      {text && <p>{text}</p>}
    </div>
  );
}
