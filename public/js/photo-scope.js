import { nameKey } from './place-utils.js';

// Administrative evidence is required as well as coordinates. This envelope
// is a sanity check, not a municipal boundary or a proximity-based identity.
const localities = new Set([
  'ottawa',
  'kanata',
  'nepean',
  'orleans',
  'stittsville',
  'gloucester',
  'vanier',
  'manotick',
  'richmond',
  'carp',
  'dunrobin',
  'osgoode',
  'metcalfe',
  'north gower',
  'greely',
  'vars',
  'cumberland'
]);
export function isOttawaPhotoPlace(place) {
  if (
    !place ||
    !Number.isFinite(place.lat) ||
    !Number.isFinite(place.lon) ||
    place.lat < 44.95 ||
    place.lat > 45.6 ||
    place.lon < -76.4 ||
    place.lon > -75.2
  )
    return false;
  const country = nameKey(place.country || place.countryCode || '');
  if (place.countryCode && nameKey(place.countryCode) !== 'ca') return false;
  const state = nameKey(place.state || '');
  if (country && !['canada', 'ca'].includes(country)) return false;
  if (state && !['ontario', 'on'].includes(state)) return false;
  const address = nameKey(place.address || '');
  const city = nameKey(place.city || '');
  if (city && !localities.has(city)) return false;
  const addressParts = String(place.address || '')
    .split(',')
    .map(nameKey);
  const locality = city || addressParts.find((part) => localities.has(part));
  return Boolean(
    locality &&
    (state || /\b(ontario|on)\b/.test(address)) &&
    (country || /\bcanada\b/.test(address))
  );
}

export function isParisPhotoPlace(place) {
  if (
    !place ||
    !Number.isFinite(place.lat) ||
    !Number.isFinite(place.lon) ||
    place.lat < 48.8 ||
    place.lat > 48.92 ||
    place.lon < 2.22 ||
    place.lon > 2.47
  )
    return false;
  const country = nameKey(place.country || place.countryCode || '');
  if (country && !['france', 'fr'].includes(country)) return false;
  if (place.countryCode && nameKey(place.countryCode) !== 'fr') return false;
  if (place.state && !['ile de france', 'paris'].includes(nameKey(place.state))) return false;
  const city = nameKey(place.city || '');
  if (city && !/^paris(?: \d{1,2}(?:er|e|eme)?(?: arrondissement)?)?$/.test(city)) return false;
  const address = nameKey(place.address || '');
  return Boolean(
    (city || /\b75\d{3} paris\b/.test(address)) && (country || /\bfrance\b/.test(address))
  );
}

export const isSupportedPhotoPlace = (place) =>
  isOttawaPhotoPlace(place) || isParisPhotoPlace(place);
export const photoCity = (place) =>
  isParisPhotoPlace(place) ? 'Paris' : isOttawaPhotoPlace(place) ? 'Ottawa' : null;

export function photoIdentity(place) {
  return JSON.stringify([
    place.id,
    place.name,
    place.lat,
    place.lon,
    place.wikidata,
    place.wikipedia,
    place.brandId,
    place.category,
    place.address,
    place.city,
    place.state,
    place.country,
    place.countryCode,
    place.street,
    place.houseNumber
  ]);
}
