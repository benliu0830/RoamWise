import assert from 'node:assert/strict';

// Run against the local server. Credentials are read only by the server and
// never printed, written to reports, or included in browser request URLs.
const base = 'http://127.0.0.1:3000';
async function call(path, body, expected = 200) {
  const response = await fetch(
    `${base}/api/${path}`,
    body
      ? {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body)
        }
      : {}
  );
  const data = await response.json();
  assert.equal(response.status, expected, `${path}: ${data.error || 'unexpected response'}`);
  return data;
}
const health = await call('health');
assert.equal(health.status, 'ok');
for (const [query, prefs] of [
  ['Paris, France', { mode: 'tourist', days: 2, hours: 8, currency: 'EUR', dailyBudget: 100 }],
  [
    'Ottawa, Canada',
    {
      mode: 'local',
      hours: 3,
      currency: 'CAD',
      dailyBudget: 30,
      interests: ['nature', 'food', 'museums']
    }
  ]
]) {
  const { results } = await call(`geocode?q=${encodeURIComponent(query)}`);
  const center = results[0];
  const data = await call('search', { center, preferences: prefs });
  assert(data.places.length > 0);
  assert(!data.partial, 'All requested categories should succeed.');
  const { plan } = await call('plan', { places: data.places, center, preferences: prefs });
  assert.equal(plan.days.length, prefs.mode === 'local' ? 1 : 2);
  assert(plan.days.every((day) => day.minutes <= prefs.hours * 60));
  assert(plan.days[0].stops.length > 0);
  const { place } = await call('details', { place: data.places[0] });
  assert.equal(place.id, data.places[0].id);
  const stops = plan.days[0].stops.map((s) => s.place);
  let route = false;
  if (stops.length > 1) {
    const r = await call('route', { places: stops, transport: 'walk' });
    assert(r.geometry);
    assert(r.distance > 0);
    route = true;
  }
  if (prefs.mode === 'tourist') {
    if (stops.length > 1) {
      const driving = await call('route', { places: stops.slice(0, 2), transport: 'drive' });
      assert(driving.geometry && driving.distance > 0);
      console.log('PASS driving route between real retrieved stops.');
    }
    const ai = await call('personalize', { places: data.places, center, preferences: prefs });
    assert.equal(ai.source, 'gemini', ai.message);
    assert(ai.picks.length > 0);
    const ids = new Set(data.places.map((p) => p.id));
    assert(ai.picks.every((p) => ids.has(p.id)));
    console.log(`PASS Gemini: ${ai.picks.length} validated real-candidate selections.`);
  }
  console.log(
    `PASS ${query}: ${data.places.length} real places; ${plan.days.length} day(s); ${plan.days.map((d) => d.stops.length).join('/')} stops; ${data.weather?.days.length || 0} forecast days; walking route ${route ? 'loaded' : 'not needed'}.`
  );
  if (prefs.mode === 'local') {
    const indoors = await call('search', { center, preferences: { ...prefs, setting: 'indoor' } });
    assert(indoors.places.length > 0 && indoors.places.every((p) => p.setting === 'indoor'));
    console.log(
      `PASS Ottawa indoor-only search: ${indoors.places.length} category-matched places.`
    );
  }
  await call(
    'plan',
    { places: [{ ...data.places[0], name: 'Tampered candidate' }], center, preferences: prefs },
    400
  );
}
const empty = await call('search', {
  center: { lat: 0, lon: 0 },
  preferences: { mode: 'local', radius: 500, interests: ['food'] }
});
assert.equal(empty.places.length, 0);
console.log('PASS empty real-provider search in open ocean returns no invented places.');
await call('geocode?q=zzzxqvnotarealcity999999', undefined, 404);
await call('search', { center: { lat: 'invalid', lon: 0 }, preferences: {} }, 400);
for (const path of ['/.env.local', '/server/config.js', '/package.json'])
  assert.equal((await fetch(base + path)).status, 404);
console.log(
  'PASS invalid destination, invalid coordinates, tampered candidates, and private-file isolation.'
);
