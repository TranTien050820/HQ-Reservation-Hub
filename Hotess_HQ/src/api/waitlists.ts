import { http, assertArray } from './http';
import type { ApiEnvelope, ReservationWaitlist, CreateWaitlistRequest, SiteScope } from '../types';
import { mockWaitlists, nextMockId } from './mockData';

export async function fetchWaitlists(scope: SiteScope): Promise<ReservationWaitlist[]> {
  try {
    const res = await http.get<ApiEnvelope<ReservationWaitlist[]>>('/api/ReservationWaitlists', {
      params: { SiteId: scope.siteId, SNum: scope.sNum, StatNum: scope.statNum },
    });
    return assertArray<ReservationWaitlist>(res.data.data);
  } catch (err) {
    console.warn('[waitlists] API unavailable, using mock fallback', err);
    return mockWaitlists.filter((w) => w.siteId === scope.siteId);
  }
}

export async function createWaitlist(payload: CreateWaitlistRequest): Promise<ReservationWaitlist> {
  try {
    const res = await http.post<ApiEnvelope<ReservationWaitlist>>('/api/ReservationWaitlists', payload);
    return res.data.data;
  } catch (err) {
    console.warn('[waitlists] create API unavailable, using mock fallback', err);
    const w: ReservationWaitlist = {
      waitlistId: nextMockId(),
      name: payload.name,
      phone: payload.phone,
      numOfGuest: payload.numOfGuest,
      zoneId: payload.zoneId,
      notes: payload.notes,
      isVip: payload.isVip,
      status: 0,
      createdDate: new Date().toISOString(),
      siteId: payload.siteId,
    };
    mockWaitlists.push(w);
    return w;
  }
}

export async function updateWaitlist(
  waitlistId: number,
  patch: Partial<ReservationWaitlist>,
): Promise<ReservationWaitlist> {
  try {
    const res = await http.put<ApiEnvelope<ReservationWaitlist>>('/api/ReservationWaitlists', {
      waitlistId,
      ...patch,
    });
    return res.data.data;
  } catch (err) {
    console.warn('[waitlists] update API unavailable, using mock fallback', err);
    const idx = mockWaitlists.findIndex((w) => w.waitlistId === waitlistId);
    if (idx === -1) throw new Error('Waitlist entry not found (mock)');
    mockWaitlists[idx] = { ...mockWaitlists[idx], ...patch };
    return mockWaitlists[idx];
  }
}
