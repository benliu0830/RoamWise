import { createHmac, timingSafeEqual } from 'node:crypto';
import { requireApiKey } from './config.js';
import { ApiError } from './http.js';

function signature(place) {
  const { signature: ignored, ...data } = place;
  return createHmac('sha256', requireApiKey('GEOAPIFY_API_KEY'))
    .update(JSON.stringify(data))
    .digest('hex');
}
// Signing normalized places prevents a client from supplying fictional AI candidates.
// Signatures work across independent Vercel Function instances, without a database.
export function signPlace(place) {
  return { ...place, signature: signature(place) };
}
export function verifiedPlaces(places) {
  if (!Array.isArray(places) || places.length < 1 || places.length > 80)
    throw new ApiError('Choose between 1 and 80 retrieved places.', 400);
  const ids = new Set();
  return places.map((place) => {
    if (
      !place ||
      typeof place !== 'object' ||
      typeof place.signature !== 'string' ||
      !/^[a-f0-9]{64}$/.test(place.signature)
    )
      throw new ApiError('Search again to retrieve verified place data.', 400);
    if (!timingSafeEqual(Buffer.from(place.signature, 'hex'), Buffer.from(signature(place), 'hex')))
      throw new ApiError('Place data changed. Search again before planning.', 400);
    if (ids.has(place.id)) throw new ApiError('Duplicate places in request.', 400);
    ids.add(place.id);
    return place;
  });
}

// A small instance-local guard reduces accidental quota exhaustion. It is not
// a distributed production rate limiter; Vercel firewall rules are still advised.
const requests = new Map();
export function endpoint(method, action, { limit = 30 } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== method) {
      res.setHeader('Allow', method);
      return res.status(405).json({ error: 'Method not allowed.' });
    }
    if (method === 'POST' && req.headers.origin && req.headers.host) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host)
          return res.status(403).json({ error: 'Use this API from Roamwise.' });
      } catch {
        return res.status(403).json({ error: 'Invalid origin.' });
      }
    }
    const address =
      req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown';
    const bucket = `${address}:${req.url?.split('?')[0]}`;
    const now = Date.now();
    if (requests.size > 2000)
      for (const [key, value] of requests) if (value.until < now) requests.delete(key);
    const usage = requests.get(bucket);
    if (usage && usage.until > now && usage.count >= limit) {
      res.setHeader('Retry-After', '60');
      return res.status(429).json({ error: 'Too many requests. Wait a minute and try again.' });
    }
    requests.set(
      bucket,
      usage && usage.until > now
        ? { ...usage, count: usage.count + 1 }
        : { count: 1, until: now + 60000 }
    );
    try {
      return res.status(200).json(await action(req));
    } catch (error) {
      const safe = error instanceof ApiError || error.status === 503;
      return res.status(safe ? error.status : 500).json({
        error: safe ? error.message : 'This request could not be completed. Please try again.'
      });
    }
  };
}
