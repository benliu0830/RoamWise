import { endpoint, verifiedPlaces } from '../server/security.js';
import { placeDetails } from '../server/places.js';
import { describePlace } from '../server/descriptions.js';
export default endpoint('POST', async (req) => {
  const original = verifiedPlaces([req.body?.place])[0];
  if (req.body?.describe) return { description: await describePlace(original) };
  const place = await placeDetails(original);
  return { place };
});
