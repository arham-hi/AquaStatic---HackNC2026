# Readiness audit — October 11, 2026

The current branch is suitable for a controlled demo after deploying these local changes and checking the production environment. This audit does not establish that the app is bug free or ready for unrestricted public use.

## Verified

- Production compilation, TypeScript, ESLint, and production dependency audit (zero reported vulnerabilities).
- The main automated suite passed 91 tests; an additional long-conversation regression passed with all 18 service tests afterward (92 distinct main-suite cases verified).
- SQLite transfer: 5 tests passed.
- Voice suite: 8 tests passed, including mocked browser interruption and overlapping playback cases. Three speech helper tests also appear in the main suite.
- All 9 Playwright scenarios passed across the initial run and targeted reruns: map, page navigation, two-person post/match/chat flow, station announcements, typed call and station restoration, bus redirect, saved posts, and desktop/mobile layout checks. A case-sensitive bus assertion and a saved-post test that depended on earlier seeding were corrected.
- Desktop and 390 px mobile screenshots of the map, buses, connections, and radio were reviewed. Map tiles load from an external provider and may arrive after the interface and markers.
- The existing public deployment returned HTTP 200 for health, feed, map markers, and transit during this audit. It does not include these uncommitted changes.

Tests use isolated PostgreSQL schemas; they do not reset the public application database.

## Fixes made during the audit

- Simultaneous acceptance now locks the relevant posts and match and commits chat creation and notifications in one transaction. Repeat acceptance is idempotent.
- Long chats return the newest 200 messages in chronological order instead of permanently showing the oldest 200. Reading marks only returned messages as read.
- Live calls send recent context with each request so follow-up questions survive a different server instance.
- Signed sessions validate token structure, issuance time, and the 90-day lifetime.
- Health checks execute a database query and return a safe 503 response on configuration or connection failure.
- Transit and voice caches default to a writable temporary directory on Vercel.
- ElevenLabs requests have timeouts; reserve configuration correctly accepts zero and rejects invalid values.
- Preview build output and generated files are excluded from linting; the build tracing root is explicit.
- Floating map panels have a more opaque background to improve text readability over map labels.

## Remaining work for a public launch

- Accounts currently use guest identities. Verified account ownership and recovery require a separate authentication product decision and implementation.
- Rate limits, live event distribution, and some worker state are process local. Use shared storage or messaging for reliable enforcement and delivery across instances; polling currently provides a fallback for live updates.
- Feed refresh uses background work initiated by readers. A scheduled refresh job is needed for dependable freshness on serverless deployments.
- Gemini and ElevenLabs live generation, paid quotas, and real microphone echo/interruption behavior were not verified with live credentials in this audit. Browser provider mocks and typed calls were tested.
- Bus positions are explicitly simulated, not real-time transit telemetry.
- Map tiles depend on external network access. Mobile Safari, other browsers, keyboard/screen-reader accessibility, and load testing need dedicated coverage before a broad launch.
- The audit is a practical repository review, not a penetration test or a guarantee about every route, concurrency case, or device.

## Deployment check

Deploy the reviewed changes, use a valid PostgreSQL connection URL and authentication secret, and disable demo controls for public production. Verify health, feed, map markers, transit, post creation, matching/chat, and provider availability on that new deployment. Existing deployment checks alone cannot validate changes that have not been deployed.
