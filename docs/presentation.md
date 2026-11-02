# Presenting Roamwise

## The idea

Roamwise helps tourists explore a new city and locals find something interesting nearby. The main challenge was combining real place information with AI without letting AI invent businesses or unreliable facts.

## Architecture and languages

The frontend runs in the visitor's browser. HTML gives the app its structure, CSS controls layout and responsive design, and vanilla JavaScript handles forms, navigation, filtering, maps, and saving.

The backend is a set of Node.js functions in `api/`. Vercel runs these functions when requests arrive. Shared code in `server/` handles providers, input validation, signatures, AI, and planning. An Express development server runs the same handlers locally. API keys stay in server environment variables; `.gitignore` excludes `.env.local`.

## APIs

- Geoapify converts city names to coordinates, retrieves real places, fetches details, and supplies walking/driving routes.
- Gemini ranks supplied candidates against the user's interests. A JSON schema constrains its response.
- Open-Meteo provides forecasts. The app checks which dates are available and favors indoor activities when rain is likely.
- Leaflet displays OpenStreetMap tiles, clickable markers, and route geometry. Maps keep the required attribution.

## Keeping AI grounded

The server retrieves candidate places first and signs each normalized record with an HMAC signature. This tamper check prevents a browser from changing a name or supplying a fictional recommendation to the AI and planning endpoints.

Gemini receives compact references to known candidates, with categories, known prices, setting, hours, and preferences. Its output must use unique existing references and allowed reason codes. The server maps those references back to actual Geoapify identifiers. Category-based descriptions keep unverified AI facts out of the interface.

If Gemini fails, deterministic matching uses interests, distance, budget information, and available weather. The application remains useful without AI.

## Itinerary algorithm

Each place has coordinates and a suggested activity duration. The planner works day by day:

1. Start at the search center.
2. Consider nearby remaining places, penalizing poor weather fit and repeated restaurant stops.
3. Estimate travel time and add the suggested visit duration.
4. Check the day's time limit, source-reported entry prices in the budget currency, and simple opening hours when a date is set.
5. Choose a suitable nearby place, remove it from the remaining candidates, and repeat.
6. Continue with the next day. Leave places unscheduled when they do not fit.

This nearest-neighbor heuristic gives a practical route without checking every possible ordering. It does not guarantee the mathematically shortest route. The separate Geoapify map route follows actual paths between selected stops. Schedule times remain estimates. Transit uses actual external directions and a labeled planning buffer, never invented schedules.

## Geolocation

Local Mode requests browser geolocation only after the visitor presses the location button. If permission is denied, the app explains what happened and accepts a manual city search. Geolocation needs HTTPS or localhost.

## Data structures

Objects represent places, preferences, forecasts, days, and stops. Arrays hold results, favorites, candidate pools, schedules, and saved plans. Sets detect duplicate identifiers. Maps cache short-lived provider responses and connect AI references to provider IDs. JSON moves data between browser and backend.

Filtering uses `filter`; ordering uses `sort`; cards and schedules use `map`. URL hash routes support navigation and Back without a frontend framework.

## Local storage

Favorites and saved plans use localStorage and persist after refreshing in the same browser. Search results, drafts, filters, and selected places use sessionStorage. No database or login is required. Storage failures show a clear message.

## Budgets and missing facts

OpenStreetMap prices are source-reported, not independently verified. Missing numeric prices and currencies stay unknown. The planner counts known entry costs in the chosen currency without inventing exchange rates. Meals, fares, and accommodation are not included, so the app does not claim an exact trip total. Only simple hours are checked automatically; complex and holiday rules need venue confirmation.

## Challenges and testing

Live testing found outdated Gemini model names and invalid Geoapify category paths. Compact AI references reduced token usage and response delays. Another challenge was preserving filters between results, details, and plans.

Automated tests cover algorithms, unknown costs, closures, AI failures, candidate tampering, navigation, filtering, details, map markers, saved data, and denied location. Separate live tests search Paris and Ottawa and validate Gemini, forecasts, routes, and plans. Browser-based visual QA remains manual because the automation bridge could not attach during development.

## Demonstration

Search Paris, France for two days. Filter museums, open details, return to the same filter, and save a favorite. Personalize with Gemini, reset filters, build a two-day plan, open Day 2, show directions, and save it.

Then search Ottawa, Canada in Local Mode for three hours with a CAD 30 budget. Generate an outing and point out the time limit, nearby stop order, forecast, and explicit unknown prices.
