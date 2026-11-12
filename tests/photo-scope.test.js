import test from 'node:test';
import assert from 'node:assert/strict';
import { isOttawaPhotoPlace, photoIdentity } from '../public/js/photo-scope.js';
import { findPhoto, matchesEntity, matchesAddress } from '../server/photos.js';

const p = {
  name: 'Parliament Hill',
  lat: 45.4248,
  lon: -75.699,
  city: 'Ottawa',
  state: 'Ontario',
  country: 'Canada',
  address: 'Wellington Street, Ottawa, ON, Canada'
};
const claim = (value) => ({ mainsnak: { datavalue: { value } } });
test('Ottawa scope requires consistent administrative and geographic evidence', () => {
  assert(isOttawaPhotoPlace(p));
  assert(isOttawaPhotoPlace({ ...p, city: 'Kanata', lat: 45.338, lon: -75.912 }));
  assert(isOttawaPhotoPlace({ ...p, city: undefined, state: undefined, country: undefined }));
  for (const change of [
    { city: 'Gatineau' },
    { state: 'Quebec' },
    { country: 'United States' },
    { lat: 43.65, lon: -79.38 },
    { city: undefined, address: 'Unknown', state: undefined, country: undefined }
  ])
    assert(!isOttawaPhotoPlace({ ...p, ...change }));
});
test('excluded cities never issue Wikimedia requests, even with valid-looking identity links', async () => {
  const original = fetch;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    throw new Error('Must not fetch');
  };
  try {
    for (const place of [
      { ...p, city: 'Gatineau' },
      { ...p, city: 'Toronto', lat: 43.65, lon: -79.38 },
      { ...p, city: 'Paris', lat: 48.85, lon: 2.35 }
    ])
      assert.equal(await findPhoto({ ...place, wikidata: 'Q1589289' }), null);
    assert.equal(calls, 0);
  } finally {
    global.fetch = original;
  }
});
test('Ottawa branch addresses and names must match even with a provider identifier', () => {
  const branch = {
    ...p,
    name: 'Cafe Fixture',
    category: 'cafes',
    address: '406 March Road, Ottawa, ON, Canada'
  };
  const entity = {
    id: 'Q123',
    labels: { en: { value: branch.name } },
    claims: {
      P625: [claim({ latitude: p.lat, longitude: p.lon })],
      P6375: [claim({ text: '406 March Rd', language: 'en' })]
    }
  };
  assert(matchesEntity(branch, entity, true));
  assert(
    !matchesEntity({ ...branch, address: '404 March Road, Ottawa, ON, Canada' }, entity, true)
  );
  assert(!matchesEntity({ ...branch, name: 'Other cafe' }, entity, true));
  assert(!matchesAddress(branch, { claims: {} }));
  assert(!matchesEntity({ ...p, name: 'Other monument' }, entity, true));
  assert.notEqual(photoIdentity(branch), photoIdentity({ ...branch, address: '404 March Road' }));
  assert(
    matchesAddress(p, {
      claims: { P6375: [claim({ text: 'Wellington Street', language: 'en' })] }
    }),
    'A landmark without a numbered provider address can still use its exact name and coordinates'
  );
});
