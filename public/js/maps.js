import { icon } from './icons.js';
import { categoryKey, categoryOf } from './categories.js';
let activeMaps = [];
export function clearMaps() {
  activeMaps.forEach((map) => map.remove());
  activeMaps = [];
}
export function createMap(element, places, center, { numbered = false, onPlace } = {}) {
  if (!element || !window.L) {
    if (element)
      element.textContent = 'The map could not load. Directions links are still available.';
    return null;
  }
  // Maps are rebuilt when filters change. Disable Leaflet's deferred zoom
  // transition so it cannot target a pane removed by rapid navigation.
  const map = L.map(element, { scrollWheelZoom: false, zoomAnimation: false, markerZoomAnimation: false }).setView([center.lat, center.lon], 13);
  activeMaps.push(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  })
    .addTo(map)
    .on('tileerror', () => {
      if (element.dataset.tileError) return;
      element.dataset.tileError = 'true';
      const notice = document.createElement('div');
      notice.className = 'map-tile-message';
      notice.textContent =
        'Map tiles could not load. Place pins and directions links remain available.';
      notice.setAttribute('role', 'status');
      element.append(notice);
    });
  const bounds = [];
  places.forEach((place, i) => {
    const category = categoryOf(place.category);
    const marker = L.marker([place.lat, place.lon], {
      title: `${place.name} · ${category.label}`,
      alt: `${place.name} · ${category.label}`,
      icon: L.divIcon({
        className: `roam-marker category-${categoryKey(place.category)}`,
        html: `<span>${numbered ? i + 1 : icon(category.icon)}</span>`,
        iconSize: [34, 40],
        iconAnchor: [17, 40]
      })
    }).addTo(map);
    const popup = document.createElement('div');
    popup.className = `place-popup category-${categoryKey(place.category)}`;
    const title = document.createElement('strong');
    title.textContent = place.name;
    popup.append(title);
    const label = document.createElement('span');
    label.className = 'category-badge';
    label.innerHTML = icon(category.icon);
    label.append(document.createTextNode(category.label));
    popup.append(label);
    const description = document.createElement('p');
    description.textContent = (
      place.description ||
      place.address ||
      'Open details for available place information.'
    ).slice(0, 150);
    popup.append(description);
    if (onPlace) {
      const button = document.createElement('button');
      button.className = 'popup-link';
      button.textContent = 'View details';
      button.addEventListener('click', () => onPlace(place.id));
      popup.append(button);
    }
    marker.bindPopup(popup);
    bounds.push([place.lat, place.lon]);
  });
  if (places.length) {
    const legend = L.control({ position: 'bottomleft' });
    legend.onAdd = () => {
      const node = document.createElement('div');
      node.className = 'map-legend';
      node.setAttribute('aria-label', 'Place categories on this map');
      const heading = document.createElement('strong');
      heading.textContent = numbered ? 'Your stops' : 'On the map';
      node.append(heading);
      [...new Set(places.map((p) => categoryKey(p.category)))].forEach((key) => {
        const item = document.createElement('span');
        item.className = `legend-item category-${key}`;
        item.innerHTML = icon(categoryOf(key).icon);
        item.append(document.createTextNode(categoryOf(key).short));
        node.append(item);
      });
      L.DomEvent.disableClickPropagation(node);
      L.DomEvent.disableScrollPropagation(node);
      return node;
    };
    legend.addTo(map);
  }
  if (bounds.length > 1) map.fitBounds(bounds, { padding: [35, 35], maxZoom: 15, animate: false });
  else if (bounds.length === 1) map.setView(bounds[0], 15);
  setTimeout(() => {
    if (activeMaps.includes(map)) map.invalidateSize();
  }, 150);
  return map;
}
export function drawRoute(map, geometry) {
  if (!map || !geometry) return;
  const layer = L.geoJSON(
    { type: 'Feature', properties: {}, geometry },
    { style: { color: '#246b64', weight: 5, opacity: 0.85 } }
  ).addTo(map);
  map.fitBounds(layer.getBounds(), { padding: [35, 35], animate: false });
}
export function directions(place, transport = 'walk') {
  const mode = { walk: 'walking', drive: 'driving', transit: 'transit' }[transport] || 'walking';
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${place.lat},${place.lon}`)}&travelmode=${mode}`;
}
export function dayDirections(stops, transport = 'walk') {
  if (!stops.length) return '#';
  const places = stops.map((s) => s.place || s),
    last = places.at(-1);
  if (places.length === 1) return directions(last, transport);
  const params = new URLSearchParams({
    api: '1',
    origin: `${places[0].lat},${places[0].lon}`,
    destination: `${last.lat},${last.lon}`,
    travelmode: { walk: 'walking', drive: 'driving', transit: 'transit' }[transport]
  });
  // Google Maps transit directions do not support waypoints; link the first leg.
  if (transport === 'transit') params.set('destination', `${places[1].lat},${places[1].lon}`);
  else if (places.length > 2)
    params.set(
      'waypoints',
      places
        .slice(1, -1)
        .map((p) => `${p.lat},${p.lon}`)
        .join('|')
    );
  return `https://www.google.com/maps/dir/?${params}`;
}
