import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { chromium } = await import(
  pathToFileURL(join(tmpdir(), 'roamwise-browser-qa/node_modules/playwright/index.mjs'))
);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    reducedMotion: 'reduce'
  }),
  page = await context.newPage();
page.setDefaultTimeout(15000);
const places = Array.from({ length: 80 }, (_, i) => ({
  id: `map-${i}`,
  name: `Ottawa ${['Museum', 'Cafe', 'Park', 'Restaurant'][i % 4]} ${i + 1}`,
  category: ['museums', 'cafes', 'nature', 'food'][i % 4],
  lat: 45.4215 + Math.floor(i / 10) * 0.00025,
  lon: -75.6972 + (i % 10) * 0.0003,
  address: `${i + 1} Example Street, Ottawa, ON, Canada`,
  city: 'Ottawa',
  state: 'Ontario',
  country: 'Canada',
  categories: [],
  description: 'A sourced visitor description for this browser test location.',
  hours: 'Mo-Su 00:00-23:59',
  timezone: 'America/Toronto'
}));
const makePlan = (id, days = 2) => ({
  id,
  name: 'Ottawa riverside weekend',
  center: { name: 'Ottawa', lat: 45.42, lon: -75.7 },
  status: 'active',
  tripStarted: true,
  createdAt: '2026-11-11T12:00:00Z',
  preferences: { transport: 'walk', days, hours: 8 },
  notes: ['Browser QA fixture.'],
  days: Array.from({ length: days }, (_, day) => ({
    number: day + 1,
    date: null,
    minutes: 180,
    stops: places.slice(day * 2, day * 2 + 2).map((place, i) => ({
      place,
      start: 540 + i * 80,
      end: 600 + i * 80,
      duration: 60,
      visited: false,
      travel: { km: 0.4, minutes: 8 },
      hoursChecked: false
    }))
  }))
});
const active = makePlan('history-browser');
await page.addInitScript(
  ({ places, active }) => {
    if (!sessionStorage.getItem('map-history-fixture')) {
      localStorage.clear();
      sessionStorage.clear();
      sessionStorage.setItem('map-history-fixture', 'true');
      sessionStorage.setItem(
        'roamwise:v1:discovery',
        JSON.stringify({
          places,
          view: 'map',
          center: { name: 'Ottawa', lat: 45.4215, lon: -75.6972, timezone: 'America/Toronto' },
          prefs: { mode: 'tourist', radius: 10000, days: 2, hours: 8, transport: 'walk' },
          filters: {
            category: 'all',
            query: '',
            setting: 'any',
            distance: 'any',
            hours: 'all',
            sort: 'recommended'
          }
        })
      );
      localStorage.setItem('roamwise:v1:activePlan', JSON.stringify(active));
      localStorage.setItem('roamwise:v1:plans', JSON.stringify([active]));
    }
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(_success, failure) {
          failure({ code: 1 });
        }
      }
    });
  },
  { places, active }
);
let routeRequests = 0,
  failRoutes = false;
const routeBodies = [];
await page.route('**/api/route', async (route) => {
  routeRequests++;
  const body = route.request().postDataJSON();
  routeBodies.push(body);
  assert(body.places.length + Number(Boolean(body.origin)) <= 12);
  if (failRoutes) {
    await route.fulfill({ status: 503, json: { error: 'Routing provider unavailable' } });
    return;
  }
  const points = [...(body.origin ? [body.origin] : []), ...body.places];
  await route.fulfill({
    json: {
      geometry: { type: 'LineString', coordinates: points.map((p) => [p.lon, p.lat]) },
      distance: 840,
      time: 600,
      legs: points.slice(1).map(() => ({ distance: 420, time: 300 }))
    }
  });
});
await page.route('**/api/details', async (route) => {
  const body = route.request().postDataJSON();
  await route.fulfill({
    json: body.describe ? { description: { paragraphs: [] } } : { place: body.place }
  });
});
await page.route('**/api/photo', (route) => route.fulfill({ json: { photo: null } }));
const errors = [];
page.on('pageerror', (error) => errors.push(error.stack || error.message));
const output = '.impeccable/review';
await mkdir(output, { recursive: true });
try {
  console.log('Checking clustered Ottawa discovery and synchronized selection');
  await page.goto('http://localhost:3000/#results');
  await page.locator('#results-map.leaflet-container').waitFor();
  assert((await page.locator('.map-cluster').count()) > 0, 'Dense results cluster');
  const mapId = await page.locator('#results-map').evaluate((n) => n._leaflet_id);
  await page.locator('.map-cluster').first().click();
  await page.locator('.map-focus-link').first().click();
  await page.locator('.roam-popup').waitFor();
  assert.equal(await page.locator('.place-card.is-map-selected').count(), 1);
  assert(await page.locator('.map-preview .category-badge').isVisible());
  assert(await page.locator('.map-preview .opening-status').isVisible());
  await page.locator('.popup-favorite').click();
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('roamwise:v1:favorites')).length),
    1
  );
  await page.locator('.leaflet-popup-close-button').click();
  const visibleMarkerTitle = await page.locator('.roam-marker').evaluateAll((nodes) => {
    const box = document.querySelector('#results-map').getBoundingClientRect();
    return nodes.find((n) => {
      const r = n.getBoundingClientRect();
      return (
        r.x > box.x + 60 &&
        r.right < box.right - 60 &&
        r.y > box.y + 50 &&
        r.bottom < box.bottom - 70
      );
    })?.title;
  });
  assert(visibleMarkerTitle);
  await page.getByTitle(visibleMarkerTitle, { exact: true }).click();
  await page.locator('.roam-popup').waitFor();
  assert.equal(await page.locator('.place-card.is-map-selected').count(), 1);
  await page.locator('.leaflet-popup-close-button').click();
  await page.locator('[data-action=category][data-category=nature]').click();
  assert.equal(
    await page.locator('#results-map').evaluate((n) => n._leaflet_id),
    mapId,
    'Filtering reuses the map instance'
  );
  assert((await page.locator('.place-card.category-nature').count()) > 0);
  assert.equal(
    await page.locator('.place-card:not(.category-nature)').count(),
    0,
    'Category filters update cards and markers together'
  );
  await page.getByRole('button', { name: 'Fit all results', exact: true }).click();
  await page.getByRole('button', { name: 'My location', exact: true }).click();
  await page.getByText('Location permission denied. The map is still available.').waitFor();
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(success) {
          success({ coords: { latitude: 45.422, longitude: -75.696 } });
        }
      }
    })
  );
  await page.getByRole('button', { name: 'My location', exact: true }).click();
  await page.getByText('Your location is shown.').waitFor();
  await page.getByRole('button', { name: 'Recenter map', exact: true }).click();
  await page.locator('.map-legend summary').click();
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  const cardHeight = await page
    .locator('.place-card')
    .first()
    .evaluate((n) => n.getBoundingClientRect().height);
  assert(cardHeight > 350, 'Scrollable result cards must retain their full content');
  if (await page.getByRole('button', { name: 'Fullscreen map', exact: true }).count()) {
    await page.getByRole('button', { name: 'Fullscreen map', exact: true }).click();
    assert(await page.evaluate(() => Boolean(document.fullscreenElement)));
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForTimeout(100);
    const visibleCluster = await page.locator('.map-cluster').evaluateAll((nodes) => {
      const box = document.querySelector('#results-map').getBoundingClientRect();
      return nodes.some((n) => {
        const r = n.getBoundingClientRect();
        return r.right > box.left && r.left < box.right && r.bottom > box.top && r.top < box.bottom;
      });
    });
    assert(visibleCluster, 'Leaving fullscreen preserves the result locations in view');
  }
  await page.screenshot({ path: `${output}/maps-discovery-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/maps-discovery-mobile.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  await page.setViewportSize({ width: 1440, height: 1050 });
  console.log('Checking routes, day caching, completion and read-only history');
  await page.goto('http://localhost:3000/#trip/history-browser');
  await page.locator('#trip-map').waitFor();
  await page.waitForFunction(() =>
    document.querySelector('#trip-route-status')?.textContent.includes('Highlighted segment')
  );
  assert.equal(
    await page.locator('[data-action=complete-trip]').count(),
    0,
    'Completion appears only on the final trip day'
  );
  await page.locator('[data-action=toggle-visited]').first().click();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('roamwise:v1:activePlan')).days[0].stops[0].visited
  );
  assert.equal(await page.locator('.roam-marker.is-up-next').count(), 1);
  await page.locator('[data-action=day][data-day="1"]').click();
  await page.locator('[data-action=complete-trip]').waitFor();
  await page.waitForFunction(() =>
    document.querySelector('#trip-route-status')?.textContent.includes('Highlighted segment')
  );
  const before = routeRequests;
  await page.locator('[data-action=day][data-day="0"]').click();
  await page.waitForTimeout(150);
  assert.equal(routeRequests, before, 'Previously viewed day and active leg reuse route cache');
  await page.locator('[data-action=day][data-day="1"]').click();
  await page.locator('[data-action=complete-trip]').click();
  await page.getByRole('heading', { name: 'Complete Your Trip?', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/complete-confirm-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/complete-confirm-mobile.png`, fullPage: true });
  await page.locator('#complete-trip-dialog [data-cancel]').click();
  await page.setViewportSize({ width: 1440, height: 1050 });
  assert.equal(new URL(page.url()).hash, '#trip/history-browser');
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('roamwise:v1:activePlan')).status),
    'active'
  );
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
    document.querySelector('.trip-timeline').scrollTop = 0;
  });
  await page.screenshot({ path: `${output}/maps-itinerary-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/maps-itinerary-mobile.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.locator('[data-action=complete-trip]').click();
  await page.locator('#complete-trip-dialog [data-confirm]').click();
  await page.getByRole('heading', { name: 'My Itineraries', exact: true }).waitFor();
  await page.getByText('Trip completed! Your adventure has been saved.', { exact: true }).waitFor();
  const completed = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('roamwise:v1:plans'))
  );
  assert.equal(completed.length, 1);
  assert.equal(completed[0].status, 'completed');
  assert(completed[0].completedAt);
  assert.equal(completed[0].days[0].stops[0].visited, true);
  assert.equal(completed[0].days[1].stops[0].visited, false);
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('roamwise:v1:activePlan'))),
    null
  );
  assert.equal(await page.locator('.trip-history-card').count(), 1);
  await page.locator('[data-action=trip-tab][data-tab=active]').click();
  assert.equal(await page.locator('.trip-history-card').count(), 0);
  await page.locator('[data-action=trip-tab][data-tab=completed]').click();
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: `${output}/completed-trips-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/completed-trips-mobile.png`, fullPage: true });
  await page.getByRole('button', { name: 'View Trip', exact: false }).click();
  await page.locator('#trip-map').waitFor();
  assert.equal(
    await page
      .locator('[data-action=toggle-visited], [data-action=complete-trip], [data-action=save-plan]')
      .count(),
    0
  );
  await page.reload();
  await page.locator('#trip-map').waitFor();
  assert.equal(await page.locator('[data-action=complete-trip]').count(), 0);
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('roamwise:v1:plans')).length),
    1
  );
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('roamwise:v1:activePlan'))),
    null
  );
  // A separate single-day trip can finish without marking all destinations.
  const single = makePlan('single-day', 1);
  await page.evaluate((p) => {
    localStorage.setItem('roamwise:v1:activePlan', JSON.stringify(p));
    localStorage.setItem(
      'roamwise:v1:plans',
      JSON.stringify([...JSON.parse(localStorage.getItem('roamwise:v1:plans')), p])
    );
  }, single);
  await page.goto('http://localhost:3000/#trip/single-day');
  await page.reload();
  await page.locator('.trip-timeline-summary').click();
  await page.locator('[data-action=complete-trip]').click();
  await page.locator('#complete-trip-dialog [data-confirm]').click();
  await page.getByRole('heading', { name: 'My Itineraries', exact: true }).waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('roamwise:v1:plans')).filter(
          (p) => p.status === 'completed'
        ).length
    ),
    2
  );
  const many = makePlan('many-stops', 1);
  many.preferences.transport = 'drive';
  many.days[0].stops = places.slice(0, 25).map((place, i) => ({
    place,
    start: 540 + i * 20,
    end: 555 + i * 20,
    duration: 15,
    visited: false,
    travel: { km: 0.1, minutes: 5 },
    hoursChecked: false
  }));
  await page.evaluate(
    (p) => localStorage.setItem('roamwise:v1:activePlan', JSON.stringify(p)),
    many
  );
  const bodiesBefore = routeBodies.length;
  await page.goto('http://localhost:3000/#trip/many-stops');
  await page.reload();
  await page.waitForFunction(() =>
    document.querySelector('#trip-route-status')?.textContent.includes('Highlighted segment')
  );
  const batches = routeBodies.slice(bodiesBefore).filter((b) => !b.origin);
  assert.equal(batches.length, 3, '25-stop day uses three bounded routing chunks');
  assert.equal(await page.locator('.roam-marker').count(), 25);
  const transit = makePlan('transit-trip', 1);
  transit.preferences.transport = 'transit';
  transit.days[0].stops.forEach((s) => (s.travel.minutes = null));
  await page.evaluate(
    (p) => localStorage.setItem('roamwise:v1:activePlan', JSON.stringify(p)),
    transit
  );
  const requestsBeforeTransit = routeRequests;
  await page.goto('http://localhost:3000/#trip/transit-trip');
  await page.reload();
  await page.locator('#trip-map').waitFor();
  assert.equal(routeRequests, requestsBeforeTransit);
  assert.equal(await page.locator('[data-action=route-leg]').count(), 0);
  const unavailable = makePlan('unavailable-route', 1);
  unavailable.preferences.transport = 'walk';
  unavailable.days[0].stops = places
    .slice(14, 16)
    .map((place, i) => ({ ...active.days[0].stops[i], place }));
  failRoutes = true;
  await page.evaluate(
    (p) => localStorage.setItem('roamwise:v1:activePlan', JSON.stringify(p)),
    unavailable
  );
  await page.goto('http://localhost:3000/#trip/unavailable-route');
  await page.reload();
  await page.getByText(/Route unavailable. Stop markers/).waitFor();
  assert.equal(await page.locator('.roam-marker').count(), 2);
  failRoutes = false;
  assert.deepEqual(errors, []);
  console.log(
    'PASS: 80-place clustering, synchronized selection, popup favorites, filters reuse markers, location success/denial, cached route days, single/multi-day confirmation/cancellation, partial progress, redirect, persistent deduplicated history, read-only maps, desktop/mobile.'
  );
} finally {
  await browser.close();
}
