import { create } from 'zustand';
import { defaultSearchValues, type SearchValues } from '../lib/search';

interface SearchState extends SearchValues {
  setSearch: (values: SearchValues) => void;
}

/**
 * Shares the guest's current "date / time / party size" search criteria across the
 * home page and restaurant pages, so switching restaurants keeps the same context
 * instead of resetting the search every time.
 */
export const useSearchStore = create<SearchState>((set) => ({
  ...defaultSearchValues(),
  setSearch: (values) => set(values),
}));
