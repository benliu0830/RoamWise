import { endpoint, verifiedPlaces } from '../server/security.js';
import { placeDetails } from '../server/places.js';
export default endpoint('POST', async (req) => ({
  place: await placeDetails(verifiedPlaces([req.body?.place])[0])
}));
