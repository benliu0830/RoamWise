import test from 'node:test';
import assert from 'node:assert/strict';
import { groupBranches, distanceKm, formatDistance } from '../public/js/place-utils.js';
import { openingStatus, parseHours, windowsForDate } from '../public/js/hours.js';
import { relevanceScore } from '../server/ranking.js';
import { validateDescription } from '../server/descriptions.js';
import { searchPlaces, placeDetails } from '../server/places.js';
import { preferences } from '../server/validation.js';
import { signPlace, verifiedPlaces } from '../server/security.js';
import { migrateStoredData } from '../public/js/store.js';

process.env.GEOAPIFY_API_KEY = 'synthetic-test-key';
const origin = { lat: 45.42, lon: -75.69 };
test('legacy saved plans retain stops while retired fields are removed and signed places are refreshed', async () => {
  const oldFetch = global.fetch;
  const oldLocal = global.localStorage,
    oldSession = global.sessionStorage;
  const record = signPlace({
    id: 'legacy-place',
    name: 'Synthetic legacy fixture',
    ...origin,
    category: 'cafes',
    price: { amount: 25 },
    website: 'https://example.com'
  });
  const plan = {
    id: 'kept-plan',
    preferences: { days: 2, dailyBudget: 100, currency: 'CAD' },
    days: [{ knownCost: 25, unknownCosts: 0, stops: [{ place: record }] }],
    notes: ['Visit durations are estimates.', 'Unknown prices remain.']
  };
  const storage = () => {
    const data = new Map();
    return {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => data.set(key, value)
    };
  };
  global.localStorage = storage();
  global.sessionStorage = storage();
  localStorage.setItem('roamwise:v1:plans', JSON.stringify([plan]));
  global.fetch = async (_url, options) =>
    Response.json({ places: verifiedPlaces(JSON.parse(options.body).places) });
  try {
    await migrateStoredData();
    const migrated = JSON.parse(localStorage.getItem('roamwise:v1:plans'))[0];
    assert.equal(migrated.id, plan.id);
    assert.equal(migrated.days[0].stops[0].place.id, record.id);
    assert.equal(verifiedPlaces([migrated.days[0].stops[0].place]).length, 1);
    assert(
      !/dailyBudget|knownCost|unknownCosts|"price"|"currency"|"website"/.test(
        JSON.stringify(migrated)
      )
    );
    assert.deepEqual(migrated.notes, ['Visit durations are estimates.']);
  } finally {
    global.fetch = oldFetch;
    global.localStorage = oldLocal;
    global.sessionStorage = oldSession;
  }
});
test('branch groups use evidence, preserve unrelated businesses, and order by actual distance', () => {
  const places = [
    {
      id: 'far',
      name: 'Starbucks',
      brandId: 'Q37158',
      brand: 'Starbucks',
      category: 'cafes',
      lat: 45.45,
      lon: -75.69
    },
    { id: 'near', name: 'Starbucks', category: 'cafes', lat: 45.421, lon: -75.69 },
    {
      id: 'unrelated',
      name: 'Starbucks Bakery Studio',
      category: 'food',
      lat: 45.421,
      lon: -75.69
    },
    ...['a', 'b'].map((id) => ({
      id,
      name: 'Sunshine Café',
      category: 'cafes',
      lat: 45.42,
      lon: -75.69
    })),
    ...['c', 'd'].map((id) => ({
      id,
      name: 'Small Local Chain',
      brandId: 'Q12345',
      category: 'food',
      lat: 45.42,
      lon: -75.69
    }))
  ];
  const groups = groupBranches(places, origin);
  assert.equal(groups.length, 5);
  assert.deepEqual(
    groups.find((p) => p.name === 'Starbucks').branches.map((p) => p.id),
    ['near', 'far']
  );
  assert.equal(groups.find((p) => p.id === 'unrelated').branchCount, undefined);
  assert.equal(groups.filter((p) => p.name === 'Sunshine Café').length, 2);
  assert.equal(groups.find((p) => p.brandId === 'Q12345').branchCount, 2);
  assert(distanceKm(origin, places[1]) < distanceKm(origin, places[0]));
  assert.equal(formatDistance(0.32), '320 m');
});
test('opening status uses destination time, overnight carry, split shifts, and conservative unknowns', () => {
  const now = new Date('2026-11-09T02:00:00Z');
  const venue = { hours: 'Mo-Su 09:00-18:00' };
  assert.equal(openingStatus(venue, 'America/Toronto', now).open, false);
  assert.equal(openingStatus(venue, 'Asia/Tokyo', now).open, true);
  assert.equal(
    openingStatus({ hours: 'Su 20:00-02:00' }, 'America/Toronto', new Date('2026-11-09T06:00:00Z'))
      .open,
    true
  );
  assert.equal(parseHours('Mo,We,Fr 09:00-12:00,13:00-17:00')[2].length, 2);
  assert.equal(parseHours('Mo-Fr 09:00-17:00; PH off'), null);
  assert.equal(parseHours('Mo 24:30-25:00'), null);
  assert.equal(openingStatus(venue, undefined, now).reliable, false);
  assert.equal(openingStatus({ hours: null }, 'Europe/Paris', now).label, 'Hours unavailable');
  assert.deepEqual(windowsForDate('Mo-Su 09:00-17:00; Su off', '2026-11-08'), []);
});
test('relevance uses source evidence and exact names without inventing popularity', () => {
  const obscure = { name: 'Little local place', distance: 20 };
  const documented = {
    name: 'Documented landmark',
    category: 'landmarks',
    wikidata: 'Q1',
    wikipedia: 'en:Known',
    distance: 2000
  };
  assert(relevanceScore(documented) > relevanceScore(obscure));
  assert(
    relevanceScore(obscure, 'Little local place') > relevanceScore(documented, 'Little local place')
  );
  assert.equal('popularity' in documented, false);
});
test('AI descriptions cannot add prose, unknown facts, or duplicate evidence', () => {
  const facts = ['A source-reported sentence.', 'A second source-reported sentence.'];
  assert.deepEqual(validateDescription({ paragraphs: [[1], [0]] }, facts), [facts[1], facts[0]]);
  assert.throws(() => validateDescription({ paragraphs: [[4]] }, facts));
  assert.throws(() => validateDescription({ paragraphs: [[0, 0]] }, facts));
  assert.throws(() => validateDescription({ paragraphs: [['invented claim']] }, facts));
});
test('named discovery reaches provider beyond recommendation pool, removes duplicates/out-of-area matches, and retains hours on sparse details', async () => {
  const original = global.fetch,
    requests = [];
  const feature = (id, lat, name = 'Obscure Named Venue') => ({
    properties: {
      place_id: id,
      name,
      lat,
      lon: origin.lon,
      categories: ['catering.cafe'],
      opening_hours: 'Mo-Su 09:00-18:00'
    }
  });
  global.fetch = async (url) => {
    const parsed = new URL(url);
    requests.push(parsed);
    if (parsed.pathname.includes('place-details'))
      return Response.json({
        features: [
          {
            properties: {
              feature_type: 'details',
              name: 'Obscure Named Venue',
              lat: 45.421,
              lon: origin.lon
            }
          }
        ]
      });
    return Response.json({
      features: [feature('one', 45.421), feature('duplicate', 45.421), feature('outside', 46)]
    });
  };
  try {
    const result = await searchPlaces(
      origin,
      preferences({ query: 'Obscure Named Venue', radius: 1000 })
    );
    assert.equal(result.places.length, 1);
    assert(
      requests
        .filter((url) => url.pathname === '/v2/places')
        .every((url) => url.searchParams.get('name') === 'Obscure Named Venue')
    );
    assert(requests.some((url) => url.searchParams.get('text') === 'Obscure Named Venue'));
    assert(result.places[0].hours);
    assert.equal((await placeDetails(result.places[0])).hours, result.places[0].hours);
    assert.equal('price' in result.places[0], false);
    assert.equal('website' in result.places[0], false);
  } finally {
    global.fetch = original;
  }
});
