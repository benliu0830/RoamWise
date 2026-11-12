# Interactive maps and completed trips

The existing vanilla JavaScript app, Leaflet 1.9.4, OpenStreetMap tiles and Geoapify routing remain in place. No paid API, account, database or client-visible API key was added. Marker clustering uses the locally bundled MIT-licensed Leaflet.markercluster 1.5.3; its license is copied during the normal build.

## Discovery maps

Category icons, white-edged pins, selected states and compact clusters replace the old marker presentation. Cafes now have their requested amber accent. The collapsible legend, 44-pixel controls, zoom, recenter, fit-results, permission-based location and supported native fullscreen share the app's existing cream/teal style. Resize and fullscreen changes preserve geographic context.

Cards have an explicit Show on map button as well as background selection in map view. Marker selection highlights the associated card and scrolls only the desktop results panel. Marker previews contain category, description, address, reliable opening status, verified imagery or a placeholder, details and favorites. Photo attribution is preserved. Popups reserve space for floating controls.

Filtering reuses the current map and marker objects and removes filtered-out IDs. Duplicate IDs and invalid coordinates do not create extra pins. Entering another city resets the viewport; opening details and returning restores the map context. Map removal disconnects resize/fullscreen listeners. Tile and location failures leave other actions usable.

## Fixed itinerary routes

Desktop uses approximately 35% timeline and 65% map, with independent timeline scrolling. On mobile the map comes first and the timeline is a native collapsible disclosure. Existing place selection and fixed stop order are preserved; no drag-and-drop or trip editing was added.

Routes have a white casing, direction arrows, numbered markers, visited states and a more prominent active leg. Completed segments are muted; the next unvisited stop advances without reordering the itinerary. Timeline legs show the existing estimated duration and explicitly labelled straight-line distance; the active route status reports provider distance and time. Transit remains an external directions flow rather than an invented transit schedule.

Day geometry and active legs are cached by transport and coordinates. Days with more than 12 stops use overlapping bounded routing requests, preserving every stop. The first leg can use a validated origin plus a signed destination. User-supplied places still require their existing server signatures. Stale route responses cannot replace a newer day's map.

## Completion and history

My Itineraries is available from the navigation and at `#itineraries`. Active Trips includes planned and in-progress trips; Completed Trips contains finished snapshots. The existing Saved places and saved-itinerary entry points remain available. Newly generated trips are saved automatically, and the former 30-plan truncation no longer removes travel history.

Complete Trip appears after the final destination on the final nonempty day, including single-day trips. Its confirmation dialog uses the requested wording and supports Cancel/Escape. Some stops may remain unvisited. Only confirmation commits a deep snapshot with `status: completed` and an ISO completion timestamp, preserving destinations, order, schedule, preferences and visited progress.

The plans collection is written before active-trip removal. Failed storage writes leave the active trip unchanged and show an error in the dialog. Repeated completion preserves the existing completed snapshot rather than adding a duplicate. A stale active record cannot reactivate a trip already recorded as completed.

After success the app redirects to My Itineraries, selects Completed Trips and displays the success notice. History cards show city, name, days, destination count and local completion date. Completed trips retain their maps, day tabs, routes, directions and progress, while visited/save/completion controls are removed. Opening or changing days in history does not overwrite the independent active trip.

## Verification

- The complete automated suite covers existing discovery, photography and planning plus immutable completion, duplicate prevention, storage failures, legacy trips, marker reuse, missing coordinates, attribution and signed-origin route validation.
- `npm.cmd run test:maps-history-browser` uses isolated Chrome fixtures for 80-place clustering, card/pin synchronization, popup favorites, category filtering, geolocation denial/success, fullscreen context, day-route caching, 25-stop chunking, transit and routing failure, single-/multi-day completion, cancellation, partial progress, redirect, reload, deduplication and read-only history.
- `npm.cmd run test:itinerary-browser` verifies the existing generation/navigation flow and desktop, tablet, mobile and narrow mobile layouts.
- Live Geoapify checks returned actual walking and driving geometry between retrieved Ottawa locations and a route from a validated origin to the first signed destination.
- Desktop and mobile-width screenshots were visually reviewed; no horizontal overflow was found. Mobile uses Chrome viewport emulation, not physical-device testing.

## Limits

Fullscreen and geolocation depend on browser capabilities and permission. Tiles and live routes require network/provider availability; failures retain markers and external directions. Completed trips are local to the browser/device and can be lost if site storage is cleared. Route geometry is retrieved from the current provider rather than archived permanently. Photo coverage and attribution follow the existing Ottawa/Paris integration.

Alternative Geoapify tile styles were evaluated. The existing OSM tiles were retained to avoid exposing the backend key, adding a tile proxy or consuming additional Geoapify credits. The map UI adds restrained colour treatment while keeping OSM attribution visible.

References: [Leaflet](https://leafletjs.com/reference), [Markercluster 1.5.3](https://github.com/Leaflet/Leaflet.markercluster/tree/v1.5.3), [Geoapify tile attribution](https://apidocs.geoapify.com/docs/maps/map-tiles/).
