export { clearMaps, createMap, drawRoute, drawRouteSegment } from './map-controller.js';
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
