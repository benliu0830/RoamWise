import { locationLabel } from './location-label.js';
import { isCompleted, lastTripDay } from './trips.js';
import { tripCollectionMarkup, completionDate, promptTripCompletion } from './trip-ui.js';
import { photoMarkup, observePhotos, placeholder } from './photos.js';
import { destinationPhotos } from './destination-photos.js';
import { api } from './api.js';
import { read, write, saved, migrateStoredData } from './store.js';
import { icon } from './icons.js';
import { categories, categoryKey, categoryBadge } from './categories.js';
import { attachDestinationSearch } from './destination-search.js';
import { openingStatus } from './hours.js';
import { distanceKm, groupBranches, formatDistance, nameKey } from './place-utils.js';
import {
  renderCard,
  renderBranchRow,
  renderControls,
  renderOrigin,
  renderDetails,
  renderFacts,
  statusMarkup as statusForDetails
} from './discovery-ui.js';
await migrateStoredData();
import {
  clearMaps,
  createMap,
  drawRoute,
  drawRouteSegment,
  directions,
  dayDirections
} from './maps.js';

const main = document.querySelector('main'),
  header = document.querySelector('#header');
const labels = Object.fromEntries(
  Object.entries(categories).map(([key, value]) => [key, value.label])
);
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
  distance: 'any',
  hours: 'all',
  sort: 'recommended'
};
const initial = read('discovery', null, true);
const activeCandidate = read('activePlan', null) || read('activePlan', null, true);
const storedActivePlan =
  activeCandidate &&
  !isCompleted(activeCandidate) &&
  !saved.plans.some((p) => p.id === activeCandidate.id && isCompleted(p))
    ? activeCandidate
    : null;
const storedSelection = read('selection', null) || read('selection', [], true);
const state = {
  places: initial?.places || [],
  center: initial?.center || null,
  prefs: initial?.prefs || null,
  weather: initial?.weather || null,
  filters: { ...emptyFilters, ...initial?.filters },
  view: initial?.view || 'list',
  selection: storedSelection,
  plan: storedActivePlan,
  day: storedActivePlan?.activeDay || 0,
  ai: initial?.ai || null,
  drafts: read('drafts', {}, true),
  coordinates: null,
  origin: initial?.origin || null,
  originChoices: [],
  branchSort: 'distance',
  showAll: false,
  truncated: initial?.truncated || false,
  cityChoices: [],
  pendingLocation: false,
  busy: false,
  error: '',
  savedTab: 'places',
  detailsReturn: '#results',
  tripTab: 'active',
  timelineOpen: null,
  mapContext: initial?.mapContext || null,
  tripOrigin: null
};
if (storedActivePlan) write('activePlan', storedActivePlan);
if (storedSelection.length) write('selection', storedSelection);
let toastTimer,
  searchVersion = 0,
  renderVersion = 0,
  disposeDestinationSearch,
  activePlanMap,
  discoveryMap;
const routeCache = new Map();
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
      mapContext: state.mapContext,
      places: state.places,
      origin: state.origin,
      truncated: state.truncated,
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
  state.selection = [...new Map(state.selection.map((place) => [place.id, place])).values()];
  write('selection', state.selection);
  updateHeader();
}
function persistPlan() {
  if (isCompleted(state.plan)) return;
  if (state.plan) {
    state.plan.activeDay = state.day;
    if (saved.plans.some((plan) => plan.id === state.plan.id)) saved.savePlan(state.plan);
  }
  write('activePlan', state.plan);
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
  const activeMode =
    ['results'].includes(current) || current.startsWith('place/') ? state.prefs?.mode : current;
  const navState = (active) => (active ? ' class="active" aria-current="page"' : '');
  const itineraryHref = '#itineraries';
  header.innerHTML = `<div class="nav-inner"><a class="brand" href="#home" aria-label="Roamwise home">${icon('compass')}roamwise<span class="brand-dot">.</span></a><button class="mobile-toggle" aria-label="Open navigation" aria-expanded="false" aria-controls="primary-navigation" data-action="menu">${icon('menu')}</button><nav id="primary-navigation" class="nav-links" aria-label="Main navigation"><a href="#tourist"${navState(activeMode === 'tourist')}>Tourist mode</a><a href="#local"${navState(activeMode === 'local')}>Personal mode</a><a href="${itineraryHref}"${navState(current === 'itineraries' || current === 'builder' || current.startsWith('plan') || current.startsWith('trip'))}>My itineraries ${state.selection.length ? `<span class="count">${state.selection.length}</span>` : ''}</a><a href="#saved" class="saved-nav ${current === 'saved' ? 'active' : ''}" ${current === 'saved' ? 'aria-current="page"' : ''}>${icon('heart')}Saved <span class="count">${saved.favorites.length + saved.plans.length}</span></a></nav></div>`;
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
function photo(p, cls = '') {
  return photoMarkup(p, cls);
}
const referenceOrigin = () => state.origin || state.center;
const referenceLabel = () => state.origin?.name || 'city centre';
function uiContext() {
  return {
    origin: referenceOrigin(),
    originLabel: referenceLabel(),
    timezone: state.center?.timezone || state.weather?.timezone,
    city: state.center?.name || 'your destination',
    favorite,
    selected,
    photo,
    mapView: state.view === 'map' && route() === 'results',
    back,
    transport: state.prefs?.transport || 'walk'
  };
}
function card(p) {
  return renderCard(p, uiContext());
}
function businessGroups() {
  return state.center ? groupBranches(state.places, referenceOrigin(), state.branchSort) : [];
}
function groupFor(id) {
  return businessGroups().find((group) => group.branches?.some((place) => place.id === id));
}
function branchScreen(id) {
  const group = groupFor(id);
  if (!group)
    return (
      '<div class="container page">' +
      empty(
        'These locations are no longer in this search.',
        'Run a new search to refresh business locations.',
        'Back to results',
        'results'
      ) +
      '</div>'
    );
  const places = [...group.branches].sort((a, b) =>
    state.branchSort === 'name'
      ? (a.address || a.name).localeCompare(b.address || b.name)
      : distanceKm(referenceOrigin(), a) - distanceKm(referenceOrigin(), b)
  );
  return (
    '<div class="container page branches-page">' +
    back('#results', 'Back to results') +
    '<div class="page-heading"><div><h1>' +
    e(group.name) +
    '</h1><p>' +
    group.branchCount +
    ' locations found in this search area. Choose the one that fits your day.</p></div><span class="multiple-label">Multiple locations</span></div>' +
    renderOrigin(uiContext()) +
    '<div class="branch-toolbar"><p>Distances from <strong>' +
    e(referenceLabel()) +
    '</strong> &middot; straight line</p><label>Sort branches <select id="branch-sort"><option value="distance" ' +
    (state.branchSort === 'distance' ? 'selected' : '') +
    '>Nearest first</option><option value="name" ' +
    (state.branchSort === 'name' ? 'selected' : '') +
    '>Alphabetical by address</option></select></label></div><details class="branch-map-disclosure"><summary>View all locations on the map</summary><div id="branches-map" class="map branches-map" aria-label="All business locations"></div></details><div class="branch-list">' +
    places.map((place) => renderBranchRow(place, uiContext())).join('') +
    '</div><p class="source-note">Branch count covers discovered provider records, not every possible location.</p></div>'
  );
}

function destinationField(
  id,
  {
    home = false,
    value = '',
    required = true,
    placeholder = 'Where would you like to explore?'
  } = {}
) {
  return `<div class="destination-search ${home ? 'home-destination' : ''}"><div class="${home ? 'home-search' : 'destination-field'}">${icon('pin', 'destination-pin')}<label for="${id}" class="search-input-label"><span class="sr-only">Destination city</span><input id="${id}" name="destination" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-list" aria-describedby="${id}-hint" placeholder="${placeholder}" value="${e(locationLabel(value))}" autocomplete="off" spellcheck="false" ${required ? 'required' : ''} minlength="2" maxlength="180"></label><button class="clear-search" type="button" aria-label="Clear destination" hidden>${icon('close')}</button>${home ? `<button class="btn search-submit" type="submit">${icon('search')}<span>Explore</span></button>` : ''}</div><div class="suggestion-panel" hidden><div class="suggestion-heading">Popular destinations</div><ul id="${id}-list" class="suggestion-list" role="listbox" aria-label="Destination suggestions"></ul><div class="suggestion-status" role="status" aria-live="polite"></div><div class="suggestion-help" id="${id}-hint">${icon('globe')}Search any city. A little curiosity goes a long way.</div></div></div>`;
}
function cityPhotoMarkup(id) {
  const photo = destinationPhotos.find((item) => item.id === id);
  return `<div class="location-photo destination-photo"><img data-city-photo src="${e(photo.src)}" alt="${e(photo.alt)}" width="${photo.width}" height="${photo.height}" loading="lazy" decoding="async"><div class="photo-credit"><span>${e(photo.creator)}</span> &middot; <a href="${e(photo.licenseUrl)}" target="_blank" rel="noopener noreferrer">${e(photo.license)}</a> &middot; <a href="${e(photo.sourceUrl)}" target="_blank" rel="noopener noreferrer">Wikimedia Commons</a><details><summary>Photo credits</summary><p>${e(photo.title)}</p><p>Resized and cropped to fit.</p></details></div></div>`;
}
function home() {
  const destinations = [
    ['Paris', 'France', 'Q90', 'Paris, France', 'Paris skyline inspiration'],
    ['Tokyo', 'Japan', 'tokyo', 'Tokyo, Japan'],
    ['New York City', 'United States', 'new-york', 'New York City, USA'],
    ['Toronto', 'Canada', 'toronto', 'Toronto, Canada']
  ];
  return `<div class="container home-container"><section class="home-hero" aria-labelledby="hero-heading"><h1 id="hero-heading">Where will you explore next?</h1><p>Discover incredible places, explore your surroundings, and plan your next adventure.</p><form id="home-search" class="home-search-form">${destinationField('home-destination', { home: true, placeholder: 'Search cities or destinations...' })}</form></section><section class="home-modes" aria-label="Choose how to explore"><a href="#tourist" class="mode-option"><span class="mode-option-icon">${icon('globe')}</span><span class="mode-option-copy"><strong>Explore a Destination</strong><small>Discover attractions, restaurants, and experiences anywhere in the world.</small></span><span class="mode-option-action">Explore a City${icon('arrow')}</span></a><a href="#local" class="mode-option" data-action="explore-nearby"><span class="mode-option-icon">${icon('locate')}</span><span class="mode-option-copy"><strong>Explore Nearby</strong><small>Find interesting places and things to do near your current location.</small></span><span class="mode-option-action">Explore Near Me${icon('arrow')}</span></a></section><section class="home-destinations" aria-labelledby="destinations-heading"><div class="section-head"><div><h2 id="destinations-heading">Popular Destinations</h2></div><span class="small-text muted">A little inspiration to get started</span></div><div class="destination-grid">${destinations.map(([city, country, image, query]) => `<article class="destination">${city === 'Paris' ? photoMarkup({ name: city, wikidata: image, category: 'landmarks', ...(city === 'Paris' ? { city: 'Paris', country: 'France', countryCode: 'fr', state: 'Ile-de-France', lat: 48.8566, lon: 2.3522 } : {}) }, 'destination-photo', true) : cityPhotoMarkup(image)}<button class="destination-label" data-action="destination" data-city="${e(query)}" aria-label="Explore ${e(city)}, ${e(country)}"><span>${e(city)}<small>${e(country)}</small></span>${icon('arrow')}</button></article>`).join('')}</div></section></div>`;
}

const defaults = (mode) => ({
  destination: '',
  mode,
  days: 2,
  hours: mode === 'local' ? 3 : 8,
  radius: mode === 'local' ? 5000 : 10000,
  startDate: '',
  query: '',
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
  return `<div class="container page">${back('#home', 'Back to exploring')}<div class="page-heading"><div><h1>${mode === 'local' ? 'A good day is closer than you think.' : 'Let’s find your next adventure.'}</h1><p>${mode === 'local' ? 'A little time. A little curiosity. Something new around the corner.' : 'Tell us what brings you here. We’ll help you make the most of it.'}</p></div></div><div class="form-layout"><form id="travel-form" class="travel-form" data-mode="${mode}">${`<div class="location-row"><button type="button" class="btn secondary small" data-action="locate">${icon('locate')}Use my current location</button><span class="small-text muted" id="location-status">${state.coordinates ? 'Location ready. Or enter a different city below.' : 'Or search a city manually below.'}</span></div>`}<div class="field-grid"><div class="field full"><label for="travel-destination">${mode === 'local' ? 'City or neighborhood city' : 'Where are you going?'}</label>${destinationField('travel-destination', { value: p.destination, required: mode !== 'local', placeholder: mode === 'local' ? 'e.g. Ottawa, Canada' : 'Where would you like to explore?' })}<small>${mode === 'local' ? 'Location permission is optional. Manual city search always works.' : 'Choose a suggestion or enter a city and country.'}</small></div><label class="field full">Place or business name (optional)<input name="query" value="${e(p.query || '')}" placeholder="e.g. Starbucks, Louvre, or a local favourite" maxlength="120"><small>Search the provider directly for a specific place in this area.</small></label>${mode === 'tourist' ? `<label class="field">Days to explore<input name="days" type="number" min="1" max="14" value="${p.days}" required></label>` : ''}<label class="field">${mode === 'tourist' ? 'Trip start date (optional)' : 'Outing date (optional)'}<input name="startDate" type="date" value="${e(p.startDate)}"><small>Dates enable forecast and simple opening-hour checks.</small></label><label class="field">${mode === 'local' ? 'Time available' : 'Hours to explore each day'}<select name="hours">${options(
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
    )}</div></fieldset><div id="form-message" class="notice ${state.error ? 'error' : ''}" role="status">${e(state.error)}</div><div id="city-choices" class="city-choices"></div><div class="form-submit"><p>Real place data first. A thoughtful plan comes next.</p><button class="btn" type="submit">${icon('search')}Find my places${icon('arrow')}</button></div></form><aside class="form-aside"><div class="form-aside-photo"><img src="/assets/${mode === 'local' ? 'food.jpg' : 'nature.jpg'}" alt="${mode === 'local' ? 'Inviting restaurant interior' : 'A lake surrounded by mountains'}"></div><h3>${mode === 'local' ? 'Make an ordinary day a little less ordinary.' : 'Less planning. More being there.'}</h3><p>You bring the curiosity. Roamwise brings real places, personal recommendations, and a route that connects the dots.</p><ul class="aside-list"><li>${icon('pin')}Actual places, sourced from Geoapify</li><li>${icon('spark')}Interest matching with Gemini AI</li><li>${icon('route')}Geographic planning that groups nearby stops</li><li>${icon('heart')}Save your favorites, without an account</li></ul><p class="small-text">Inspiration photo. Recommendations use live place data.</p></aside></div></div>`;
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
  const f = state.filters,
    origin = referenceOrigin();
  let places = state.places.filter((p) => {
    const hours = openingStatus(p, state.center?.timezone || state.weather?.timezone);
    return (
      (!f.query ||
        nameKey(f.query) === nameKey(state.prefs?.query || '') ||
        nameKey(p.name + ' ' + (p.address || '') + ' ' + labels[p.category]).includes(
          nameKey(f.query)
        )) &&
      (f.category === 'all' ||
        p.category === f.category ||
        (f.category === 'food' && p.category === 'cafes')) &&
      (f.setting === 'any' || p.setting === f.setting) &&
      (f.distance === 'any' || (origin && distanceKm(origin, p) <= Number(f.distance))) &&
      (f.hours === 'all' || (hours.reliable && (f.hours === 'now' ? hours.open : hours.today)))
    );
  });
  if (f.sort === 'distance') places.sort((a, b) => distanceKm(origin, a) - distanceKm(origin, b));
  else if (f.sort === 'name') places.sort((a, b) => a.name.localeCompare(b.name));
  else if (f.sort === 'relevance' && f.query)
    places.sort(
      (a, b) => (nameKey(b.name) === nameKey(f.query)) - (nameKey(a.name) === nameKey(f.query))
    );
  return places;
}
function resultControls() {
  return renderControls(state.filters, state.view);
}
function results() {
  if (state.busy)
    return `<div class="container page">${back('#' + (state.prefs?.mode || 'tourist'), 'Change search')}${loading()}</div>`;
  if (!state.center)
    return `<div class="container page">${empty('Where will you go?', 'Choose a destination or discover what’s nearby.')}</div>`;
  return `<div class="container page">${back('#' + state.prefs.mode, 'Edit my search')}<div class="page-heading"><div><h1>${state.prefs.mode === 'local' ? 'A little closer. A little different.' : `Find your kind of ${e(locationLabel(state.center.name))}.`}</h1><p>${e(locationLabel(state.center.label || state.center.name))} · ${(state.prefs.radius / 1000).toFixed(0)} km search radius · ${state.prefs.mode === 'local' ? state.prefs.hours + '-hour outing' : state.prefs.days + ' days to explore'}</p></div></div>${state.error ? `<div class="notice error" role="alert">${e(state.error)} <a href="#${state.prefs.mode}">Edit search</a></div>` : ''}${state.places.length ? `<details class="results-context"><summary>${icon('sun')}Weather at your destination</summary>${weatherMarkup()}</details>` : ''}<div class="results-top"><div class="results-info"><strong id="result-count">${state.places.length} places</strong> retrieved from Geoapify<br><span>${state.ai ? e(state.ai.message) : 'Choose a place or build an itinerary.'}</span></div><div class="results-actions"><button class="btn secondary small" data-action="personalize" ${!state.places.length ? 'disabled' : ''}>${icon('spark')}Personalize with AI</button><a class="btn small" href="#builder">${icon('route')}Build itinerary <span class="count" id="selection-count">${state.selection.length}</span></a></div></div>${renderOrigin(uiContext())}${resultControls()}<div id="results-content"></div><p class="source-note">Place data: Geoapify / OpenStreetMap contributors. Straight-line distances are measured from your search center. Source-reported hours may change; confirm with the venue.</p></div>`;
}
function renderResultsContent() {
  const content = document.querySelector('#results-content');
  if (!content) return;
  const oldMap = state.view === 'map' && discoveryMap && document.querySelector('#results-map');
  if (oldMap) oldMap.remove();
  clearMaps(oldMap ? [discoveryMap] : []);
  const places = filteredPlaces();
  document
    .querySelectorAll('[data-action=category]')
    .forEach((chip) =>
      chip.setAttribute('aria-pressed', String(chip.dataset.category === state.filters.category))
    );
  const filterCount = document.querySelector('.active-filter-count');
  const activeFilters =
    Number(state.filters.distance !== 'any') +
    Number(state.filters.hours !== 'all') +
    Number(state.filters.setting !== 'any') +
    Number(state.filters.sort !== 'recommended');
  if (filterCount) filterCount.textContent = activeFilters ? ' (' + activeFilters + ')' : '';
  const categorySelect = document.querySelector('#category-filter');
  if (categorySelect) categorySelect.value = state.filters.category;
  const groups = groupBranches(
    places,
    referenceOrigin(),
    state.filters.sort === 'name' ? 'name' : 'distance'
  );
  const visible = state.showAll || state.filters.query ? groups : groups.slice(0, 18);
  document.querySelector('#result-count').textContent =
    groups.length + (groups.length === 1 ? ' matching result' : ' matching results');
  content.innerHTML = places.length
    ? '<div class="result-summary"><span>' +
      places.length +
      ' places' +
      (groups.length !== places.length ? ' &middot; matching branches grouped' : '') +
      '</span><span>Showing ' +
      visible.length +
      ' of ' +
      groups.length +
      ' results</span></div><div class="result-layout ' +
      (state.view === 'map' ? 'with-map' : '') +
      '"><div class="places-grid">' +
      visible.map(card).join('') +
      '</div>' +
      (state.view === 'map'
        ? '<aside class="map-panel"><div id="results-map" class="map" aria-label="Map of discovered places"></div></aside>'
        : '') +
      '</div>' +
      (visible.length < groups.length
        ? '<div class="show-all-row"><button class="btn secondary" data-action="show-all">Show all ' +
          groups.length +
          ' results</button><button class="btn quiet" data-action="hidden-gems">Explore hidden gems' +
          icon('arrow') +
          '</button></div>'
        : '') +
      (state.truncated
        ? '<p class="source-note">This is a bounded selection of provider results. Search a specific name or category to discover additional places.</p>'
        : '')
    : empty(
        'No places match just yet.',
        'Try a different name, a wider distance, or all opening hours. Unknown schedules are excluded by hours filters.',
        'Clear all filters',
        'results'
      );
  if (!places.length)
    content.querySelector('.btn').outerHTML =
      '<button class="btn" data-action="reset-filters">Clear all filters</button>';
  if (state.view === 'map' && places.length) {
    if (oldMap) {
      document.querySelector('#results-map').replaceWith(oldMap);
      discoveryMap.roam.setPlaces(places);
      discoveryMap.invalidateSize();
    } else
      discoveryMap = createMap(document.querySelector('#results-map'), places, state.center, {
        context: state.mapContext,
        favorite,
        timezone: state.center?.timezone,
        onSelect: selectDiscoveryCard,
        onPlace: (id) => {
          state.mapContext = discoveryMap.roam.getContext();
          persist();
          state.detailsReturn = '#results';
          go('place/' + id);
        }
      });
  } else if (oldMap) {
    discoveryMap.remove();
    discoveryMap = null;
  }
}

function details(p) {
  if (!p)
    return (
      '<div class="container page">' +
      empty(
        'This place is no longer in your session.',
        'Search again or open a saved place.',
        'View saved places',
        'saved'
      ) +
      '</div>'
    );
  return renderDetails(p, {
    ...uiContext(),
    group: groupFor(p.id),
    returnLink: state.detailsReturn || '#results'
  });
}
function facts(p) {
  return renderFacts(p, uiContext());
}
function itineraryProgress(current) {
  const items = [
    ['Choose Places', 'builder'],
    ['Generate Plan', 'plan-settings'],
    ['View Route', null]
  ];
  return `<nav class="itinerary-progress" aria-label="Itinerary steps">${items
    .map(([label, path], index) => {
      const number = index + 1,
        complete = number < current,
        active = number === current,
        content = `<span class="step-number">${complete ? icon('check') : number}</span><span>${label}</span>`;
      return `${index ? '<span class="step-connector" aria-hidden="true"></span>' : ''}${complete ? `<a class="itinerary-step is-complete" href="#${path}">${content}</a>` : `<span class="itinerary-step ${active ? 'is-current' : ''}" ${active ? 'aria-current="step"' : ''}>${content}</span>`}`;
    })
    .join('')}</nav>`;
}
function choicePhoto(place) {
  return photoMarkup(place, 'builder-choice-image');
}
function builder() {
  const places = [
    ...new Map(
      [...saved.favorites, ...state.selection].map((place) => [
        place.id,
        placeById(place.id) || place
      ])
    ).values()
  ];
  const p = state.prefs || defaults('tourist'),
    selectedIds = new Set(state.selection.map((place) => place.id));
  return `<div class="container page builder-page">${itineraryProgress(1)}<div class="page-heading"><div><h1>Choose Your Places</h1><p>Select the places you'd like to include in your trip.</p></div></div>${places.length ? `<section class="selection-panel"><div class="section-head"><div><h2>Saved places</h2><p class="small-text muted">Only your favorites and places you already selected are shown.</p></div><div class="toolbar"><button class="btn secondary small" data-action="select-all">Select All</button><button class="btn quiet small" data-action="clear-selection">Clear Selection</button></div></div><ul class="builder-list builder-choices">${places.map((place) => `<li class="builder-choice ${selectedIds.has(place.id) ? 'selected' : ''}"><label class="builder-choice-toggle"><input type="checkbox" data-select="${e(place.id)}" aria-label="Select ${e(place.name)}" ${selectedIds.has(place.id) ? 'checked' : ''}><span class="choice-check" aria-hidden="true">${icon('check')}</span></label>${choicePhoto(place)}<div><h3><a href="#place/${encodeURIComponent(place.id)}">${e(place.name)}</a></h3><p>${categoryBadge(place.category)} <span>${e(place.address || place.city || 'Location details unavailable')}${place.distance != null ? ` · ${e(formatDistance(place.distance))}` : ''}</span></p></div></li>`).join('')}</ul><div class="selection-footer"><p class="selection-count" role="status"><strong>${state.selection.length}</strong> ${state.selection.length === 1 ? 'place' : 'places'} selected</p><button class="btn" data-action="continue-planning" ${state.selection.length ? '' : 'disabled'}>Continue${icon('arrow')}</button></div></section>` : empty('Your trip starts with a saved place.', 'Save a favorite or choose places from your discoveries. They’ll appear here when you’re ready to plan.', 'Explore places', 'tourist')}</div>`;
}
function builderOptions(p) {
  const dayCount = Number(p.days) || 1;
  return `<form id="builder-options" class="builder-options"><input type="hidden" name="days" value="${dayCount}"><input type="hidden" name="hours" value="${Number(p.hours) || 8}"><input type="hidden" name="startDate" value="${e(p.startDate || '')}"><fieldset class="transport-picker"><legend>Getting around</legend><div class="transport-options">${[
    ['walk', 'Walking', 'route'],
    ['drive', 'Driving', 'compass'],
    ['transit', 'Public Transit', 'map']
  ]
    .map(
      ([value, label, glyph]) =>
        `<label class="transport-option ${p.transport === value ? 'selected' : ''}"><input type="radio" name="transport" value="${value}" ${p.transport === value ? 'checked' : ''}><span>${icon(glyph)}${label}</span></label>`
    )
    .join('')}</div></fieldset></form>`;
}
function planSettings() {
  const p = state.prefs || defaults('tourist'),
    days = Number(p.days) || 1;
  return `<div class="container page plan-settings-page">${itineraryProgress(2)}${back('#builder', 'Back to selection')}<div class="page-heading"><div><h1>Plan Your Trip</h1><p>Choose your trip length and how you’ll get around.</p></div></div><section class="planning-card"><div class="trip-duration"><h2>Trip Duration</h2><div class="day-stepper" aria-label="Trip duration"><button type="button" data-action="days-step" data-delta="-1" aria-label="Remove one day" ${days <= 1 ? 'disabled' : ''}>−</button><output aria-live="polite">${days}<span>${days === 1 ? 'day' : 'days'}</span></output><button type="button" data-action="days-step" data-delta="1" aria-label="Add one day" ${days >= 14 ? 'disabled' : ''}>+</button></div></div>${builderOptions(p)}<p id="generation-status" class="generation-status" role="status">Organizing your destinations into an efficient route.</p><button class="btn wide generate-itinerary" type="button" data-action="generate">${icon('route')}Generate My Itinerary${icon('arrow')}</button></section></div>`;
}
const formatTime = (n) =>
  `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
function planScreen() {
  const p = state.plan;
  if (!p)
    return `<div class="container page">${empty('Your itinerary is waiting to happen.', 'Choose a few places and let Roamwise connect the dots.', 'Build an itinerary', 'builder')}</div>`;
  state.day = Math.min(state.day, p.days.length - 1);
  const completed = isCompleted(p);
  const day = p.days[state.day],
    count = p.days.reduce((sum, d) => sum + d.stops.length, 0),
    activeIndex = completed ? -1 : day.stops.findIndex((stop) => !stop.visited),
    activeStop = activeIndex < 0 ? null : day.stops[activeIndex],
    currentStop = day.stops
      .slice(0, activeIndex < 0 ? day.stops.length : activeIndex)
      .filter((stop) => stop.visited)
      .at(-1);
  const tabs = `<div class="day-tabs" aria-label="Itinerary days">${p.days.map((d, i) => `<button class="day-tab ${state.day === i ? 'active' : ''}" data-action="day" data-day="${i}" aria-pressed="${state.day === i}">Day ${d.number}${d.date ? ' · ' + e(d.date.slice(5)) : ''}</button>`).join('')}</div>`;
  const timeline = day.stops.length
    ? `<ol class="schedule">${day.stops
        .map((s, index) => {
          const next = !s.visited && index === activeIndex,
            nextLeg = day.stops[index + 1]?.travel,
            travelLabel = nextLeg
              ? nextLeg.minutes == null
                ? 'Transit time available in live directions'
                : `${nextLeg.minutes} min estimated ${p.preferences.transport === 'drive' ? 'drive' : 'walk'} to next stop`
              : 'Last stop of the day';
          return `<li class="category-${categoryKey(s.place.category)} ${s.visited ? 'is-visited' : ''} ${next ? 'is-up-next' : ''}"><div class="schedule-time">${formatTime(s.start)}</div><div class="schedule-stop"><div class="stop-heading"><span class="stop-number">${s.visited ? icon('check') : index + 1}</span><h3><a href="#place/${encodeURIComponent(s.place.id)}">${e(s.place.name)}</a></h3></div><p class="stop-category">${categoryBadge(s.place.category)}<span> · ${next ? 'Up next' : s.visited ? 'Visited' : 'Upcoming'} · ${s.duration} min visit · until ${formatTime(s.end)}</span></p><p>${s.hoursChecked ? 'Simple opening hours checked for this date' : 'Hours not checked; confirm before visiting'}</p><p class="travel-info">${icon('route')} ${travelLabel}${nextLeg ? ` · ${Number.isFinite(nextLeg.km) ? nextLeg.km.toFixed(1) : 'Unknown'} km straight-line distance` : ''}</p>${p.preferences.transport !== 'transit' ? `<button class="route-segment" style="--segment-color:var(--category-${categoryKey(s.place.category)})" data-action="route-leg" data-index="${index}">Highlight this route segment</button>` : ''}<a class="stop-directions" href="${legDirections(day, index, p.preferences.transport, p.center)}" target="_blank" rel="noopener noreferrer">${p.preferences.transport === 'transit' ? 'Actual transit directions' : 'Directions to this stop'}${icon('external')}</a>${completed ? '' : `<button class="btn ${s.visited ? 'secondary' : 'quiet'} small visited-toggle" data-action="toggle-visited" data-index="${index}">${s.visited ? 'Undo visited' : 'Mark as visited'}</button>`}</div></li>`;
        })
        .join('')}</ol>`
    : `<p class="empty-day">No selected places were assigned to this day.</p>`;
  const navigation = `<div class="current-destination"><div><span>Current destination</span><strong>${currentStop ? e(currentStop.place.name) : state.tripOrigin ? 'Your current location' : e(p.center?.name || 'Trip start')}</strong></div><div><span>Next destination</span><strong>${activeStop ? e(activeStop.place.name) : 'Day complete'}</strong></div><div><span>Travel method</span><strong>${e({ walk: 'Walking', drive: 'Driving', transit: 'Public transit' }[p.preferences.transport])}</strong></div><div><span>Estimated travel time</span><strong>${activeStop ? (activeStop.travel.minutes == null ? 'Available in live directions' : `About ${activeStop.travel.minutes} min`) : '—'}</strong></div>${activeStop ? `<a class="btn secondary small" href="${directionsUrl(day, activeIndex, p.preferences.transport, state.tripOrigin || p.center)}" target="_blank" rel="noopener noreferrer">Open directions${icon('external')}</a><button class="btn quiet small" data-action="use-location-directions">Use my location for directions</button>` : ''}</div>`;
  return `<div class="container page trip-page">${completed ? '' : itineraryProgress(3)}${back(completed ? '#itineraries' : '#builder', completed ? 'Back to My Itineraries' : 'Back to Selection')}<div class="page-heading"><div><h1>${e(locationLabel(p.name))}</h1><p>${p.days.length} ${p.days.length === 1 ? 'day' : 'days'} · ${count} selected places · ${e({ walk: 'Walking', drive: 'Driving', transit: 'Public transportation' }[p.preferences.transport])}</p></div><div class="toolbar">${completed ? `<span class="trip-status is-completed">${icon('check')}Completed ${e(completionDate(p.completedAt))}</span>` : `<button class="btn secondary small" data-action="save-plan">${icon('heart')}${saved.plans.some((x) => x.id === p.id) ? 'Update saved itinerary' : 'Save itinerary'}</button>`}</div></div>${completed ? '<div class="notice">This completed trip is read-only. Your original destinations and visited progress are preserved.</div>' : navigation}${p.notes.some((n) => n.startsWith('All selected places')) ? `<div class="notice">All your selected places are included. Some days run longer than your requested hours.</div>` : ''}${tabs}${day.forecast ? `<div class="weather-strip">${icon(day.forecast.rain >= 50 ? 'rain' : 'sun')}<strong>${Math.round(day.forecast.high)}°C</strong> ${e(day.forecast.label)} · Rain ${day.forecast.rain == null ? 'not available' : day.forecast.rain + '%'} · ${e(day.forecast.date)}</div>` : ''}<div class="trip-layout"><details class="trip-timeline" ${(state.timelineOpen ?? !window.matchMedia?.('(max-width: 780px)').matches) ? 'open' : ''}><summary class="trip-timeline-summary">Day ${day.number} · ${day.stops.length} ${day.stops.length === 1 ? 'stop' : 'stops'} · Timeline</summary><section><div class="day-heading"><div><h2>Day ${day.number}${day.date ? ' · ' + e(day.date) : ''}</h2><p>${day.stops.length} stops · ${Math.floor(day.minutes / 60)}h ${day.minutes % 60}m estimated</p></div>${day.stops.length ? `<a class="btn secondary small" href="${dayDirections(day.stops, p.preferences.transport)}" target="_blank" rel="noopener noreferrer">${p.preferences.transport === 'transit' ? 'Transit directions' : 'Day directions'}${icon('external')}</a>` : ''}</div>${timeline}${!completed && state.day === lastTripDay(p) ? `<div class="complete-trip-footer"><p>Ready to wrap up this adventure?</p><button class="btn wide" data-action="complete-trip">${icon('check')}Complete Trip</button><small>You can finish with unvisited places.</small></div>` : ''}</section></details><aside class="plan-map-aside"><div id="trip-map" class="map plan-map" aria-label="Interactive route map for day ${day.number}"></div><div id="trip-route-status" class="route-status" role="status">${day.stops.length > 1 && p.preferences.transport !== 'transit' ? 'Loading the route between your stops…' : p.preferences.transport === 'transit' ? 'Transit routes use external directions; no transit schedule is estimated.' : 'Markers show your planned stops.'}</div><p class="small-text muted">Route lines follow available Geoapify geometry. Schedule times remain planning estimates.</p></aside></div><details class="plan-notes"><summary>Planning notes</summary><ul>${p.notes.map((n) => `<li>${e(n)}</li>`).join('')}</ul></details></div>`;
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
  return `<div class="container page">${back('#home', 'Back to exploring')}<div class="page-heading"><div><h1>Good finds deserve a second visit.</h1><p>Your little collection of places and plans. Saved in this browser, ready when you are.</p></div></div><div class="saved-tabs"><button class="saved-tab ${state.savedTab === 'places' ? 'active' : ''}" data-action="saved-tab" data-tab="places">Favorite places (${saved.favorites.length})</button><button class="saved-tab ${state.savedTab === 'plans' ? 'active' : ''}" data-action="saved-tab" data-tab="plans">Saved itineraries (${saved.plans.length})</button></div>${state.savedTab === 'places' ? (saved.favorites.length ? `<div class="places-grid">${saved.favorites.map(card).join('')}</div>` : empty('A few favorites make a great beginning.', 'Tap the heart on any place to keep it here for later.')) : tripCollectionMarkup(saved.plans, read('activePlan', null), state.tripTab)}<p class="source-note">localStorage is specific to this browser and device. Clearing browser data removes saved items. Old plans and provider-reported hours may need a fresh search.</p></div>`;
}
function about() {
  return `<div class="container page about-content">${back('#home', 'Back to exploring')}<h1>A little curiosity. Real possibilities.</h1><p style="margin-top:23px">Roamwise helps you discover actual places and turn them into a personal travel plan. Built as a Grade 12 Computer Science project with HTML, CSS, vanilla JavaScript, and Node.js.</p><h2>Real places come first.</h2><p>Geoapify supplies destination geocoding, places, place details, and supported walking/driving routes using <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> data. Attribution: © OpenStreetMap contributors, available under the Open Database License. Hours and addresses can be incomplete or out of date. Confirm important details with each venue.</p><h2>AI with a clear job.</h2><p>Gemini selects identifiers from retrieved candidates. Its structured response is validated, and its output cannot replace addresses, hours, or names. Deterministic matching takes over if Gemini is unavailable. Travel preferences and candidate data are sent to Google for personalization; current coordinates are sent to Geoapify and Open-Meteo during a search.</p><h2>A route, with room for real life.</h2><p>A nearest-neighbor heuristic arranges only the places selected by the traveler across the requested days. Selected places remain in the itinerary even when the day runs long or source-reported hours are unavailable. Schedule times are estimates; a separate Geoapify route shows the path between stops. Public transit uses external Google Maps directions and never invents service times.</p><h2>Weather & honest unknowns.</h2><p><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> supplies forecasts only within its returned date range (CC BY 4.0). Rain encourages indoor alternatives. Opening status uses interpretable source-reported schedules in the destination time zone. Unavailable or irregular hours are clearly marked.</p><h2>Photography & maps.</h2><p>Editorial form inspiration photos are from <a href="https://unsplash.com/" target="_blank" rel="noopener noreferrer">Unsplash</a>. Place and destination photographs come from Wikimedia Commons after identity and location checks. Each photograph includes its creator, license and source; photo credits include additional notices. Unverified locations use category placeholders. Maps use <a href="https://leafletjs.com/" target="_blank" rel="noopener noreferrer">Leaflet</a> and OpenStreetMap tiles. Photo source URLs and licenses are documented in the project’s assets notes.</p><h2>Yours, in this browser.</h2><p>No account or database. Selections, active itineraries, visited progress, favorites, and saved plans use localStorage; discovery results use sessionStorage. Location is requested when you choose Explore Nearby or press a current-location button. Manual city search works when permission is denied.</p></div>`;
}

async function render() {
  const version = ++renderVersion;
  disposeDestinationSearch?.();
  disposeDestinationSearch = null;
  if (discoveryMap) state.mapContext = discoveryMap.roam.getContext();
  clearMaps();
  discoveryMap = null;
  activePlanMap = null;
  updateHeader();
  const path = route();
  let place;
  if (path.startsWith('place/')) {
    place = placeById(path.slice(6));
    main.innerHTML = details(place);
  } else if (path === 'home') main.innerHTML = home();
  else if (['tourist', 'local'].includes(path)) main.innerHTML = travelForm(path);
  else if (path === 'results') main.innerHTML = results();
  else if (path.startsWith('locations/')) main.innerHTML = branchScreen(path.slice(10));
  else if (path === 'builder') main.innerHTML = builder();
  else if (path === 'plan-settings') main.innerHTML = planSettings();
  else if (path.startsWith('plan') || path.startsWith('trip')) {
    if (path.includes('/')) {
      const id = path.split('/')[1];
      state.plan =
        (state.plan?.id === id ? state.plan : null) || saved.plans.find((p) => p.id === id);
    }
    main.innerHTML = planScreen();
  } else if (path === 'itineraries') main.innerHTML = itineraries();
  else if (path === 'saved') main.innerHTML = savedScreen();
  else if (path === 'about') main.innerHTML = about();
  else
    main.innerHTML = `<div class="container page">${empty('Let’s get you back on the map.', 'This view does not exist.', 'Go home', 'home')}</div>`;
  document.title =
    path === 'home'
      ? 'Roamwise — Where will you explore next?'
      : `${place?.name || { tourist: 'Explore a destination', local: 'Discover nearby', results: 'Your discoveries', builder: 'Choose your places', 'plan-settings': 'Plan your trip', saved: 'Your saved places', itineraries: 'My Itineraries', about: 'About Roamwise' }[path] || 'Your itinerary'} — Roamwise`;
  if (path === 'home' || path === 'tourist' || path === 'local') {
    const form = document.querySelector(path === 'home' ? '#home-search' : '#travel-form');
    disposeDestinationSearch = attachDestinationSearch(
      form,
      async (city) => {
        const prefs =
          path === 'home'
            ? {
                ...defaults('tourist'),
                ...state.drafts.tourist,
                destination: city.label,
                query: '',
                mode: 'tourist'
              }
            : formValues(form);
        state.drafts[prefs.mode] = prefs;
        write('drafts', state.drafts, true);
        await startSearch(prefs, city);
      },
      { submit: path === 'home' }
    );
  }
  if (path === 'local' && state.pendingLocation) {
    state.pendingLocation = false;
    queueMicrotask(() => {
      const button = document.querySelector('#travel-form [data-action=locate]');
      if (button) void locate(button);
    });
  }
  if (path === 'results') {
    main.firstElementChild?.classList.add('results-page');
    renderResultsContent();
  }
  if (place) {
    createMap(document.querySelector('#details-map'), [place], place, { favorite });
    loadDetails(place, version);
  }
  if (path.startsWith('locations/')) {
    const group = groupFor(path.slice(10));
    if (group) {
      const map = createMap(document.querySelector('#branches-map'), group.branches, state.center, {
        onPlace: (id) => {
          state.detailsReturn = location.hash;
          go('place/' + id);
        }
      });
      const disclosure = document.querySelector('.branch-map-disclosure');
      disclosure.addEventListener('toggle', () => {
        if (disclosure.isConnected && disclosure.open && map) {
          map.invalidateSize();
          map.fitBounds(
            group.branches.map((p) => [p.lat, p.lon]),
            { padding: [35, 35], maxZoom: 15, animate: false }
          );
        }
      });
    }
  }
  if ((path === 'plan' || path.startsWith('plan/') || path.startsWith('trip')) && state.plan)
    loadPlanMap(version);
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
    document.querySelector('.details-image').outerHTML = photo(p, 'details-image');
    document.querySelector('#detail-status').textContent = 'Available provider details loaded.';
    document.querySelector('.detail-title-category').innerHTML =
      categoryBadge(p.category) +
      statusForDetails(p, state.center?.timezone || state.weather?.timezone);
    void loadDescription(p, version);
  } catch (error) {
    if (version === renderVersion) {
      void loadDescription(place, version);
      document.querySelector('#detail-status').textContent =
        `Extra details unavailable. Showing retrieved search data. ${error.message}`;
    }
  }
}
async function loadPlanMap(version) {
  const requestedPlan = state.plan;
  const day = state.plan.days[state.day],
    transport = state.plan.preferences.transport,
    activeIndex = day.stops.findIndex((stop) => !stop.visited),
    activePlaceId = activeIndex < 0 ? null : day.stops[activeIndex].place.id,
    mapNode = document.querySelector('#trip-map, #plan-map'),
    statusNode = document.querySelector('#trip-route-status, #route-status');
  const map = createMap(
    mapNode,
    day.stops.map((s) => s.place),
    state.plan.center,
    {
      numbered: true,
      favorite,
      visitedIds: day.stops.filter((s) => s.visited).map((s) => s.place.id),
      activePlaceId: isCompleted(state.plan) ? null : activePlaceId,
      onPlace: (id) => {
        state.detailsReturn = location.hash;
        go(`place/${id}`);
      }
    }
  );
  activePlanMap = map;
  if (day.stops.length < 2 || transport === 'transit') {
    if (day.stops.length === 1 && transport !== 'transit' && !isCompleted(state.plan))
      void highlightRouteSegment(0);
    return;
  }
  try {
    const routeKey = `day:${transport}:${day.stops.map((s) => s.place.id + ':' + s.place.lat + ',' + s.place.lon).join('|')}`;
    let routeData = routeCache.get(routeKey);
    if (!routeData) {
      const parts = [];
      for (let from = 0; from < day.stops.length - 1; from += 11) {
        if (version !== renderVersion) return;
        const batch = day.stops.slice(from, from + 12).map((s) => s.place);
        const key = `chunk:${transport}:${batch.map((p) => p.id + ':' + p.lat + ',' + p.lon).join('|')}`;
        let part = routeCache.get(key);
        if (!part) {
          part = await api('route', { places: batch, transport });
          if (routeCache.size > 150) routeCache.clear();
          routeCache.set(key, part);
        }
        parts.push(part);
      }
      routeData = {
        geometry: {
          type: 'MultiLineString',
          coordinates: parts.flatMap((p) =>
            p.geometry.type === 'MultiLineString'
              ? p.geometry.coordinates
              : [p.geometry.coordinates]
          )
        },
        distance: parts.reduce((sum, p) => sum + (p.distance || 0), 0),
        time: parts.reduce((sum, p) => sum + (p.time || 0), 0)
      };
      routeCache.set(routeKey, routeData);
    }
    if (version !== renderVersion || state.plan !== requestedPlan || map !== activePlanMap) return;
    drawRoute(map, routeData.geometry, { stops: day.stops, completed: isCompleted(state.plan) });
    const nextStop = isCompleted(state.plan) ? null : day.stops.find((stop) => !stop.visited);
    if (nextStop) {
      map?.panTo([nextStop.place.lat, nextStop.place.lon], { animate: false });
      void highlightRouteSegment(activeIndex);
    }
    statusNode.textContent = `Geoapify ${transport === 'drive' ? 'driving' : 'walking'} route between stops: ${(routeData.distance / 1000).toFixed(1)} km · approximately ${Math.round(routeData.time / 60)} min moving time. Schedule times above remain planning estimates.`;
  } catch (error) {
    if (version === renderVersion)
      statusNode.textContent = `Route unavailable. Stop markers and external directions still work. ${error.message}`;
  }
}
async function highlightRouteSegment(index) {
  if (!state.plan || !activePlanMap) return;
  const requestedPlan = state.plan;
  const day = state.plan.days[state.day],
    stop = day?.stops[index];
  if (!stop || state.plan.preferences.transport === 'transit') return;
  const previous = index > 0 ? day.stops[index - 1].place : state.tripOrigin || state.plan.center,
    transport = state.plan.preferences.transport,
    key = `leg:${transport}:${previous.lat},${previous.lon}:${stop.place.lat},${stop.place.lon}`,
    status = document.querySelector('#trip-route-status, #route-status'),
    map = activePlanMap,
    placeId = stop.place.id,
    version = renderVersion;
  try {
    let routeData = routeCache.get(key);
    if (!routeData) {
      routeData = await api(
        'route',
        index
          ? { places: [previous, stop.place], transport }
          : { places: [stop.place], origin: previous, transport }
      );
      routeCache.set(key, routeData);
    }
    if (
      version !== renderVersion ||
      map !== activePlanMap ||
      state.plan !== requestedPlan ||
      state.plan.days[state.day].stops[index]?.place.id !== placeId
    )
      return;
    if (!map) throw new Error('The map is unavailable; use the external directions link instead.');
    const category = categoryKey(stop.place.category),
      color =
        window
          .getComputedStyle(document.documentElement)
          .getPropertyValue(`--category-${category}`)
          .trim() || '#246b64';
    drawRouteSegment(activePlanMap, routeData.geometry, color);
    if (status)
      status.textContent = `Highlighted segment to ${stop.place.name}. Geoapify ${transport === 'drive' ? 'driving' : 'walking'} route · approximately ${Math.round(routeData.time / 60)} min · ${(routeData.distance / 1000).toFixed(1)} km. Schedule time remains an estimate.`;
  } catch (error) {
    if (status && status.isConnected && version === renderVersion)
      status.textContent = `This route segment is unavailable. Use the directions link for ${stop.place.name}. ${error.message}`;
  }
}

async function startSearch(prefs, center) {
  const run = ++searchVersion;
  if (discoveryMap) {
    discoveryMap.remove();
    discoveryMap = null;
  }
  state.selection = [];
  persistSelection();
  state.busy = true;
  state.error = '';
  state.prefs = prefs;
  if (state.center && distanceKm(state.center, center) > 40 && !state.coordinates)
    state.origin = null;
  state.center = center;
  state.mapContext = null;
  state.places = [];
  state.ai = null;
  state.filters = { ...emptyFilters, query: prefs.query || '' };
  state.showAll = false;
  state.returnScroll = 0;
  state.view = 'list';
  go('results');
  try {
    const data = await api('search', { center, preferences: prefs });
    if (run !== searchVersion) return;
    state.places = data.places;
    state.weather = data.weather;
    state.truncated = data.truncated || false;
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
    state.origin = { ...state.coordinates, name: 'your location' };
    if (
      document.querySelector('#travel-form').dataset.mode === 'local' &&
      !document.querySelector('[name=destination]').value.trim()
    )
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
async function generate(button) {
  const requestedSearch = searchVersion;
  const requestedRoute = route();
  let planningCenter = referenceOrigin();
  const places = [...new Map(state.selection.map((place) => [place.id, place])).values()];
  if (!places.length) {
    flash('Add at least one place first.');
    return;
  }
  const settings = document.querySelector('#builder-options');
  if (settings && !settings.reportValidity()) return;
  state.prefs = {
    ...(state.prefs || defaults('tourist')),
    ...(settings ? Object.fromEntries(new FormData(settings)) : {})
  };
  if (!state.center)
    planningCenter = {
      lat: places[0].lat,
      lon: places[0].lon,
      name: places[0].city || 'Chosen places'
    };
  persist();
  button.disabled = true;
  const original = button.innerHTML;
  button.innerHTML = `${icon('route')}Creating your itinerary…`;
  button.setAttribute('aria-busy', 'true');
  const status = document.querySelector('#generation-status');
  if (status) status.textContent = 'Organizing your destinations into an efficient route…';
  try {
    const { plan } = await api('plan', {
      places,
      preferences: state.prefs,
      center: planningCenter
    });
    if (requestedSearch !== searchVersion) return;
    for (const day of plan.days) for (const stop of day.stops) stop.visited = false;
    plan.status = 'active';
    const previousActive = read('activePlan', null);
    if (previousActive && previousActive.id !== plan.id && !isCompleted(previousActive))
      saved.savePlan(previousActive);
    saved.savePlan(plan);
    state.plan = plan;
    state.day = 0;
    plan.tripStarted = true;
    persistPlan();
    if (route() === requestedRoute) go(`trip/${plan.id}`);
    else flash('Your itinerary is ready in My itinerary.');
  } catch (error) {
    flash(error.message);
    button.disabled = false;
    button.innerHTML = original;
    button.removeAttribute('aria-busy');
    if (status)
      status.textContent = `Itinerary generation failed. ${error.message} Try again; your place selection is saved.`;
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
function directionsUrl(day, index, transport, fallbackOrigin) {
  const from = state.tripOrigin || (index > 0 ? day.stops[index - 1].place : fallbackOrigin);
  const to = day.stops[index]?.place;
  if (!to) return '#';
  const params = new URLSearchParams({
    api: '1',
    destination: `${to.lat},${to.lon}`,
    travelmode: { walk: 'walking', drive: 'driving', transit: 'transit' }[transport]
  });
  if (from?.lat != null && from?.lon != null) params.set('origin', `${from.lat},${from.lon}`);
  return `https://www.google.com/maps/dir/?${params}`;
}
async function setTripOriginFromLocation(button) {
  button.disabled = true;
  try {
    if (!navigator.geolocation) throw new Error('Location is not supported here.');
    const position = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000
      })
    );
    state.tripOrigin = { lat: position.coords.latitude, lon: position.coords.longitude };
    render();
    flash('Directions now start from your current location.');
  } catch {
    state.tripOrigin = null;
    render();
    flash('Location was unavailable; directions start from your last visited stop or trip start.');
  }
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
    if (placeCard && !event.target.closest('a,button,input,label,summary,details,.photo-credit')) {
      if (route() === 'results' && state.view === 'map') {
        discoveryMap?.roam.selectPlace(placeCard.dataset.place);
        return;
      }
      state.detailsReturn = location.hash;
      state.returnScroll = window.scrollY;
      go(`${placeCard.dataset.group ? 'locations' : 'place'}/${placeCard.dataset.place}`);
    }
    return;
  }
  const { action, id } = target.dataset;
  if (action === 'focus-place') {
    discoveryMap?.roam.selectPlace(id);
    return;
  }
  if (action === 'complete-trip') {
    completeCurrentTrip(target);
    return;
  }
  if (action === 'trip-tab') {
    state.tripTab = target.dataset.tab;
    render();
    return;
  }
  if (action === 'menu') {
    const nav = document.querySelector('.nav-links');
    nav.classList.toggle('open');
    target.setAttribute('aria-expanded', String(nav.classList.contains('open')));
    target.setAttribute(
      'aria-label',
      nav.classList.contains('open') ? 'Close navigation' : 'Open navigation'
    );
  }
  if (action === 'quick-city') {
    const input = document.querySelector('#home-destination');
    input.value = target.dataset.city;
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (action === 'category') {
    state.filters.category = target.dataset.category;
    persist();
    renderResultsContent();
  }
  if (action === 'destination') {
    state.drafts.tourist = { ...defaults('tourist'), destination: target.dataset.city };
    write('drafts', state.drafts, true);
    go('tourist');
  }
  if (action === 'explore-nearby') {
    event.preventDefault();
    state.pendingLocation = true;
    go('local');
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
  if (action === 'continue-planning') go('plan-settings');
  if (action === 'days-step') {
    const current = Number(state.prefs?.days) || 1,
      delta = Number(target.dataset.delta);
    state.prefs = {
      ...(state.prefs || defaults('tourist')),
      days: Math.max(1, Math.min(14, current + delta))
    };
    persist();
    render();
  }
  if (action === 'select-all') {
    state.selection = [
      ...new Map(
        [...state.selection, ...saved.favorites].map((place) => [place.id, place])
      ).values()
    ].slice(0, 80);
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
    state.showAll = false;
    persist();
    render();
  }
  if (action === 'personalize') await personalizeButton(target);
  if (action === 'generate') await generate(target);
  if (action === 'day') {
    state.day = Number(target.dataset.day);
    persistPlan();
    render();
  }
  if (action === 'route-leg') await highlightRouteSegment(Number(target.dataset.index));
  if (action === 'toggle-visited' && !isCompleted(state.plan)) {
    const day = state.plan.days[state.day],
      stop = day.stops[Number(target.dataset.index)];
    if (stop) {
      let advancedTo = null;
      stop.visited = !stop.visited;
      persistPlan();
      const next = day.stops.findIndex((item) => !item.visited);
      if (next < 0) {
        const nextDay = state.plan.days.findIndex(
          (item, index) => index > state.day && item.stops.some((candidate) => !candidate.visited)
        );
        if (nextDay >= 0) {
          state.day = nextDay;
          advancedTo = state.plan.days[nextDay].number;
        }
      }
      persistPlan();
      render();
      document
        .querySelector('.schedule li.is-up-next')
        ?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      flash(
        stop.visited
          ? next < 0
            ? advancedTo
              ? `Day ${day.number} complete. Day ${advancedTo} is now active.`
              : 'Day complete. Your visited stops are saved.'
            : 'Marked visited. The next stop is highlighted.'
          : 'Visited status undone.'
      );
    }
  }
  if (action === 'use-location-directions' && !isCompleted(state.plan))
    await setTripOriginFromLocation(target);
  if (action === 'save-plan' && !isCompleted(state.plan)) {
    const ok = saved.savePlan(state.plan);
    flash(
      ok
        ? 'Itinerary saved in this browser.'
        : 'Browser storage is full or blocked. The itinerary was not persisted.'
    );
    persistPlan();
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
    if (!isCompleted(state.plan)) persistPlan();
    go(`trip/${id}`);
  }
  if (action === 'delete-plan') {
    const ok = saved.removePlan(id);
    if (ok && (read('activePlan', null)?.id === id || read('activePlan', null, true)?.id === id)) {
      write('activePlan', null);
      write('activePlan', null, true);
    }
    if (ok && state.plan?.id === id) state.plan = null;
    if (ok) state.tripSuccess = false;
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

  if (event.target.id === 'travel-form') {
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
  if (input.name === 'transport' && input.form?.id === 'builder-options') {
    state.prefs = { ...(state.prefs || defaults('tourist')), transport: input.value };
    persist();
    render();
    return;
  }
  if (input.dataset.select) {
    addSelection(input.dataset.select, true);
    if (route() === 'builder') render();
    return;
  }
  const filter = {
    'category-filter': 'category',
    'setting-filter': 'setting',
    'sort-filter': 'sort',
    'distance-filter': 'distance',
    'hours-filter': 'hours'
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
    if (image.tagName === 'IMG' && image.hasAttribute('data-city-photo')) {
      image.parentElement.innerHTML = placeholder({ category: 'landmarks' });
      return;
    }
    if (image.tagName === 'IMG' && image.closest('.branch-actual-photo')) {
      image.closest('.branch-actual-photo').remove();
      return;
    }
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
const descriptionCache = new Map();
async function loadDescription(place, version) {
  const key = `${place.id}:${place.retrievedAt}`;
  try {
    const data = descriptionCache.get(key) || (await api('details', { place, describe: true }));
    if (version !== renderVersion) return;
    const description = data.description;
    const node = document.querySelector('#place-description');
    const status = document.querySelector('#description-status');
    if (!description?.paragraphs?.length) {
      status.textContent =
        'A detailed description is unavailable from the retrieved sources. Additional facts are not inferred.';
      return;
    }
    descriptionCache.set(key, data);
    node.replaceChildren(
      ...description.paragraphs.map((text) => {
        const paragraph = document.createElement('p');
        paragraph.textContent = text;
        return paragraph;
      })
    );
    status.textContent = description.message;
    if (description.attribution) {
      const attribution = document.createElement('p');
      attribution.className = 'source-note';
      const link = document.createElement('a');
      link.textContent = `${description.attribution.title} · ${description.attribution.license}`;
      link.href = description.attribution.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      attribution.append(link);
      node.append(attribution);
    }
  } catch {
    if (version === renderVersion)
      document.querySelector('#description-status').textContent =
        'Additional source information is temporarily unavailable. Showing retrieved place information.';
  }
}
async function setOriginFromLocation(button) {
  const output = document.querySelector('#origin-status');
  button.disabled = true;
  output.textContent = 'Waiting for location permission…';
  const version = renderVersion;
  try {
    if (!navigator.geolocation)
      throw new Error('Location is not supported. Enter a starting point below.');
    const position = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000
      })
    );
    if (version !== renderVersion) return;
    state.origin = {
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      name: 'your location'
    };
    state.branchSort = 'distance';
    persist();
    render();
    flash('Distances now use your location.');
  } catch {
    if (version === renderVersion)
      output.textContent =
        'Location is unavailable or permission was denied. City-centre distances remain available; you can enter a starting point below.';
  } finally {
    button.disabled = false;
  }
}
document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const { action, id } = target.dataset;
  if (action === 'show-all') {
    state.showAll = true;
    renderResultsContent();
  }
  if (action === 'hidden-gems') {
    state.filters.category = 'hidden';
    state.showAll = true;
    persist();
    renderResultsContent();
  }
  if (action === 'origin-locate') await setOriginFromLocation(target);
  if (action === 'origin-reset') {
    state.origin = null;
    persist();
    render();
  }
  if (action === 'origin-choice') {
    const city = state.originChoices[Number(target.dataset.index)];
    if (city) {
      state.origin = { ...city, name: city.label };
      persist();
      render();
    }
  }
  if (action === 'origin-place') {
    const place = placeById(id);
    if (place) {
      state.origin = { lat: place.lat, lon: place.lon, name: place.name };
      persist();
      render();
      flash('Starting point updated.');
    }
  }
});
document.addEventListener('submit', async (event) => {
  if (event.target.id === 'place-name-search') {
    event.preventDefault();
    const query = new FormData(event.target).get('query').trim();
    await startSearch({ ...state.prefs, query }, state.center);
  }
  if (event.target.id === 'origin-form') {
    event.preventDefault();
    const value = new FormData(event.target).get('origin').trim();
    const coordinates = value.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    const output = document.querySelector('#origin-status'),
      button = event.target.querySelector('button');
    if (coordinates) {
      const lat = Number(coordinates[1]),
        lon = Number(coordinates[2]);
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        output.textContent = 'Enter latitude from −90 to 90 and longitude from −180 to 180.';
        return;
      }
      state.origin = { lat, lon, name: 'your chosen coordinates' };
      persist();
      render();
      return;
    }
    output.textContent = 'Finding starting points…';
    button.disabled = true;
    const version = renderVersion;
    try {
      const { results } = await api(`geocode?q=${encodeURIComponent(value)}&origin=1`);
      if (version !== renderVersion) return;
      state.originChoices = results;
      output.textContent = 'Choose the starting point you meant.';
      document.querySelector('#origin-choices').innerHTML = results
        .map(
          (city, index) =>
            `<button class="city-choice" type="button" data-action="origin-choice" data-index="${index}">${icon('pin')}${e(city.label)}</button>`
        )
        .join('');
    } catch (error) {
      if (version === renderVersion) output.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }
});
document.addEventListener('change', (event) => {
  if (event.target.id === 'branch-sort') {
    state.branchSort = event.target.value;
    render();
  }
  if (event.target.id === 'detail-transport') {
    const place = placeById(route().slice(6));
    if (place)
      document.querySelector('#detail-directions').href = directions(place, event.target.value);
  }
});
observePhotos(main);
render();

function selectDiscoveryCard(id, source = 'card') {
  let card = [...document.querySelectorAll('[data-place]')].find(
    (node) => node.dataset.place === id
  );
  if (!card && source === 'marker') {
    const group = businessGroups().find((g) => g.id === id || g.branches?.some((p) => p.id === id));
    if (group)
      card = [...document.querySelectorAll('[data-place]')].find(
        (node) => node.dataset.place === group.id
      );
    if (!card && !state.showAll) {
      state.showAll = true;
      renderResultsContent();
      card = [...document.querySelectorAll('[data-place]')].find(
        (node) => node.dataset.place === id
      );
    }
  }
  document
    .querySelectorAll('.place-card')
    .forEach((node) => node.classList.toggle('is-map-selected', node === card));
  const list = card?.closest('.places-grid');
  if (source === 'marker' && window.innerWidth > 780 && list)
    list.scrollTo?.({
      top: card.offsetTop - 8,
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth'
    });
}
function itineraries() {
  return `<div class="container page itineraries-page"><div class="page-heading"><div><h1>My Itineraries</h1><p>Your next adventures and the ones you'll remember.</p></div><a class="btn" href="#builder">${icon('route')}Plan a trip</a></div>${state.tripSuccess ? '<div class="notice success" role="status">Trip completed! Your adventure has been saved.</div>' : ''}${tripCollectionMarkup(saved.plans, read('activePlan', null), state.tripTab)}</div>`;
}
function completeCurrentTrip(trigger) {
  if (!state.plan || isCompleted(state.plan) || state.day !== lastTripDay(state.plan)) return;
  promptTripCompletion(state.plan, {
    trigger,
    onComplete(completed) {
      clearTimeout(toastTimer);
      document.querySelector('#toast')?.classList.remove('show');
      if (read('activePlan', null)?.id === completed.id) write('activePlan', null);
      if (read('activePlan', null, true)?.id === completed.id) write('activePlan', null, true);
      if (state.plan?.id === completed.id) state.plan = null;
      state.tripTab = 'completed';
      state.tripSuccess = true;
      go('itineraries');
    }
  });
}
document.addEventListener(
  'toggle',
  (event) => {
    if (event.target.matches?.('.trip-timeline')) state.timelineOpen = event.target.open;
  },
  true
);
