import { nameKey } from '../public/js/place-utils.js';

// These are relevance signals, never displayed as visitor ratings/popularity.
export function relevanceScore(place, query = '') {
  const name = nameKey(place.name),
    term = nameKey(query);
  const tokens = term.split(' ').filter(Boolean);
  const match =
    term && nameKey(place.matchedQuery || '') === term
      ? 26
      : !term
        ? 0
        : name === term
          ? 30
          : name.startsWith(term)
            ? 22
            : name.includes(term)
              ? 18
              : tokens.filter((token) => name.includes(token)).length * 4;
  const evidence =
    (place.wikidata ? 5 : 0) +
    (place.wikipedia ? 5 : 0) +
    (place.description ? 2 : 0) +
    (place.image ? 1 : 0) +
    (place.hours ? 1 : 0);
  const category = ['landmarks', 'museums', 'history'].includes(place.category) ? 2 : 0;
  return (
    match +
    evidence +
    category +
    (place.editorial ? 24 : 0) -
    Math.min(place.distance || 0, 30000) / 30000
  );
}
