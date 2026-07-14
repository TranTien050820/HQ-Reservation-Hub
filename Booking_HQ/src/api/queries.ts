import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SITE_ID,
  cancelBooking,
  createBooking,
  fetchBookingsByPhone,
  fetchDateOverrides,
  fetchMenuCategories,
  fetchMenuItems,
  fetchPeriodRules,
  fetchPeriods,
  fetchStore,
  fetchStores,
  fetchZones,
} from './reservations';

export const queryKeys = {
  stores: (siteId: number) => ['stores', siteId] as const,
  store: (siteId: number, storeNum: number) => ['store', siteId, storeNum] as const,
  zones: (siteId: number) => ['zones', siteId] as const,
  periods: (siteId: number, sNum: number) => ['periods', siteId, sNum] as const,
  periodRules: (siteId: number, sNum: number) => ['periodRules', siteId, sNum] as const,
  dateOverrides: (siteId: number, sNum: number) => ['dateOverrides', siteId, sNum] as const,
  bookingsByPhone: (phone: string, siteId?: number, sNum?: number) =>
    ['bookings', 'byPhone', phone, siteId, sNum] as const,
  menuCategories: (siteId: number, sNum: number) => ['menuCategories', siteId, sNum] as const,
  menuItems: (siteId: number, sNum: number) => ['menuItems', siteId, sNum] as const,
};

export function useStores(siteId: number = SITE_ID) {
  return useQuery({ queryKey: queryKeys.stores(siteId), queryFn: () => fetchStores(siteId) });
}

export function useStore(siteId: number, storeNum: number) {
  return useQuery({
    queryKey: queryKeys.store(siteId, storeNum),
    queryFn: () => fetchStore(siteId, storeNum),
    enabled: Number.isFinite(storeNum) && storeNum > 0,
  });
}

export function useZones(siteId: number = SITE_ID) {
  return useQuery({ queryKey: queryKeys.zones(siteId), queryFn: () => fetchZones(siteId) });
}

export function usePeriods(siteId: number, sNum: number) {
  return useQuery({
    queryKey: queryKeys.periods(siteId, sNum),
    queryFn: () => fetchPeriods(siteId, sNum),
    enabled: Number.isFinite(sNum) && sNum > 0,
  });
}

export function usePeriodRules(siteId: number, sNum: number) {
  return useQuery({
    queryKey: queryKeys.periodRules(siteId, sNum),
    queryFn: () => fetchPeriodRules(siteId, sNum),
    enabled: Number.isFinite(sNum) && sNum > 0,
  });
}

export function useDateOverrides(siteId: number, sNum: number) {
  return useQuery({
    queryKey: queryKeys.dateOverrides(siteId, sNum),
    queryFn: () => fetchDateOverrides(siteId, sNum),
    enabled: Number.isFinite(sNum) && sNum > 0,
  });
}

/** Bundles a store's zones/periods/rules/overrides — the data a restaurant page needs to render availability. */
export function useRestaurantAvailability(siteId: number, storeNum: number) {
  const store = useStore(siteId, storeNum);
  const zones = useZones(siteId);
  const periods = usePeriods(siteId, storeNum);
  const rules = usePeriodRules(siteId, storeNum);
  const overrides = useDateOverrides(siteId, storeNum);

  return {
    store: store.data ?? null,
    zones: (zones.data ?? []).filter((zone) => zone.sNum === storeNum),
    periods: periods.data ?? [],
    rules: rules.data ?? [],
    overrides: overrides.data ?? [],
    isLoading: store.isLoading || zones.isLoading || periods.isLoading || rules.isLoading || overrides.isLoading,
    error: store.error ?? zones.error ?? periods.error ?? rules.error ?? overrides.error ?? null,
    refetch: () => {
      void store.refetch();
      void zones.refetch();
      void periods.refetch();
      void rules.refetch();
      void overrides.refetch();
    },
  };
}

export function useMenuCategories(siteId: number, sNum: number) {
  return useQuery({
    queryKey: queryKeys.menuCategories(siteId, sNum),
    queryFn: () => fetchMenuCategories(siteId, sNum),
    enabled: Number.isFinite(sNum) && sNum > 0,
  });
}

export function useMenuItems(siteId: number, sNum: number) {
  return useQuery({
    queryKey: queryKeys.menuItems(siteId, sNum),
    queryFn: () => fetchMenuItems(siteId, sNum),
    enabled: Number.isFinite(sNum) && sNum > 0,
  });
}

/** Bundles a store's menu categories + items for the menu page and restaurant highlights. */
export function useMenu(siteId: number, sNum: number) {
  const categories = useMenuCategories(siteId, sNum);
  const items = useMenuItems(siteId, sNum);

  return {
    categories: categories.data ?? [],
    items: items.data ?? [],
    isLoading: categories.isLoading || items.isLoading,
    error: categories.error ?? items.error ?? null,
  };
}

export function useBookingsByPhone(phone: string, siteId?: number, sNum?: number) {
  const trimmed = phone.trim();
  return useQuery({
    queryKey: queryKeys.bookingsByPhone(trimmed, siteId, sNum),
    queryFn: () => fetchBookingsByPhone(trimmed, siteId, sNum),
    enabled: false,
  });
}

export function useCreateBooking() {
  return useMutation({ mutationFn: createBooking });
}

export function useCancelBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cancelBooking,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings', 'byPhone'] });
    },
  });
}
