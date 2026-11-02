import { ApiError } from './http.js';

export function number(value, min, max, fallback) {
  if ((value === undefined || value === '' || value === null) && fallback !== undefined)
    return fallback;
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max)
    throw new ApiError(`Enter a number between ${min} and ${max}.`, 400);
  return result;
}
export function coordinates(value) {
  return { lat: number(value?.lat, -90, 90), lon: number(value?.lon, -180, 180) };
}
export function preferences(input = {}) {
  const interests = Array.isArray(input.interests)
    ? input.interests.filter((x) =>
        [
          'landmarks',
          'food',
          'museums',
          'nature',
          'entertainment',
          'shopping',
          'hidden',
          'free'
        ].includes(x)
      )
    : [];
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(input.startDate || '') ? input.startDate : null;
  if (
    startDate &&
    (Number.isNaN(Date.parse(startDate)) ||
      new Date(startDate).toISOString().slice(0, 10) !== startDate)
  )
    throw new ApiError('Enter a valid trip date.', 400);
  return {
    mode: input.mode === 'local' ? 'local' : 'tourist',
    days: input.mode === 'local' ? 1 : Math.floor(number(input.days, 1, 14, 2)),
    hours: number(input.hours, 1, 12, input.mode === 'local' ? 3 : 8),
    radius: number(input.radius, 500, 30000, input.mode === 'local' ? 5000 : 10000),
    dailyBudget: number(input.dailyBudget, 0, 100000, 100),
    totalBudget:
      input.totalBudget === '' || input.totalBudget == null
        ? null
        : number(input.totalBudget, 0, 1000000),
    currency: ['CAD', 'USD', 'EUR', 'GBP', 'JPY', 'AUD'].includes(input.currency)
      ? input.currency
      : 'CAD',
    transport: ['walk', 'drive', 'transit'].includes(input.transport) ? input.transport : 'walk',
    pace: ['relaxed', 'balanced', 'packed'].includes(input.pace) ? input.pace : 'balanced',
    setting: ['any', 'indoor', 'outdoor'].includes(input.setting) ? input.setting : 'any',
    interests,
    startDate
  };
}
