import { endpoint, verifiedPlaces } from '../server/security.js';
import { geo } from '../server/places.js';
import { ApiError } from '../server/http.js';
export default endpoint('POST', async (req) => {
  const places = verifiedPlaces(req.body?.places);
  if (places.length < 2 || places.length > 12)
    throw new ApiError('Routes need 2 to 12 stops.', 400);
  if (!['walk', 'drive'].includes(req.body?.transport))
    throw new ApiError('Use external directions for public transportation.', 400);
  const data = await geo('/v1/routing', {
    waypoints: places.map((p) => `${p.lat},${p.lon}`).join('|'),
    mode: req.body.transport,
    details: 'instruction_details',
    lang: 'en'
  });
  const route = data.features?.[0];
  if (!route?.geometry) throw new ApiError('No route is available between these stops.', 404);
  return {
    geometry: route.geometry,
    distance: route.properties.distance,
    time: route.properties.time,
    legs: route.properties.legs?.map((l) => ({ distance: l.distance, time: l.time })),
    source: 'Geoapify'
  };
});
