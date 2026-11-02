# Roamwise QA record

Date: October 31, 2026. Local URL: http://localhost:3000

## Passed automated checks

`npm.cmd run check` passed JavaScript syntax checking. `npm.cmd run build` prepared Leaflet JavaScript, CSS, marker assets, and license. npm dependency installation reported zero known vulnerabilities.

`npm.cmd test` passed 11 tests, including a broad jsdom workflow test with real Leaflet code. Covered:

- Tourist form, results, text/category filters, empty filtered results, and reset.
- Place details with missing prices/hours and Back preserving filters.
- Favorite persistence, saved-plan persistence after reconstructing browser storage, and saved-item navigation.
- Leaflet marker construction and map switching.
- Two-day plan generation, removable stops, and saved plans.
- Local manual search, denied geolocation fallback, invalid city handling, and a short selected-place outing.
- A delayed old Gemini response cannot overwrite a newer city's results.
- Candidate signatures reject tampering, fabricated records, and duplicates.
- AI output rejects unknown/repeated references and invalid reason codes.
- Gemini quota and malformed-response fallback; safe provider errors.
- Geographic stop order, unique stops, daily time limits, budgets, unknown costs, simple closure rules, and transit buffers.
- Explicit Sunday closures override general weekly hours; malformed times stay unverified.
- Forecasts outside available dates are not invented.
- HTTP method, cross-origin request, and rate-limit handling.

## Passed live provider checks

`npm.cmd run test:live` tested actual services through the local backend:

- Paris, France: 80 actual places across multiple categories; two-day plan with 5 stops on each day; 16 forecast days; details and walking route.
- Gemini: 20 selections mapped to actual retrieved provider IDs, with structured output validation.
- Geoapify driving route between real retrieved stops.
- Ottawa, Canada: 42 places for nature, food, and museum interests; a three-hour local plan with 2 stops; 16 forecast days; details and walking route.
- Indoor-only Ottawa search returns only category-matched indoor candidates.
- A small-radius food search at ocean coordinates returns an empty list without fabricated recommendations.
- Invalid destination, invalid coordinates, tampered candidate, and private-file HTTP requests fail safely.

Counts are observations from this run, not guarantees about future provider data or availability.

## Security and serving

Both environment variables were confirmed configured without printing values. A scan of commit-eligible files found no configured key values. `.env.local` is ignored by Git. The server serves only `public/`; requests for `.env.local`, server source, and package metadata returned 404. Homepage, frontend modules/styles, Leaflet, font, image, favicon, and health endpoint returned HTTP 200.

## Source review

An independent finish review checked validation, signatures, safe errors, storage, form labels/control names, focus/status behavior, and reduced-motion support. Reported closure handling, map Back navigation, favorites-only builder, and stale personalization issues were fixed. The reviewer confirmed those source fixes. Small CSS text was raised to at least 11px after a mechanical design scan.

## Verification limits and manual checklist

The available browser automation bridge could not attach to Windows Chrome and stopped computer-use input. No visual, screenshot, real-device, or screen-reader approval is claimed. Automated DOM tests cannot prove responsive layout, real map tiles, external directions pages, or the actual browser permission prompt.

Before publishing, manually check:

- Desktop and mobile widths, image crops, spacing, overflow, nav menu, and touch targets.
- Real map tile rendering, zoom/pan, marker popups, and day route lines.
- Actual geolocation success/denial and manual fallback.
- External walking/driving/transit directions and official website links.
- Keyboard focus and announcements in a real browser/screen reader.
- Favorites and plans after a real browser refresh.

No commit, push, or deployment has been performed. See deployment.md for the publication steps and environment-variable setup.
