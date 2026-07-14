import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { fetchLinkInfoByPublicKey } from '../api/links';
import type { LinkInfo } from '../types';

interface StoreContextValue {
  publicKey: string;
  linkInfo: LinkInfo | undefined;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

/**
 * Resolves siteId/sNum/statNum/channelId for the :publicKey in the current
 * route (own reimplementation inspired by Booking_HQ's StoreDataContext, but
 * self-contained — no shared code/runtime dependency on that project).
 */
export function StoreProvider({ children }: { children: ReactNode }) {
  const { publicKey = '' } = useParams();
  const [linkInfo, setLinkInfo] = useState<LinkInfo>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!publicKey) {
      setIsLoading(false);
      setError('missing-public-key');
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchLinkInfoByPublicKey(publicKey)
      .then((info) => {
        if (!cancelled) setLinkInfo(info);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'not-found');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey, tick]);

  return (
    <StoreContext.Provider
      value={{ publicKey, linkInfo, isLoading, error, refetch: () => setTick((t) => t + 1) }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within a StoreProvider');
  return ctx;
}
