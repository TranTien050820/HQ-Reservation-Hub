import { useCallback, useEffect, useState } from 'react';
import { fetchPosOpenTablenums } from '../api/posTabs';
import type { SiteScope } from '../types';

/**
 * Tables the POS currently has an open check on (PosLocal/TabInfo), shared by
 * the seating floor plan and the waitlist seat picker so neither can offer a
 * table that already has guests on it.
 *
 * Fails open: if the POS call errors the set is empty and seating keeps working
 * exactly as it did before, with `failed` set so the screen can say the POS
 * state is unknown rather than implying every table is POS-free.
 */
export function usePosOpenTables(scope: SiteScope | null | undefined) {
  const { siteId, sNum, statNum } = scope ?? {};
  const [posOpenTablenums, setPosOpenTablenums] = useState<Set<number>>(() => new Set());
  const [failed, setFailed] = useState(false);

  /** Re-reads the POS and also hands the fresh set back, so a caller re-checking at submit time doesn't have to wait for a re-render. Null means the POS couldn't be read. */
  const reload = useCallback(async (): Promise<Set<number> | null> => {
    if (siteId == null || sNum == null || statNum == null) return null;
    try {
      const open = await fetchPosOpenTablenums({ siteId, sNum, statNum });
      setPosOpenTablenums(open);
      setFailed(false);
      return open;
    } catch {
      setPosOpenTablenums(new Set());
      setFailed(true);
      return null;
    }
  }, [siteId, sNum, statNum]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { posOpenTablenums, posOpenFailed: failed, reloadPosOpenTables: reload };
}
