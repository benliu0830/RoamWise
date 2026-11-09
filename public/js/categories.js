import { icon } from './icons.js';

// One primary category follows each retrieved place through every view.
export const categories = {
  landmarks: { label: 'Famous landmarks', short: 'Attractions', icon: 'landmark' },
  food: { label: 'Restaurants & food', short: 'Food', icon: 'food' },
  cafes: { label: 'Cafés', short: 'Cafés', icon: 'coffee' },
  history: { label: 'Historical sites', short: 'History', icon: 'landmark' },
  museums: { label: 'Museums & history', short: 'Museums', icon: 'museum' },
  nature: { label: 'Nature & parks', short: 'Nature', icon: 'leaf' },
  entertainment: { label: 'Entertainment', short: 'Entertainment', icon: 'ticket' },
  shopping: { label: 'Shopping', short: 'Shopping', icon: 'bag' },
  hidden: { label: 'Hidden gems', short: 'Hidden gems', icon: 'gem' }
};
export const categoryOf = (key) =>
  Object.hasOwn(categories, key) ? categories[key] : categories.hidden;
export const categoryKey = (key) => (Object.hasOwn(categories, key) ? key : 'hidden');
export function categoryBadge(key) {
  const category = categoryOf(key);
  return `<span class="category-badge category-${categoryKey(key)}">${icon(category.icon)}${category.label}</span>`;
}
