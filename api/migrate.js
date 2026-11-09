import { endpoint, verifiedPlaces, signPlace } from '../server/security.js';

// Old HMAC-signed records must be verified before removing retired fields.
export default endpoint('POST', async (req) => ({
  places: verifiedPlaces(req.body?.places).map((place) => {
    const { price, website, signature, ...current } = place;
    return signPlace(current);
  })
}));
