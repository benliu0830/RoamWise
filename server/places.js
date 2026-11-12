import { locationLabel } from '../public/js/location-label.js';
import { fetchJson, ApiError } from './http.js';
import { requireApiKey } from './config.js';
import { signPlace } from './security.js';
import { distanceKm, nameKey } from '../public/js/place-utils.js';
import { relevanceScore } from './ranking.js';

export const categories = {
  landmarks: 'tourism.sights',
  food: 'catering.restaurant',
  museums: 'entertainment.museum',
  nature: 'leisure.park,natural',
  entertainment: 'entertainment.cinema,entertainment.culture.theatre,entertainment.zoo',
  shopping: 'commercial.shopping_mall,commercial.marketplace',
  hidden: 'tourism.attraction',
  cafes: 'catering.cafe',
  history: 'tourism.sights.castle,tourism.sights.memorial,tourism.sights.archaeological_site'
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
  if (cats.some((c) => c.startsWith('catering.cafe'))) return 'cafes';
  if (cats.some((c) => c.startsWith('catering'))) return 'food';
  if (cats.some((c) => c.includes('museum'))) return 'museums';
  if (cats.some((c) => c.startsWith('leisure.park') || c.startsWith('natural'))) return 'nature';
  if (cats.some((c) => c.startsWith('commercial'))) return 'shopping';
  if (cats.some((c) => c.startsWith('entertainment'))) return 'entertainment';
  if (cats.some((c) => /castle|memorial|archaeological/.test(c))) return 'history';
  if (cats.some((c) => c.startsWith('tourism.sights'))) return 'landmarks';
  return 'hidden';
}
export function normalize(feature) {
  const p = feature.properties || {};
  const raw = p.datasource?.raw || {};
  const cats = p.categories || (p.category ? [p.category] : []);
  const group = groupOf(cats);
  const indoor =
    raw.indoor === 'yes' || ['museums', 'food', 'cafes', 'shopping'].includes(group)
      ? 'indoor'
      : raw.indoor === 'no' || group === 'nature'
        ? 'outdoor'
        : 'unknown';
  const image = safeUrl(p.wiki_and_media?.image || raw.image);
  return signPlace({
    id: p.place_id,
    name: text(p.name, 200),
    names: [
      ...new Set(
        [raw.name, raw['name:fr'], raw['name:en'], raw.official_name, raw.alt_name]
          .filter((value) => typeof value === 'string')
          .flatMap((value) => value.split(';'))
          .map((value) => value.slice(0, 200))
      )
    ].slice(0, 10),
    photoNeedsDetails: !p.datasource?.raw,
    lat: Number(p.lat),
    lon: Number(p.lon),
    category: group,
    categories: cats.slice(0, 12),
    setting: indoor,
    address: text(p.address_line2 || p.formatted),
    city: text(p.city || p.town || p.village, 120),
    country: text(p.country, 120),
    state: text(p.state, 120),
    countryCode: text(p.country_code, 3),
    street: text(p.street || raw['addr:street'], 200),
    houseNumber: text(p.housenumber || raw['addr:housenumber'], 30),
    description: text(raw.description || raw['description:en']),
    businessDomain: businessDomain(p.website || raw.website || raw['contact:website']),
    brand: text(p.brand?.name || p.brand || raw.brand, 120),
    brandId: text(raw['brand:wikidata'], 30),
    timezone: text(p.timezone?.name || raw.timezone, 100),
    cuisine: text(p.catering?.cuisine || raw.cuisine, 200),
    operator: text(raw.operator, 120),
    heritage: text(raw.heritage, 60),
    wikidata: text(p.wiki_and_media?.wikidata || raw.wikidata, 30),
    features: Object.fromEntries(
      [
        'wheelchair',
        'outdoor_seating',
        'takeaway',
        'internet_access',
        'historic',
        'tourism',
        'leisure'
      ]
        .filter((key) => typeof raw[key] === 'string')
        .map((key) => [key, raw[key].slice(0, 100)])
    ),
    hours: text(p.opening_hours || raw.opening_hours),
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
export async function geocode(query, { autocomplete = false, origin = false } = {}) {
  if (typeof query !== 'string' || query.trim().length < 2 || query.length > 180)
    throw new ApiError('Enter a city or destination with at least two characters.', 400);
  const data = await geo(autocomplete ? '/v1/geocode/autocomplete' : '/v1/geocode/search', {
    text: query.trim(),
    ...(origin ? {} : { type: 'city' }),
    format: 'json',
    limit: autocomplete ? '8' : '5',
    lang: 'en'
  });
  const results = (data.results || [])
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .map((p) => ({
      name: p.city || p.name || p.formatted,
      label: locationLabel(p.formatted),
      lat: p.lat,
      lon: p.lon,
      placeId: p.place_id || null,
      country: p.country,
      region: locationLabel(
        `${p.city || p.name}, ${[p.state, p.country].filter(Boolean).join(', ')}`
      ).replace(`${p.city || p.name}, `, ''),
      timezone: p.timezone?.name || null
    }));
  if (!results.length)
    throw new ApiError('No destination found. Try a city and country, such as Paris, France.', 404);
  return results;
}
export async function searchPlaces(center, prefs) {
  const keys = prefs.query
    ? [
        'landmarks',
        'food',
        'cafes',
        'museums',
        'nature',
        'hidden',
        'shopping',
        'entertainment',
        'history'
      ]
    : prefs.interests.length
      ? prefs.interests
      : ['landmarks', 'food', 'cafes', 'museums', 'nature', 'hidden', 'entertainment', 'shopping'];
  // Separate bounded category requests avoid a dense restaurant district crowding
  // every other interest out of a single proximity-sorted response.
  const requests = (
    prefs.query
      ? ['tourism', 'catering', 'commercial', 'entertainment', 'leisure', 'natural']
      : keys
  ).flatMap((key) =>
    (prefs.query ? [key] : categories[key].split(',')).map((category) => ({
      category,
      name: prefs.query,
      limit: prefs.query || ['landmarks', 'museums'].includes(key) ? 80 : 30
    }))
  );
  if (prefs.query) requests.push({ name: prefs.query, geocode: true, limit: 10 });
  // Editorial retrieval seeds address proximity-only provider ordering. These
  // names never become recommendations unless an actual in-area record exists.
  if (
    !prefs.query &&
    (!prefs.interests.length ||
      prefs.interests.some((key) => ['landmarks', 'museums', 'history'].includes(key))) &&
    distanceKm(center, { lat: 48.8566, lon: 2.3522 }) < 15
  ) {
    requests.push(
      ...[
        {
          name: 'Eiffel Tower, Paris, France',
          geocode: true,
          targetCategory: 'landmarks',
          editorial: true
        },
        {
          name: 'Louvre Museum, Paris, France',
          geocode: true,
          targetCategory: 'museums',
          editorial: true
        },
        {
          name: 'Arc de Triomphe, Paris, France',
          geocode: true,
          targetCategory: 'landmarks',
          editorial: true
        }
      ]
    );
  }
  const results = await Promise.allSettled(
    requests.map((request) =>
      geo(
        request.geocode ? '/v1/geocode/search' : '/v2/places',
        request.geocode
          ? {
              text: request.name,
              type: 'amenity',
              format: 'geojson',
              limit: String(request.limit || 1),
              filter: `circle:${center.lon},${center.lat},${prefs.radius}`,
              lang: 'en'
            }
          : {
              categories: request.category,
              ...(request.name ? { name: request.name } : {}),
              filter: `circle:${center.lon},${center.lat},${prefs.radius}`,
              ...(!request.name ? { bias: `proximity:${center.lon},${center.lat}` } : {}),
              limit: String(request.limit || 20),
              lang: 'en'
            }
      ).then((data) => ({
        ...data,
        editorial: request.editorial,
        matchedQuery: request.geocode && !request.editorial ? prefs.query : null,
        targetCategory: request.targetCategory
      }))
    )
  );
  const successes = results.filter((r) => r.status === 'fulfilled');
  if (!successes.length) throw results[0].reason;
  const seen = new Set(),
    places = [];
  const candidates = [];
  if (prefs.query) {
    // Prefer complete Places records to their sparser geocoding duplicates.
    for (const result of successes)
      for (const feature of (result.value.features || []).slice(0, 80))
        candidates.push({ feature, result });
  } else {
    for (let i = 0; i < 80; i++)
      for (const result of successes)
        candidates.push({ feature: result.value.features?.[i], result });
  }
  for (const { feature, result } of candidates) {
    if (!feature || !eligible(feature) || seen.has(feature.properties.place_id)) continue;
    seen.add(feature.properties.place_id);
    const normalized = normalize(feature);
    const place = signPlace({
      ...normalized,
      ...(result.value.matchedQuery ? { matchedQuery: result.value.matchedQuery } : {}),
      distance: distanceKm(center, normalized) * 1000,
      ...(result.value.editorial ? { editorial: true, category: result.value.targetCategory } : {})
    });
    if (prefs.setting !== 'any' && place.setting !== prefs.setting) continue;
    if (distanceKm(center, place) * 1000 > prefs.radius + 20) continue;
    const identity = `${nameKey(place.name)}:${Math.round(place.lat * 10000)}:${Math.round(place.lon * 10000)}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    places.push(place);
  }
  places.sort((a, b) => relevanceScore(b, prefs.query) - relevanceScore(a, prefs.query));
  // A museum-rich city must not push all food or nature records out of the
  // bounded pool. Take a balanced pool first, then order it by relevance.
  let pool = places;
  if (!prefs.query && places.length > 80) {
    const buckets = [...new Set(places.map((place) => place.category))].map((key) =>
      places.filter((place) => place.category === key)
    );
    pool = [];
    for (let i = 0; pool.length < 80 && buckets.some((bucket) => bucket[i]); i++)
      for (const bucket of buckets) if (bucket[i] && pool.length < 80) pool.push(bucket[i]);
    pool.sort((a, b) => relevanceScore(b, prefs.query) - relevanceScore(a, prefs.query));
  }
  return {
    places: pool.slice(0, 80),
    truncated:
      places.length > 80 ||
      successes.some((r) => r.value.features?.length >= (prefs.query ? 80 : 30)),
    partial: successes.length !== results.length
  };
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
    ...Object.fromEntries(Object.entries(normalized).filter(([, value]) => value != null)),
    hours: normalized.hours || place.hours,
    category: place.editorial ? place.category : normalized.category,
    features: { ...place.features, ...normalized.features },
    timezone: normalized.timezone || place.timezone,
    image: normalized.image || place.image,
    description: normalized.description || place.description
  });
}

function businessDomain(value) {
  const url = safeUrl(value);
  if (!url) return null;
  const host = new URL(url).hostname.replace(/^www\./, '');
  return /(^|\.)(facebook|instagram|google|tripadvisor|yelp)\./.test(host) ? null : host;
}
