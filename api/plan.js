import { endpoint, verifiedPlaces } from '../server/security.js';
import { preferences, coordinates } from '../server/validation.js';
import { rankPlaces } from '../server/ai.js';
import { getWeather } from '../server/weather.js';
import { buildPlan } from '../server/planner.js';
export default endpoint(
  'POST',
  async (req) => {
    const places = verifiedPlaces(req.body?.places),
      prefs = preferences(req.body?.preferences),
      coords = coordinates(req.body?.center);
    const center = {
      ...coords,
      name:
        typeof req.body?.center?.name === 'string' ? req.body.center.name.slice(0, 120) : 'Nearby'
    };
    const weather = await getWeather(center).catch(() => null);
    return { plan: buildPlan(rankPlaces(places, prefs, weather), prefs, center, weather) };
  },
  { limit: 15 }
);
