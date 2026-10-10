import { CATEGORY_COLORS } from "./Map.jsx";

const ago = (iso) => {
  const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
};

export default function Feed({ posts, selected, onSelect }) {
  if (!posts.length) return <div className="empty">No posts yet. Be the first, or hit "Load demo".</div>;
  return (
    <ul className="feed">
      {posts.map((p) => (
        <li key={p.id} className={`post u${p.urgency} ${selected === p.id ? "selected" : ""}`} onClick={() => onSelect(p.id)}>
          <span className="dot" style={{ background: CATEGORY_COLORS[p.category] }} />
          <div className="body">
            <div className="title">{p.title}</div>
            <div className="meta">
              <span className={`kind ${p.kind}`}>{p.kind}</span>
              <span>{p.category.replace("_", " & ")}</span>
              {p.location && <span>📍 {p.location}</span>}
              <span>{ago(p.created_at)}</span>
              {p.matched_with && <span className="match">🤝 matched</span>}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
