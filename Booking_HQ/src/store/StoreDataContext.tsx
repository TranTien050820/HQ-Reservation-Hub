import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { fetchBookingByPublicKey, type BookingData } from '../api/booking';

interface StoreDataContextValue {
  publicKey: string;
  data: BookingData | undefined;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}

const StoreDataContext = createContext<StoreDataContextValue | null>(null);

/**
 * Loads the full storefront payload for the :publicKey in the current route and
 * shares it with every page nested under it, so each store only ever does one
 * network round trip instead of one per section (zones, periods, etc).
 */
export function StoreDataProvider({ children }: { children: ReactNode }) {
  const { publicKey = '' } = useParams();
  const query = useQuery({
    queryKey: ['bookingData', publicKey],
    queryFn: () => fetchBookingByPublicKey(publicKey),
    enabled: publicKey.length > 0,
  });

  return (
    <StoreDataContext.Provider
      value={{
        publicKey,
        data: query.data,
        isLoading: query.isLoading,
        error: query.error,
        refetch: () => void query.refetch(),
      }}
    >
      {children}
    </StoreDataContext.Provider>
  );
}

export function useStoreData(): StoreDataContextValue {
  const ctx = useContext(StoreDataContext);
  if (!ctx) throw new Error('useStoreData must be used within a StoreDataProvider');
  return ctx;
}
