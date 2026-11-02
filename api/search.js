import { endpoint } from '../server/security.js';
import { preferences, coordinates } from '../server/validation.js';
import { searchPlaces } from '../server/places.js';
import { getWeather } from '../server/weather.js';
export default endpoint('POST', async (req) => {
  const prefs = preferences(req.body?.preferences),
    center = coordinates(req.body?.center);
  const [result, weather] = await Promise.all([
    searchPlaces(center, prefs),
    getWeather(center).catch(() => null)
  ]);
  return { ...result, weather, preferences: prefs };
});
