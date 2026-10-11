# Preserving the SQLite data in Tiger Data

The app uses PostgreSQL. The transfer tool copies an existing SQLite database to
an empty Tiger Data service without changing the original SQLite file. Configure
`SQLITE_DATABASE_URL=file:./data/aqua.db` to retain the source path.

Use Node.js 24 and set `TIGER_DATABASE_URL` in your local `.env` to the PostgreSQL
connection URL from Tiger Console, including `sslmode=require`. Never commit it.

Check the service is **Ready**, its host and port match the connection details,
and your network can reach that port. A connection timeout before authentication
can indicate a paused service, incorrect host/port or blocked network access.

Pause writes to the app during the final transfer. First inspect a dry run:

```powershell
npm run db:transfer:tiger -- --dry-run
```

Then transfer into an empty destination:

```powershell
npm run db:transfer:tiger
```

To transfer a particular SQLite file instead of `SQLITE_DATABASE_URL`:

```powershell
npm run db:transfer:tiger -- --source=./data/aqua.db
```

Each run creates a consistent SQLite backup in `data/backups/`, including committed
WAL data. All application tables are transferred in dependency order. Original IDs,
relationships, uniqueness constraints, indexes, timestamps (millisecond precision),
Unicode text, JSON and booleans are preserved. Coordinates and scores use double
precision. SQLite internal/migration bookkeeping is excluded.

DDL, inserts and verification run in one PostgreSQL transaction. Each imported
table is read back and compared with the snapshot using record counts and a hash
of every field. If anything fails, PostgreSQL rolls back. If application tables
already exist, the tool refuses to overwrite them. After a successful import,
an adjacent `*-verified.json` file records the counts and hashes.

The transfer itself leaves the source database and `.env` unchanged. After it succeeds:

```powershell
npm run db:migrate -- --adopt-import
npm run db:tiger:verify
node scripts/use-tiger.mjs
npm run dev
```

The adoption step checks the imported schema, aligns constraint names and registers
the initial PostgreSQL migration without replacing records. The switch script updates
`DATABASE_URL` locally and retains the SQLite path. Restart any existing dev server.
Keep the same `AUTH_SECRET` so existing signed sessions continue to work.

Do not run a demo reset or seed as part of transferring existing data. Audio files
and GTFS caches remain on disk. The verification command checks against the original
snapshot; it is intended before normal app usage changes or expires records.

Future migrations use `npm run db:generate` and `npm run db:migrate`. The legacy
SQLite migration folder is retained but is no longer applied by the app.

Database tests use unique `aqua_test_*` schemas and remove only their own schemas.
Set `TEST_DATABASE_URL`, or provide `TIGER_DATABASE_URL` in `.env`. Tests never reset
the public application tables. Gemini and voice calls are disabled in database tests.

Run the conversion and overwrite-protection checks with:

```powershell
npm run db:transfer:test
```
