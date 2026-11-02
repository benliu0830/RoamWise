import { icon } from './icons.js';
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
  const map = L.map(element, { scrollWheelZoom: false }).setView([center.lat, center.lon], 13);
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
    const marker = L.marker([place.lat, place.lon], {
      icon: L.divIcon({
        className: 'roam-marker',
        html: `<span>${numbered ? i + 1 : icon('pin')}</span>`,
        iconSize: [34, 40],
        iconAnchor: [17, 40]
      })
    }).addTo(map);
    const popup = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = place.name;
    popup.append(title);
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
  if (bounds.length > 1) map.fitBounds(bounds, { padding: [35, 35], maxZoom: 15 });
  else if (bounds.length === 1) map.setView(bounds[0], 15);
  setTimeout(() => map.invalidateSize(), 150);
  return map;
}
export function drawRoute(map, geometry) {
  if (!map || !geometry) return;
  const layer = L.geoJSON(
    { type: 'Feature', properties: {}, geometry },
    { style: { color: '#246b64', weight: 5, opacity: 0.85 } }
  ).addTo(map);
  map.fitBounds(layer.getBounds(), { padding: [35, 35] });
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
