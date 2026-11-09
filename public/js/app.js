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
import { clearMaps, createMap, drawRoute, directions, dayDirections } from './maps.js';

const main = document.querySelector('main'),
  header = document.querySelector('#header');
const labels = Object.fromEntries(
  Object.entries(categories).map(([key, value]) => [key, value.label])
);
const images = {
  landmarks: 'paris.jpg',
  food: 'food.jpg',
  cafes: 'food.jpg',
  history: 'city.jpg',
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
  distance: 'any',
  hours: 'all',
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
  origin: initial?.origin || null,
  originChoices: [],
  branchSort: 'distance',
  showAll: false,
  truncated: initial?.truncated || false,
  cityChoices: [],
  busy: false,
  error: '',
  savedTab: 'places',
  detailsReturn: '#results'
};
let toastTimer,
  searchVersion = 0,
  renderVersion = 0,
  disposeDestinationSearch;
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
  const activeMode =
    ['results'].includes(current) || current.startsWith('place/') ? state.prefs?.mode : current;
  const navState = (active) => (active ? ' class="active" aria-current="page"' : '');
  header.innerHTML = `<div class="nav-inner"><a class="brand" href="#home" aria-label="Roamwise home">${icon('compass')}roamwise<span class="brand-dot">.</span></a><button class="mobile-toggle" aria-label="Open navigation" aria-expanded="false" aria-controls="primary-navigation" data-action="menu">${icon('menu')}</button><nav id="primary-navigation" class="nav-links" aria-label="Main navigation"><a href="#tourist"${navState(activeMode === 'tourist')}>Tourist mode</a><a href="#local"${navState(activeMode === 'local')}>Personal mode</a><a href="#builder"${navState(current === 'builder' || current.startsWith('plan'))}>My itinerary ${state.selection.length ? `<span class="count">${state.selection.length}</span>` : ''}</a><a href="#saved" class="saved-nav ${current === 'saved' ? 'active' : ''}" ${current === 'saved' ? 'aria-current="page"' : ''}>${icon('heart')}Saved <span class="count">${saved.favorites.length + saved.plans.length}</span></a></nav></div>`;
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
  return `<div class="${cls}"><img src="${e(p.image || `/assets/${images[p.category] || 'city.jpg'}`)}" alt="${p.image ? e(p.name) : ''}" loading="lazy" data-fallback="/assets/${images[p.category] || 'city.jpg'}"><span class="image-note">${p.image ? 'Source-linked place photo' : 'Category inspiration photo · not this place'}</span></div>`;
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
  return `<div class="destination-search ${home ? 'home-destination' : ''}"><div class="${home ? 'home-search' : 'destination-field'}">${icon('pin', 'destination-pin')}<label for="${id}" class="search-input-label"><span class="sr-only">Destination city</span><input id="${id}" name="destination" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-list" aria-describedby="${id}-hint" placeholder="${placeholder}" value="${e(value)}" autocomplete="off" spellcheck="false" ${required ? 'required' : ''} minlength="2" maxlength="180"></label><button class="clear-search" type="button" aria-label="Clear destination" hidden>${icon('close')}</button>${home ? `<button class="btn search-submit" type="submit">${icon('search')}<span>Explore</span></button>` : ''}</div><div class="suggestion-panel" hidden><div class="suggestion-heading">Popular destinations</div><ul id="${id}-list" class="suggestion-list" role="listbox" aria-label="Destination suggestions"></ul><div class="suggestion-status" role="status" aria-live="polite"></div><div class="suggestion-help" id="${id}-hint">${icon('globe')}Search any city. A little curiosity goes a long way.</div></div></div>`;
}
function home() {
  return `
    <div class="container">
      <section class="hero search-hero" aria-labelledby="hero-heading">
        <div class="hero-copy">
          <h1 id="hero-heading">Discover more.<br><span>Explore smarter.</span></h1>
          <p>Find your kind of places. Turn a new city or a free afternoon into a day that feels like you.</p>
          <form id="home-search" class="home-search-form">${destinationField('home-destination', { home: true })}</form>
          <div class="popular-links" aria-label="Popular destinations"><span>Start somewhere:</span>${['Paris', 'Tokyo', 'London', 'Toronto'].map((city) => `<button type="button" data-action="quick-city" data-city="${city}">${city}${icon('arrow')}</button>`).join('')}</div>
          <a class="nearby-link" href="#local">${icon('locate')}Find something closer to home${icon('arrow')}</a>
        </div>
        <div class="hero-photo">
          <img src="/assets/mountains.jpg" width="1800" height="1200" alt="Sunlight catching a rugged mountain peak beneath a blue sky" fetchpriority="high">
          <div class="photo-caption"><span class="caption-icon">${icon('compass')}</span><span>A little further from ordinary.<small>Go somewhere that stays with you.</small></span>${icon('arrow')}</div>
        </div>
      </section>
      <div class="intro-strip"><span>${icon('pin')}Places worth discovering</span><span>${icon('route')}Routes that make sense</span><span>${icon('spark')}A little help from AI</span><span>${icon('heart')}Your favorites, always with you</span></div>
      <section class="section" id="choose-mode" aria-labelledby="mode-heading">
        <div class="section-head"><div><h2 id="mode-heading">Near or far. Make it yours.</h2><p>A new city or your own neighborhood. There’s always something to discover.</p></div></div>
        <div class="mode-grid">
          <a href="#tourist" class="mode-card"><div class="mode-card-copy">${icon('globe')}<h3>Somewhere new.</h3><p>Find the sights, little cafés, and unexpected stops that make a trip your own.</p><span class="text-link">Explore tourist mode${icon('arrow')}</span></div><img src="/assets/paris.jpg" width="1000" height="667" alt="Paris rooftops with the Eiffel Tower in the distance" loading="lazy"></a>
          <a href="#local" class="mode-card"><div class="mode-card-copy">${icon('locate')}<h3>Closer to home.</h3><p>A free afternoon can become a great story. Find a fresh way to spend it nearby.</p><span class="text-link">Explore personal mode${icon('arrow')}</span></div><img src="/assets/food.jpg" width="1000" height="667" alt="Warmly lit restaurant interior" loading="lazy"></a>
        </div>
      </section>
    </div>
    <section class="section-soft" aria-labelledby="destinations-heading"><div class="container section">
      <div class="section-head"><div><h2 id="destinations-heading">Where curiosity could take you.</h2><p>A few starting points. Your live search begins when you choose a city.</p></div><a href="#tourist" class="btn quiet">Find your next place${icon('arrow')}</a></div>
      <div class="destination-grid">
        <button class="destination" data-action="destination" data-city="Paris, France"><img src="/assets/paris.jpg" width="1000" height="667" alt="Paris" loading="lazy"><span class="destination-label"><span>Paris, France<small>Art, architecture & long café stops</small></span>${icon('arrow')}</span></button>
        <button class="destination" data-action="destination" data-city="Ottawa, Canada"><img src="/assets/nature.jpg" width="1000" height="667" alt="Lake and mountains, travel inspiration" loading="lazy"><span class="destination-label"><span>Ottawa, Canada<small>Find a new side of the capital · inspiration photo</small></span>${icon('arrow')}</span></button>
        <button class="destination" data-action="destination" data-city="New York, USA"><img src="/assets/city.jpg" width="1000" height="667" alt="City skyline" loading="lazy"><span class="destination-label"><span>New York, USA<small>A different discovery around every corner</small></span>${icon('arrow')}</span></button>
      </div>
    </div></section>
    <section class="container section how-section" aria-labelledby="how-heading"><div class="section-head"><div><h2 id="how-heading">Less planning. More being there.</h2><p>From a little curiosity to a day worth remembering.</p></div><a href="#tourist" class="btn secondary">Plan a day${icon('arrow')}</a></div><ol class="how-steps"><li>${icon('search')}<div><h3>Find your starting point.</h3><p>Choose a city or explore nearby. Set your interests, time, and travel style.</p></div></li><li>${icon('heart')}<div><h3>Make a few discoveries.</h3><p>Browse real places, compare them on the map, and save what catches your eye.</p></div></li><li>${icon('route')}<div><h3>Connect the dots.</h3><p>Build an itinerary that groups nearby stops. Keep room for a little wandering.</p></div></li></ol></section>`;
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
  return `<div class="container page">${back('#' + state.prefs.mode, 'Edit my search')}<div class="page-heading"><div><h1>${state.prefs.mode === 'local' ? 'A little closer. A little different.' : `Find your kind of ${e(state.center.name)}.`}</h1><p>${e(state.center.label || state.center.name)} · ${(state.prefs.radius / 1000).toFixed(0)} km search radius · ${state.prefs.mode === 'local' ? state.prefs.hours + '-hour outing' : state.prefs.days + ' days to explore'}</p></div></div>${state.error ? `<div class="notice error" role="alert">${e(state.error)} <a href="#${state.prefs.mode}">Edit search</a></div>` : ''}${state.places.length ? `<details class="results-context"><summary>${icon('sun')}Weather at your destination</summary>${weatherMarkup()}</details>` : ''}<div class="results-top"><div class="results-info"><strong id="result-count">${state.places.length} places</strong> retrieved from Geoapify<br><span>${state.ai ? e(state.ai.message) : 'Choose a place or build an itinerary.'}</span></div><div class="results-actions"><button class="btn secondary small" data-action="personalize" ${!state.places.length ? 'disabled' : ''}>${icon('spark')}Personalize with AI</button><a class="btn small" href="#builder">${icon('route')}Build itinerary <span class="count" id="selection-count">${state.selection.length}</span></a></div></div>${renderOrigin(uiContext())}${resultControls()}<div id="results-content"></div><p class="source-note">Place data: Geoapify / OpenStreetMap contributors. Straight-line distances are measured from your search center. Source-reported hours may change; confirm with the venue.</p></div>`;
}
function renderResultsContent() {
  const content = document.querySelector('#results-content');
  if (!content) return;
  clearMaps();
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
  if (state.view === 'map' && places.length)
    createMap(document.querySelector('#results-map'), places, state.center, {
      onPlace: (id) => {
        state.detailsReturn = '#results';
        go('place/' + id);
      }
    });
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
function builderOptions(p) {
  return `<form id="builder-options" class="builder-options"><div class="field-grid"><label class="field full">Start from<select name="origin">${options(
    [
      ['search', 'Selected starting point'],
      ['first', 'First chosen place']
    ],
    !state.center || state.selection.length ? 'first' : 'search'
  )}</select></label><label class="field">Days<input name="days" type="number" min="1" max="14" value="${p.mode === 'local' ? 1 : p.days}" ${p.mode === 'local' ? 'readonly' : ''} required></label><label class="field">Hours per day<input name="hours" type="number" min="1" max="12" step="0.5" value="${p.hours}" required></label><label class="field full">Getting around<select name="transport">${options(
    [
      ['walk', 'Walking'],
      ['drive', 'Driving'],
      ['transit', 'Public transportation']
    ],
    p.transport
  )}</select></label><label class="field full">Start date (optional)<input name="startDate" type="date" value="${e(p.startDate || '')}"></label></div></form>`;
}
function builder() {
  const places = state.selection.length ? state.selection : filteredPlaces();
  const p = state.prefs || defaults('tourist');
  return `<div class="container page">${back(state.places.length ? '#results' : '#saved', state.places.length ? 'Back to discoveries' : 'Back to saved places')}<div class="page-heading"><div><h1>A good plan leaves room to wander.</h1><p>${state.selection.length ? 'Your selected places, connected into a thoughtful route.' : 'Start with your recommendations, or choose specific places from your results.'}</p></div>${state.selection.length ? '<button class="btn secondary small" data-action="clear-selection">Clear selection</button>' : ''}</div>${!places.length ? empty('Your next adventure starts with a place.', 'Explore a city and add places, or add favorites to an itinerary.') : `<div class="builder-summary"><span>${icon('pin')}${e(state.center?.name || 'Saved places')}</span><span>${icon('clock')}${p.mode === 'local' ? '1 day' : p.days + ' days'} · ${p.hours} hours/day</span><span>${icon('route')}${e({ walk: 'Walking', drive: 'Driving', transit: 'Public transportation' }[p.transport])}</span></div><div class="builder-grid"><section><div class="section-head"><h2 style="font-size:24px">${state.selection.length ? 'Your chosen stops' : 'Your recommendation pool'}</h2><span class="small-text muted">${places.length} places</span></div><ul class="builder-list">${places.map((p) => `<li><img src="${e(p.image || '/assets/' + images[p.category])}" alt="" loading="lazy"><div><h3><a href="#place/${encodeURIComponent(p.id)}">${e(p.name)}</a></h3><p>${categoryBadge(p.category)}</p></div>${state.selection.length ? `<button class="icon-button" data-action="remove-selection" data-id="${e(p.id)}" aria-label="Remove ${e(p.name)} from selection">${icon('close')}</button>` : ''}</li>`).join('')}</ul></section><aside class="summary-box"><h2>Connect the dots.</h2><p>Nearby stops are grouped into days, then ordered with a nearest-neighbor algorithm. Available time, travel pace, opening hours, interests, and weather help shape the route.</p><p>${p.transport === 'transit' ? 'Transit uses a scheduling buffer, with links to actual directions.' : 'Travel times start as estimates. Open a day to load its walking or driving route.'}</p><p>Your time and transport shape the route. Some places may not fit into every day.</p>${!state.center ? '<p class="notice">Your first selected place will be the starting point.</p>' : ''}${builderOptions(p)}<button class="btn wide" data-action="generate">${icon('spark')}Generate ${p.mode === 'local' ? 'my outing' : 'my itinerary'}${icon('arrow')}</button><a class="btn quiet wide" href="#${p.mode}">Edit travel preferences</a></aside></div>`}</div>`;
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
  return `<div class="container page">${back('#builder', 'Back to builder')}<div class="page-heading"><div><h1>${e(p.name)}</h1><p>${p.days.length} ${p.days.length === 1 ? 'day' : 'days'} · ${count} stops · ${e({ walk: 'Walking', drive: 'Driving', transit: 'Public transportation' }[p.preferences.transport])} · Made for a little discovery.</p></div><div class="toolbar"><button class="btn secondary small" data-action="regenerate">Regenerate${icon('route')}</button><button class="btn small" data-action="save-plan">${icon('heart')}${saved.plans.some((x) => x.id === p.id) ? 'Update saved plan' : 'Save itinerary'}</button></div></div><div class="notice">${count ? `${p.unscheduled} candidate places left unscheduled. ` : ''}Schedule times and visit durations are estimates. Confirm opening hours before visiting.</div><div class="day-tabs" aria-label="Itinerary days">${p.days.map((d, i) => `<button class="day-tab ${state.day === i ? 'active' : ''}" data-action="day" data-day="${i}" aria-pressed="${state.day === i}">Day ${d.number}${d.date ? ' · ' + e(d.date.slice(5)) : ''}</button>`).join('')}</div>${day.forecast ? `<div class="weather-strip">${icon(day.forecast.rain >= 50 ? 'rain' : 'sun')}<strong>${Math.round(day.forecast.high)}°C</strong> ${e(day.forecast.label)} · Rain ${day.forecast.rain == null ? 'not available' : day.forecast.rain + '%'} · ${e(day.forecast.date)}</div>` : ''}<div class="plan-layout"><section><div class="day-heading"><div><h2>Day ${day.number}${day.date ? ' · ' + e(day.date) : ''}</h2><p>${day.stops.length} stops · ${Math.floor(day.minutes / 60)}h ${day.minutes % 60}m scheduled</p></div>${day.stops.length ? `<a class="btn secondary small" href="${dayDirections(day.stops, p.preferences.transport)}" target="_blank" rel="noopener noreferrer">${p.preferences.transport === 'transit' ? 'First transit leg' : 'Day directions'}${icon('external')}</a>` : ''}</div>${day.stops.length ? `<ol class="schedule">${day.stops.map((s, index) => `<li class="category-${categoryKey(s.place.category)}"><div class="schedule-time">${formatTime(s.start)}</div><div class="schedule-stop"><div class="stop-heading"><h3><a href="#place/${encodeURIComponent(s.place.id)}">${e(s.place.name)}</a></h3><button class="icon-button" data-action="remove-stop" data-index="${index}" aria-label="Remove ${e(s.place.name)} from day ${day.number}">${icon('close')}</button></div><p class="stop-category">${categoryBadge(s.place.category)}<span> &middot; ${s.duration} min suggested visit · until ${formatTime(s.end)}</span></p><p>${s.hoursChecked ? 'Simple opening hours checked for this date' : 'Hours not checked; confirm before visiting'}</p><p class="travel-info">${icon('route')} ${s.travel.minutes == null ? '30 min scheduling buffer · transit time not predicted' : `${s.travel.minutes} min estimated ${p.preferences.transport === 'drive' ? 'drive' : 'walk'}`} · ${s.travel.km.toFixed(1)} km straight line ${index === 0 ? 'from search center' : 'from previous stop'}</p><a class="stop-directions" href="${legDirections(day, index, p.preferences.transport, p.center)}" target="_blank" rel="noopener noreferrer">${p.preferences.transport === 'transit' ? 'Actual transit directions' : 'Directions to this stop'}${icon('external')}</a></div></li>`).join('')}</ol>` : empty('A little more room in this day.', 'No stops fit the current time or opening-hour constraints. Try more available time, a wider place pool, or different transport.', 'Edit preferences', p.preferences.mode)}</section><aside class="plan-map-aside"><div id="plan-map" class="map plan-map" aria-label="Itinerary route map"></div><div id="route-status" class="route-status" role="status">${day.stops.length > 1 && p.preferences.transport !== 'transit' ? 'Loading the route between your stops…' : p.preferences.transport === 'transit' ? 'Transit routing: use each stop’s directions link for actual service.' : 'Markers show your planned stops.'}</div><p class="small-text muted">The schedule includes travel from the search center. The mapped route connects the day’s stops.</p></aside></div>${p.alternatives?.length ? `<h2 class="text-heading">Keep an indoor alternative in your pocket.</h2><div class="checklist">${p.alternatives.map((x) => `<a class="tag" href="#place/${encodeURIComponent(x.id)}">${e(x.name)}</a>`).join('')}</div>` : ''}<details class="plan-notes"><summary>Planning notes</summary><ul>${p.notes.map((n) => `<li>${e(n)}</li>`).join('')}</ul></details></div>`;
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
  return `<div class="container page">${back('#home', 'Back to exploring')}<div class="page-heading"><div><h1>Good finds deserve a second visit.</h1><p>Your little collection of places and plans. Saved in this browser, ready when you are.</p></div></div><div class="saved-tabs"><button class="saved-tab ${state.savedTab === 'places' ? 'active' : ''}" data-action="saved-tab" data-tab="places">Favorite places (${saved.favorites.length})</button><button class="saved-tab ${state.savedTab === 'plans' ? 'active' : ''}" data-action="saved-tab" data-tab="plans">Saved itineraries (${saved.plans.length})</button></div>${state.savedTab === 'places' ? (saved.favorites.length ? `<div class="places-grid">${saved.favorites.map(card).join('')}</div>` : empty('A few favorites make a great beginning.', 'Tap the heart on any place to keep it here for later.')) : saved.plans.length ? `<div class="saved-plans">${saved.plans.map((p) => `<article class="saved-plan">${icon('route')}<h2>${e(p.name)}</h2><p>${p.days.length} days · ${p.days.reduce((sum, d) => sum + d.stops.length, 0)} stops · ${e(p.createdAt.slice(0, 10))}</p><div class="toolbar"><button class="btn small" data-action="open-plan" data-id="${e(p.id)}">Open itinerary${icon('arrow')}</button><button class="btn quiet small" data-action="delete-plan" data-id="${e(p.id)}">Delete saved plan</button></div></article>`).join('')}</div>` : empty('Your next adventure, kept for later.', 'Generate an itinerary and save it here. No account needed.', 'Build an itinerary', 'builder')}<p class="source-note">localStorage is specific to this browser and device. Clearing browser data removes saved items. Old plans and provider-reported hours may need a fresh search.</p></div>`;
}
function about() {
  return `<div class="container page about-content">${back('#home', 'Back to exploring')}<h1>A little curiosity. Real possibilities.</h1><p style="margin-top:23px">Roamwise helps you discover actual places and turn them into a personal travel plan. Built as a Grade 12 Computer Science project with HTML, CSS, vanilla JavaScript, and Node.js.</p><h2>Real places come first.</h2><p>Geoapify supplies destination geocoding, places, place details, and supported walking/driving routes using <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> data. Attribution: © OpenStreetMap contributors, available under the Open Database License. Hours and addresses can be incomplete or out of date. Confirm important details with each venue.</p><h2>AI with a clear job.</h2><p>Gemini selects identifiers from retrieved candidates. Its structured response is validated, and its output cannot replace addresses, hours, or names. Deterministic matching takes over if Gemini is unavailable. Travel preferences and candidate data are sent to Google for personalization; current coordinates are sent to Geoapify and Open-Meteo during a search.</p><h2>A route, with room for real life.</h2><p>A nearest-neighbor heuristic groups nearby stops, accounts for suggested activity durations and available time, and checks a supported subset of opening-hour rules when a date is provided. Travel schedule times are estimates; a separate Geoapify route shows the path between stops. Public transit uses external Google Maps directions and a labeled planning buffer, never invented service times.</p><h2>Weather & honest unknowns.</h2><p><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> supplies forecasts only within its returned date range (CC BY 4.0). Rain encourages indoor alternatives. Opening status uses interpretable source-reported schedules in the destination time zone. Unavailable or irregular hours are clearly marked.</p><h2>Photography & maps.</h2><p>Editorial inspiration photos are from <a href="https://unsplash.com/" target="_blank" rel="noopener noreferrer">Unsplash</a>. Category photographs are labeled and do not depict the recommended venue. Source-linked place images appear only when the place provider supplies one. Maps use <a href="https://leafletjs.com/" target="_blank" rel="noopener noreferrer">Leaflet</a> and OpenStreetMap tiles. Photo source URLs and licenses are documented in the project’s assets notes.</p><h2>Yours, in this browser.</h2><p>No account or database. Favorites and saved plans use localStorage; active search results use sessionStorage. Location is requested only when you press the current-location button. Manual city search works when permission is denied.</p></div>`;
}

async function render() {
  const version = ++renderVersion;
  disposeDestinationSearch?.();
  disposeDestinationSearch = null;
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
  else if (path.startsWith('locations/')) main.innerHTML = branchScreen(path.slice(10));
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
  if (path === 'results') {
    main.firstElementChild?.classList.add('results-page');
    renderResultsContent();
  }
  if (place) {
    createMap(document.querySelector('#details-map'), [place], place);
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
    if (p.image && p.image !== place.image)
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
  if (state.center && distanceKm(state.center, center) > 40 && !state.coordinates)
    state.origin = null;
  state.center = center;
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
async function generate(button, regenerate = false) {
  const requestedSearch = searchVersion;
  const requestedRoute = route();
  let planningCenter = referenceOrigin();
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
      go(`${placeCard.dataset.group ? 'locations' : 'place'}/${placeCard.dataset.place}`);
    }
    return;
  }
  const { action, id } = target.dataset;
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
    state.showAll = false;
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
  if (input.dataset.select) {
    addSelection(input.dataset.select, true);
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
render();
