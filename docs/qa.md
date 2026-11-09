# Current discovery QA - November 9, 2026

This section supersedes the historical records below. No deployment or commit was performed.

- All 18 automated tests pass. Coverage includes city autocomplete/keyboard/debounce, branch identity and distance sorting, local-time/DST/overnight hours, named provider search, alias/translated result names, source-only AI descriptions, legacy saved-plan migration, HMAC integrity, filters/maps, navigation, favorites, and multi-day plans.
- JavaScript syntax checks, Leaflet asset build, and git diff whitespace checks pass.
- Isolated installed Chrome checked actual rendered home, results, branch collection, place details, and itinerary pages at 1440x960, 820x1180, and 390x844. All functional browser assertions pass with zero page JavaScript errors or horizontal overflow. Reduced-motion mode was enabled for stable captures.
- Live Ottawa search found 32 Starbucks branches grouped into one result and 30 restaurants in a food search. Branch counts are provider observations, not complete directory counts. All branch markers, individual branch details, manual origin, transit directions, favorites, itinerary generation, and saved plans passed the browser flow.
- Isolated browser geolocation with explicit synthetic test coordinates correctly ordered the nearest branch first. Alphabetical address ordering and simulated denied-permission fallback passed. No user's actual location or saved browser data was used.
- Paris recommendations put Louvre Museum, Eiffel Tower, and Arc de Triomphe in the first results. A real two-day plan respected daily time limits. Live Tor autocomplete included Toronto. Live Atelier Brancusi named search retained the provider's translated Brancusi's Studio result.
- A live Louvre detail request yielded a 96-word Gemini-organized description with linked Wikipedia attribution and available provider hours. Price fields and external business website actions were absent.
- Independent UI review requested compact address-led branch rows, earlier mobile results, and current design documentation. All three fixes were scored resolved; its ship verdict applies to those scored fixes. Mobile results now begin around y=681 instead of y=1210.
- Category badge text meets at least 4.5:1 calculated contrast against its tint; the coral shade received a small contrast adjustment.
- The mechanical design detector ran once: 214 advisory-only metadata differences, no non-advisory findings. New approved category tokens and patterns were documented. Unrelated pre-existing metadata drift was retained.

Screenshots are in .impeccable/review/. The optional browser test is node scripts/test-browser.mjs. Its tooling is installed outside the app: npm.cmd install --prefix "$env:TEMP/roamwise-browser-qa" --no-package-lock --no-save playwright pngjs. Chrome must be installed. Very tall screenshots use genuine viewport stitching to avoid Chromium's texture limit.

Remaining checks: physical phones/tablets, screen readers, actual OS permission prompts, and current venue/holiday confirmation. Unknown or complex hours remain unverified; sparse sources produce shorter descriptions. Discovery is capped at 80 records; explicit name searches retrieve separately. No visitor ratings or popularity scores are fabricated. Paris landmark retrieval uses editorial search seeds; other cities rely on source relevance and completeness.

API references: [Geoapify Places](https://apidocs.geoapify.com/docs/places/places/), [Geoapify Place Details](https://apidocs.geoapify.com/docs/place-details/), [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output), [Wikimedia REST summaries](https://www.mediawiki.org/wiki/Wikimedia_REST_API).

---

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

## November 6 UI refinement

Refined the homepage hero/search, photographic mode and destination choices, shared typography, place cards, forms, sticky navigation, itinerary readability, and mobile breakpoints. All three destination choices remain visible on phones. The existing 11 tests and syntax checks passed; primary text/button contrast pairs passed 4.5:1 (lowest checked pair 4.84:1). The browser access host remained unavailable, so responsive visual and screenshot verification is still pending. API behavior and provider data handling were not changed.
