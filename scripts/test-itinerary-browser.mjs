import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { chromium } = await import(
  pathToFileURL(join(tmpdir(), 'roamwise-browser-qa/node_modules/playwright/index.mjs')).href
);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  reducedMotion: 'reduce'
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const places = [
  ['browser-museum', 'Riverside Museum', 'museums', 45.421, -75.69],
  ['browser-cafe', 'Garden Café', 'food', 45.423, -75.689],
  ['browser-park', 'Maple Park', 'nature', 45.424, -75.687],
  ['browser-gallery', 'City Gallery', 'landmarks', 45.426, -75.686]
].map(([id, name, category, lat, lon], index) => ({
  id,
  name,
  category,
  setting: 'indoor',
  lat,
  lon,
  address: `${index + 1} Example Street`,
  city: 'Ottawa',
  categories: [],
  hours: null,
  distance: index * 650,
  source: 'Browser QA fixture'
}));
await page.addInitScript(
  ({ places }) => {
    sessionStorage.setItem(
      'roamwise:v1:discovery',
      JSON.stringify({
        places,
        center: {
          lat: 45.421,
          lon: -75.69,
          name: 'Ottawa',
          label: 'Ottawa, Canada',
          timezone: 'America/Toronto'
        },
        prefs: {
          mode: 'tourist',
          days: 2,
          hours: 8,
          transport: 'walk',
          pace: 'balanced',
          startDate: '',
          radius: 10000
        },
        filters: {
          query: '',
          category: 'all',
          setting: 'any',
          distance: 'any',
          hours: 'all',
          sort: 'recommended'
        }
      })
    );
    localStorage.setItem('roamwise:v1:selection', '[]');
    localStorage.setItem('roamwise:v1:favorites', JSON.stringify(places));
    localStorage.removeItem('roamwise:v1:activePlan');
  },
  { places }
);
await page.route('**/api/geocode*', async (route) => {
  const query = new URL(route.request().url()).searchParams.get('q') || 'Paris, France';
  const city = query.toLowerCase().includes('saskatoon')
    ? {
        name: 'Saskatoon',
        country: 'Canada',
        label: 'Saskatoon, Canada',
        lat: 52.1332,
        lon: -106.67
      }
    : { name: 'Paris', country: 'France', label: 'Paris, France', lat: 48.8566, lon: 2.3522 };
  await route.fulfill({ json: { results: [city] } });
});
await page.route('**/api/search', async (route) => {
  const request = route.request().postDataJSON();
  const center = request.center;
  await route.fulfill({
    json: { places, center, preferences: request.preferences, weather: null, truncated: false }
  });
});
await page.route('**/api/plan', async (route) => {
  const request = route.request().postDataJSON();
  const byDay = Array.from({ length: Number(request.preferences.days) }, () => []);
  request.places.forEach((place, index) =>
    byDay[
      Math.min(byDay.length - 1, Math.floor((index * byDay.length) / request.places.length))
    ].push(place)
  );
  const plan = {
    id: 'browser-trip',
    createdAt: new Date().toISOString(),
    name: 'Ottawa adventure',
    center: request.center,
    preferences: request.preferences,
    unscheduled: 0,
    alternatives: [],
    notes: ['Browser QA fixture; all times are estimates.'],
    days: byDay.map((dayPlaces, index) => {
      let time = 540;
      const stops = dayPlaces.map((place, stopIndex) => {
        const travel = { km: 0.5, minutes: 8, reserve: null, kind: 'estimate' };
        time += travel.minutes;
        const stop = {
          place,
          start: time,
          duration: 60,
          end: time + 60,
          travel,
          hoursChecked: false,
          visited: false
        };
        time = stop.end;
        return stop;
      });
      return {
        number: index + 1,
        date: null,
        stops,
        minutes: time - 540,
        confirmed: false,
        forecast: null
      };
    })
  };
  await route.fulfill({ json: { plan } });
});
await page.route('**/api/route', async (route) => {
  const request = route.request().postDataJSON();
  const coordinates = request.places.map((place) => [place.lon, place.lat]);
  await route.fulfill({
    json: { geometry: { type: 'LineString', coordinates }, distance: 650, time: 480, legs: [] }
  });
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const output = '.impeccable/review';
await mkdir(output, { recursive: true });
try {
  console.log('Checking the simplified homepage');
  await page.goto('http://localhost:3000/#home');
  await page.getByRole('heading', { name: 'Where will you explore next?' }).waitFor();
  assert.equal(await page.locator('.home-destinations .destination').count(), 4);
  await page.locator('#home-destination').focus();
  await page.getByRole('option', { name: /Paris.*France/ }).click();
  await page.locator('.place-card').first().waitFor();
  assert.match(page.url(), /#results$/);
  await page.goto('http://localhost:3000/#home');
  await page.locator('#home-destination').fill('Saskatoon');
  await page.getByRole('option', { name: /Saskatoon.*Canada/ }).click();
  await page.locator('.place-card').first().waitFor();
  assert.match(page.url(), /#results$/);
  await page.goto('http://localhost:3000/#home');
  await page.locator('.mode-option[href="#tourist"]').click();
  await page.locator('#travel-form[data-mode=tourist]').waitFor();
  await page.goto('http://localhost:3000/#home');
  await context.grantPermissions([], { origin: 'http://localhost:3000' });
  await page.locator('[data-action=explore-nearby]').click();
  await page.getByText(/Location permission was denied/).waitFor();
  assert(
    await page.locator('#travel-form [name=destination]').isVisible(),
    'Manual city entry remains available after denial'
  );
  await page.goto('http://localhost:3000/#home');
  await page.locator('[data-action=destination][data-city="Paris, France"]').click();
  assert.equal(await page.locator('#travel-form [name=destination]').inputValue(), 'Paris, France');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('http://localhost:3000/#home');
  await page.screenshot({ path: `${output}/homepage-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/homepage-mobile.png`, fullPage: true });

  console.log('Opening the three-step itinerary flow');
  await page.goto('http://localhost:3000/#builder');
  await page.locator('[data-action=continue-planning]').waitFor();
  assert(
    await page.locator('[data-action=continue-planning]').isDisabled(),
    'No stops disables continuing'
  );
  await page.locator('[data-action=select-all]').click();
  assert.equal(await page.locator('[data-select]:checked').count(), 4);
  await page.screenshot({ path: `${output}/itinerary-builder.png`, fullPage: true });
  await page.locator('[data-action=continue-planning]').click();
  await page.locator('#builder-options').waitFor();
  await page.locator('[data-action=days-step][data-delta="-1"]').click();
  assert.equal(
    await page
      .locator('.day-stepper output')
      .evaluate((node) => node.textContent.replace(/\s+/g, '')),
    '1day'
  );
  await page.locator('[data-action=days-step][data-delta="1"]').click();
  await page.locator('[data-action=days-step][data-delta="1"]').click();
  assert.equal(
    await page
      .locator('.day-stepper output')
      .evaluate((node) => node.textContent.replace(/\s+/g, '')),
    '3days'
  );
  await page.locator('[data-action=days-step][data-delta="-1"]').click();
  await page.locator('[name=transport][value=drive]').check();
  await page.screenshot({ path: `${output}/itinerary-settings.png`, fullPage: true });
  await page.locator('[data-action=generate]').click();
  console.log('Waiting for the generated plan');
  if (!(await page.locator('.trip-timeline').evaluate((n) => n.open)))
    await page.locator('.trip-timeline-summary').click();
  await page.locator('.schedule li').first().waitFor();
  assert.equal(await page.locator('.day-tab').count(), 2);
  await page.locator('#trip-map').waitFor();
  const plannedIds = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('roamwise:v1:activePlan')).days.flatMap((day) =>
      day.stops.map((stop) => stop.place.id)
    )
  );
  assert.equal(new Set(plannedIds).size, 4, 'Each selected place appears once');
  assert.equal(plannedIds.length, 4, 'All selected places are scheduled');
  assert.equal(
    await page
      .locator(
        '[data-action=toggle-plan-edit], [data-drag-index], [data-action=remove-stop], [data-action=add-stop], [data-action=change-transport]'
      )
      .count(),
    0,
    'Generated itinerary is read-only'
  );
  await page.locator('[data-action=route-leg]').first().click();
  console.log('Checking the highlighted route');
  await page.getByText(/Highlighted segment to/).waitFor();
  console.log('Checking trip navigation and progress');
  await page.locator('[data-action=toggle-visited]').first().click();
  await page.locator('.schedule li.is-up-next').waitFor();
  await context.grantPermissions(['geolocation'], { origin: 'http://localhost:3000' });
  await context.setGeolocation({ latitude: 45.42, longitude: -75.7 });
  await page.locator('[data-action=use-location-directions]').click();
  await page.waitForFunction(
    () =>
      new URL(
        document.querySelector('.current-destination a[href*="google.com/maps"]')?.href ||
          location.href
      ).searchParams.get('origin') === '45.42,-75.7'
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(_success, failure) {
          failure({ code: 1 });
        }
      }
    })
  );
  await page.locator('[data-action=use-location-directions]').click();
  await page.waitForFunction(() =>
    document.querySelector('.toast')?.textContent.includes('last visited stop')
  );
  const fallbackOrigin = await page
    .locator('.current-destination a[href*="google.com/maps"]')
    .evaluate((link) => new URL(link.href).searchParams.get('origin'));
  assert.equal(
    fallbackOrigin,
    `${places[0].lat},${places[0].lon}`,
    'Denied location uses the last visited stop'
  );
  await page.locator('.itinerary-step.is-complete[href="#builder"]').click();
  await page.locator('.builder-page').waitFor();
  assert.equal(
    await page.locator('[data-select]:checked').count(),
    4,
    'Returning to selection preserves places'
  );
  await page.locator('[data-select]').last().uncheck();
  assert.equal(
    await page.locator('[data-select]:checked').count(),
    3,
    'Destinations change only in selection'
  );
  await page.locator('[data-action=continue-planning]').click();
  await page.locator('[data-action=days-step][data-delta="-1"]').click();
  assert.equal(
    await page
      .locator('.day-stepper output')
      .evaluate((node) => node.textContent.replace(/\s+/g, '')),
    '1day'
  );
  await page.locator('[data-action=generate]').click();
  await page.locator('#trip-map').waitFor();
  const revisedPlan = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('roamwise:v1:activePlan'))
  );
  const revisedIds = revisedPlan.days.flatMap((day) => day.stops.map((stop) => stop.place.id));
  assert.equal(revisedPlan.days.length, 1, 'A one-day plan is supported');
  assert.equal(revisedIds.length, 3, 'Regeneration uses the revised selection');
  assert.equal(new Set(revisedIds).size, 3, 'Every revised selection is included once');
  await page.locator('[data-action=save-plan]').click();
  assert.equal(await page.locator('[data-action=save-plan]').count(), 1, 'Trip can be saved');
  await page.waitForTimeout(4400);
  for (const [name, width, height] of [
    ['desktop', 1440, 960],
    ['tablet', 820, 1180],
    ['mobile', 390, 844],
    ['narrow-mobile', 360, 800]
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert(overflow <= 1, `${name} itinerary layout overflows by ${overflow}px`);
    if (name === 'desktop' || name === 'mobile') {
      await page.screenshot({ path: `${output}/itinerary-${name}.png`, fullPage: true });
    }
  }
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('; ')}`);
  console.log(
    'PASS browser checks: homepage search and mode entry, denied location fallback, destination cards, three-step itinerary, exact saved-place coverage, transport and duration controls, map route, visited progression, back-to-selection and one-day regeneration, desktop/tablet/mobile/narrow layouts; no overflow or JavaScript errors.'
  );
} finally {
  await browser.close();
}
