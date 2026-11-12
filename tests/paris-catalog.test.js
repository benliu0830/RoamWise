import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../server/data/paris-photos.json' with { type: 'json' };
import { isParisPhotoPlace } from '../public/js/photo-scope.js';
import { findPhoto } from '../server/photos.js';

test('Paris catalogue contains scoped, attributed photographs and both Notre-Dame name variants', () => {
  assert.equal(catalog.version, 2);
  assert(catalog.photos.length >= 60);
  for (const { place, photo } of catalog.photos) {
    assert(isParisPhotoPlace(place), place.name);
    assert(!('signature' in place));
    assert(photo.creator && photo.license && photo.licenseUrl && photo.sourceUrl);
  }
  for (const name of [
    'Louvre Museum',
    'Eiffel Tower',
    'Cathedral of Notre Dame',
    'Cathédrale Notre-Dame de Paris'
  ])
    assert(
      catalog.photos.some((e) => e.place.name === name),
      name
    );
});

test('every fresh Paris catalogue variant is reusable without an upstream API request', async () => {
  const original = fetch,
    originalNow = Date.now;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    throw new Error('Catalog should serve without upstream requests');
  };
  try {
    for (const e of catalog.photos) {
      Date.now = () => Date.parse(e.photo.checkedAt) + 1000;
      assert.deepEqual(await findPhoto(e.place), e.photo, e.place.name);
    }
    assert.equal(calls, 0);
  } finally {
    global.fetch = original;
    Date.now = originalNow;
  }
});
