import { useEffect, useState } from "react";
import { getPosts, getPlaces, subscribe, seed } from "./api.js";
import Map from "./Map.jsx";
import Submit from "./Submit.jsx";
import Feed from "./Feed.jsx";
import Digest from "./Digest.jsx";

export default function App() {
  const [posts, setPosts] = useState([]);
  const [center, setCenter] = useState(null);
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    getPlaces().then((p) => setCenter(p.center));
    getPosts().then(setPosts);
    return subscribe({
      onPost: (p) => setPosts((prev) => (prev.some((x) => x.id === p.id) ? prev : [p, ...prev])),
      onMatch: ({ a, b }) => {
        setPosts((prev) => prev.map((x) => (x.id === a.id ? { ...x, matched_with: b.id } : x.id === b.id ? { ...x, matched_with: a.id } : x)));
        setToast(`🤝 Match: "${a.title}" ↔ "${b.title}"`);
        setTimeout(() => setToast(null), 6000);
      },
    });
  }, []);

  const pins = posts.filter((p) => p.lat != null && p.lng != null);

  return (
    <div className="app">
      <aside className="panel">
        <header>
          <h1>Pulse</h1>
          <span className="sub">live campus map · UNC Chapel Hill</span>
          <button className="ghost" onClick={() => seed(true)} title="Load demo posts (resets)">Load demo</button>
        </header>
        <Submit />
        <Digest />
        <Feed posts={posts} selected={selected} onSelect={setSelected} />
      </aside>
      <main>
        {center && <Map center={center} pins={pins} selected={selected} onSelect={setSelected} />}
        {toast && <div className="toast">{toast}</div>}
      </main>
    </div>
  );
}
