const prefix = 'roamwise:v1:';
let storageWarning = false;
export function read(key, fallback, session = false) {
  try {
    return JSON.parse((session ? sessionStorage : localStorage).getItem(prefix + key)) ?? fallback;
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
