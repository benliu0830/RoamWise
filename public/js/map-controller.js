import { icon } from './icons.js';
import { categoryKey, categoryOf, categoryBadge } from './categories.js';
import { openingStatus } from './hours.js';
import { photoMarkup } from './photos.js';
import { distanceKm } from './place-utils.js';

const maps = new Set(),
  routes = new WeakMap(),
  segments = new WeakMap();
const escape = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const valid = (p) =>
  Number.isFinite(p?.lat) &&
  Number.isFinite(p?.lon) &&
  Math.abs(p.lat) <= 90 &&
  Math.abs(p.lon) <= 180;
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;
export function clearMaps(except = []) {
  for (const map of maps)
    if (!except.includes(map)) {
      map.remove();
      maps.delete(map);
    }
}

export function createMap(element, places, center, options = {}) {
  if (!element || !window.L) {
    if (element)
      element.textContent = 'The map could not load. Directions links are still available.';
    return null;
  }
  const L = window.L,
    origin = valid(center) ? center : places.find(valid) || { lat: 45.4215, lon: -75.6972 };
  const map = L.map(element, {
    zoomControl: false,
    scrollWheelZoom: false,
    zoomAnimation: false,
    markerZoomAnimation: false,
    maxZoom: 19
  }).setView([origin.lat, origin.lon], 13);
  maps.add(map);
  element.classList.add('roam-map');
  let destroyed = false,
    selected = options.context?.selectedId || options.activePlaceId || null,
    current = [],
    visited = new Set(options.visitedIds || []),
    userMarker;
  const markers = new Map();
  const group =
    !options.numbered && L.markerClusterGroup
      ? L.markerClusterGroup({
          maxClusterRadius: 44,
          showCoverageOnHover: false,
          animate: false,
          animateAddingMarkers: false,
          spiderfyOnMaxZoom: true,
          iconCreateFunction: (c) =>
            L.divIcon({
              className: 'map-cluster marker-cluster',
              html: `<span>${c.getChildCount()}</span><span class="sr-only"> locations. Zoom in to explore.</span>`,
              iconSize: [44, 44]
            })
        })
      : L.layerGroup();
  group.addTo(map);
  const feedback = L.control({ position: 'bottomright' }),
    message = document.createElement('div');
  message.className = 'map-feedback';
  message.setAttribute('role', 'status');
  const announce = (text) => {
    message.textContent = text;
    message.hidden = !text;
  };
  feedback.onAdd = () => message;
  feedback.addTo(map);
  announce('Loading map…');
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  tiles.on('load', () => {
    if (message.textContent === 'Loading map…') announce('');
  });
  tiles.on('tileerror', () => announce('Map tiles unavailable. Pins and directions still work.'));
  const pin = (place, index) =>
    L.divIcon({
      className: `roam-marker category-${categoryKey(place.category)} ${place.id === selected ? 'is-selected' : ''} ${place.id === options.activePlaceId ? 'is-up-next' : ''} ${visited.has(place.id) ? 'is-visited' : ''}`,
      html: `<span class="marker-pin">${visited.has(place.id) ? icon('check') : options.numbered ? index + 1 : icon(categoryOf(place.category).icon)}</span>`,
      iconSize: [38, 44],
      iconAnchor: [19, 42],
      popupAnchor: [0, -35]
    });
  function popup(place) {
    const node = document.createElement('div'),
      status = openingStatus(place, options.timezone || place.timezone);
    node.className = 'map-preview';
    const description =
      place.description &&
      !/\b(prices?|costs?|admission|fees?|budget)\b|[$€£]\s*\d/i.test(place.description)
        ? place.description
        : 'Open place details for available visitor information.';
    node.innerHTML = `${photoMarkup(place, 'map-preview-photo')}<div class="map-preview-copy">${categoryBadge(place.category)}<h3>${escape(place.name)}</h3><p class="preview-description">${escape(description.slice(0, 160))}</p><p class="preview-address">${icon('pin')}${escape(place.address || place.city || 'Address unavailable')}</p>${status.reliable ? `<p class="opening-status ${status.open ? 'is-open' : 'is-closed'}">${icon('clock')}${escape(status.label)}</p>` : ''}<div class="preview-actions"><a class="btn small" href="#place/${encodeURIComponent(place.id)}">View Details${icon('arrow')}</a><button class="btn secondary small popup-favorite" data-action="favorite" data-id="${escape(place.id)}" aria-pressed="${Boolean(options.favorite?.(place.id))}">${icon('heart')}${options.favorite?.(place.id) ? 'Remove favorite' : 'Add to Favorites'}</button></div></div>`;
    node.querySelector('a').addEventListener('click', (event) => {
      if (options.onPlace) {
        event.preventDefault();
        options.onPlace(place.id);
      }
    });
    return node;
  }
  function refreshPin(id) {
    const marker = markers.get(id),
      index = current.findIndex((p) => p.id === id);
    if (marker && index >= 0) {
      marker.setIcon(pin(current[index], index));
      marker.setZIndexOffset(id === selected ? 1000 : 0);
    }
  }
  function selectPlace(id, { open = true, source = 'card', pan = true } = {}) {
    if (!markers.has(id)) return;
    const before = selected;
    selected = id;
    refreshPin(before);
    refreshPin(id);
    const marker = markers.get(id),
      show = () => {
        if (destroyed || selected !== id) return;
        if (pan) map.panTo(marker.getLatLng(), { animate: !reduced(), duration: 0.25 });
        if (open) marker.openPopup();
      };
    if (group.zoomToShowLayer && open) group.zoomToShowLayer(marker, show);
    else show();
    options.onSelect?.(id, source);
  }
  const legend = L.control({ position: 'bottomleft' }),
    legendNode = document.createElement('details');
  legendNode.className = 'map-legend';
  function updateLegend() {
    const wasOpen = legendNode.open;
    legendNode.innerHTML = `<summary>${icon('map')}Map legend</summary><div>${[...new Set(current.map((p) => categoryKey(p.category)))].map((key) => `<span class="legend-item category-${key}">${icon(categoryOf(key).icon)}${categoryOf(key).short}</span>`).join('')}${options.numbered ? '<span class="legend-item">Numbered stops follow your fixed itinerary.</span>' : ''}</div>`;
    legendNode.open = wasOpen;
  }
  legend.onAdd = () => {
    L.DomEvent.disableClickPropagation(legendNode);
    L.DomEvent.disableScrollPropagation(legendNode);
    return legendNode;
  };
  legend.addTo(map);
  function fit() {
    const points = current.map((p) => [p.lat, p.lon]);
    if (points.length > 1)
      map.fitBounds(points, { padding: [48, 48], maxZoom: 16, animate: false });
    else if (points.length) map.setView(points[0], 16, { animate: false });
  }
  function setPlaces(next, { fitBounds = false } = {}) {
    const unique = new Map(next.filter(valid).map((p) => [p.id, p]));
    current = [...unique.values()];
    for (const [id, marker] of markers)
      if (!unique.has(id)) {
        group.removeLayer(marker);
        markers.delete(id);
      }
    current.forEach((place, index) => {
      let marker = markers.get(place.id);
      if (!marker) {
        marker = L.marker([place.lat, place.lon], {
          title: `${place.name} · ${categoryOf(place.category).label}`,
          alt: place.name,
          icon: pin(place, index)
        });
        marker.on('click', () =>
          selectPlace(place.id, { source: 'marker', pan: false, open: false })
        );
        marker.bindPopup(() => popup(current.find((p) => p.id === place.id) || place), {
          className: 'roam-popup',
          maxWidth: 310,
          minWidth: 245,
          maxHeight: 420,
          autoPanPaddingTopLeft: [18, 28],
          autoPanPaddingBottomRight: [86, 60]
        });
        group.addLayer(marker);
        markers.set(place.id, marker);
      } else {
        const point = marker.getLatLng();
        if (point.lat !== place.lat || point.lng !== place.lon) {
          group.removeLayer(marker);
          marker.setLatLng([place.lat, place.lon]);
          group.addLayer(marker);
        }
        marker.setIcon(pin(place, index));
      }
    });
    if (selected && !unique.has(selected)) {
      selected = null;
      map.closePopup();
    }
    updateLegend();
    if (next.length > current.length) announce('Some places have no valid map coordinates.');
    if (fitBounds) fit();
  }
  const controls = L.control({ position: 'topright' });
  controls.onAdd = () => {
    const node = document.createElement('div');
    node.className = 'map-controls';
    node.setAttribute('role', 'group');
    node.setAttribute('aria-label', 'Map controls');
    L.DomEvent.disableClickPropagation(node);
    L.DomEvent.disableScrollPropagation(node);
    const button = (label, glyph, action) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = label;
      b.setAttribute('aria-label', label);
      b.innerHTML = icon(glyph);
      b.addEventListener('click', (event) => {
        event.stopPropagation();
        action(b);
      });
      node.append(b);
      return b;
    };
    button('Zoom in', 'zoom-in', () => map.zoomIn());
    button('Zoom out', 'zoom-out', () => map.zoomOut());
    button('Recenter map', 'pin', () =>
      map.setView([origin.lat, origin.lon], 13, { animate: !reduced() })
    );
    button('Fit all results', 'fit', fit);
    button('My location', 'locate', (b) => {
      if (!navigator.geolocation) {
        announce('Location is unavailable. You can still explore the map.');
        return;
      }
      b.disabled = true;
      announce('Waiting for location permission…');
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (destroyed) return;
          b.disabled = false;
          const point = [position.coords.latitude, position.coords.longitude];
          userMarker?.remove();
          userMarker = L.circleMarker(point, {
            radius: 8,
            color: '#fff',
            weight: 3,
            fillColor: '#246b64',
            fillOpacity: 1
          })
            .addTo(map)
            .bindTooltip('Your location');
          map.setView(point, 16, { animate: !reduced() });
          announce('Your location is shown.');
        },
        (error) => {
          if (destroyed) return;
          b.disabled = false;
          announce(
            error.code === 1
              ? 'Location permission denied. The map is still available.'
              : 'Location could not be found. Try again or recenter the map.'
          );
        },
        { timeout: 10000, maximumAge: 300000 }
      );
    });
    if (element.requestFullscreen)
      button('Fullscreen map', 'fullscreen', async (b) => {
        try {
          if (document.fullscreenElement === element) await document.exitFullscreen();
          else await element.requestFullscreen();
          b.setAttribute(
            'aria-label',
            document.fullscreenElement === element ? 'Exit fullscreen map' : 'Fullscreen map'
          );
          map.invalidateSize();
        } catch {
          announce('Fullscreen is unavailable in this browser.');
        }
      });
    return node;
  };
  controls.addTo(map);
  const resize = () => {
    if (!destroyed) map.invalidateSize({ pan: true, animate: false });
  };
  const observer = window.ResizeObserver ? new window.ResizeObserver(resize) : null;
  observer?.observe(element);
  document.addEventListener('fullscreenchange', resize);
  map.on('unload', () => {
    destroyed = true;
    observer?.disconnect();
    document.removeEventListener('fullscreenchange', resize);
    markers.clear();
    maps.delete(map);
  });
  map.roam = {
    setPlaces,
    selectPlace,
    fit,
    markers,
    getContext: () => ({
      center: { lat: map.getCenter().lat, lon: map.getCenter().lng },
      zoom: map.getZoom(),
      selectedId: selected
    }),
    setProgress(ids, activeId) {
      visited = new Set(ids);
      options.activePlaceId = activeId;
      current.forEach((p) => refreshPin(p.id));
    }
  };
  setPlaces(places, { fitBounds: true });
  if (options.context?.center && valid(options.context.center))
    map.setView(
      [options.context.center.lat, options.context.center.lon],
      options.context.zoom || 13,
      { animate: false }
    );
  if (selected && markers.has(selected))
    selectPlace(selected, { open: false, pan: false, source: 'restore' });
  return map;
}

function routeLines(geometry) {
  if (geometry.type === 'LineString') return [geometry.coordinates];
  if (geometry.type === 'MultiLineString') return geometry.coordinates;
  return [];
}
export function drawRoute(map, geometry, { stops = [], completed = false } = {}) {
  if (!map || !geometry) return;
  const L = window.L;
  routes.get(map)?.remove();
  const group = L.layerGroup().addTo(map),
    lines = routeLines(geometry);
  L.geoJSON(
    { type: 'Feature', properties: {}, geometry },
    { style: { color: '#fff', weight: 10, opacity: 0.95, lineCap: 'round', lineJoin: 'round' } }
  ).addTo(group);
  const base = L.geoJSON(
    { type: 'Feature', properties: {}, geometry },
    {
      style: {
        color: completed || stops.some((s) => s.visited) ? '#849a94' : '#246b64',
        weight: 5,
        opacity: 0.85,
        lineCap: 'round',
        lineJoin: 'round'
      }
    }
  ).addTo(group);
  const coords = lines.flat();
  let cursor = 0;
  const indices = stops.map((s) => {
    let best = cursor,
      distance = Infinity;
    for (let i = cursor; i < coords.length; i++) {
      const km = distanceKm(s.place, { lat: coords[i][1], lon: coords[i][0] });
      if (km < distance) {
        distance = km;
        best = i;
      }
    }
    cursor = best;
    return best;
  });
  if (!completed)
    for (let i = 1; i < stops.length; i++)
      if (!stops[i].visited) {
        const piece = coords.slice(indices[i - 1], indices[i] + 1);
        if (piece.length > 1)
          L.polyline(
            piece.map((c) => [c[1], c[0]]),
            { color: '#246b64', weight: 5, lineCap: 'round' }
          ).addTo(group);
      }
  for (const line of lines) {
    const step = Math.max(1, Math.floor(line.length / 5));
    for (let i = step; i < line.length; i += step) {
      const a = line[i - 1],
        b = line[i],
        angle =
          (Math.atan2(-(b[1] - a[1]), (b[0] - a[0]) * Math.cos((b[1] * Math.PI) / 180)) * 180) /
          Math.PI;
      L.marker([b[1], b[0]], {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: 'route-arrow',
          html: `<span style="transform:rotate(${angle}deg)">${icon('arrow')}</span>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9]
        })
      }).addTo(group);
    }
  }
  routes.set(map, group);
  const bounds = base.getBounds();
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [45, 45], animate: false });
}
export function drawRouteSegment(map, geometry, color = '#246b64') {
  if (!map || !geometry) return;
  const L = window.L;
  segments.get(map)?.remove();
  const group = L.layerGroup().addTo(map);
  L.geoJSON(
    { type: 'Feature', properties: {}, geometry },
    { style: { color: '#fff', weight: 12, opacity: 1, lineCap: 'round' } }
  ).addTo(group);
  L.geoJSON(
    { type: 'Feature', properties: {}, geometry },
    { style: { color, weight: 7, opacity: 1, lineCap: 'round', lineJoin: 'round' } }
  ).addTo(group);
  segments.set(map, group);
}
