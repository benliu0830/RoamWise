import test from 'node:test';
import assert from 'node:assert/strict';
import { completeTrip, lastTripDay, tripCollection } from '../public/js/trips.js';
import { saved, write, read } from '../public/js/store.js';

const plan = () => ({
  id: 'history-trip',
  name: 'Ottawa day out',
  status: 'active',
  tripStarted: true,
  preferences: { transport: 'walk' },
  days: [
    {
      number: 1,
      stops: [
        { place: { id: 'museum', name: 'Museum' }, visited: true },
        { place: { id: 'park', name: 'Park' }, visited: false }
      ]
    }
  ]
});
test('completion preserves the original itinerary and partial visited progress without mutating it', () => {
  const active = plan(),
    before = structuredClone(active),
    finished = completeTrip(active, '2026-11-11T18:00:00Z');
  assert.deepEqual(active, before);
  assert.deepEqual(finished.days, before.days);
  assert.equal(finished.status, 'completed');
  assert.equal(finished.completedAt, '2026-11-11T18:00:00Z');
  assert.equal(finished.tripStarted, false);
  assert.equal(completeTrip(finished), finished);
  assert.equal(lastTripDay({ ...active, days: [...active.days, { number: 2, stops: [] }] }), 0);
  assert.equal(
    lastTripDay({ ...active, days: [...active.days, { number: 2, stops: active.days[0].stops }] }),
    1
  );
});
test('legacy, active and completed trips remain deduplicated without reactivating history', () => {
  const active = plan(),
    completed = completeTrip(active);
  const list = tripCollection([completed, { ...active, id: 'legacy', status: undefined }], active);
  assert.equal(list.length, 2);
  assert.equal(list.find((p) => p.id === active.id).status, 'completed');
});
test('persistent completion is idempotent and a storage failure leaves active data intact', () => {
  const original = global.localStorage,
    oldPlans = saved.plans,
    data = new Map();
  let blocked = false;
  global.localStorage = {
    getItem: (k) => data.get(k) ?? null,
    setItem(k, v) {
      if (blocked) throw new Error('Storage blocked');
      data.set(k, v);
    }
  };
  try {
    const active = plan();
    saved.plans = [];
    write('activePlan', active);
    const done = saved.completePlan(active);
    assert(done.completedAt);
    assert.equal(read('plans', []).length, 1);
    assert.deepEqual(done.days, active.days);
    assert.equal(saved.completePlan(active).completedAt, done.completedAt);
    assert.equal(read('plans', []).length, 1);
    assert.equal(saved.savePlan(active), false);
    blocked = true;
    const another = { ...active, id: 'unsaved-trip' };
    assert.equal(saved.completePlan(another), null);
    assert.equal(saved.plans.length, 1);
    assert.equal(read('activePlan', null).status, 'active');
  } finally {
    global.localStorage = original;
    saved.plans = oldPlans;
  }
});
