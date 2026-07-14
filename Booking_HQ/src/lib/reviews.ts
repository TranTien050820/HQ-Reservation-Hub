/** Lightweight client-side storage for post-visit reviews — no backend endpoint exists yet. */

const STORAGE_KEY = 'bookinghq-reviews';

export interface BookingReview {
  rating: number;
  comment: string;
  createdAt: string;
}

function readAll(): Record<number, BookingReview> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<number, BookingReview>) : {};
  } catch {
    return {};
  }
}

export function getReview(bookingId: number): BookingReview | undefined {
  return readAll()[bookingId];
}

export function saveReview(bookingId: number, review: BookingReview): void {
  const all = readAll();
  all[bookingId] = review;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}
