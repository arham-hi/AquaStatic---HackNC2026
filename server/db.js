import pg from "pg";

const url = process.env.DATABASE_URL;
let pool = null;
let mem = []; // in-memory fallback when no DATABASE_URL
let nextId = 1;

export const usingDb = !!url;

export async function init() {
  if (!url) { console.log("No DATABASE_URL: using in-memory store"); return; }
  pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      raw TEXT NOT NULL,
      kind TEXT NOT NULL,
      category TEXT NOT NULL,
      urgency INT NOT NULL,
      title TEXT NOT NULL,
      location TEXT,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      expires_at TIMESTAMPTZ,
      matched_with INT,
      PRIMARY KEY (id, created_at)
    );
  `);
  try { await pool.query(`SELECT create_hypertable('posts', 'created_at', if_not_exists => TRUE)`); }
  catch (e) { console.warn("Not a Timescale DB (hypertable skipped):", e.message); }
  console.log("Connected to Postgres");
}

export async function insertPost(p) {
  if (!pool) {
    const row = { id: nextId++, created_at: new Date(), matched_with: null, ...p };
    mem.push(row);
    return row;
  }
  const { rows } = await pool.query(
    `INSERT INTO posts (raw, kind, category, urgency, title, location, lat, lng, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [p.raw, p.kind, p.category, p.urgency, p.title, p.location, p.lat, p.lng, p.expires_at]
  );
  return rows[0];
}

// Live posts: not expired, newest first.
export async function livePosts(hours = 24) {
  const since = new Date(Date.now() - hours * 3600000);
  if (!pool) {
    return mem.filter((p) => p.created_at > since && (!p.expires_at || p.expires_at > new Date()))
      .sort((a, b) => b.created_at - a.created_at);
  }
  const { rows } = await pool.query(
    `SELECT * FROM posts WHERE created_at > $1 AND (expires_at IS NULL OR expires_at > now()) ORDER BY created_at DESC`,
    [since]
  );
  return rows;
}

export async function setMatch(a, b) {
  if (!pool) {
    const ra = mem.find((p) => p.id === a), rb = mem.find((p) => p.id === b);
    if (ra) ra.matched_with = b;
    if (rb) rb.matched_with = a;
    return;
  }
  await pool.query(`UPDATE posts SET matched_with = $2 WHERE id = $1`, [a, b]);
  await pool.query(`UPDATE posts SET matched_with = $2 WHERE id = $1`, [b, a]);
}

export async function clearAll() {
  if (!pool) { mem = []; nextId = 1; return; }
  await pool.query(`DELETE FROM posts`);
}
