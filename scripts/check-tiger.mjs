import postgres from 'postgres';

process.loadEnvFile('.env');
if (!process.env.TIGER_DATABASE_URL) throw new Error('Set TIGER_DATABASE_URL in .env');
let sql;
try {
  sql = postgres(process.env.TIGER_DATABASE_URL, { max: 1, connect_timeout: 15 });
  await sql`select 1`;
  const existing = await sql`select tablename from pg_tables where schemaname = 'public'`;
  console.log('Tiger connection verified. Existing public tables:', existing.map(x=>x.tablename).join(', ') || '(none)');
} catch(e) { console.error('Tiger connection failed:', e.code || e.name); process.exitCode = 1; }
finally { await sql?.end(); }
