import { endpoint, verifiedPlaces } from '../server/security.js';
import { preferences, coordinates } from '../server/validation.js';
import { personalize } from '../server/ai.js';
import { getWeather } from '../server/weather.js';
export default endpoint(
  'POST',
  async (req) => {
    const places = verifiedPlaces(req.body?.places),
      prefs = preferences(req.body?.preferences),
      center = coordinates(req.body?.center);
    const weather = await getWeather(center).catch(() => null);
    return personalize(places, prefs, weather);
  },
  { limit: 10 }
);
