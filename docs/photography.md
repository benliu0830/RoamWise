# Location photography: Ottawa and Paris

Photo retrieval covers Ottawa, Ontario, Canada (including amalgamated localities such as Kanata and Nepean) and Paris, France. The Paris catalogue is documented in [Paris photography](paris-photography.md). Other city searches, saved places, maps and itinerary features remain available, with photo placeholders. No new key, account, payment information or paid service is needed.

## Scope and matching

The browser and server both require consistent Ottawa locality, Ontario and Canada evidence plus plausible Ottawa coordinates before reading photo caches or requesting Wikimedia metadata. The coordinate envelope is a sanity check alongside signed administrative evidence, not a municipal boundary or proximity-based identity. Gatineau and cities outside the two supported regions are excluded. Paris requires French administrative evidence and Paris coordinates, including checks against similarly named places in Canada and the United States. The earlier multi-city browser cache is no longer used.

A Wikimedia entity must match the place name, an alias, or the title of its provider-linked Wikipedia article. Harmless building/sculpture suffixes and the Ottawa article qualifier are normalized only for linked identities. Attractions must be within 500 metres of their identified entity. Numbered addresses, when available on both sides, must agree. A provider's unnumbered street or neighbourhood is insufficient to reject an otherwise exact landmark identity. Long features such as the Rideau Canal can remain placeholders if the provider coordinate identifies a different segment.

Businesses require a matching numbered street address, one coordinate within 80 metres, and no brand/headquarters ambiguity. Independent businesses can match through a unique name, address and coordinates. When an entity match is unavailable, a Commons file can qualify only if its title identifies the business, its metadata states the same numbered street address, and its camera coordinates are within 150 metres. A chain name or nearby camera position alone never qualifies. Shopping malls and marketplaces use landmark matching rather than restaurant-branch rules. Address and administrative changes are part of the cache identity. These checks rely on provider and Wikimedia metadata, not visual recognition.

Preferred-rank Wikidata P18 photographs come first. Additional Commons candidates require structured depicts metadata or a direct P373 Commons category link from the already verified entity. Category lookups stay within that exact category, require a subject-led filename and never descend into subcategories. A photograph of a landmark taken FROM a park does not establish a photograph OF the park: the original Major's Hill Park candidate showed Chateau Laurier and is now rejected.

## Licensing and presentation

Only sufficiently large JPEG, PNG and WebP files qualify. Obvious maps, diagrams, logos, flags and drawings are rejected. The license allowlist accepts CC BY, CC BY-SA, CC0 and public domain with supporting licensing information and no reported restrictions. Public-domain files without external license URLs must explicitly declare a public-domain license and no copyright; their own Commons licensing declaration is linked, without calling it CC0.

Each photo displays its creator, license and Commons source. Expand Photo credits for additional attribution, copyright notices and validated attribution links. Provider HTML is converted to escaped text. The display notes cropping. Unknown, ambiguous, restricted, missing or broken photos use the existing category-coloured placeholders. Decorative form inspiration remains explicitly labelled.

## Efficiency

IntersectionObserver delays requests until photos approach the viewport, with at most two client lookups active. Detached views lose their queued requests. The server serializes Wikimedia requests with 1.1 seconds between requests, deduplicates in-flight work and bounds its caches to 500 entries. Metadata and successful photos cache for 24 hours; missing matches cache for one hour on the server; errors cache for one minute. Browser misses retry after a minute using the server cache. HTTP 429/503 and maxlag trigger cooldowns; Retry-After numeric and date forms are supported. No rapid retry loop is used.

The identifying User-Agent includes the project repository. Optionally set WIKIMEDIA_USER_AGENT to a deployed app URL and maintainer contact. Caches and request queues are instance-local; a high-traffic multi-instance deployment would need a shared limiter/cache.

## Ottawa catalogue coverage - November 11, 2026

The collection checked 92 Ottawa location records and retrieved photos for 44 records (43 distinct names; 42 distinct image files). The remaining 48 records keep placeholders. This covers the current discovery pool and additional attractions/businesses, not every location in the city. See [the exact unresolved-location list](ottawa-photo-coverage.json) and [the photo catalogue with sources and credits](../server/data/ottawa-photos.json).

Batch retrieval and broader verified matching recovered Major's Hill Park, the War Museum, Aviation and Space Museum, ByWard Market, Rideau Centre, shopping centres, and a verified Bier Markt branch. Visual QA replaced a plaque close-up at Billings Estate, a construction photo at Lansdowne, a War Museum event/person photo, and an old London display of the National War Memorial. Thumbnail/source image loading was checked in Chrome, including original-size images for ByWard Market and Rideau Centre.

## Earlier Ottawa verification

Live Geoapify records and Wikimedia lookups returned credited photographs with HTTP 200 thumbnails for Parliament Hill, National Gallery of Canada, Canadian Museum of Nature, and a monument within Confederation Park.

These retrieved records remain placeholders under the conservative matching policy:

- Major's Hill Park: now has a verified park photograph from its exact Commons category; the misleading viewpoint photo remains rejected.
- Riviera, 62 Sparks Street: no verified exact business photo selected.
- The Ministry of Coffee, 141 Laurier Avenue West: no verified exact branch photo selected.
- Tim Hortons, 406 March Road: brand identity only; no verified branch photo selected.
- Rideau Canal: broad geocoding record in the K4M area does not match the downtown Ottawa entity coordinate.

These are unresolved matches, not claims that no photographs exist anywhere. Offline tests cover Ottawa exclusions before requests/cache use, names, coordinates, conflicting addresses, wrong branches, licensing, attribution, viewpoint rejection, deduplication, saved-view reuse, lazy loading, failures and cooldowns. Existing discovery, favorites, maps and itinerary tests remain intact.

Headless Chrome checks at desktop 1440 x 960 and mobile width 390 x 844 confirmed zero photo requests for the other featured cities, a loaded National Gallery photo, and cached reuse after saving it. The visual check exposed an existing card crop that hid attribution; the crop now applies to the photo alone. Browser geometry checks confirm both visible credits and expanded notices fit within the image area without being clipped or covered, with no horizontal overflow. Mobile testing used an emulated viewport, not a physical phone.

The bundled server/data/ottawa-photos.json catalogue stores retrieved metadata and attribution so fresh exact matches need no upstream requests. Entries expire after 24 hours and fall back to the live resolver. Run npm.cmd run photos:ottawa to refresh it using bounded batch entity/image requests. The collection checks current Ottawa discovery results plus major attractions and iconic businesses; it is not an enumeration of every business in the municipality. Unmatched records are recorded in docs/ottawa-photo-coverage.json and the local QA directory. No signatures or credentials are written to the catalogue.

Run npm.cmd test, npm.cmd run check and npm.cmd run build. The opt-in live script queries Ottawa only: node --env-file-if-exists=.env.local scripts/test-photos-live.mjs. Credentials stay server-side and are never printed.

Mapillary remains disabled. A future storefront integration would need an application token and explicit visual verification of signage, street number and address before treating a street-level frame as a branch photograph.
