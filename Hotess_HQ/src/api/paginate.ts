import type { PagedResult } from '../types';

/** Server page size. Large enough that a normal day is a single round trip. */
export const DEFAULT_PAGE_SIZE = 200;

/**
 * Backstop against a runaway loop if the backend ever reports a totalRecords it
 * never delivers. 25 x 200 = 5000 rows, far past any single day's volume.
 */
const MAX_PAGES = 25;

export interface AllPagesResult<T> {
  items: T[];
  totalRecords: number;
  /** True when MAX_PAGES was hit before every row was fetched — never truncate silently. */
  truncated: boolean;
}

/**
 * Walks a paged endpoint until every matching row is in hand.
 *
 * Screens that count or filter client-side need the whole set, and asking for
 * one big page instead just moves the truncation somewhere less visible: a
 * store with a thousand rows in a day would quietly lose everything past the
 * first page.
 */
export async function fetchAllPages<T>(
  fetchPage: (pageIndex: number, pageSize: number) => Promise<PagedResult<T>>,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<AllPagesResult<T>> {
  const first = await fetchPage(1, pageSize);
  const items = [...first.items];
  const totalRecords = first.totalRecords ?? items.length;

  // totalPages can be absent or wrong; derive our own bound and stop as soon as
  // a page comes back empty so a bad count can't spin us forever.
  const lastPage = Math.min(Math.max(1, Math.ceil(totalRecords / pageSize)), MAX_PAGES);

  for (let pageIndex = 2; pageIndex <= lastPage; pageIndex++) {
    const page = await fetchPage(pageIndex, pageSize);
    if (page.items.length === 0) break;
    items.push(...page.items);
  }

  return { items, totalRecords, truncated: items.length < totalRecords };
}
