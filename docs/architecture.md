# Roamwise architecture and implementation plan

## Current status

The essential application is implemented and runs locally. Live Paris and Ottawa searches, Gemini candidate selection, details, routes, and forecasts passed integration checks. Automated DOM and server tests cover main flows and failure cases. Browser automation was unavailable; visual and real-device QA remains a manual deployment check.

## Application

- `public/`: static HTML, CSS, browser JavaScript, and public image assets. This is the only directory served as frontend content.
- `public/js/`: separate modules for navigation, forms, API requests, cards, Leaflet maps, favorites, and saved itineraries.
- `api/`: JavaScript Vercel Functions. The browser calls these same-origin endpoints instead of calling secret-bearing provider URLs.
- `server/`: shared, server-only configuration, provider clients, validation, and itinerary planning logic.
- `scripts/`: a Windows-compatible local development server, browser dependency preparation, and syntax checking.
- `tests/`: meaningful algorithm and API validation tests added with the implementation.

## Data flow

1. A visitor chooses tourist or local mode and supplies preferences.
2. A backend function geocodes a destination and fetches real candidate places from Geoapify.
3. Server code normalizes provider records and preserves missing prices/hours as unknown.
4. Gemini receives a bounded set of real place identifiers and structured preferences. Server validation rejects unknown identifiers and invalid output.
5. A deterministic geographic planner groups nearby stops and orders them while respecting time limits; it also works without Gemini.
6. The browser renders recommendations, details, maps, and plans. Favorites and saved itineraries persist in localStorage.

Open-Meteo provides forecasts within its available date range. Routing uses supported walking/driving data; public transportation uses external directions rather than invented schedules. Place-specific photos will require reliable source metadata; generic category photography must be labeled accordingly.

## Delivery phases

1. Essential views, destination search, real places, details, and navigation.
2. Gemini personalization, Leaflet maps, and geographic itinerary generation.
3. Weather, explicit budget uncertainty, favorites, and responsive visual polish.
4. API and browser QA, presentation notes, GitHub preparation, and Vercel deployment preparation.

Each phase must leave the application runnable. Publishing requires the user's approval.
