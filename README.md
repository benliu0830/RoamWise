# Roamwise

A real travel discovery app with Tourist and Local modes, built for a Grade 12 Computer Science project. HTML, CSS, vanilla JavaScript, and Node.js; no framework, login, database, or frontend API keys.

## Run locally on Windows

Requirements: Node.js 24, npm, Gemini and Geoapify keys.

1. Install dependencies with `npm.cmd install`.
2. Copy `.env.example` to `.env.local` if needed. Enter your keys directly in that file:

   ```dotenv
   GEMINI_API_KEY=your_key_here
   GEOAPIFY_API_KEY=your_key_here
   ```

   Never paste keys into chat, browser code, or a commit. `.env.local` is ignored by Git.

3. Run `npm.cmd run build` to prepare locally hosted Leaflet assets.
4. Run `npm.cmd run dev`.
5. Open **http://localhost:3000**. Stop with Ctrl+C. Restart after editing `.env.local`.

Use `npm.cmd` if PowerShell blocks `npm.ps1`. No execution-policy change is needed.

## Working features

- Minimalist homepage with live city autocomplete, popular destination inspiration cards, Tourist Mode, and Nearby discovery. Tourist and Personal (local) forms keep manual search available when location is denied.
- Real Geoapify discovery, interests, radius, live place-name search, branch groups, category/distance/opening-hours/setting filters, sorting, details, preserved Back navigation, and map markers.
- Gemini personalization restricted to signed retrieved candidates, with structured response validation and deterministic fallback.
- Local and up to 14-day tourist plans from explicitly selected places. Geographic ordering, suggested durations, time constraints, and supported simple opening-hour checks, without monetary constraints.
- Leaflet maps, Geoapify walking/driving routes, individual/day directions, and external actual transit directions.
- Open-Meteo forecasts with date-range handling and rain-aware indoor matching.
- Three-step itinerary flow: choose saved or previously selected places, set trip duration and transport, then view a read-only multi-day map and timeline containing every selected place exactly once.
- Persistent visited progress, transport preferences, and place selections in localStorage. Route segments can be highlighted on demand; visited places stay in trip history.
- Persistent favorites and saved plans, preserved filters, and saved drafts.
- Loading, empty, provider-error, rate-limit, location-denied, tile-error, and browser-storage-error states.

## Honest data and practical limits

Provider records supply place facts. Gemini cannot introduce places or replace addresses, names, or hours. Normalized records have server-generated HMAC signatures, checked by AI, details, routing, and planning endpoints.

Place details use retrieved provider facts and, when linked by the provider, Wikipedia summaries. Gemini organizes source sentences; it cannot add factual prose. Brief source information stays brief rather than being padded with invented facts.

Schedules and activity durations are estimates. Every explicitly selected place appears once; tight hours and opening-hour gaps are explained in the plan rather than dropping destinations. A separate Geoapify route follows actual paths between selected stops; individual walking/driving legs are requested when a user highlights one. Transit uses external directions and never invented transit times. Only supported opening-hour rules are checked when a date is supplied; confirm complex rules and holidays with venues. Suggested schedules start at 09:00, rather than claiming live venue availability.

Category photos are labeled and do not depict each recommended venue. Provider-linked images appear when available. Selections, active trip progress, favorites, and saved plans persist in this browser's localStorage; discovery results use sessionStorage. Clearing browser data removes saved items. Provider caches and rate guards are instance-local.

Opening status uses the destination time zone. Irregular schedules remain unverified; hours filters exclude them. Branch counts cover discovered records inside the selected radius, not a complete directory. Recommended ordering uses query relevance, source completeness, proximity, and editorial landmark retrieval; no visitor ratings or popularity scores are inferred.

## Structure

- `public/`: static HTML, CSS, modular browser JavaScript, and assets. This is the only frontend web root.
- `api/`: Vercel JavaScript Functions, also mounted by the local server.
- `server/`: providers, input validation, signatures, AI, weather, and planning.
- `scripts/`: development server, dependency asset preparation, syntax and live checks.
- `tests/`: server/algorithm tests and jsdom workflow tests. Synthetic fixtures never ship as recommendations.
- `docs/`: architecture, presentation support, deployment instructions, and QA record.

## Commands

Interactive maps now include clustered category pins, synchronized card selection, richer previews, floating controls and fixed-itinerary route states. **My Itineraries** includes Active Trips and persistent read-only Completed Trips. See [maps and trip history](docs/maps-and-trip-history.md) for behaviour, verification and limitations.

Location photography currently covers Ottawa, Ontario, Canada and Paris, France, using free Wikimedia Commons/Wikidata metadata with exact-place checks, per-file attribution, lazy loading and category placeholders. Other cities retain working searches with image placeholders. No new key or paid service is needed. See [photography matching, licensing and verification](docs/photography.md) for coverage, configuration and optional future Mapillary support.

- `npm.cmd run dev`: backend file watching and local server.
- `npm.cmd start`: server without watching.
- `npm.cmd run build`: prepare Leaflet distribution files and license.
- `npm.cmd run check`: JavaScript syntax checks.
- `npm.cmd test`: offline server/algorithm and DOM workflow tests.
- `npm.cmd run photos:paris`: retrieve and cache verified photos for Paris recommendations, attractions, parks, museums and businesses.
- `npm.cmd run photos:ottawa`: retrieve and cache verified photos for the Ottawa discovery catalogue (uses existing Geoapify configuration; no new keys).
- `npm.cmd run test:itinerary-browser`: isolated Chrome itinerary flow with mocked place and route responses; does not use provider quota.
- `npm.cmd run test:live`: real Paris/Ottawa searches, Gemini, weather, details, routes, and invalid requests. Requires the local server and consumes provider quota.
- `npm.cmd run format`: format the project source.

## Verification and deployment

Live tests passed: Paris returned 80 actual places and a two-day plan; Ottawa returned 42 places and a three-hour outing. Gemini selected 20 validated candidate IDs. Walking routes and 16-day forecast responses loaded.

Browser automation could not attach in this development session. DOM tests use actual Leaflet code but do not verify visual layout, tile rendering, or a real permission prompt. Complete the manual desktop/mobile checks before publication.

- [Presentation notes](docs/presentation.md)
- [Architecture](docs/architecture.md)
- [Deployment instructions](docs/deployment.md)
- [QA record](docs/qa.md)

Existing Git remote: `https://github.com/benliu0830/YourSpot.git`. No commit, push, or publication was performed. Vercel configuration is included; enter both production environment variables directly in Vercel. Publishing requires user approval.

References: [Geoapify](https://apidocs.geoapify.com/), [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), [Open-Meteo](https://open-meteo.com/en/docs), [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js).
