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
          body.preferences.mode === 'local'
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
    assert.match(document.querySelector('h1').textContent, /Discover more/);
    await navigate('tourist');
    change('[name=destination]', 'Paris, France');
    change('[name=days]', '2');
    document
      .querySelector('#travel-form')
      .dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    await until(() => document.querySelectorAll('.place-card').length === 4);
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
    assert.match(document.querySelector('#details-facts').textContent, /Not available/);
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
    click('[data-action=generate]');
    await until(() => document.querySelectorAll('.day-tab').length === 2);
    assert.equal(document.querySelectorAll('.schedule li').length, 2);
    click('[data-action=save-plan]');
    assert.equal(JSON.parse(localStorage.getItem('roamwise:v1:plans')).length, 1);
    click('[data-action=remove-stop]');
    assert.equal(document.querySelectorAll('.schedule li').length, 1);
    await navigate('saved');
    assert.equal(document.querySelectorAll('.place-card').length, 1);
    click('[data-action=saved-tab][data-tab=plans]');
    assert.equal(document.querySelectorAll('.saved-plan').length, 1);
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
    change('[name=dailyBudget]', '30');
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
    assert.equal(JSON.parse(sessionStorage.getItem('roamwise:v1:selection')).length, 0);
    click('[data-select="fixture-park"]');
    await navigate('builder');
    click('[data-action=generate]');
    await until(() => document.querySelectorAll('.day-tab').length === 1);
    assert.equal(document.querySelectorAll('.schedule li').length, 1);
    assert.equal(
      JSON.parse(localStorage.getItem('roamwise:v1:favorites')).length,
      1,
      'Favorites survive navigation and plan generation'
    );
    const snapshots = {
      favorites: localStorage.getItem('roamwise:v1:favorites'),
      plans: localStorage.getItem('roamwise:v1:plans')
    };
    const refreshed = new JSDOM('<!doctype html>', { url: 'http://localhost:3000' });
    global.localStorage = refreshed.window.localStorage;
    for (const [key, value] of Object.entries(snapshots))
      global.localStorage.setItem(`roamwise:v1:${key}`, value);
    const freshStore = await import('../public/js/store.js?refresh-test');
    assert.equal(freshStore.saved.favorites.length, 1);
    assert.equal(freshStore.saved.plans.length, 1);
    refreshed.window.close();
  } finally {
    global.fetch = originalFetch;
    win.close();
  }
});
