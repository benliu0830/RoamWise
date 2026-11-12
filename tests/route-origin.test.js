import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/route.js';
import { signPlace } from '../server/security.js';

test('the first route leg accepts a validated origin and a signed destination without weakening place verification', async () => {
  const oldFetch = fetch,
    oldKey = process.env.GEOAPIFY_API_KEY;
  process.env.GEOAPIFY_API_KEY = 'route-origin-fixture';
  let requests = 0;
  global.fetch = async (url) => {
    requests++;
    const u = new URL(url);
    assert.equal(u.searchParams.get('waypoints'), '45.42,-75.7|45.43,-75.69');
    return Response.json({
      features: [
        {
          geometry: {
            type: 'LineString',
            coordinates: [
              [-75.7, 45.42],
              [-75.69, 45.43]
            ]
          },
          properties: { distance: 1000, time: 600, legs: [] }
        }
      ]
    });
  };
  const place = signPlace({ id: 'signed-destination', name: 'Museum', lat: 45.43, lon: -75.69 });
  const call = async (body) => {
    const r = {
      setHeader() {},
      status(code) {
        this.code = code;
        return this;
      },
      json(data) {
        this.data = data;
        return this;
      }
    };
    await handler({ method: 'POST', url: '/api/route', headers: {}, body }, r);
    return r;
  };
  try {
    assert.equal(
      (await call({ places: [place], origin: { lat: 45.42, lon: -75.7 }, transport: 'walk' })).code,
      200
    );
    assert.equal(
      (await call({ places: [place], origin: { lat: 95, lon: -75.7 }, transport: 'walk' })).code,
      400
    );
    assert.equal(
      (
        await call({
          places: [{ ...place, name: 'Tampered' }],
          origin: { lat: 45.42, lon: -75.7 },
          transport: 'walk'
        })
      ).code,
      400
    );
    assert.equal(requests, 1);
  } finally {
    global.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GEOAPIFY_API_KEY;
    else process.env.GEOAPIFY_API_KEY = oldKey;
  }
});
