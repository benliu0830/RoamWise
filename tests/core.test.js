import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, safeUrl } from '../server/places.js';
import { signPlace, verifiedPlaces, endpoint } from '../server/security.js';
import { validateAi, personalize, rankPlaces } from '../server/ai.js';
import { buildPlan, distanceKm, openingWindow } from '../server/planner.js';
import { preferences } from '../server/validation.js';
import { fetchJson } from '../server/http.js';

// Synthetic test fixtures never ship as public recommendations.
process.env.GEOAPIFY_API_KEY = 'unit-test-key-not-a-real-credential';
process.env.GEMINI_API_KEY = 'unit-test-key-not-a-real-credential';
function place(id, lat, lon, extra = {}) {
  return signPlace({
    id,
    name: `Fixture ${id}`,
    lat,
    lon,
    category: 'nature',
    categories: ['leisure.park'],
    setting: 'outdoor',
    price: { kind: 'unknown', amount: null, currency: null, text: 'Not available' },
    hours: null,
    distance: 100,
    ...extra
  });
}
const center = { lat: 45.42, lon: -75.69, name: 'Fixture city' };

test('normalization preserves missing facts and rejects unsafe links', () => {
  const p = normalize({
    properties: {
      place_id: 'test1',
      name: 'Fixture',
      lat: 45,
      lon: -75,
      categories: ['entertainment.museum']
    }
  });
  assert.equal(p.hours, null);
  assert.equal('price' in p, false);
  assert.equal('website' in p, false);
  assert.equal(p.address, null);
  assert.equal(p.category, 'museums');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('https://example.com'), 'https://example.com/');
  assert.equal(safeUrl('https://user:password@example.com'), null);
});
test('signed candidates reject modified, invented, and duplicate places', () => {
  const p = place('one', 45.42, -75.69);
  assert.equal(verifiedPlaces([p]).length, 1);
  assert.equal('price' in verifiedPlaces([p])[0], false);
  assert.throws(() => verifiedPlaces([{ ...p, name: 'Fabricated' }]));
  assert.throws(() => verifiedPlaces([{ id: 'invented' }]));
  assert.throws(() => verifiedPlaces([p, p]));
});
test('AI output must use unique existing identifiers and safe reason enums', () => {
  const p = place('real', 45.42, -75.69);
  assert.equal(validateAi({ picks: [{ id: 'real', reason: 'interest' }] }, [p]).length, 1);
  assert.throws(() => validateAi({ picks: [{ id: 'imaginary', reason: 'interest' }] }, [p]));
  assert.throws(() => validateAi({ picks: [{ id: 'real', reason: 'invented price' }] }, [p]));
  assert.throws(() =>
    validateAi(
      {
        picks: [
          { id: 'real', reason: 'interest' },
          { id: 'real', reason: 'nearby' }
        ]
      },
      [p]
    )
  );
});
test('quota and malformed provider failures activate deterministic AI fallback', async () => {
  const original = global.fetch;
  try {
    const places = [
      place('a', 45.42, -75.69),
      place('b', 45.421, -75.69, { category: 'museums', setting: 'indoor' })
    ];
    const prefs = preferences({ mode: 'local', interests: ['museums'] });
    global.fetch = async () => new Response(JSON.stringify({ error: 'quota' }), { status: 429 });
    const result = await personalize(places, prefs, null);
    assert.equal(result.source, 'fallback');
    assert.match(result.message, /quota/);
    assert.equal(result.places[0].id, 'b');
    global.fetch = async () => new Response('{bad json', { status: 200 });
    assert.equal((await personalize(places, prefs, null)).source, 'fallback');
  } finally {
    global.fetch = original;
  }
});
test('provider errors never leak request URLs or raw error messages', async () => {
  const original = global.fetch;
  try {
    global.fetch = async () =>
      new Response(JSON.stringify({ secret: 'NEVER_EXPOSE' }), { status: 401 });
    await assert.rejects(
      fetchJson('https://example.com/?key=NEVER_EXPOSE'),
      (error) => error.status === 502 && !error.message.includes('NEVER_EXPOSE')
    );
  } finally {
    global.fetch = original;
  }
});
test('nearest-neighbor plan has unique stops, coherent order, multiple days, and bounded time', () => {
  const places = [
    place('a', 45.4201, -75.69),
    place('b', 45.4202, -75.69),
    place('c', 45.43, -75.7),
    place('d', 45.4301, -75.7)
  ];
  const plan = buildPlan(places, preferences({ days: 2, hours: 4 }), center, null);
  assert.equal(plan.days.length, 2);
  assert(plan.days.every((d) => d.stops.length === 2 && d.minutes <= 240));
  const ids = plan.days.flatMap((d) => d.stops.map((s) => s.place.id));
  assert.equal(new Set(ids).size, 4);
  assert.deepEqual(
    plan.days[0].stops.map((s) => s.place.id),
    ['a', 'b']
  );
  assert.equal(distanceKm(center, center), 0);
  assert(distanceKm(center, places[2]) < 2);
});
test('local plans use time and opening hours regardless of legacy monetary preferences', () => {
  const places = [
    place('closed', 45.4201, -75.69, { hours: 'Mo-Su off' }),
    place('open', 45.4202, -75.69, { hours: 'Mo-Su 09:00-18:00' }),
    place('unknown', 45.4203, -75.69)
  ];
  const prefs = preferences({
    mode: 'local',
    hours: 3,
    dailyBudget: 0,
    totalBudget: 0,
    currency: 'CAD',
    startDate: '2026-11-05'
  });
  assert.equal('dailyBudget' in prefs, false);
  const plan = buildPlan(places, prefs, center, null);
  assert(plan.days[0].stops.some((stop) => stop.place.id === 'open'));
  assert(!plan.days[0].stops.some((stop) => stop.place.id === 'closed'));
  assert(plan.days[0].minutes <= 180);
  assert.equal('knownCost' in plan.days[0], false);
  assert.deepEqual(openingWindow('Mo-Su 10:00-18:00', '2026-11-05'), [[600, 1080]]);
  assert.equal(openingWindow('Mo-Fr 10:00-18:00; PH off', '2026-11-05'), null);
  assert.deepEqual(openingWindow('Mo-Su 09:00-17:00; Su off', '2026-11-08'), []);
  assert.equal(openingWindow('Mo-Su 09:90-17:00', '2026-11-05'), null);
  const transit = buildPlan(
    [places[2]],
    preferences({ mode: 'local', transport: 'transit' }),
    center,
    null
  );
  assert.equal(transit.days[0].stops[0].travel.minutes, null);
  assert.equal(transit.days[0].stops[0].travel.reserve, 30);
});
test('out-of-range weather is not projected onto a trip', () => {
  const places = [place('out', 45.42, -75.69), place('in', 45.42, -75.69, { setting: 'indoor' })];
  const weather = { days: [{ date: '2026-11-01', rain: 90, code: 61 }] };
  assert.equal(rankPlaces(places, preferences({ startDate: '2026-11-01' }), weather)[0].id, 'in');
  assert.equal(rankPlaces(places, preferences({ startDate: '2027-01-01' }), weather)[0].id, 'out');
  assert.equal(
    buildPlan(places, preferences({ startDate: '2027-01-01' }), center, weather).days[0].forecast,
    null
  );
  assert.equal(buildPlan(places, preferences({ days: 2 }), center, weather).days[1].forecast, null);
});
test('invalid inputs fail before provider requests', () => {
  assert.throws(() => preferences({ days: -1 }));
  assert.throws(() => preferences({ hours: Infinity }));
  assert.throws(() => preferences({ startDate: '2026-02-30' }));
  assert.equal(preferences({ mode: 'local', days: 9 }).days, 1);
});
test('API wrapper enforces HTTP methods, origins, and rate limits', async () => {
  function response() {
    return {
      headers: {},
      setHeader(k, v) {
        this.headers[k] = v;
      },
      status(s) {
        this.code = s;
        return this;
      },
      json(d) {
        this.data = d;
        return this;
      }
    };
  }
  const handler = endpoint('POST', async () => ({ ok: true }), { limit: 1 });
  const req = {
    method: 'POST',
    headers: { host: 'localhost', origin: 'http://localhost' },
    url: '/unit-limit',
    socket: { remoteAddress: 'unit-test' }
  };
  let res = response();
  await handler({ ...req, method: 'GET' }, res);
  assert.equal(res.code, 405);
  res = response();
  await handler(
    { ...req, headers: { host: 'localhost', origin: 'https://elsewhere.example' } },
    res
  );
  assert.equal(res.code, 403);
  res = response();
  await handler(req, res);
  assert.equal(res.code, 200);
  res = response();
  await handler(req, res);
  assert.equal(res.code, 429);
  assert.equal(res.headers['Retry-After'], '60');
});
