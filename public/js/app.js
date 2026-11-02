import { api } from './api.js';
import { read, write, saved } from './store.js';
import { icon } from './icons.js';
import { clearMaps, createMap, drawRoute, directions, dayDirections } from './maps.js';

const main = document.querySelector('main'),
  header = document.querySelector('#header');
const labels = {
  landmarks: 'Famous landmarks',
  food: 'Restaurants & cafés',
  museums: 'Museums & history',
  nature: 'Nature & parks',
  entertainment: 'Entertainment',
  shopping: 'Shopping',
  hidden: 'Off the usual path',
  free: 'Reported free entry'
};
const images = {
  landmarks: 'paris.jpg',
  food: 'food.jpg',
  museums: 'city.jpg',
  nature: 'nature.jpg',
  entertainment: 'city.jpg',
  shopping: 'city.jpg',
  hidden: 'nature.jpg'
};
const descriptions = {
  landmarks: 'Make room for a little history and a different perspective.',
  food: 'Take a break, settle in, and make a meal part of the adventure.',
  museums: 'Slow down and spend some time with culture and history.',
  nature: 'A chance to step outside and enjoy a change of scenery.',
  entertainment: 'Bring a little entertainment into your day.',
  shopping: 'Leave some time to browse and explore.',
  hidden: 'Follow your curiosity somewhere a little different.'
};
const emptyFilters = {
  query: '',
  category: 'all',
  setting: 'any',
  free: false,
  sort: 'recommended'
};
const initial = read('discovery', null, true);
const state = {
  places: initial?.places || [],
  center: initial?.center || null,
  prefs: initial?.prefs || null,
  weather: initial?.weather || null,
  filters: { ...emptyFilters, ...initial?.filters },
  view: initial?.view || 'list',
  selection: read('selection', [], true),
  plan: read('activePlan', null, true),
  day: 0,
  ai: initial?.ai || null,
  drafts: read('drafts', {}, true),
  coordinates: null,
  cityChoices: [],
  busy: false,
  error: '',
  savedTab: 'places',
  detailsReturn: '#results'
};
let toastTimer,
  searchVersion = 0,
  renderVersion = 0;
const e = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );
const selected = (id) => state.selection.some((p) => p.id === id);
const favorite = (id) => saved.favorites.some((p) => p.id === id);
const route = () => {
  try {
    return decodeURIComponent(location.hash.slice(1) || 'home');
  } catch {
    return 'home';
  }
};
const go = (path) => {
  if (location.hash === `#${path}`) render();
  else location.hash = path;
};
function flash(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 4300);
}
function persist() {
  write(
    'discovery',
    {
      places: state.places,
      center: state.center,
      prefs: state.prefs,
      weather: state.weather,
      filters: state.filters,
      view: state.view,
      ai: state.ai
    },
    true
  );
}
function persistSelection() {
  write('selection', state.selection, true);
  updateHeader();
}
function placeById(id) {
  return [
    ...state.places,
    ...state.selection,
    ...saved.favorites,
    ...(state.plan?.days.flatMap((d) => d.stops.map((s) => s.place)) || []),
    ...(state.plan?.alternatives || []),
    ...saved.plans.flatMap((p) => p.days.flatMap((d) => d.stops.map((s) => s.place)))
  ].find((p) => p.id === id);
}
function updateHeader() {
  const current = route();
  header.innerHTML = `<div class="nav-inner"><a class="brand" href="#home" aria-label="Roamwise home">${icon('compass')}roamwise<span class="brand-dot">.</span></a><button class="mobile-toggle" aria-label="Open navigation" aria-expanded="false" data-action="menu">${icon('menu')}</button><nav class="nav-links" aria-label="Main navigation"><a href="#tourist" class="${current === 'tourist' ? 'active' : ''}">Tourist mode</a><a href="#local" class="${current === 'local' ? 'active' : ''}">Local mode</a><a href="#builder" class="${current === 'builder' ? 'active' : ''}">My itinerary ${state.selection.length ? `<span class="count">${state.selection.length}</span>` : ''}</a><a href="#saved" class="saved-nav ${current === 'saved' ? 'active' : ''}">${icon('heart')}Saved <span class="count">${saved.favorites.length + saved.plans.length}</span></a></nav></div>`;
}
function empty(title, message, button = 'Start exploring', path = 'tourist') {
  return `<div class="empty">${icon('compass')}<h2>${e(title)}</h2><p>${e(message)}</p>${button ? `<a class="btn" href="#${path}">${e(button)}${icon('arrow')}</a>` : ''}</div>`;
}
function loading(
  title = 'Finding your kind of places…',
  subtitle = 'Searching real places and checking the forecast.'
) {
  return `<div class="loading" role="status"><div class="spinner" aria-hidden="true"></div><p>${e(title)}</p><small>${e(subtitle)}</small></div>`;
}
function back(path, label = 'Back') {
  return `<a href="${path}" class="back-link">${icon('back')}${e(label)}</a>`;
}
function priceText(p) {
  if (p.price.amount === 0) return 'Reported free entry';
  if (p.price.kind === 'reported') return `${p.price.text} · source-reported`;
  return p.price.text === 'Not available' ? 'Price: Not available' : p.price.text;
}
function photo(p, cls = '') {
  return `<div class="${cls}"><img src="${e(p.image || `/assets/${images[p.category] || 'city.jpg'}`)}" alt="${p.image ? e(p.name) : ''}" loading="lazy" data-fallback="/assets/${images[p.category] || 'city.jpg'}"><span class="image-note">${p.image ? 'Source-linked place photo' : 'Category inspiration photo · not this place'}</span></div>`;
}
function card(p) {
  return `<article class="place-card" data-place="${e(p.id)}"><div class="place-image"><a href="#place/${encodeURIComponent(p.id)}" aria-label="View ${e(p.name)}">${photo(p, 'card-photo')}</a><button class="icon-button ${favorite(p.id) ? 'favorited' : ''}" data-action="favorite" data-id="${e(p.id)}" aria-label="${favorite(p.id) ? 'Remove from' : 'Add to'} favorites: ${e(p.name)}" aria-pressed="${favorite(p.id)}">${icon('heart')}</button></div><div class="place-card-body"><div class="place-category">${e(labels[p.category])}${p.setting !== 'unknown' ? ` · ${e(p.setting)}` : ''}</div><h3><a href="#place/${encodeURIComponent(p.id)}">${e(p.name)}</a></h3><p class="place-description">${e(p.description || descriptions[p.category])}</p><div class="place-address">${icon('pin')}<span>${e(p.address || 'Address: Not available')}</span></div><div class="place-meta"><strong>${e(priceText(p))}</strong><span>Hours: ${e(p.hours || 'Not available')}</span>${p.distance != null ? `<span>${(p.distance / 1000).toFixed(1)} km from search center · straight line</span>` : ''}</div><div class="card-bottom"><label class="select-stop"><input type="checkbox" data-select="${e(p.id)}" ${selected(p.id) ? 'checked' : ''}> Add to plan</label><a href="#place/${encodeURIComponent(p.id)}" class="btn secondary small">View details${icon('arrow')}</a></div></div></article>`;
}

function home() {
  return `<div class="container"><section class="hero"><div class="hero-copy"><h1>Discover more.<br><span>Explore smarter.</span></h1><p>Some of the best moments start with a little curiosity. Find real places you’ll love, and turn them into a day that feels like you.</p><form class="home-search" id="home-search">${icon('pin')}<label><span>YOUR NEXT ADVENTURE</span><input name="destination" aria-label="Destination city" placeholder="Where do you want to go?" autocomplete="off" required minlength="2" maxlength="180"></label><button class="btn" type="submit" aria-label="Explore destination">Explore${icon('arrow')}</button></form><div class="hero-note">${icon('check')}Real places. Thoughtful plans. More room to wander.</div></div><div class="hero-photo"><img src="/assets/mountains.jpg" alt="Sunlight catching a rugged mountain peak beneath a blue sky" fetchpriority="high"><div class="photo-caption">${icon('compass')}A little further from ordinary.</div></div></section><div class="intro-strip"><span>${icon('pin')}Places worth discovering</span><span>${icon('route')}Routes that make sense</span><span>${icon('spark')}A little help from AI</span><span>${icon('heart')}Your favorites, always with you</span></div><section class="section" id="choose-mode"><div class="section-head"><div><h2>Near or far. Make it yours.</h2><p>A new city or your own neighborhood. There’s always something to discover.</p></div></div><div class="mode-grid"><a href="#tourist" class="mode-card"><div class="mode-card-copy">${icon('globe')}<h3>Somewhere new.</h3><p>Find the sights, little cafés, and unexpected stops that make a trip your own.</p><span class="text-link">Explore tourist mode${icon('arrow')}</span></div><img src="/assets/paris.jpg" alt="Paris rooftops with the Eiffel Tower in the distance" loading="lazy"></a><a href="#local" class="mode-card"><div class="mode-card-copy">${icon('locate')}<h3>Closer to home.</h3><p>A free afternoon can become a great story. Find a fresh way to spend it nearby.</p><span class="text-link">Explore local mode${icon('arrow')}</span></div><img src="/assets/food.jpg" alt="Warmly lit restaurant interior" loading="lazy"></a></div></section></div><section class="section-soft"><div class="container section"><div class="section-head"><div><h2>Where curiosity could take you.</h2><p>A few starting points. Your live search begins when you choose a city.</p></div><a href="#tourist" class="btn quiet">Find your next place${icon('arrow')}</a></div><div class="destination-grid"><button class="destination" data-action="destination" data-city="Paris, France"><img src="/assets/paris.jpg" alt="Paris" loading="lazy"><span class="destination-label"><span>Paris, France<small>Art, architecture & long café stops</small></span>${icon('arrow')}</span></button><button class="destination" data-action="destination" data-city="Ottawa, Canada"><img src="/assets/nature.jpg" alt="Lake and mountains, travel inspiration" loading="lazy"><span class="destination-label"><span>Ottawa, Canada<small>Find a new side of the capital · inspiration photo</small></span>${icon('arrow')}</span></button><button class="destination" data-action="destination" data-city="New York, USA"><img src="/assets/city.jpg" alt="City skyline" loading="lazy"><span class="destination-label"><span>New York, USA<small>A different discovery around every corner</small></span>${icon('arrow')}</span></button></div></div></section>`;
}

const defaults = (mode) => ({
  destination: '',
  mode,
  days: 2,
  hours: mode === 'local' ? 3 : 8,
  radius: mode === 'local' ? 5000 : 10000,
  startDate: '',
  dailyBudget: mode === 'local' ? 30 : 100,
  totalBudget: '',
  currency: 'CAD',
  transport: 'walk',
  pace: 'balanced',
  setting: 'any',
  interests: []
});
const options = (items, value) =>
  items
    .map(
      ([v, label]) =>
        `<option value="${e(v)}" ${String(v) === String(value) ? 'selected' : ''}>${e(label)}</option>`
    )
    .join('');
function travelForm(mode) {
  const p = { ...defaults(mode), ...state.drafts[mode], mode };
  return `<div class="container page">${back('#home', 'Back to exploring')}<div class="page-heading"><div><h1>${mode === 'local' ? 'A good day is closer than you think.' : 'Let’s find your next adventure.'}</h1><p>${mode === 'local' ? 'A little time. A little curiosity. Something new around the corner.' : 'Tell us what brings you here. We’ll help you make the most of it.'}</p></div></div><div class="form-layout"><form id="travel-form" class="travel-form" data-mode="${mode}">${mode === 'local' ? `<div class="location-row"><button type="button" class="btn secondary small" data-action="locate">${icon('locate')}Use my current location</button><span class="small-text muted" id="location-status">${state.coordinates ? 'Location ready. Or enter a different city below.' : 'Or search a city manually below.'}</span></div>` : ''}<div class="field-grid"><label class="field full">${mode === 'local' ? 'City or neighborhood city' : 'Where are you going?'}<input name="destination" placeholder="${mode === 'local' ? 'e.g. Ottawa, Canada' : 'e.g. Paris, France'}" value="${e(p.destination)}" autocomplete="off" minlength="2" maxlength="180" ${mode === 'local' ? '' : 'required'}><small>${mode === 'local' ? 'Location permission is optional. Manual city search always works.' : 'Include the country to find the right city.'}</small></label>${mode === 'tourist' ? `<label class="field">Days to explore<input name="days" type="number" min="1" max="14" value="${p.days}" required></label>` : ''}<label class="field">${mode === 'tourist' ? 'Trip start date (optional)' : 'Outing date (optional)'}<input name="startDate" type="date" value="${e(p.startDate)}"><small>Dates enable forecast and simple opening-hour checks.</small></label><label class="field">${mode === 'local' ? 'Time available' : 'Hours to explore each day'}<select name="hours">${options(
    (mode === 'local' ? [1, 2, 3, 4, 5, 6, 8, 10, 12] : [3, 4, 5, 6, 7, 8, 9, 10, 12]).map((n) => [
      n,
      `${n} hours`
    ]),
    p.hours
  )}</select></label><label class="field">Search radius<select name="radius">${options(
    [
      [1000, '1 km · a small neighborhood'],
      [3000, '3 km · a little further'],
      [5000, '5 km · nearby discoveries'],
      [10000, '10 km · across the city'],
      [20000, '20 km · room to explore'],
      [30000, '30 km · a wider adventure']
    ],
    p.radius
  )}</select></label></div><section class="form-section"><h2>Your travel style</h2><div class="field-grid"><label class="field">Getting around<select name="transport">${options(
    [
      ['walk', 'Walking'],
      ['drive', 'Driving'],
      ['transit', 'Public transportation']
    ],
    p.transport
  )}</select></label><label class="field">Travel pace<select name="pace">${options(
    [
      ['relaxed', 'Relaxed · take your time'],
      ['balanced', 'Balanced · a bit of everything'],
      ['packed', 'Packed · see a little more']
    ],
    p.pace
  )}</select></label>${
    mode === 'local'
      ? `<label class="field full">Indoor or outdoor?<select name="setting">${options(
          [
            ['any', 'A mix of both'],
            ['indoor', 'Indoors'],
            ['outdoor', 'Outdoors']
          ],
          p.setting
        )}</select><small>Only places with a matching known setting appear when filtered.</small></label>`
      : ''
  }</div></section><fieldset class="form-section"><legend>What are you drawn to?</legend><p>Choose a few interests, or leave them open for a mix.</p><div class="interest-grid">${Object.entries(
    labels
  )
    .map(
      ([key, label]) =>
        `<label class="choice"><input type="checkbox" name="interests" value="${key}" ${p.interests.includes(key) ? 'checked' : ''}>${label}</label>`
    )
    .join(
      ''
    )}</div></fieldset><section class="form-section"><h2>A budget that works for you</h2><div class="field-grid"><label class="field">${mode === 'local' ? 'Outing budget' : 'Daily budget'}<input type="number" name="dailyBudget" value="${p.dailyBudget}" min="0" max="100000" step="1" required></label><label class="field">Budget currency<select name="currency">${options(
    ['CAD', 'USD', 'EUR', 'GBP', 'JPY', 'AUD'].map((x) => [x, x]),
    p.currency
  )}</select></label>${mode === 'tourist' ? `<label class="field full">Total trip budget (optional)<input type="number" name="totalBudget" value="${e(p.totalBudget)}" min="0" max="1000000" step="1" placeholder="Leave blank to use your daily budget"></label>` : ''}</div><p class="source-note">Known entry costs inform planning. Unknown prices stay unknown; meals, transport, and accommodation are not included. No automatic currency conversion.</p></section><div id="form-message" class="notice ${state.error ? 'error' : ''}" role="status">${e(state.error)}</div><div id="city-choices" class="city-choices"></div><div class="form-submit"><p>Real place data first. A thoughtful plan comes next.</p><button class="btn" type="submit">${icon('search')}Find my places${icon('arrow')}</button></div></form><aside class="form-aside"><div class="form-aside-photo"><img src="/assets/${mode === 'local' ? 'food.jpg' : 'nature.jpg'}" alt="${mode === 'local' ? 'Inviting restaurant interior' : 'A lake surrounded by mountains'}"></div><h3>${mode === 'local' ? 'Make an ordinary day a little less ordinary.' : 'Less planning. More being there.'}</h3><p>You bring the curiosity. Roamwise brings real places, personal recommendations, and a route that connects the dots.</p><ul class="aside-list"><li>${icon('pin')}Actual places, sourced from Geoapify</li><li>${icon('spark')}Interest matching with Gemini AI</li><li>${icon('route')}Geographic planning that groups nearby stops</li><li>${icon('heart')}Save your favorites, without an account</li></ul><p class="small-text">Inspiration photo. Recommendations use live place data.</p></aside></div></div>`;
}
function formValues(form) {
  const d = new FormData(form);
  const p = {
    ...defaults(form.dataset.mode),
    ...Object.fromEntries(d.entries()),
    mode: form.dataset.mode,
    interests: d.getAll('interests')
  };
  state.drafts[p.mode] = p;
  write('drafts', state.drafts, true);
  return p;
}
function weatherMarkup() {
  const w = state.weather;
  if (!w)
    return `<div class="notice">Weather is temporarily unavailable. Your search and plans still work.</div>`;
  const date = state.prefs?.startDate;
  const forecast = date ? w.days.find((d) => d.date === date) : w.days[0];
  return `<div class="weather-strip">${icon(forecast?.rain >= 50 ? 'rain' : 'sun')}${forecast ? `<span class="weather-temp">${Math.round(forecast.high)}°C</span><span>${e(forecast.label)} · ${e(forecast.date)} · high ${Math.round(forecast.high)}° / low ${Math.round(forecast.low)}°</span><span>Rain: ${forecast.rain == null ? 'Not available' : forecast.rain + '%'}</span><span>${forecast.rain >= 50 ? 'Consider indoor stops today.' : 'A little fresh air could be a good idea.'}</span>` : `<span>No forecast is available for ${e(date)}. Available range: ${e(w.days[0]?.date)} to ${e(w.days.at(-1)?.date)}.</span>`}<a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a></div>`;
}
function filteredPlaces() {
  const f = state.filters;
  let places = state.places.filter(
    (p) =>
      (!f.query ||
        `${p.name} ${p.address} ${labels[p.category]}`
          .toLowerCase()
          .includes(f.query.toLowerCase())) &&
      (f.category === 'all' || p.category === f.category) &&
      (f.setting === 'any' || p.setting === f.setting) &&
      (!f.free || p.price.amount === 0)
  );
  if (f.sort === 'distance')
    places.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  else if (f.sort === 'name') places.sort((a, b) => a.name.localeCompare(b.name));
  return places;
}
function resultControls() {
  const f = state.filters;
  return `<div class="filters"><label class="filter-search">${icon('search')}<input type="search" id="result-search" aria-label="Search retrieved places" placeholder="Search places, categories, or addresses" value="${e(f.query)}"></label><select id="category-filter" aria-label="Filter by category">${options([['all', 'All categories'], ...Object.entries(labels).filter(([key]) => key !== 'free')], f.category)}</select><select id="setting-filter" aria-label="Filter by indoor or outdoor">${options(
    [
      ['any', 'Any setting'],
      ['indoor', 'Indoors'],
      ['outdoor', 'Outdoors']
    ],
    f.setting
  )}</select><select id="sort-filter" aria-label="Sort results">${options(
    [
      ['recommended', 'Recommended'],
      ['distance', 'Nearest first'],
      ['name', 'Name A–Z']
    ],
    f.sort
  )}</select><label class="choice"><input id="free-filter" type="checkbox" ${f.free ? 'checked' : ''}> Reported free</label><div class="view-switch" aria-label="Results view"><button data-action="view" data-view="list" class="${state.view === 'list' ? 'active' : ''}" aria-pressed="${state.view === 'list'}">List</button><button data-action="view" data-view="map" class="${state.view === 'map' ? 'active' : ''}" aria-pressed="${state.view === 'map'}">${icon('map')} Map</button></div></div>`;
}
function results() {
  if (state.busy)
    return `<div class="container page">${back('#' + (state.prefs?.mode || 'tourist'), 'Change search')}${loading()}</div>`;
  if (!state.center)
    return `<div class="container page">${empty('Where will you go?', 'Choose a destination or discover what’s nearby.')}</div>`;
  return `<div class="container page">${back('#' + state.prefs.mode, 'Edit my search')}<div class="page-heading"><div><h1>${state.prefs.mode === 'local' ? 'A little closer. A little different.' : `Find your kind of ${e(state.center.name)}.`}</h1><p>${e(state.center.label || state.center.name)} · ${(state.prefs.radius / 1000).toFixed(0)} km search radius · ${state.prefs.mode === 'local' ? state.prefs.hours + '-hour outing' : state.prefs.days + ' days to explore'}</p></div></div>${state.error ? `<div class="notice error" role="alert">${e(state.error)} <a href="#${state.prefs.mode}">Edit search</a></div>` : ''}${state.places.length ? weatherMarkup() : ''}<div class="results-top"><div class="results-info"><strong id="result-count">${state.places.length} places</strong> retrieved from Geoapify<br><span>${state.ai ? e(state.ai.message) : 'Make these places your own with Gemini interest matching.'}</span></div><div class="results-actions"><button class="btn secondary small" data-action="personalize" ${!state.places.length ? 'disabled' : ''}>${icon('spark')}Personalize with AI</button><a class="btn small" href="#builder">${icon('route')}Build my itinerary <span class="count" id="selection-count">${state.selection.length}</span></a></div></div>${resultControls()}<div id="results-content"></div><p class="source-note">Place data: Geoapify / OpenStreetMap contributors. Straight-line distances are measured from your search center. Source-reported hours and entry costs may change; confirm with the venue.</p></div>`;
}
function renderResultsContent() {
  if (!document.querySelector('#results-content')) return;
  clearMaps();
  const places = filteredPlaces();
  document.querySelector('#result-count').textContent =
    `${places.length} of ${state.places.length} places`;
  document.querySelector('#results-content').innerHTML = places.length
    ? `<div class="result-layout ${state.view === 'map' ? 'with-map' : ''}"><div class="places-grid">${places.map(card).join('')}</div>${state.view === 'map' ? '<aside class="map-panel"><div id="results-map" class="map" aria-label="Map of discovered places"></div></aside>' : ''}</div>`
    : empty(
        'No places in this view.',
        state.places.length
          ? 'Try another category, clear the search, or broaden your filters.'
          : 'Try a wider radius, more interests, or another city. Every recommendation must come from the provider.',
        state.places.length ? 'Reset filters' : 'Edit search',
        state.places.length ? 'results' : state.prefs.mode
      );
  if (!places.length && state.places.length) {
    document.querySelector('#results-content .btn').outerHTML =
      '<button class="btn" data-action="reset-filters">Reset filters</button>';
  }
  if (state.view === 'map' && places.length)
    createMap(document.querySelector('#results-map'), places, state.center, {
      onPlace: (id) => {
        state.detailsReturn = location.hash;
        go(`place/${id}`);
      }
    });
}

function details(p) {
  if (!p)
    return `<div class="container page">${empty('This place is no longer in your session.', 'Search again, or open a saved place.', 'View saved places', 'saved')}</div>`;
  const returnLink = state.detailsReturn || '#results';
  return `<div class="container page">${back(returnLink, 'Back to ' + (returnLink.startsWith('#plan') ? 'itinerary' : returnLink === '#saved' ? 'saved places' : returnLink === '#builder' ? 'itinerary builder' : 'results'))}<div class="details-layout"><section class="details-copy">${photo(p, 'details-image')}<p class="place-category">${e(labels[p.category])}${p.setting !== 'unknown' ? ` · ${e(p.setting)}` : ''}</p><h1>${e(p.name)}</h1><p>${e(p.description || descriptions[p.category])}</p><div id="detail-status" class="details-loading" role="status">Checking available place details…</div><dl class="details-facts" id="details-facts">${facts(p)}</dl><p class="source-note">Source: ${e(p.source)} · Retrieved ${e(p.retrievedAt?.slice(0, 10))}. Unknown information stays unknown. Confirm current details directly before visiting.</p></section><aside class="details-aside"><div class="map" id="details-map" aria-label="Place location"></div><h3>A place for your plan.</h3><p>Save it for another day, or add it to the itinerary you’re building.</p><a class="btn wide" href="${directions(p, state.prefs?.transport)}" target="_blank" rel="noopener noreferrer">${icon('route')}Get directions${icon('external')}</a><button class="btn secondary wide" data-action="favorite" data-id="${e(p.id)}">${icon('heart')}${favorite(p.id) ? 'Remove from favorites' : 'Add to favorites'}</button><button class="btn secondary wide" data-action="add" data-id="${e(p.id)}">${icon(selected(p.id) ? 'check' : 'plus')}${selected(p.id) ? 'Added to itinerary' : 'Add to itinerary'}</button><a class="btn quiet wide" href="#builder">View itinerary builder${icon('arrow')}</a></aside></div></div>`;
}
function facts(p) {
  return `<div class="fact"><dt>Address</dt><dd>${e(p.address || 'Not available')}</dd></div><div class="fact"><dt>Category</dt><dd>${e(labels[p.category])}</dd></div><div class="fact"><dt>Opening hours</dt><dd>${e(p.hours || 'Not available')}<small>Provider-reported OpenStreetMap notation. Holiday changes may apply.</small></dd></div><div class="fact"><dt>Entry cost</dt><dd>${e(priceText(p))}<small>${p.price.kind === 'reported' ? 'Source-reported, not independently verified. Confirm with the venue.' : 'No verified entry price is available. Meals and purchases are separate.'}</small></dd></div><div class="fact"><dt>Website</dt><dd>${p.website ? `<a href="${e(p.website)}" target="_blank" rel="noopener noreferrer">Official website ${icon('external')}</a>` : 'Not available'}</dd></div>`;
}
function builderOptions(p) {
  return `<form id="builder-options" class="builder-options"><div class="field-grid"><label class="field full">Start from<select name="origin">${options(
    [
      ['search', 'Search center'],
      ['first', 'First chosen place']
    ],
    !state.center || state.selection.length ? 'first' : 'search'
  )}</select></label><label class="field">Days<input name="days" type="number" min="1" max="14" value="${p.mode === 'local' ? 1 : p.days}" ${p.mode === 'local' ? 'readonly' : ''} required></label><label class="field">Hours per day<input name="hours" type="number" min="1" max="12" step="0.5" value="${p.hours}" required></label><label class="field">Daily budget<input name="dailyBudget" type="number" min="0" max="100000" value="${p.dailyBudget}" required></label><label class="field">Currency<select name="currency">${options(
    ['CAD', 'USD', 'EUR', 'GBP', 'JPY', 'AUD'].map((x) => [x, x]),
    p.currency
  )}</select></label><label class="field full">Getting around<select name="transport">${options(
    [
      ['walk', 'Walking'],
      ['drive', 'Driving'],
      ['transit', 'Public transportation']
    ],
    p.transport
  )}</select></label><label class="field full">Start date (optional)<input name="startDate" type="date" value="${e(p.startDate || '')}"></label><label class="field full">Total budget (optional)<input name="totalBudget" type="number" min="0" max="1000000" value="${e(p.totalBudget ?? '')}" placeholder="Use daily budget"></label></div></form>`;
}
function builder() {
  const places = state.selection.length ? state.selection : filteredPlaces();
  const p = state.prefs || defaults('tourist');
  return `<div class="container page">${back(state.places.length ? '#results' : '#saved', state.places.length ? 'Back to discoveries' : 'Back to saved places')}<div class="page-heading"><div><h1>A good plan leaves room to wander.</h1><p>${state.selection.length ? 'Your selected places, connected into a thoughtful route.' : 'Start with your recommendations, or choose specific places from your results.'}</p></div>${state.selection.length ? '<button class="btn secondary small" data-action="clear-selection">Clear selection</button>' : ''}</div>${!places.length ? empty('Your next adventure starts with a place.', 'Explore a city and add places, or add favorites to an itinerary.') : `<div class="builder-summary"><span>${icon('pin')}${e(state.center?.name || 'Saved places')}</span><span>${icon('clock')}${p.mode === 'local' ? '1 day' : p.days + ' days'} · ${p.hours} hours/day</span><span>${icon('wallet')}${e(p.currency)} ${e(p.dailyBudget)}/day${p.totalBudget ? ` · ${e(p.totalBudget)} total` : ''}</span><span>${icon('route')}${e({ walk: 'Walking', drive: 'Driving', transit: 'Public transportation' }[p.transport])}</span></div><div class="builder-grid"><section><div class="section-head"><h2 style="font-size:24px">${state.selection.length ? 'Your chosen stops' : 'Your recommendation pool'}</h2><span class="small-text muted">${places.length} places</span></div><ul class="builder-list">${places.map((p) => `<li><img src="${e(p.image || '/assets/' + images[p.category])}" alt="" loading="lazy"><div><h3><a href="#place/${encodeURIComponent(p.id)}">${e(p.name)}</a></h3><p>${e(labels[p.category])} · ${e(priceText(p))}</p></div>${state.selection.length ? `<button class="icon-button" data-action="remove-selection" data-id="${e(p.id)}" aria-label="Remove ${e(p.name)} from selection">${icon('close')}</button>` : ''}</li>`).join('')}</ul></section><aside class="summary-box"><h2>Connect the dots.</h2><p>Nearby stops are grouped into days, then ordered with a nearest-neighbor algorithm. Available time, travel pace, simple opening hours, known entry prices, and weather help shape the route.</p><p>${p.transport === 'transit' ? 'Transit uses a scheduling buffer, with links to actual directions.' : 'Travel times start as estimates. Open a day to load its walking or driving route.'}</p><p>Some places may not fit. With unknown prices, your trip total cannot be confirmed.</p>${!state.center ? '<p class="notice">Your first selected place will be the starting point.</p>' : ''}${builderOptions(p)}<button class="btn wide" data-action="generate">${icon('spark')}Generate ${p.mode === 'local' ? 'my outing' : 'my itinerary'}${icon('arrow')}</button><a class="btn quiet wide" href="#${p.mode}">Edit travel preferences</a></aside></div>`}</div>`;
}
const formatTime = (n) =>
  `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
function planScreen() {
  const p = state.plan;
  if (!p)
    return `<div class="container page">${empty('Your itinerary is waiting to happen.', 'Choose a few places and let Roamwise connect the dots.', 'Build an itinerary', 'builder')}</div>`;
  state.day = Math.min(state.day, p.days.length - 1);
  const day = p.days[state.day],
    count = p.days.reduce((sum, d) => sum + d.stops.length, 0);
  return `<div class="container page">${back('#builder', 'Back to builder')}<div class="page-heading"><div><h1>${e(p.name)}</h1><p>${p.days.length} ${p.days.length === 1 ? 'day' : 'days'} · ${count} stops · ${e({ walk: 'Walking', drive: 'Driving', transit: 'Public transportation' }[p.preferences.transport])} · Made for a little discovery.</p></div><div class="toolbar"><button class="btn secondary small" data-action="regenerate">Regenerate${icon('route')}</button><button class="btn small" data-action="save-plan">${icon('heart')}${saved.plans.some((x) => x.id === p.id) ? 'Update saved plan' : 'Save itinerary'}</button></div></div><div class="notice">${count ? `${p.unscheduled} candidate places left unscheduled. ` : ''}Schedule times and visit durations are estimates. Entry costs are incomplete when prices are unknown.</div><div class="day-tabs" aria-label="Itinerary days">${p.days.map((d, i) => `<button class="day-tab ${state.day === i ? 'active' : ''}" data-action="day" data-day="${i}" aria-pressed="${state.day === i}">Day ${d.number}${d.date ? ' · ' + e(d.date.slice(5)) : ''}</button>`).join('')}</div>${day.forecast ? `<div class="weather-strip">${icon(day.forecast.rain >= 50 ? 'rain' : 'sun')}<strong>${Math.round(day.forecast.high)}°C</strong> ${e(day.forecast.label)} · Rain ${day.forecast.rain == null ? 'not available' : day.forecast.rain + '%'} · ${e(day.forecast.date)}</div>` : ''}<div class="plan-layout"><section><div class="day-heading"><div><h2>Day ${day.number}${day.date ? ' · ' + e(day.date) : ''}</h2><p>${day.stops.length} stops · ${Math.floor(day.minutes / 60)}h ${day.minutes % 60}m scheduled · ${e(p.preferences.currency)} ${day.knownCost.toFixed(2)} source-reported entry subtotal${day.unknownCosts ? ` + ${day.unknownCosts} unknown prices` : ''}</p></div>${day.stops.length ? `<a class="btn secondary small" href="${dayDirections(day.stops, p.preferences.transport)}" target="_blank" rel="noopener noreferrer">${p.preferences.transport === 'transit' ? 'First transit leg' : 'Day directions'}${icon('external')}</a>` : ''}</div>${day.stops.length ? `<ol class="schedule">${day.stops.map((s, index) => `<li><div class="schedule-time">${formatTime(s.start)}</div><div class="schedule-stop"><div class="stop-heading"><h3><a href="#place/${encodeURIComponent(s.place.id)}">${e(s.place.name)}</a></h3><button class="icon-button" data-action="remove-stop" data-index="${index}" aria-label="Remove ${e(s.place.name)} from day ${day.number}">${icon('close')}</button></div><p>${e(labels[s.place.category])} · ${s.duration} min suggested visit · until ${formatTime(s.end)}</p><p>${e(priceText(s.place))} · ${s.hoursChecked ? 'Simple opening hours checked for this date' : 'Hours not checked; confirm before visiting'}</p><p class="travel-info">${icon('route')} ${s.travel.minutes == null ? '30 min scheduling buffer · transit time not predicted' : `${s.travel.minutes} min estimated ${p.preferences.transport === 'drive' ? 'drive' : 'walk'}`} · ${s.travel.km.toFixed(1)} km straight line ${index === 0 ? 'from search center' : 'from previous stop'}</p><a class="stop-directions" href="${legDirections(day, index, p.preferences.transport, p.center)}" target="_blank" rel="noopener noreferrer">${p.preferences.transport === 'transit' ? 'Actual transit directions' : 'Directions to this stop'}${icon('external')}</a></div></li>`).join('')}</ol>` : empty('A little more room in this day.', 'No stops fit the current time, known budget, or simple opening-hour constraints. Try more available time, a wider place pool, or different transport.', 'Edit preferences', p.preferences.mode)}</section><aside class="plan-map-aside"><div id="plan-map" class="map plan-map" aria-label="Itinerary route map"></div><div id="route-status" class="route-status" role="status">${day.stops.length > 1 && p.preferences.transport !== 'transit' ? 'Loading the route between your stops…' : p.preferences.transport === 'transit' ? 'Transit routing: use each stop’s directions link for actual service.' : 'Markers show your planned stops.'}</div><p class="small-text muted">The schedule includes travel from the search center. The mapped route connects the day’s stops.</p></aside></div>${p.alternatives?.length ? `<h2 class="text-heading">Keep an indoor alternative in your pocket.</h2><div class="checklist">${p.alternatives.map((x) => `<a class="tag" href="#place/${encodeURIComponent(x.id)}">${e(x.name)}</a>`).join('')}</div>` : ''}<details class="plan-notes"><summary>Planning assumptions & budget notes</summary><ul>${p.notes.map((n) => `<li>${e(n)}</li>`).join('')}<li>Budget target: ${e(p.preferences.currency)} ${p.preferences.dailyBudget}/day${p.preferences.totalBudget != null ? `, ${p.preferences.totalBudget} total` : ''}. Only source-reported prices in this currency are counted; currencies are not converted. No independently verified exact trip total is available.</li></ul></details></div>`;
}
function legDirections(day, index, transport, center) {
  const a = index ? day.stops[index - 1].place : center;
  const b = day.stops[index].place;
  const params = new URLSearchParams({
    api: '1',
    origin: `${a.lat},${a.lon}`,
    destination: `${b.lat},${b.lon}`,
    travelmode: { walk: 'walking', drive: 'driving', transit: 'transit' }[transport]
  });
  return `https://www.google.com/maps/dir/?${params}`;
}
function savedScreen() {
  return `<div class="container page">${back('#home', 'Back to exploring')}<div class="page-heading"><div><h1>Good finds deserve a second visit.</h1><p>Your little collection of places and plans. Saved in this browser, ready when you are.</p></div></div><div class="saved-tabs"><button class="saved-tab ${state.savedTab === 'places' ? 'active' : ''}" data-action="saved-tab" data-tab="places">Favorite places (${saved.favorites.length})</button><button class="saved-tab ${state.savedTab === 'plans' ? 'active' : ''}" data-action="saved-tab" data-tab="plans">Saved itineraries (${saved.plans.length})</button></div>${state.savedTab === 'places' ? (saved.favorites.length ? `<div class="places-grid">${saved.favorites.map(card).join('')}</div>` : empty('A few favorites make a great beginning.', 'Tap the heart on any place to keep it here for later.')) : saved.plans.length ? `<div class="saved-plans">${saved.plans.map((p) => `<article class="saved-plan">${icon('route')}<h2>${e(p.name)}</h2><p>${p.days.length} days · ${p.days.reduce((sum, d) => sum + d.stops.length, 0)} stops · ${e(p.createdAt.slice(0, 10))}<br>${e(p.preferences.currency)} ${p.preferences.dailyBudget}/day budget target</p><div class="toolbar"><button class="btn small" data-action="open-plan" data-id="${e(p.id)}">Open itinerary${icon('arrow')}</button><button class="btn quiet small" data-action="delete-plan" data-id="${e(p.id)}">Delete saved plan</button></div></article>`).join('')}</div>` : empty('Your next adventure, kept for later.', 'Generate an itinerary and save it here. No account needed.', 'Build an itinerary', 'builder')}<p class="source-note">localStorage is specific to this browser and device. Clearing browser data removes saved items. Old plans and provider-reported hours may need a fresh search.</p></div>`;
}
function about() {
  return `<div class="container page about-content">${back('#home', 'Back to exploring')}<h1>A little curiosity. Real possibilities.</h1><p style="margin-top:23px">Roamwise helps you discover actual places and turn them into a personal travel plan. Built as a Grade 12 Computer Science project with HTML, CSS, vanilla JavaScript, and Node.js.</p><h2>Real places come first.</h2><p>Geoapify supplies destination geocoding, places, place details, and supported walking/driving routes using <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> data. Attribution: © OpenStreetMap contributors, available under the Open Database License. Hours, addresses, and source-reported prices can be incomplete or out of date. Confirm important details with each venue.</p><h2>AI with a clear job.</h2><p>Gemini selects identifiers from retrieved candidates. Its structured response is validated, and its output cannot replace addresses, prices, hours, or names. Deterministic matching takes over if Gemini is unavailable. Travel preferences and candidate data are sent to Google for personalization; current coordinates are sent to Geoapify and Open-Meteo during a search.</p><h2>A route, with room for real life.</h2><p>A nearest-neighbor heuristic groups nearby stops, accounts for suggested activity durations and available time, and checks a supported subset of opening-hour rules when a date is provided. Travel schedule times are estimates; a separate Geoapify route shows the path between stops. Public transit uses external Google Maps directions and a labeled planning buffer, never invented service times.</p><h2>Weather, budgets & honest unknowns.</h2><p><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> supplies forecasts only within its returned date range (CC BY 4.0). Rain encourages indoor alternatives. Source-reported entry prices are distinguished from unknown costs; we do not independently verify venue prices, convert currencies, or calculate an exact complete trip cost.</p><h2>Photography & maps.</h2><p>Editorial inspiration photos are from <a href="https://unsplash.com/" target="_blank" rel="noopener noreferrer">Unsplash</a>. Category photographs are labeled and do not depict the recommended venue. Source-linked place images appear only when the place provider supplies one. Maps use <a href="https://leafletjs.com/" target="_blank" rel="noopener noreferrer">Leaflet</a> and OpenStreetMap tiles. Photo source URLs and licenses are documented in the project’s assets notes.</p><h2>Yours, in this browser.</h2><p>No account or database. Favorites and saved plans use localStorage; active search results use sessionStorage. Location is requested only when you press the current-location button. Manual city search works when permission is denied.</p></div>`;
}

async function render() {
  const version = ++renderVersion;
  clearMaps();
  updateHeader();
  const path = route();
  let place;
  if (path.startsWith('place/')) {
    place = placeById(path.slice(6));
    main.innerHTML = details(place);
  } else if (path === 'home') main.innerHTML = home();
  else if (['tourist', 'local'].includes(path)) main.innerHTML = travelForm(path);
  else if (path === 'results') main.innerHTML = results();
  else if (path === 'builder') main.innerHTML = builder();
  else if (path.startsWith('plan')) {
    if (path.includes('/')) {
      const id = path.split('/')[1];
      state.plan =
        saved.plans.find((p) => p.id === id) || (state.plan?.id === id ? state.plan : null);
    }
    main.innerHTML = planScreen();
  } else if (path === 'saved') main.innerHTML = savedScreen();
  else if (path === 'about') main.innerHTML = about();
  else
    main.innerHTML = `<div class="container page">${empty('Let’s get you back on the map.', 'This view does not exist.', 'Go home', 'home')}</div>`;
  document.title =
    path === 'home'
      ? 'Roamwise — Discover more. Explore smarter.'
      : `${place?.name || { tourist: 'Explore a destination', local: 'Discover nearby', results: 'Your discoveries', builder: 'Itinerary builder', saved: 'Your saved places', about: 'About Roamwise' }[path] || 'Your itinerary'} — Roamwise`;
  if (path === 'results') renderResultsContent();
  if (place) {
    createMap(document.querySelector('#details-map'), [place], place);
    loadDetails(place, version);
  }
  if (path.startsWith('plan') && state.plan) loadPlanMap(version);
}
async function loadDetails(place, version) {
  try {
    const { place: p } = await api('details', { place });
    if (version !== renderVersion) return;
    state.places = state.places.map((x) => (x.id === p.id ? p : x));
    state.selection = state.selection.map((x) => (x.id === p.id ? p : x));
    if (favorite(p.id)) {
      saved.favorites = saved.favorites.map((x) => (x.id === p.id ? p : x));
      write('favorites', saved.favorites);
    }
    persist();
    persistSelection();
    document.querySelector('#details-facts').innerHTML = facts(p);
    document.querySelector('#detail-status').textContent = 'Available provider details loaded.';
  } catch (error) {
    if (version === renderVersion)
      document.querySelector('#detail-status').textContent =
        `Extra details unavailable. Showing retrieved search data. ${error.message}`;
  }
}
async function loadPlanMap(version) {
  const day = state.plan.days[state.day],
    transport = state.plan.preferences.transport;
  const map = createMap(
    document.querySelector('#plan-map'),
    day.stops.map((s) => s.place),
    state.plan.center,
    {
      numbered: true,
      onPlace: (id) => {
        state.detailsReturn = location.hash;
        go(`place/${id}`);
      }
    }
  );
  if (day.stops.length < 2 || transport === 'transit') return;
  try {
    const routeData = await api('route', { places: day.stops.map((s) => s.place), transport });
    if (version !== renderVersion) return;
    drawRoute(map, routeData.geometry);
    document.querySelector('#route-status').textContent =
      `Geoapify ${transport === 'drive' ? 'driving' : 'walking'} route between stops: ${(routeData.distance / 1000).toFixed(1)} km · approximately ${Math.round(routeData.time / 60)} min moving time. Schedule times above remain planning estimates.`;
  } catch (error) {
    if (version === renderVersion)
      document.querySelector('#route-status').textContent =
        `Route unavailable. Stop markers and external directions still work. ${error.message}`;
  }
}

async function startSearch(prefs, center) {
  const run = ++searchVersion;
  state.selection = [];
  persistSelection();
  state.busy = true;
  state.error = '';
  state.prefs = prefs;
  state.center = center;
  state.places = [];
  state.ai = null;
  state.filters = { ...emptyFilters };
  state.view = 'list';
  go('results');
  try {
    const data = await api('search', { center, preferences: prefs });
    if (run !== searchVersion) return;
    state.places = data.places;
    state.weather = data.weather;
    state.prefs = data.preferences;
    state.error = data.partial
      ? 'Some categories could not be retrieved. These results are from the categories that succeeded.'
      : '';
    persist();
  } catch (error) {
    if (run === searchVersion) {
      state.error = error.message;
      state.weather = null;
    }
  } finally {
    if (run === searchVersion) {
      state.busy = false;
      if (route() === 'results') render();
    }
  }
}
async function submitTravel(form) {
  const prefs = formValues(form);
  state.error = '';
  const message = document.querySelector('#form-message'),
    button = form.querySelector('[type=submit]');
  button.disabled = true;
  message.className = 'notice';
  message.textContent = 'Finding your destination…';
  try {
    if (prefs.mode === 'local' && !prefs.destination.trim() && state.coordinates) {
      await startSearch(prefs, {
        ...state.coordinates,
        name: 'Nearby discoveries',
        label: 'Your current location'
      });
      return;
    }
    const { results: locations } = await api(`geocode?q=${encodeURIComponent(prefs.destination)}`);
    // A city + country query normally has an unambiguous first match. Otherwise
    // show actual geocoder matches rather than silently choosing the wrong city.
    if (!prefs.destination.includes(',') && locations.length > 1) {
      state.cityChoices = locations;
      message.textContent = 'Choose the city you meant.';
      document.querySelector('#city-choices').innerHTML = locations
        .map(
          (city, i) =>
            `<button type="button" class="city-choice" data-action="choose-city" data-index="${i}">${icon('pin')} ${e(city.label)}</button>`
        )
        .join('');
      return;
    }
    await startSearch(prefs, locations[0]);
  } catch (error) {
    message.className = 'notice error';
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}
async function locate(button) {
  button.disabled = true;
  const status = document.querySelector('#location-status');
  status.textContent = 'Waiting for location permission…';
  try {
    if (!navigator.geolocation)
      throw new Error('This browser does not support location. Enter a city below.');
    const position = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000
      })
    );
    state.coordinates = { lat: position.coords.latitude, lon: position.coords.longitude };
    document.querySelector('[name=destination]').value = '';
    status.textContent = 'Location ready. Choose your preferences and find places.';
  } catch (error) {
    state.coordinates = null;
    status.textContent =
      error.code === 1
        ? 'Location permission was denied. Enter a city below to continue.'
        : 'Location could not be found. Enter a city below to continue.';
    document.querySelector('[name=destination]').focus();
  } finally {
    button.disabled = false;
  }
}
async function personalizeButton(button) {
  if (!state.places.length) return;
  const requestedSearch = searchVersion;
  button.disabled = true;
  button.textContent = 'Matching your interests…';
  try {
    const data = await api('personalize', {
      places: state.places,
      preferences: state.prefs,
      center: state.center
    });
    if (requestedSearch !== searchVersion) return;
    state.places = data.places;
    state.ai = { source: data.source, message: data.message };
    persist();
    flash(data.source === 'gemini' ? 'Gemini personalized your discoveries.' : data.message);
    if (route() === 'results') render();
  } catch (error) {
    if (requestedSearch !== searchVersion) return;
    flash(error.message);
    button.disabled = false;
    button.innerHTML = icon('spark') + 'Personalize with AI';
  }
}
async function generate(button, regenerate = false) {
  const requestedSearch = searchVersion;
  const requestedRoute = route();
  let planningCenter = state.center;
  const places = regenerate
    ? state.plan?.days.flatMap((d) => d.stops.map((s) => s.place)) || []
    : state.selection.length
      ? state.selection
      : filteredPlaces();
  if (!places.length) {
    flash('Add at least one place first.');
    return;
  }
  if (!regenerate) {
    const settings = document.querySelector('#builder-options');
    if (settings && !settings.reportValidity()) return;
    state.prefs = {
      ...(state.prefs || defaults('tourist')),
      ...(settings ? Object.fromEntries(new FormData(settings)) : {})
    };
    if (!state.center || settings?.elements.origin.value === 'first')
      planningCenter = {
        lat: places[0].lat,
        lon: places[0].lon,
        name: places[0].city || 'Chosen places'
      };
    persist();
  }
  button.disabled = true;
  const original = button.innerHTML;
  button.textContent = 'Connecting your places…';
  try {
    const { plan } = await api('plan', {
      places,
      preferences: regenerate ? state.plan.preferences : state.prefs,
      center: regenerate ? state.plan.center : planningCenter
    });
    if (requestedSearch !== searchVersion) return;
    state.plan = plan;
    state.day = 0;
    write('activePlan', plan, true);
    if (route() === requestedRoute) go('plan');
    else flash('Your itinerary is ready in My itinerary.');
  } catch (error) {
    flash(error.message);
    button.disabled = false;
    button.innerHTML = original;
  }
}
function toggleFavorite(id) {
  const p = placeById(id);
  if (!p) return;
  const adding = !favorite(id);
  const ok = saved.toggle(p);
  updateHeader();
  flash(
    ok
      ? adding
        ? 'Saved to your favorites.'
        : 'Removed from favorites.'
      : 'Browser storage is full or blocked. This change will not persist.'
  );
  if (route() === 'saved') {
    render();
    return;
  }
  document.querySelectorAll('[data-action=favorite]').forEach((button) => {
    if (button.dataset.id !== id) return;
    if (button.classList.contains('icon-button')) {
      button.classList.toggle('favorited', favorite(id));
      button.setAttribute('aria-pressed', String(favorite(id)));
      button.setAttribute(
        'aria-label',
        `${favorite(id) ? 'Remove from' : 'Add to'} favorites: ${p.name}`
      );
    } else
      button.innerHTML =
        icon('heart') + (favorite(id) ? 'Remove from favorites' : 'Add to favorites');
  });
}
function addSelection(id, toggle = false) {
  const p = placeById(id);
  if (!p) return;
  if (selected(id)) {
    if (toggle) state.selection = state.selection.filter((x) => x.id !== id);
  } else {
    if (state.selection.length >= 80) {
      flash('The planner supports up to 80 selected places.');
      return;
    }
    state.selection.push(p);
  }
  persistSelection();
  document
    .querySelectorAll('[data-select]')
    .forEach((input) => (input.checked = selected(input.dataset.select)));
  const count = document.querySelector('#selection-count');
  if (count) count.textContent = state.selection.length;
}
function removeStop(index) {
  const plan = state.plan,
    day = plan.days[state.day];
  day.stops.splice(index, 1);
  if (day.stops.length) {
    let time = 9 * 60;
    let previous = plan.center;
    for (const stop of day.stops) {
      const rad = (n) => (n * Math.PI) / 180;
      const h =
        Math.sin(rad(stop.place.lat - previous.lat) / 2) ** 2 +
        Math.cos(rad(previous.lat)) *
          Math.cos(rad(stop.place.lat)) *
          Math.sin(rad(stop.place.lon - previous.lon) / 2) ** 2;
      const km = 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
      stop.travel = {
        km: Math.round(km * 10) / 10,
        minutes:
          plan.preferences.transport === 'transit'
            ? null
            : Math.max(
                3,
                Math.ceil(
                  ((km * 1.3) / (plan.preferences.transport === 'drive' ? 25 : 4.5)) * 60 +
                    (plan.preferences.transport === 'drive' ? 5 : 0)
                )
              ),
        reserve: plan.preferences.transport === 'transit' ? 30 : null,
        kind: 'estimate'
      };
      time += stop.travel.minutes ?? 30;
      stop.start = time;
      stop.end = time + stop.duration;
      stop.hoursChecked = false;
      time = stop.end;
      previous = stop.place;
    }
    day.minutes = time - 9 * 60;
  } else day.minutes = 0;
  day.knownCost = day.stops.reduce(
    (s, x) =>
      s +
      (x.place.price.amount === 0 || x.place.price.currency === plan.preferences.currency
        ? x.place.price.amount || 0
        : 0),
    0
  );
  day.unknownCosts = day.stops.filter(
    (x) =>
      x.place.price.amount !== 0 &&
      (x.place.price.amount == null || x.place.price.currency !== plan.preferences.currency)
  ).length;
  write('activePlan', plan, true);
  render();
  flash(
    'Stop removed. Times recalculated; recheck opening hours. Save to update your stored plan.'
  );
}

document.addEventListener('click', async (event) => {
  if (event.target.closest('.skip-link')) {
    event.preventDefault();
    main.focus();
    return;
  }
  if (event.target.closest('a[href^="#place/"]')) state.returnScroll = window.scrollY;
  const target = event.target.closest('[data-action]');
  const placeLink = event.target.closest('a[href^="#place/"]');
  if (placeLink && !route().startsWith('place/')) state.detailsReturn = location.hash || '#results';
  if (!target) {
    const placeCard = event.target.closest('.place-card');
    if (placeCard && !event.target.closest('a,button,input,label')) {
      state.detailsReturn = location.hash;
      state.returnScroll = window.scrollY;
      go(`place/${placeCard.dataset.place}`);
    }
    return;
  }
  const { action, id } = target.dataset;
  if (action === 'menu') {
    const nav = document.querySelector('.nav-links');
    nav.classList.toggle('open');
    target.setAttribute('aria-expanded', String(nav.classList.contains('open')));
  }
  if (action === 'destination') {
    state.drafts.tourist = { ...defaults('tourist'), destination: target.dataset.city };
    write('drafts', state.drafts, true);
    go('tourist');
  }
  if (action === 'locate') await locate(target);
  if (action === 'choose-city') {
    const city = state.cityChoices[Number(target.dataset.index)];
    if (city) await startSearch(formValues(document.querySelector('#travel-form')), city);
  }
  if (action === 'favorite') toggleFavorite(id);
  if (action === 'add') {
    addSelection(id);
    target.innerHTML = icon('check') + 'Added to itinerary';
    flash('Added to your itinerary builder.');
  }
  if (action === 'remove-selection') {
    state.selection = state.selection.filter((p) => p.id !== id);
    persistSelection();
    render();
  }
  if (action === 'clear-selection') {
    state.selection = [];
    persistSelection();
    render();
  }
  if (action === 'view') {
    state.view = target.dataset.view;
    persist();
    render();
  }
  if (action === 'reset-filters') {
    state.filters = { ...emptyFilters };
    persist();
    render();
  }
  if (action === 'personalize') await personalizeButton(target);
  if (action === 'generate') await generate(target);
  if (action === 'regenerate') await generate(target, true);
  if (action === 'day') {
    state.day = Number(target.dataset.day);
    render();
  }
  if (action === 'remove-stop') removeStop(Number(target.dataset.index));
  if (action === 'save-plan') {
    const ok = saved.savePlan(state.plan);
    flash(
      ok
        ? 'Itinerary saved in this browser.'
        : 'Browser storage is full or blocked. The itinerary was not persisted.'
    );
    updateHeader();
    target.innerHTML = icon('heart') + 'Update saved plan';
  }
  if (action === 'saved-tab') {
    state.savedTab = target.dataset.tab;
    render();
  }
  if (action === 'open-plan') {
    state.plan = saved.plans.find((p) => p.id === id);
    state.day = 0;
    write('activePlan', state.plan, true);
    go(`plan/${id}`);
  }
  if (action === 'delete-plan') {
    const ok = saved.removePlan(id);
    render();
    flash(ok ? 'Saved itinerary deleted.' : 'Browser storage could not be updated.');
  }
});
document.addEventListener('submit', async (event) => {
  if (event.target.id === 'builder-options') {
    event.preventDefault();
    await generate(document.querySelector('[data-action=generate]'));
    return;
  }

  if (event.target.id === 'home-search') {
    event.preventDefault();
    const destination = new FormData(event.target).get('destination');
    state.drafts.tourist = { ...defaults('tourist'), destination };
    write('drafts', state.drafts, true);
    go('tourist');
  } else if (event.target.id === 'travel-form') {
    event.preventDefault();
    await submitTravel(event.target);
  }
});
document.addEventListener('input', (event) => {
  if (event.target.id === 'result-search') {
    state.filters.query = event.target.value;
    persist();
    renderResultsContent();
  }
  if (event.target.closest('#travel-form')) {
    formValues(event.target.closest('form'));
    if (event.target.name === 'destination') state.coordinates = null;
  }
});
document.addEventListener('change', (event) => {
  const input = event.target;
  if (input.dataset.select) {
    addSelection(input.dataset.select, true);
    return;
  }
  const filter = {
    'category-filter': 'category',
    'setting-filter': 'setting',
    'sort-filter': 'sort',
    'free-filter': 'free'
  }[input.id];
  if (filter) {
    state.filters[filter] = input.type === 'checkbox' ? input.checked : input.value;
    persist();
    renderResultsContent();
  }
});
document.addEventListener(
  'error',
  (event) => {
    const image = event.target;
    if (
      image.tagName === 'IMG' &&
      image.dataset.fallback &&
      image.getAttribute('src') !== image.dataset.fallback
    ) {
      image.src = image.dataset.fallback;
      const note = image.parentElement?.querySelector('.image-note');
      if (note) note.textContent = 'Category inspiration photo · not this place';
      image.alt = '';
    }
  },
  true
);
window.addEventListener('hashchange', () => {
  state.error = '';
  render();
  window.scrollTo({
    top: route() === 'results' ? state.returnScroll || 0 : 0,
    behavior: 'instant'
  });
  main.focus({ preventScroll: true });
});
render();
