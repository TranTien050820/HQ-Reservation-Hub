/**
 * The reservation API has no image fields for stores. These curated photos stand in until
 * the backend exposes real restaurant imagery (e.g. a StoreInfo.PhotoUrl column).
 */
const GALLERY = [
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=70',
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=70',
  'https://images.unsplash.com/photo-1424847651672-bf20a4b0982b?auto=format&fit=crop&w=1200&q=70',
  'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1200&q=70',
  'https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?auto=format&fit=crop&w=1200&q=70',
  'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1200&q=70',
  'https://images.unsplash.com/photo-1551218808-94e220e084d2?auto=format&fit=crop&w=1200&q=70',
  'https://images.unsplash.com/photo-1592861956120-e524fc739696?auto=format&fit=crop&w=1200&q=70',
];

const CUISINES = [
  'Modern American',
  'Italian Trattoria',
  'Izakaya & Sushi',
  'French Bistro',
  'Wood-Fired Pizzeria',
  'Steakhouse',
  'Farm-to-Table',
  'Cocktail Lounge & Small Plates',
];

/** Deterministic pick so the same store always renders the same photo/cuisine tag. */
function pick<T>(list: T[], seed: number): T {
  return list[((seed % list.length) + list.length) % list.length];
}

export function restaurantPhoto(storeNum: number): string {
  return pick(GALLERY, storeNum);
}

export function restaurantCuisine(storeNum: number): string {
  return pick(CUISINES, storeNum + 3);
}
