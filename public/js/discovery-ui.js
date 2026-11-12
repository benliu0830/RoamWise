import { icon } from './icons.js';
import { categories, categoryBadge, categoryKey, categoryOf } from './categories.js';
import { openingStatus, parseHours, dayNames, formatHour } from './hours.js';
import { distanceKm, formatDistance } from './place-utils.js';
import { directions } from './maps.js';

export const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const e = escape;
export function statusMarkup(place, timezone) {
  const status = openingStatus(place, timezone);
  return `<span class="opening-status ${status.reliable ? (status.open ? 'is-open' : 'is-closed') : 'is-unknown'}">${icon('clock')}${status.label}</span>`;
}
export function specificSummary(place) {
  if (
    place.description &&
    !/\b(prices?|costs?|admission|fees?|budget)\b|[$€£]\s*\d/i.test(place.description)
  )
    return place.description;
  if (place.cuisine)
    return `${place.name} serves ${place.cuisine.replaceAll(';', ', ').replaceAll('_', ' ')} cuisine${place.address ? ` at ${place.address}` : ''}.`;
  return `${categoryOf(place.category).label} ${place.address ? `at ${place.address}` : place.city ? `in ${place.city}` : 'at this location'}. Additional visitor information is not available yet.`;
}
export function renderCard(place, ctx) {
  const grouped = place.branchCount > 1;
  const url = grouped
    ? `#locations/${encodeURIComponent(place.id)}`
    : `#place/${encodeURIComponent(place.id)}`;
  const km = ctx.origin ? distanceKm(ctx.origin, place) : null;
  return `<article class="place-card category-${categoryKey(place.category)} ${grouped ? 'branch-group-card' : ''}" data-place="${e(place.id)}" ${grouped ? 'data-group="true"' : ''}><div class="place-image">${ctx.photo(place, 'card-photo')}${grouped ? '<span class="multiple-badge">Multiple locations</span>' : `<button class="icon-button ${ctx.favorite(place.id) ? 'favorited' : ''}" data-action="favorite" data-id="${e(place.id)}" aria-label="${ctx.favorite(place.id) ? 'Remove from' : 'Add to'} favorites: ${e(place.name)}" aria-pressed="${ctx.favorite(place.id)}">${icon('heart')}</button>`}</div><div class="place-card-body"><div class="place-category">${categoryBadge(place.category)}</div><h3><a href="${url}">${e(place.name)}</a></h3><p class="place-description">${grouped ? `${place.branchCount} locations found in this search area. Choose a branch to see its address, hours, and place details.` : e(specificSummary(place))}</p><div class="place-address">${icon('pin')}<span>${grouped ? `${place.branchCount} locations &middot; ${km == null ? '' : `nearest ${formatDistance(km)}`}` : e(place.address || 'Address unavailable')}</span></div><div class="place-meta">${grouped ? '<span>Explore each branch on the map</span>' : statusMarkup(place, ctx.timezone)}${km == null || grouped ? '' : `<span>${formatDistance(km)} from ${e(ctx.originLabel)} &middot; straight line</span>`}</div>${ctx.mapView ? `<button class="map-focus-link" data-action="focus-place" data-id="${e(place.id)}">${icon('pin')}Show on map</button>` : ''}<div class="card-bottom">${grouped ? `<span class="small-text muted">Choose your location</span><a href="${url}" class="btn secondary small">View all locations${icon('arrow')}</a>` : `<label class="select-stop"><input type="checkbox" data-select="${e(place.id)}" ${ctx.selected(place.id) ? 'checked' : ''}> Add to plan</label><a href="${url}" class="btn secondary small">View details${icon('arrow')}</a>`}</div></div></article>`;
}
export function renderControls(filters, view) {
  const opts = (items, value) =>
    items
      .map(
        ([key, label]) =>
          `<option value="${key}" ${String(key) === String(value) ? 'selected' : ''}>${label}</option>`
      )
      .join('');
  return `<div class="category-chips" role="group" aria-label="Browse by category">${[['all', { short: 'All places', icon: 'compass' }], ...Object.entries(categories)].map(([key, category]) => `<button type="button" class="category-chip ${key === 'all' ? '' : `category-${key}`}" data-action="category" data-category="${key}" aria-pressed="${filters.category === key}">${icon(category.icon)}${category.short}</button>`).join('')}</div><form id="place-name-search" class="place-name-search"><label class="filter-search">${icon('search')}<input type="search" id="result-search" name="query" aria-label="Search places by name" placeholder="Search a place, landmark, or business…" value="${e(filters.query)}" maxlength="120"></label><button class="btn small" type="submit" aria-label="Search this area">Search this area${icon('arrow')}</button></form><div class="results-secondary"><details class="advanced-filter-panel"><summary>${icon('menu')}Filters &amp; sort<span class="active-filter-count"></span></summary><div class="filters advanced-filters"><select hidden id="category-filter" aria-label="Filter by category">${opts([['all', 'All categories'], ...Object.entries(categories).map(([key, c]) => [key, c.label])], filters.category)}</select><label>Distance<select id="distance-filter">${opts(
    [
      ['any', 'Any distance'],
      [1, 'Within 1 km'],
      [5, 'Within 5 km'],
      [10, 'Within 10 km'],
      [25, 'Within 25 km']
    ],
    filters.distance
  )}</select></label><label>Opening hours<select id="hours-filter">${opts(
    [
      ['all', 'All places'],
      ['now', 'Open now'],
      ['today', 'Open today']
    ],
    filters.hours
  )}</select></label><label>Setting<select id="setting-filter">${opts(
    [
      ['any', 'Any setting'],
      ['indoor', 'Indoors'],
      ['outdoor', 'Outdoors']
    ],
    filters.setting
  )}</select></label><label>Sort by<select id="sort-filter">${opts(
    [
      ['recommended', 'Recommended'],
      ['relevance', 'Most relevant'],
      ['distance', 'Nearest first'],
      ['name', 'Alphabetical']
    ],
    filters.sort
  )}</select></label></div><p class="filter-explanation">Hours filters use source-reported schedules in the local time zone. Places with unavailable or irregular hours are excluded.</p></details><button type="button" class="text-button clear-filters" data-action="reset-filters">Clear all</button><div class="view-switch" aria-label="Results view"><button type="button" data-action="view" data-view="list" class="${view === 'list' ? 'active' : ''}" aria-pressed="${view === 'list'}">List</button><button type="button" data-action="view" data-view="map" class="${view === 'map' ? 'active' : ''}" aria-pressed="${view === 'map'}">${icon('map')} Map</button></div></div>`;
}
export function renderBranchRow(place, ctx) {
  const url = `#place/${encodeURIComponent(place.id)}`;
  const address = place.address || `${place.name} · address unavailable`;
  return `<article class="place-card branch-row category-${categoryKey(place.category)}" data-place="${e(place.id)}"><div class="branch-row-heading"><div><h3><a href="${url}">${e(address)}</a></h3><div class="branch-row-meta">${ctx.origin ? `<strong>${formatDistance(distanceKm(ctx.origin, place))} away</strong>` : ''}${statusMarkup(place, ctx.timezone)}</div></div><button class="icon-button ${ctx.favorite(place.id) ? 'favorited' : ''}" data-action="favorite" data-id="${e(place.id)}" aria-label="${ctx.favorite(place.id) ? 'Remove from' : 'Add to'} favorites: ${e(place.name)}, ${e(address)}" aria-pressed="${ctx.favorite(place.id)}">${icon('heart')}</button></div>${ctx.photo(place, 'branch-photo')}<div class="card-bottom"><label class="select-stop"><input type="checkbox" data-select="${e(place.id)}" ${ctx.selected(place.id) ? 'checked' : ''}> Add to plan</label><a href="${url}" class="btn secondary small">View branch details${icon('arrow')}</a></div></article>`;
}
export function renderOrigin(ctx) {
  return `<details class="origin-settings"><summary>${icon('locate')}Distances from <strong>${e(ctx.originLabel)}</strong><span>Change starting point</span></summary><div class="origin-content"><p>Straight-line distances use this starting point. Your search area stays centred on ${e(ctx.city)}.</p><div class="origin-actions"><button class="btn secondary small" type="button" data-action="origin-locate">${icon('locate')}Use my location</button><button class="btn secondary small" type="button" data-action="origin-reset">Use city centre</button></div><form id="origin-form"><label for="origin-input">Or enter an address, neighbourhood, or latitude, longitude</label><div class="origin-input-row"><input id="origin-input" name="origin" placeholder="e.g. 45.4215, -75.6972" minlength="2" maxlength="180" required><button class="btn small" type="submit">Find starting point</button></div></form><div id="origin-status" role="status"></div><div id="origin-choices"></div></div></details>`;
}
export function weeklyMarkup(place) {
  const week = parseHours(place.hours);
  if (!week)
    return `<p>${place.hours ? 'This schedule includes special or irregular rules. Check hours before visiting.' : 'Hours unavailable. Check hours before visiting.'}</p>${place.hours ? `<p class="raw-hours">${e(place.hours)}</p>` : ''}`;
  return `<dl class="weekly-hours">${week.map((ranges, index) => `<div><dt>${dayNames[index]}</dt><dd>${ranges.length ? ranges.map(([start, end]) => `${formatHour(start)}–${end === 1440 ? '24:00' : formatHour(end)}${end > 1440 ? ' (next day)' : ''}`).join(', ') : 'Closed'}</dd></div>`).join('')}</dl><p class="small-text muted">Provider-reported local hours. Holidays and last-minute changes may differ.</p>`;
}
export function renderFacts(place, ctx) {
  const features = Object.entries(place.features || {}).filter(
    ([, value]) => value && value !== 'no'
  );
  return `<div class="visitor-section"><h2>Opening hours</h2>${statusMarkup(place, ctx.timezone)}${weeklyMarkup(place)}${place.timezone || ctx.timezone ? `<p class="small-text muted">Local time zone: ${e(place.timezone || ctx.timezone)}</p>` : '<p class="small-text muted">Time zone unavailable; current opening status cannot be confirmed.</p>'}</div><div class="visitor-section"><h2>Visitor information</h2><dl class="details-facts"><div class="fact"><dt>Activity</dt><dd>${categoryBadge(place.category)}</dd></div><div class="fact"><dt>Address</dt><dd>${e(place.address || 'Address unavailable')}</dd></div>${place.cuisine ? `<div class="fact"><dt>Cuisine</dt><dd>${e(place.cuisine.replaceAll(';', ', ').replaceAll('_', ' '))}</dd></div>` : ''}${place.operator ? `<div class="fact"><dt>Operator</dt><dd>${e(place.operator)}</dd></div>` : ''}${features.map(([key, value]) => `<div class="fact"><dt>${e(key.replaceAll('_', ' '))}</dt><dd>${e(value)}</dd></div>`).join('')}</dl></div>`;
}
export function renderDetails(place, ctx) {
  const group = ctx.group;
  return `<div class="container page detail-page">${ctx.back(ctx.returnLink, ctx.returnLink.startsWith('#locations/') ? 'Back to all locations' : 'Back to discoveries')}<div class="detail-title"><div class="detail-title-category">${categoryBadge(place.category)}${statusMarkup(place, ctx.timezone)}</div><h1>${e(place.name)}</h1><p>${icon('pin')}${e(place.address || 'Address unavailable')}</p>${group ? `<a class="text-link" href="#locations/${encodeURIComponent(group.id)}">${icon('map')}View all ${group.branchCount} locations</a>` : ''}</div><div class="details-layout"><section class="details-copy">${ctx.photo(place, 'details-image')}<section class="about-place"><h2>About this place</h2><div id="place-description"><p>${e(specificSummary(place))}</p></div><p id="description-status" class="small-text muted" role="status">Loading available source information…</p></section><div id="detail-status" class="details-loading" role="status">Checking available place details…</div><div id="details-facts">${renderFacts(place, ctx)}</div><p class="source-note">Source: ${e(place.source || 'Geoapify / OpenStreetMap')} &middot; Retrieved ${e(place.retrievedAt?.slice(0, 10) || 'date unavailable')}. Confirm current information before visiting.</p></section><aside class="details-aside"><div class="map" id="details-map" aria-label="Place location"></div><h3>Make it part of your day.</h3><p>${ctx.origin ? `${formatDistance(distanceKm(ctx.origin, place))} from ${e(ctx.originLabel)} &middot; straight line.` : 'Explore this location and add it to your plan.'}</p><label class="field">Getting around<select id="detail-transport">${[
    ['walk', 'Walking'],
    ['drive', 'Driving'],
    ['transit', 'Public transit']
  ]
    .map(
      ([key, label]) =>
        `<option value="${key}" ${ctx.transport === key ? 'selected' : ''}>${label}</option>`
    )
    .join(
      ''
    )}</select></label><a id="detail-directions" class="btn wide" href="${directions(place, ctx.transport)}" target="_blank" rel="noopener noreferrer">${icon('route')}Get directions${icon('external')}</a><button class="btn secondary wide" data-action="favorite" data-id="${e(place.id)}">${icon('heart')}${ctx.favorite(place.id) ? 'Remove from favorites' : 'Add to favorites'}</button><button class="btn secondary wide" data-action="add" data-id="${e(place.id)}">${icon(ctx.selected(place.id) ? 'check' : 'plus')}${ctx.selected(place.id) ? 'Added to itinerary' : 'Add to itinerary'}</button><button class="btn quiet wide" data-action="origin-place" data-id="${e(place.id)}">${icon('locate')}Use as starting point</button><a class="btn quiet wide" href="#builder">View itinerary builder${icon('arrow')}</a></aside></div></div>`;
}
