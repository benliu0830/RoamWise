import { fetchJson, ApiError } from './http.js';
import { requireApiKey } from './config.js';
import { signPlace } from './security.js';

export const categories = {
  landmarks: 'tourism.sights',
  food: 'catering.restaurant,catering.cafe',
  museums: 'entertainment.museum',
  nature: 'leisure.park,natural',
  entertainment: 'entertainment.cinema,entertainment.culture.theatre,entertainment.zoo',
  shopping: 'commercial.shopping_mall,commercial.marketplace',
  hidden: 'tourism.attraction',
  free: 'leisure.park,tourism.sights'
};
const cache = new Map();
export async function geo(path, params) {
  const url = new URL(path, 'https://api.geoapify.com');
  url.search = new URLSearchParams({ ...params, apiKey: requireApiKey('GEOAPIFY_API_KEY') });
  const key = `${path}:${JSON.stringify(params)}`;
  if (cache.get(key)?.until > Date.now()) return cache.get(key).data;
  const data = await fetchJson(url);
  if (cache.size > 100) cache.delete(cache.keys().next().value);
  cache.set(key, { data, until: Date.now() + 300000 });
  return data;
}
export function safeUrl(value) {
  if (typeof value !== 'string' || value.length > 1500) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function text(value, max = 500) {
  return typeof value === 'string' ? value.slice(0, max) : null;
}
export function groupOf(cats) {
  if (cats.some((c) => c.startsWith('catering'))) return 'food';
  if (cats.some((c) => c.includes('museum'))) return 'museums';
  if (cats.some((c) => c.startsWith('leisure.park') || c.startsWith('natural'))) return 'nature';
  if (cats.some((c) => c.startsWith('commercial'))) return 'shopping';
  if (cats.some((c) => c.startsWith('entertainment'))) return 'entertainment';
  if (cats.some((c) => c.startsWith('tourism.sights'))) return 'landmarks';
  return 'hidden';
}
export function normalize(feature) {
  const p = feature.properties || {};
  const raw = p.datasource?.raw || {};
  const cats = p.categories || [];
  const group = groupOf(cats);
  const fee = raw.fee;
  const charge = text(raw.charge, 150);
  const priceMatch = charge?.match(/^(\d+(?:\.\d+)?)\s*(EUR|USD|CAD|GBP|JPY|AUD)$/i);
  const price =
    fee === 'no'
      ? {
          kind: 'reported',
          amount: 0,
          currency: null,
          text: 'Reported free entry',
          source: 'OpenStreetMap'
        }
      : priceMatch
        ? {
            kind: 'reported',
            amount: Number(priceMatch[1]),
            currency: priceMatch[2].toUpperCase(),
            text: charge,
            source: 'OpenStreetMap'
          }
        : {
            kind: 'unknown',
            amount: null,
            currency: null,
            text:
              charge ||
              (fee === 'yes' ? 'Entry fee reported; amount not available' : 'Not available'),
            source: charge || fee === 'yes' ? 'OpenStreetMap' : null
          };
  const indoor =
    raw.indoor === 'yes' || ['museums', 'food', 'shopping'].includes(group)
      ? 'indoor'
      : raw.indoor === 'no' || group === 'nature'
        ? 'outdoor'
        : 'unknown';
  const image = safeUrl(p.wiki_and_media?.image || raw.image);
  return signPlace({
    id: p.place_id,
    name: text(p.name, 200),
    lat: Number(p.lat),
    lon: Number(p.lon),
    category: group,
    categories: cats.slice(0, 12),
    setting: indoor,
    address: text(p.address_line2 || p.formatted),
    city: text(p.city || p.town || p.village, 120),
    description: text(raw.description || raw['description:en']),
    website: safeUrl(p.website || raw.website || raw['contact:website']),
    hours: text(p.opening_hours || raw.opening_hours),
    price,
    image: image?.startsWith('https:') && !image.includes('apiKey') ? image : null,
    wikipedia: text(p.wiki_and_media?.wikipedia || raw.wikipedia, 200),
    source: 'Geoapify / OpenStreetMap',
    distance: Number.isFinite(p.distance) ? p.distance : null,
    retrievedAt: new Date().toISOString()
  });
}
function eligible(feature) {
  const p = feature.properties || {},
    raw = p.datasource?.raw || {};
  return (
    p.place_id &&
    p.name &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    !p.categories?.includes('no_access') &&
    !['no', 'private'].includes(raw.access) &&
    p.restrictions?.access !== 'private' &&
    !raw['disused:tourism']
  );
}
export async function geocode(query) {
  if (typeof query !== 'string' || query.trim().length < 2 || query.length > 180)
    throw new ApiError('Enter a city or destination with at least two characters.', 400);
  const data = await geo('/v1/geocode/search', {
    text: query.trim(),
    type: 'city',
    format: 'json',
    limit: '5',
    lang: 'en'
  });
  const results = (data.results || [])
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .map((p) => ({
      name: p.city || p.name || p.formatted,
      label: p.formatted,
      lat: p.lat,
      lon: p.lon,
      country: p.country,
      timezone: p.timezone?.name || null
    }));
  if (!results.length)
    throw new ApiError('No destination found. Try a city and country, such as Paris, France.', 404);
  return results;
}
export async function searchPlaces(center, prefs) {
  const keys = prefs.interests.length
    ? prefs.interests
    : ['landmarks', 'food', 'museums', 'nature', 'hidden', 'entertainment'];
  // Separate bounded category requests avoid a dense restaurant district crowding
  // every other interest out of a single proximity-sorted response.
  const results = await Promise.allSettled(
    keys.map((key) =>
      geo('/v2/places', {
        categories: categories[key],
        filter: `circle:${center.lon},${center.lat},${prefs.radius}`,
        bias: `proximity:${center.lon},${center.lat}`,
        limit: '20',
        lang: 'en'
      })
    )
  );
  const successes = results.filter((r) => r.status === 'fulfilled');
  if (!successes.length) throw results[0].reason;
  const seen = new Set(),
    places = [];
  for (let i = 0; i < 20; i++)
    for (const result of successes) {
      const feature = result.value.features?.[i];
      if (!feature || !eligible(feature) || seen.has(feature.properties.place_id)) continue;
      seen.add(feature.properties.place_id);
      const place = normalize(feature);
      if (prefs.setting !== 'any' && place.setting !== prefs.setting) continue;
      if (keys.length === 1 && keys[0] === 'free' && place.price.amount !== 0) continue;
      places.push(place);
      if (places.length >= 80) break;
    }
  return { places: places.slice(0, 80), partial: successes.length !== results.length };
}
export async function placeDetails(place) {
  const data = await geo('/v2/place-details', { id: place.id, features: 'details', lang: 'en' });
  const feature =
    data.features?.find((f) => f.properties?.feature_type === 'details') || data.features?.[0];
  if (!feature?.properties) return place;
  const p = feature.properties;
  const normalized = normalize({
    ...feature,
    properties: {
      ...p,
      place_id: place.id,
      name: p.name || place.name,
      lat: p.lat ?? place.lat,
      lon: p.lon ?? place.lon,
      categories: p.categories || place.categories
    }
  });
  return signPlace({
    ...place,
    ...normalized,
    image: normalized.image || place.image,
    description: normalized.description || place.description
  });
}
