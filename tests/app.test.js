import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { buildPlan } from '../server/planner.js';
import { preferences } from '../server/validation.js';

test('DOM flow: search, filter, details/back, favorites, map, two-day plan, save, local outing and denied geolocation', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, {
    url: 'http://localhost:3000/#home',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const win = dom.window;
  for (const name of [
    'window',
    'document',
    'location',
    'localStorage',
    'sessionStorage',
    'HTMLElement',
    'Element',
    'SVGElement',
    'FormData'
  ])
    global[name] = name === 'window' ? win : win[name];
  Object.defineProperty(global, 'navigator', { value: win.navigator, configurable: true });
  win.scrollTo = () => {};
  win.confirm = () => true;
  Object.defineProperty(win.navigator, 'geolocation', {
    value: {
      getCurrentPosition(_success, failure) {
        failure({ code: 1 });
      }
    },
    configurable: true
  });
  win.eval(
    await readFile(new URL('../node_modules/leaflet/dist/leaflet.js', import.meta.url), 'utf8')
  );
  global.L = win.L;
  L.Browser.svg = true;
  const places = [
    {
      id: 'fixture-museum',
      name: 'Fixture museum',
      category: 'museums',
      setting: 'indoor',
      lat: 45.421,
      lon: -75.69
    },
    {
      id: 'fixture-park',
      name: 'Fixture park',
      category: 'nature',
      setting: 'outdoor',
      lat: 45.422,
      lon: -75.69
    },
    {
      id: 'fixture-cafe',
      name: 'Fixture café',
      category: 'food',
      setting: 'indoor',
      lat: 45.423,
      lon: -75.69
    },
    {
      id: 'fixture-landmark',
      name: 'Fixture landmark',
      category: 'landmarks',
      setting: 'unknown',
      lat: 45.424,
      lon: -75.69
    }
  ].map((p, i) => ({
    ...p,
    address: 'Fixture address',
    categories: [],
    price: { kind: 'unknown', amount: null, currency: null, text: 'Not available' },
    hours: null,
    website: null,
    description: null,
    distance: i * 100,
    source: 'Synthetic test fixture',
    retrievedAt: '2026-10-31T12:00:00Z'
  }));
  const originalFetch = global.fetch;
  let delayPersonalization = false,
    releasePersonalization;
  global.fetch = async (path, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    let data;
    if (path.startsWith('/api/geocode')) {
      if (String(path).includes('invalidcity'))
        return Response.json({ error: 'No destination found.' }, { status: 404 });
      data = {
        results: [
          { name: 'Fixture city', label: 'Fixture city, test only', lat: 45.42, lon: -75.69 }
        ]
      };
    } else if (path === '/api/search')
      data = {
        places:
          body.preferences.query === 'Starbucks'
            ? places.slice(0, 3).map((p, i) => ({
                ...p,
                name: 'Starbucks',
                category: 'cafes',
                brand: 'Starbucks',
                brandId: 'Q37158',
                address: ['A Street', 'B Street', 'C Street'][i]
              }))
            : body.preferences.query === 'Atelier Brancusi'
              ? [{ ...places[0], name: "Brancusi's Studio", matchedQuery: 'Atelier Brancusi' }]
              : body.preferences.mode === 'local'
                ? places.map((p) => ({ ...p, name: `Local ${p.name}` }))
                : places,
        weather: null,
        preferences: preferences(body.preferences)
      };
    else if (path === '/api/details') data = { place: body.place };
    else if (path === '/api/personalize')
      data = {
        source: 'gemini',
        message: 'Test matching completed.',
        places: [...body.places].reverse(),
        picks: []
      };
    else if (path === '/api/plan')
      data = { plan: buildPlan(body.places, preferences(body.preferences), body.center, null) };
    else if (path === '/api/route')
      data = {
        geometry: { type: 'LineString', coordinates: body.places.map((p) => [p.lon, p.lat]) },
        distance: 1000,
        time: 900
      };
    else throw new Error(`Unexpected test request ${path}`);
    if (path === '/api/personalize' && delayPersonalization) {
      return new Promise((resolve) => {
        releasePersonalization = () => resolve(Response.json(data));
      });
    }
    return Response.json(data);
  };
  const until = async (fn) => {
    for (let i = 0; i < 100; i++) {
      if (fn()) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('Expected DOM state did not appear.');
  };
  const navigate = async (hash) => {
    win.location.hash = hash;
    await until(
      () =>
        document.querySelector('main').innerHTML &&
        (hash === 'tourist' || hash === 'local'
          ? document.querySelector('#travel-form')?.dataset.mode === hash
          : hash === 'results'
            ? document.querySelector('#results-content')
            : true)
    );
    await new Promise((r) => setTimeout(r, 10));
  };
  const click = (selector) => {
    const node = document.querySelector(selector);
    assert(node, `Missing ${selector}`);
    node.click();
  };
  const change = (selector, value) => {
    const node = document.querySelector(selector);
    node.value = value;
    node.dispatchEvent(new win.Event('input', { bubbles: true }));
    node.dispatchEvent(new win.Event('change', { bubbles: true }));
  };
  try {
    await import('../public/js/app.js');
    assert.equal(document.querySelector('h1').textContent, 'Where will you explore next?');
    assert.equal(
      document.querySelector('#home-destination').placeholder,
      'Search cities or destinations...'
    );
    assert.equal(document.querySelectorAll('.home-modes .mode-option').length, 2);
    assert.equal(document.querySelectorAll('.home-destinations .destination').length, 4);
    await navigate('tourist');
    change('[name=destination]', 'Paris, France');
    change('[name=days]', '2');
    document
      .querySelector('#travel-form')
      .dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    await until(() => document.querySelectorAll('.place-card').length === 4);
    const credit = document.createElement('details');
    credit.className = 'photo-credit';
    credit.innerHTML = '<summary>Photo credits</summary><p>Required attribution</p>';
    document.querySelector('.place-card').append(credit);
    const beforeCredits = location.hash;
    credit.querySelector('summary').click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(location.hash, beforeCredits, 'Photo credits expand without opening the place');
    credit.remove();
    change('#category-filter', 'museums');
    assert.equal(document.querySelectorAll('.place-card').length, 1);
    change('#result-search', 'does not exist');
    assert.equal(document.querySelectorAll('.place-card').length, 0);
    click('[data-action=reset-filters]');
    assert.equal(document.querySelectorAll('.place-card').length, 4);
    click('[data-action=favorite]');
    assert.equal(JSON.parse(localStorage.getItem('roamwise:v1:favorites')).length, 1);
    change('#category-filter', 'museums');
    click('.place-card h3 a');
    await until(() => document.querySelector('#details-facts'));
    assert.match(document.querySelector('#details-facts').textContent, /Hours unavailable/);
    click('main .back-link');
    await until(() => document.querySelector('#category-filter'));
    assert.equal(document.querySelector('#category-filter').value, 'museums');
    assert.equal(document.querySelectorAll('.place-card').length, 1);
    change('#category-filter', 'all');
    click('[data-action=view][data-view=map]');
    assert(document.querySelector('.leaflet-container'));
    assert.equal(document.querySelectorAll('.leaflet-marker-icon').length, 4);
    click('[data-action=personalize]');
    await until(() =>
      document.querySelector('.results-info').textContent.includes('Test matching')
    );
    await navigate('builder');
    assert(
      document.querySelector('[data-action=continue-planning]').disabled,
      'Itinerary generation requires selected stops'
    );
    click('[data-action=select-all]');
    assert.equal(
      document.querySelectorAll('[data-select]:checked').length,
      1,
      'Only saved places are offered initially'
    );
    click('[data-action=clear-selection]');
    await navigate('results');
    document.querySelectorAll('[data-action=favorite]').forEach((button) => {
      if (button.getAttribute('aria-pressed') !== 'true') button.click();
    });
    await navigate('builder');
    assert.equal(document.querySelectorAll('[data-select]').length, 4);
    click('[data-action=select-all]');
    assert.equal(document.querySelectorAll('[data-select]:checked').length, 4);
    await navigate('results');
    await navigate('builder');
    assert.equal(
      document.querySelectorAll('[data-select]:checked').length,
      4,
      'Place choices survive going back and returning'
    );
    click('[data-action=clear-selection]');
    assert(document.querySelector('[data-action=continue-planning]').disabled);
    click('[data-action=select-all]');
    assert.equal(document.querySelectorAll('[data-select]:checked').length, 4);
    click('[data-action=continue-planning]');
    await until(() => Boolean(document.querySelector('#builder-options')));
    assert.equal(
      document.querySelector('.itinerary-step[aria-current="step"]').textContent.trim(),
      '2Generate Plan'
    );
    const drive = document.querySelector('[name=transport][value=drive]');
    drive.checked = true;
    drive.dispatchEvent(new win.Event('change', { bubbles: true }));
    assert.equal(document.querySelector('[name=transport][value=drive]').checked, true);
    click('[data-action=generate]');
    await until(() => document.querySelectorAll('.day-tab').length === 2);
    await until(() => Boolean(document.querySelector('#trip-map')));
    assert.equal(document.querySelectorAll('.schedule li').length, 2);
    assert.equal(document.querySelectorAll('[data-action=toggle-plan-edit]').length, 0);
    assert.equal(
      document.querySelectorAll(
        '[data-drag-index], [data-action=remove-stop], [data-action=add-stop]'
      ).length,
      0
    );
    click('[data-action=route-leg][data-index="1"]');
    await until(() =>
      /Highlighted segment|route segment is unavailable/i.test(
        document.querySelector('#trip-route-status')?.textContent || ''
      )
    );
    assert.match(document.querySelector('#trip-route-status').textContent, /Highlighted segment/);
    assert(document.querySelector('#trip-map'), 'Trip screen displays the interactive route map');
    click('[data-action=toggle-visited]');
    assert(
      JSON.parse(localStorage.getItem('roamwise:v1:activePlan')).days.some((day) =>
        day.stops.some((stop) => stop.visited)
      ),
      'Visited progress is persisted'
    );
    assert(document.querySelector('.schedule li.is-up-next'), 'Next unvisited stop is highlighted');
    click('[data-action=day][data-day="0"]');
    click('[data-action=toggle-visited]');
    assert.equal(
      JSON.parse(localStorage.getItem('roamwise:v1:activePlan')).days[0].stops[0].visited,
      false,
      'Visited status can be undone'
    );
    click('[data-action=toggle-visited]');
    assert.equal(
      document.querySelectorAll('[data-action=day]').length,
      2,
      'Days remain selectable'
    );
    click('[data-action=save-plan]');
    assert.equal(JSON.parse(localStorage.getItem('roamwise:v1:plans')).length, 1);
    await navigate('saved');
    assert.equal(document.querySelectorAll('.place-card').length, 4);
    click('[data-action=saved-tab][data-tab=plans]');
    assert.equal(document.querySelectorAll('.saved-plan').length, 1);
    click('[data-action=open-plan]');
    await until(() => Boolean(document.querySelector('#trip-map')));
    await navigate('results');
    delayPersonalization = true;
    click('[data-action=personalize]');
    await until(() => typeof releasePersonalization === 'function');
    await navigate('local');
    click('[data-action=locate]');
    await until(() => document.querySelector('#location-status').textContent.includes('denied'));
    change('[name=destination]', 'invalidcity');
    document
      .querySelector('#travel-form')
      .dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    await until(() =>
      document.querySelector('#form-message')?.textContent.includes('No destination')
    );
    change('[name=destination]', 'Ottawa, Canada');
    change('[name=hours]', '3');
    document
      .querySelector('#travel-form')
      .dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    await until(() => document.querySelectorAll('.place-card').length === 4);
    releasePersonalization();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert(
      [...document.querySelectorAll('.place-card h3')].every((h) =>
        h.textContent.startsWith('Local ')
      ),
      'A stale AI response must not replace a newer city search'
    );
    assert.equal(JSON.parse(localStorage.getItem('roamwise:v1:selection')).length, 0);
    click('[data-select="fixture-park"]');
    await navigate('builder');
    click('[data-action=continue-planning]');
    await until(() => Boolean(document.querySelector('#builder-options')));
    click('[data-action=generate]');
    await until(() => document.querySelectorAll('.day-tab').length === 1);
    assert.equal(document.querySelectorAll('.schedule li').length, 1);
    assert.equal(
      JSON.parse(localStorage.getItem('roamwise:v1:favorites')).length,
      4,
      'Favorites survive navigation and plan generation'
    );
    await navigate('results');
    change('#result-search', 'Starbucks');
    document
      .querySelector('#place-name-search')
      .dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    await until(() => document.querySelector('.branch-group-card'));
    assert.equal(document.querySelectorAll('.place-card').length, 1);
    click('.branch-group-card h3 a');
    await until(() => document.querySelector('#branches-map'));
    assert.equal(document.querySelectorAll('.place-card').length, 3);
    assert.equal(document.querySelectorAll('.leaflet-marker-icon').length, 3);
    click('[data-action=origin-locate]');
    await until(() => document.querySelector('#origin-status').textContent.includes('denied'));
    change('#origin-input', '45.424, -75.69');
    document
      .querySelector('#origin-form')
      .dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    await until(() =>
      document.querySelector('.origin-settings summary').textContent.includes('chosen coordinates')
    );
    assert.equal(document.querySelector('.place-card').dataset.place, 'fixture-cafe');
    click('.place-card h3 a');
    await until(() => document.querySelector('#details-facts'));
    assert.equal(document.querySelectorAll('a').length > 0, true);
    assert(
      !document
        .querySelector('main')
        .textContent.match(/budget|entry cost|ticket price|official website/i)
    );
    assert(
      document.querySelector('main .back-link').getAttribute('href').startsWith('#locations/')
    );
    click('main .back-link');
    await until(() => document.querySelector('#branches-map'));
    assert.equal(document.querySelectorAll('.place-card').length, 3);
    await navigate('results');
    change('#result-search', 'Atelier Brancusi');
    document
      .querySelector('#place-name-search')
      .dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    await until(() => document.querySelector('.place-card h3')?.textContent.includes('Brancusi'));
    assert.equal(
      document.querySelectorAll('.place-card').length,
      1,
      'Provider-translated place names remain visible for their matched query'
    );
    const snapshots = {
      favorites: localStorage.getItem('roamwise:v1:favorites'),
      plans: localStorage.getItem('roamwise:v1:plans'),
      activePlan: localStorage.getItem('roamwise:v1:activePlan'),
      selection: localStorage.getItem('roamwise:v1:selection')
    };
    const refreshed = new JSDOM('<!doctype html>', { url: 'http://localhost:3000' });
    global.localStorage = refreshed.window.localStorage;
    for (const [key, value] of Object.entries(snapshots))
      global.localStorage.setItem(`roamwise:v1:${key}`, value);
    const freshStore = await import('../public/js/store.js?refresh-test');
    assert.equal(freshStore.saved.favorites.length, 4);
    assert.equal(
      freshStore.saved.plans.length,
      2,
      'Both the earlier saved trip and the new active outing survive refresh'
    );
    assert(
      JSON.parse(global.localStorage.getItem('roamwise:v1:activePlan'))?.days,
      'Active trip state survives a refresh'
    );
    refreshed.window.close();
  } finally {
    global.fetch = originalFetch;
    win.close();
  }
});
