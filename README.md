# Aqua Static

**Your campus. In real time.**

Aqua Static is a live 3D map of UNC-Chapel Hill. Students post what they need or can offer in plain English (like "Need a USB-C laptop charger at Davis Library for the next hour"), an AI turns it into a structured post on the map, and a matching engine connects people nearby. An AI radio station narrates what's happening on campus, and real Chapel Hill Transit routes sit on the same map.

Built for HackNC 2026. The design is inspired by Frutiger Aero: glass, gloss, and an optimistic view of the internet.

## What it does

- **Living campus map.** MapLibre GL with OpenFreeMap tiles, 3D buildings extruded from OpenStreetMap heights, category pins, filters, location search, and light/dark themes. Decorative 3D pedestrians walk the footpaths.
- **Aqua Static Radio.** AI-written campus briefings built from stored records (official alerts, UNC events, community posts), voiced with ElevenLabs or browser speech.
- **Ask Aqua Static.** A campus assistant that answers only from stored posts, cites its sources, and says when it doesn't know. It drafts posts but never publishes without confirmation.
- **Transit.** Real Chapel Hill Transit schedule data (22 routes, about 520 stops) with a link to the official live tracker. We do not fake live buses.



## AI usage

### AI inside the product

- **Google Gemini** 
  - *Post parsing:* turns messy student messages into structured, validated posts. We use it because campus requests are informal and nobody wants to fill in a form.
  - *Assistant:* answers questions from our own stored data only, with sources.
  - *Radio scripts:* writes briefings from stored campus records.
  - *Safety:* every Gemini response is validated with Zod, and locations are checked against a campus registry before anything is saved. If no key is set, a deterministic local parser takes over.
- **ElevenLabs** voices the radio host. Browser speech synthesis is the fallback.
- **Not AI:** the matching score is plain, explainable code.

### AI used while building


- **Claude (Anthropic) Devin, and Google Gemini** helped with:
  - Frutiger Aero map styling and the brick 3D building layer 
  - The walking pedestrians layer 
  - Troubleshooting setup errors
  - Integrating the bus routes into the app
- Our team designed the product, made the decisions, and reviewed, tested, and integrated everything.

## Tech stack

Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, Radix UI, Framer Motion, MapLibre GL, OpenFreeMap, Three.js with React Three Fiber, SQLite with Drizzle ORM, Zod, Google Gemini, ElevenLabs, Photon `spectrum-ts` (iMessage worker), Vitest, Playwright.

## Data sources and credits

- Map data: © OpenStreetMap contributors, tiles by OpenFreeMap
- Transit: Chapel Hill Transit GTFS feed
- Campus alerts and events: public UNC feeds

## Known limits

- Bus positions are not live. The app links to the official tracker.
- Pedestrians on the map are decoration, not real people or live data.
- Demo accounts and demo posts are for judging and are labeled DEMO.

## Team

Arhem Hussain Inamdar
Aadee Chheda
Arya Pathare
Nia Spence
