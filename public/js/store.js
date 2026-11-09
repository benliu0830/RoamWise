const prefix = 'roamwise:v1:';
let storageWarning = false;
const retired = new Set([
  'price',
  'website',
  'dailyBudget',
  'totalBudget',
  'currency',
  'knownCost',
  'unknownCosts',
  'free'
]);
export function cleanStored(value) {
  if (Array.isArray(value)) return value.map(cleanStored);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !retired.has(key))
      .map(([key, item]) => [
        key,
        key === 'notes' && Array.isArray(item)
          ? item.filter((note) => !/budget|prices?|costs?|currency|fares|spending/i.test(note))
          : cleanStored(item)
      ])
  );
}
export function read(key, fallback, session = false) {
  try {
    return cleanStored(
      JSON.parse((session ? sessionStorage : localStorage).getItem(prefix + key)) ?? fallback
    );
  } catch {
    return fallback;
  }
}
export function write(key, value, session = false) {
  try {
    (session ? sessionStorage : localStorage).setItem(prefix + key, JSON.stringify(value));
    return true;
  } catch {
    storageWarning = true;
    return false;
  }
}
export function hasStorageWarning() {
  return storageWarning;
}
export async function migrateStoredData() {
  for (const session of [false, true]) {
    let storage;
    try {
      storage = session ? sessionStorage : localStorage;
    } catch {
      storageWarning = true;
      continue;
    }
    for (const key of ['favorites', 'plans', 'activePlan', 'discovery', 'selection', 'drafts']) {
      try {
        const raw = storage.getItem(prefix + key);
        if (!raw) continue;
        const value = JSON.parse(raw),
          legacy = [];
        const collect = (item) => {
          if (!item || typeof item !== 'object') return;
          if (item.id && item.signature && ('price' in item || 'website' in item))
            legacy.push(item);
          else Object.values(item).forEach(collect);
        };
        collect(value);
        for (let i = 0; i < legacy.length; i += 80) {
          const batch = legacy.slice(i, i + 80);
          const unique = [...new Map(batch.map((place) => [place.id, place])).values()];
          try {
            const response = await fetch('/api/migrate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ places: unique }),
              signal: AbortSignal.timeout(8000)
            });
            if (!response.ok) throw new Error('Refresh required');
            const { places } = await response.json();
            const replacements = new Map(places.map((place) => [place.id, place]));
            batch.forEach((place) => {
              const replacement = replacements.get(place.id);
              if (replacement) {
                Object.keys(place).forEach((field) => delete place[field]);
                Object.assign(place, replacement);
              }
            });
          } catch {
            batch.forEach((place) => {
              delete place.signature;
              place.needsRefresh = true;
            });
          }
        }
        storage.setItem(prefix + key, JSON.stringify(cleanStored(value)));
      } catch {
        storageWarning = true;
      }
    }
  }
  saved.favorites = read('favorites', []);
  saved.plans = read('plans', []);
}
export const saved = {
  favorites: read('favorites', []),
  plans: read('plans', []),
  toggle(place) {
    const index = this.favorites.findIndex((p) => p.id === place.id);
    if (index >= 0) this.favorites.splice(index, 1);
    else this.favorites.unshift(place);
    return write('favorites', this.favorites);
  },
  savePlan(plan) {
    this.plans = [plan, ...this.plans.filter((p) => p.id !== plan.id)].slice(0, 30);
    return write('plans', this.plans);
  },
  removePlan(id) {
    this.plans = this.plans.filter((p) => p.id !== id);
    return write('plans', this.plans);
  }
};
