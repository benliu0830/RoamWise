# GitHub and Vercel deployment

No commit, push, Vercel project connection, or publication was performed. Publishing requires user approval.

## Before publication

- Run `npm.cmd run check`, `npm.cmd test`, and `npm.cmd run build`.
- With the server running, run `npm.cmd run test:live`. This uses real API quota.
- Manually check desktop and mobile widths: images, maps, keyboard access, geolocation permission, directions, and saved items after refresh. DOM tests do not verify visual layout or browser permission prompts.
- Verify `git check-ignore .env.local`. Never commit secret files or logs containing credentials.

## GitHub

The existing remote is `https://github.com/benliu0830/YourSpot.git`. Confirm this is the intended repository. Use GitHub's browser/device authentication or Git Credential Manager. Review source and lockfile changes before committing and pushing. Generated `public/vendor/` assets remain ignored; the build recreates them from Leaflet.

## Vercel

1. Sign in and import the approved GitHub repository, granting access to that repository.
2. Use the repository root, framework preset **Other**, build command `npm run build`, and output directory `public`. These settings are in `vercel.json`.
3. Use Node.js 24.x. JavaScript functions live in `api/`. Hash navigation needs no SPA rewrite.
4. Enter `GEMINI_API_KEY` and `GEOAPIFY_API_KEY` directly in Vercel's project environment-variable settings for the needed Preview and Production environments. Never paste keys into chat or public-prefixed variables.
5. Ensure provider restrictions permit server-side requests; browser-referrer-only restrictions do not authorize Node.js calls.
6. Obtain publication approval, deploy, and verify the HTTPS URL. Environment changes require redeployment.

## Verification

Check `/api/health`, Paris and Ottawa searches, Gemini personalization, details/back, favorites after refresh, two-day plans, day routes, local outings, and forecasts outside the available range. Transit directions open external actual service information. Denied geolocation must still permit a manual city search.

Rate guards and caches are instance-local. For significant public traffic, configure Vercel firewall/rate protections and provider quotas. There is no database or distributed cache.

References: [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js), [Vercel environment variables](https://vercel.com/docs/environment-variables), [Geoapify docs](https://apidocs.geoapify.com/), [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output).
