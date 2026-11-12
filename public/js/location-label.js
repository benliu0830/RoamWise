// Keep provider coordinates and administrative data intact; simplify display labels only.
export const locationLabel = (value) =>
  String(value ?? '').replace(/\bParis,\s*IDF,\s*France\b/gi, 'Paris, France');
