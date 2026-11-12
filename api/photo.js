import { endpoint, verifiedPlaces } from '../server/security.js';
import { destinations, findPhoto } from '../server/photos.js';
import { ApiError } from '../server/http.js';

export default endpoint(
  'POST',
  async (req) => {
    if (['Tokyo', 'New York City', 'Toronto'].includes(req.body?.destination))
      return { photo: null, scope: 'Ottawa, Canada and Paris, France' };
    const place = req.body?.destination
      ? destinations[req.body.destination]
      : verifiedPlaces([req.body?.place])[0];
    if (
      !place ||
      typeof place !== 'object' ||
      !Number.isFinite(place.lat) ||
      !Number.isFinite(place.lon)
    )
      throw new ApiError('Choose a retrieved place or featured destination.', 400);
    return { photo: await findPhoto(place), retryAfter: 60 };
  },
  { limit: 120 }
);
