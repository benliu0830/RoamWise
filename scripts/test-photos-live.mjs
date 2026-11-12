import assert from 'node:assert/strict';
import { geo, normalize } from '../server/places.js';
import { findPhoto } from '../server/photos.js';

// Opt-in live QA. Keys stay in server-side environment variables. Run with:
// node --env-file-if-exists=.env.local scripts/test-photos-live.mjs
for (const query of [
  'Parliament Hill, Ottawa, Canada',
  'Rideau Canal, Ottawa, Canada',
  'National Gallery of Canada, Ottawa, Canada',
  'Canadian Museum of Nature, Ottawa, Canada',
  'Major Hill Park, Ottawa, Canada',
  'Confederation Park, Ottawa, Canada',
  'Riviera restaurant, Ottawa, Canada',
  'The Ministry of Coffee, Ottawa, Canada'
]) {
  const data = await geo('/v1/geocode/search', {
    text: query,
    type: 'amenity',
    format: 'geojson',
    limit: '1',
    lang: 'en'
  });
  if (!data.features?.length) {
    console.log(`${query}: provider found no place`);
    continue;
  }
  const place = normalize(data.features[0]);
  const photo = await findPhoto(place);
  if (photo) {
    assert(photo.creator && photo.license && photo.sourceUrl);
    const response = await fetch(photo.url, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
    console.log(
      JSON.stringify({
        query,
        retrieved: place.name,
        address: place.address,
        entity: photo.entityId,
        title: photo.title,
        source: photo.sourceUrl,
        license: photo.license,
        imageStatus: response.status
      })
    );
  } else
    console.log(
      JSON.stringify({
        query,
        retrieved: place.name,
        address: place.address,
        wikidata: place.wikidata,
        city: place.city,
        state: place.state,
        lat: place.lat,
        lon: place.lon,
        result: 'Placeholder: no verified photo, or provider unavailable'
      })
    );
}
const branches = await geo('/v2/places', {
  categories: 'catering',
  name: 'Tim Hortons',
  filter: 'circle:-75.93,45.34,6000',
  limit: '15',
  lang: 'en'
});
const branch = (branches.features || []).map(normalize).find((p) => p.address?.includes('March'));
assert(branch, 'Retrieve a specific March Road branch');
console.log(
  JSON.stringify({ name: branch.name, address: branch.address, photo: await findPhoto(branch) })
);
assert.equal(
  await findPhoto({
    id: 'no-photo-live-fixture',
    name: 'Business without Wikimedia identity',
    category: 'food',
    lat: 45.33,
    lon: -75.93
  }),
  null
);
console.log('Business without available images: placeholder confirmed.');
