import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { fetchLinkInfoByPublicKey } from '../api/links';
import { fetchStoreInfo, type StoreInfoSummary } from '../api/storeInfo';
import type { LinkInfo } from '../types';

interface StoreContextValue {
  publicKey: string;
  linkInfo: LinkInfo | undefined;
  /**
   * Which outlet this link belongs to, for the booking slip (`H-03`) — from the link config
   * when the store filled in its branding, otherwise from the POS store record.
   *
   * Kept OUT of `linkInfo` deliberately. Half the app hangs effects off `[linkInfo]` (the
   * door counters, the pre-order sweep, the POS tab poll), so folding a late-arriving name
   * into that object would re-fire every one of them a second time to print one row on one
   * modal. As its own value it re-renders only what reads it.
   */
  storeName: string | null;
  storeAddress: string | null;
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
  /** Only ever filled when the link config came back without a store name. */
  const [storeInfo, setStoreInfo] = useState<StoreInfoSummary | null>(null);
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

    /**
     * The outlet name goes on every booking slip (H-03). Stores that filled in their
     * reservation branding already sent it with the config above; only the ones that did
     * not pay for this call, and they pay for it once per mount rather than once per slip.
     */
    const backfillStoreName = async (info: LinkInfo) => {
      try {
        const store = await fetchStoreInfo(info.siteId, info.sNum);
        if (!cancelled && store?.storeName) setStoreInfo(store);
      } catch {
        // A nameless outlet line is a missing row on a slip, not a broken store — every
        // other screen still has to work.
      }
    };

    fetchLinkInfoByPublicKey(publicKey)
      .then((info) => {
        if (cancelled) return;
        setLinkInfo(info);
        setStoreInfo(null);
        // Detached on purpose: the app is usable the moment the config lands, and the
        // outlet name is one row on a slip. Awaiting it here would hold every screen behind
        // a secondary request.
        if (!info.storeName) void backfillStoreName(info);
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
      value={{
        publicKey,
        linkInfo,
        storeName: linkInfo?.storeName ?? storeInfo?.storeName ?? null,
        storeAddress: linkInfo?.address ?? storeInfo?.address ?? null,
        isLoading,
        error,
        refetch: () => setTick((t) => t + 1),
      }}
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
