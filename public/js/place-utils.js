export function distanceKm(a, b) {
  const rad = (n) => (n * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function formatDistance(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}
export const nameKey = (name = '') =>
  name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
const knownChains = new Set([
  'starbucks',
  'mcdonalds',
  'tim hortons',
  'burger king',
  'subway',
  'a w',
  'costa coffee',
  'pret a manger'
]);
export function businessKey(place) {
  if (!['food', 'cafes', 'shopping'].includes(place.category)) return null;
  const name = nameKey(place.name);
  const brand = nameKey(place.brand || '');
  // Known exact chain names stay together when providers omit brand IDs on
  // some branches. Similar names never enter this path.
  if (knownChains.has(name)) return `${place.category}:chain:${name}`;
  if (place.brandId && /^Q\d+$/.test(place.brandId))
    return `${place.category}:brand:${place.brandId}`;
  if (brand && (name === brand || name.startsWith(brand + ' ')))
    return `${place.category}:brand-name:${brand}`;
  if (place.businessDomain && name)
    return `${place.category}:domain:${place.businessDomain}:${name}`;
  return null;
}
export function groupBranches(places, origin, sort = 'distance') {
  const groups = new Map(),
    ungrouped = [];
  for (const place of places) {
    const key = businessKey(place);
    if (!key) {
      ungrouped.push(place);
      continue;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(place);
  }
  const grouped = [...groups.values()].map((branches) => {
    const sorted = [...branches].sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name) || (a.address || '').localeCompare(b.address || '')
        : distanceKm(origin, a) - distanceKm(origin, b)
    );
    return branches.length > 1
      ? {
          ...sorted[0],
          name: sorted[0].brand || sorted[0].name,
          branches: sorted,
          branchCount: sorted.length
        }
      : sorted[0];
  });
  const positions = new Map(places.map((place, i) => [place.id, i]));
  return [...ungrouped, ...grouped].sort(
    (a, b) =>
      Math.min(...(a.branches || [a]).map((p) => positions.get(p.id))) -
      Math.min(...(b.branches || [b]).map((p) => positions.get(p.id)))
  );
}
