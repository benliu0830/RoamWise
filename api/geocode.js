import { endpoint } from '../server/security.js';
import { geocode } from '../server/places.js';
export default endpoint('GET', async (req) => ({ results: await geocode(req.query.q) }));
