import { todayDateString } from './slots';

export interface SearchValues {
  date: string;
  partySize: number;
}

export function defaultSearchValues(): SearchValues {
  return { date: todayDateString(), partySize: 2 };
}
