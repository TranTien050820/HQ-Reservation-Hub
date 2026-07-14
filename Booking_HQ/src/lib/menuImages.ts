/** Curated food photos used when a menu item has no photoUrl of its own. */
const GALLERY = [
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=70',
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=70',
  'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=800&q=70',
  'https://images.unsplash.com/photo-1432139509613-5c4255815697?auto=format&fit=crop&w=800&q=70',
  'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=800&q=70',
  'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=800&q=70',
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=800&q=70',
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=70',
  'https://images.unsplash.com/photo-1481931098730-318b6f776db0?auto=format&fit=crop&w=800&q=70',
  'https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=800&q=70',
  'https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?auto=format&fit=crop&w=800&q=70',
  'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=800&q=70',
];

/** Deterministic pick so the same item always renders the same placeholder photo. */
export function menuItemPhoto(itemId: number): string {
  return GALLERY[((itemId % GALLERY.length) + GALLERY.length) % GALLERY.length];
}
