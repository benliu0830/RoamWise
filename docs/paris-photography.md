# Paris photography

Paris, France now uses the existing free Wikimedia integration alongside Ottawa. Other cities remain excluded. No account, new API key, paid image service, or rebuilt site is required.

## Retrieved coverage

The collection checked **105 Paris location records** from the website's discovery results and additional attractions/businesses. It found **62 distinct photographs**, covering **63 checked records**. The catalogue stores 67 variants, including English geocoding and French detailed-place names for the same locations. **42 checked records remain unresolved** and retain placeholders.

Examples include the Eiffel Tower, Louvre, Arc de Triomphe, Notre-Dame cathedral, Sainte-Chapelle, Sacre-Coeur, Orsay, Palais Garnier, Pantheon, Invalides, Rodin Museum, Orangerie, Carnavalet, Luxembourg Garden, Parc Monceau, Buttes-Chaumont, Moulin Rouge, Les Deux Magots, theatres, markets, historic buildings and smaller gardens. The Paris homepage destination image is also enabled.

- [Retrieved photos, identities, sources and attribution](../server/data/paris-photos.json)
- [Unresolved records with exact addresses and coordinates](paris-photo-coverage.json)

The records are actual provider locations, not an exhaustive inventory of every place in Paris. A record named Pere Lachaise refers to the retrieved metro station; it is never reused for the separate cemetery record, which remains unresolved. Similarly, the Virgin of Paris statue and Notre-Dame cathedral are separate identities.

## Matching and efficiency

French country/region evidence and Paris coordinates are required before any cache or Wikimedia lookup. Names and provider-linked article titles are checked against Wikimedia labels and aliases. Local-language provider names are retained. Business branches continue to require numbered street-address and coordinate evidence; restaurant imagery is not shared between branches.

French address normalization handles commas after house numbers, postal/locality suffixes and numbers written after the street. For landmarks, known square-name forms can agree while retaining the exact number: Notre-Dame's Place du Parvis de Notre-Dame 6 matches 6 Parvis Notre-Dame - Place Jean-Paul II. This normalization does not discard business branch numbers.

When geocoding omits Wikimedia metadata, the resolver requests the same provider place's full details first. It accepts enrichment only inside the same supported city and within 100 metres of the original point. This recovered Notre-Dame's exact cathedral ID rather than matching a similarly named place. Incomplete details or API failures still fall back safely.

Photos retain all existing attribution, license checks, viewpoint filtering, lazy loading, request deduplication and rate limiting. The Paris catalogue uses the same 24-hour metadata lifetime as Ottawa; fresh exact matches require no upstream API request. Batch retrieval limits maintenance requests. Run `npm.cmd run photos:paris` to refresh the catalogue.

## Verification

The initial 57 selected image URLs loaded successfully in Chrome and were visually inspected together. Additional recovered park, museum and cathedral images are checked separately. Tests cover Paris versus similarly named foreign locations, French address forms, wrong branch numbers, local-language details enrichment, catalogue reuse and existing Ottawa functionality. Desktop/mobile checks verify loaded images, attribution and saved-place reuse. No photo coverage is claimed for records that remain placeholders.
