import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../server/data/ottawa-photos.json' with { type: 'json' };
import { findPhoto } from '../server/photos.js';
import { isOttawaPhotoPlace } from '../public/js/photo-scope.js';

test('the bundled catalogue contains only Ottawa records with complete photo attribution', () => {
  assert.equal(catalog.version, 2);
  assert(catalog.photos.length > 0);
  for (const entry of catalog.photos) {
    assert(isOttawaPhotoPlace(entry.place), entry.place.name);
    assert(!('signature' in entry.place));
    assert(
      entry.photo.creator && entry.photo.license && entry.photo.licenseUrl && entry.photo.sourceUrl
    );
    assert(/^https:\/\/(thumb|upload)\.wikimedia\.org\//.test(entry.photo.url));
  }
});

test('a fresh exact catalogue match needs no upstream request; scope is still enforced', async () => {
  const entry = catalog.photos[0],
    original = fetch,
    originalNow = Date.now;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    throw new Error('No upstream request expected');
  };
  Date.now = () => Date.parse(entry.photo.checkedAt) + 1000;
  try {
    assert.deepEqual(await findPhoto(entry.place), entry.photo);
    assert.equal(await findPhoto({ ...entry.place, city: 'Gatineau', state: 'Quebec' }), null);
    assert.equal(calls, 0);
  } finally {
    global.fetch = original;
    Date.now = originalNow;
  }
});
