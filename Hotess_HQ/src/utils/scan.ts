/**
 * The booking code inside whatever a QR actually contained (`H-02`).
 *
 * Channels do not agree on what to encode. Some print the bare reservation number, others
 * print the link the guest tapped to book — `https://…/booking/1596210578`, or the same code
 * as a `?rsv=` parameter. Feeding the whole URL to `searchBookings` finds nothing, and the
 * hostess is left holding a slip the app says does not exist.
 *
 * Everything that is not a URL comes back untouched: a bare code is already the answer, and
 * guessing further would break the codes that work today.
 */
export function normalizeScan(raw: string): string {
  const text = raw.trim();
  if (!text) return text;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return text; // not a URL ⇒ already a bare code
  }

  // An explicit parameter beats a path guess: a channel that names the code has said which
  // part of its own URL is the code.
  for (const key of ['rsv', 'reservationNo', 'code']) {
    const value = url.searchParams.get(key)?.trim();
    if (value) return value;
  }

  // Otherwise the last path segment, which is where every booking link this app has seen
  // puts it. `filter(Boolean)` drops the empty segment a trailing slash leaves behind.
  const lastSegment = url.pathname.split('/').filter(Boolean).pop();
  return lastSegment ? decodeURIComponent(lastSegment) : text;
}
