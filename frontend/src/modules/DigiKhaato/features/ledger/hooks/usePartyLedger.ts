'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectNetworkImpaired } from 'src/redux/slice/networkSlice';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { timelineRefreshLimit } from '../constants/timelinePaging';
import {
  correctionsVisibilityToggled,
  ledgerTimelineOpened,
  selectLedgerCursor,
  selectLedgerEntries,
  selectLedgerError,
  selectLedgerHasMore,
  selectLedgerMoreStatus,
  selectLedgerStale,
  selectLedgerStaleSeq,
  selectLedgerStatus,
  selectLedgerSummary,
  selectShowCorrections,
} from '../redux/ledgerEntrySlice';
import { fetchPartyEntries } from '../redux/ledgerEntryThunk';
import { groupByDay, supersededIds, type EntryDayGroup } from '../view-model/entryDisplay';

import type { LedgerSummary } from '../types/ledger.types';

/**
 * Part 19 §19.4 — the khata timeline's only door to Redux.
 *
 * The grouping is done here rather than in the component and memoised on the
 * rows, because it runs on every render of a list that can be hundreds of rows
 * and the answer only changes when the rows do.
 */
export interface UsePartyLedgerResult {
  readonly groups: readonly EntryDayGroup[];
  readonly summary: LedgerSummary | null;
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;
  readonly isLoadingMore: boolean;
  readonly hasMore: boolean;
  readonly isEmpty: boolean;
  readonly canRead: boolean;
  readonly error: ApiErrorShape | null;
  readonly status: RequestStatus;
  readonly loadMore: () => void;
  readonly refetch: () => void;
  /** LED-03 FR-7 — is the struck-through history on screen? */
  readonly showCorrections: boolean;
  readonly toggleCorrections: (next: boolean) => void;
  /**
   * The ids of rows some other loaded row replaced.
   *
   * Computed once over the page rather than per row: a replacement names what
   * it supersedes, so this is one pass, and the alternative is every row
   * scanning the whole list to find out whether it was corrected.
   */
  readonly superseded: ReadonlySet<string>;
}

export const usePartyLedger = (partyId: string): UsePartyLedgerResult => {
  const dispatch = useAppDispatch();
  const { can, hasModule } = usePermissions();
  const rows = useAppSelector(selectLedgerEntries);
  const summary = useAppSelector(selectLedgerSummary);
  const status = useAppSelector(selectLedgerStatus);
  const moreStatus = useAppSelector(selectLedgerMoreStatus);
  const error = useAppSelector(selectLedgerError);
  const hasMore = useAppSelector(selectLedgerHasMore);
  const cursor = useAppSelector(selectLedgerCursor);
  const stale = useAppSelector(selectLedgerStale);
  const staleSeq = useAppSelector(selectLedgerStaleSeq);
  const showCorrections = useAppSelector(selectShowCorrections);
  const isImpaired = useAppSelector(selectNetworkImpaired);

  /* A module the tenant has not enabled does not exist, so the whole card is
     absent rather than empty — and the request is never made, because a 403 the
     client could have predicted is a 403 the merchant sees as a broken page. */
  const canRead = hasModule('ledger') && can('ledger.entry.read');

  // Announce which party this is BEFORE fetching, so a late page for the
  // previous one has something to be compared against and discarded.
  useEffect(() => {
    if (!canRead) return;
    dispatch(ledgerTimelineOpened(partyId));
  }, [dispatch, partyId, canRead]);

  /* `showCorrections` is a DEPENDENCY of the first-page fetch rather than
     something a handler refetches on the side, and that is what keeps the
     switch and the rows in step: flipping it re-runs this effect, the previous
     request is aborted by the cleanup, and the rows that arrive are the rows
     the switch is now claiming. A handler that fired its own request would
     leave the two to race, and on a slow connection the loser decides. */
  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchPartyEntries({ partyId, includeReversed: showCorrections }));
    return () => promise.abort();
  }, [dispatch, partyId, canRead, showCorrections]);

  /* The silent refresh the invalidation listener asks for. Skipped while the
     network is impaired: a background request on a connection that is already
     failing turns one visible error into two.

     NEW-2 made this the path every write takes, because the totals above the
     rows are the server's (`meta.summary`) and a write changes them. Two things
     follow. It re-reads at the DEPTH already loaded (`refreshLimit`), so a
     merchant three pages down is not dropped back to one by a refresh that was
     about two figures. And `staleSeq` re-fires it on every write, so a second
     entry while the first refresh is in flight aborts that one and asks again
     — the slice drops a page requested before the last write in any case. */
  const refreshLimit = timelineRefreshLimit(rows.length);
  useEffect(() => {
    if (!stale || isImpaired || !canRead) return undefined;
    const promise = dispatch(
      fetchPartyEntries({ partyId, includeReversed: showCorrections, limit: refreshLimit })
    );
    return () => promise.abort();
  }, [stale, staleSeq, isImpaired, canRead, dispatch, partyId, showCorrections, refreshLimit]);

  /* `void` on both: the dispatch returns a promise that resolves whether the
     request succeeded or failed, and there is nothing here to do with it. The
     failure has already reached the snackbar through the interceptor and the
     slice has already recorded it. Awaiting would only make the callback async
     for no caller's benefit. */
  const loadMore = useCallback(() => {
    if (!hasMore || !cursor || moreStatus === 'loading') return;
    void dispatch(fetchPartyEntries({ partyId, cursor, includeReversed: showCorrections }));
  }, [dispatch, partyId, hasMore, cursor, moreStatus, showCorrections]);

  const refetch = useCallback(() => {
    void dispatch(fetchPartyEntries({ partyId, includeReversed: showCorrections }));
  }, [dispatch, partyId, showCorrections]);

  const toggleCorrections = useCallback(
    (next: boolean) => {
      dispatch(correctionsVisibilityToggled(next));
    },
    [dispatch]
  );

  const groups = useMemo(() => groupByDay(rows), [rows]);
  const superseded = useMemo(() => supersededIds(rows), [rows]);

  return useMemo(
    () => ({
      groups,
      summary,
      // The skeleton only on a FIRST load. A refresh behind rows that are
      // already on screen must not replace them — the merchant is reading them.
      isLoading: status === 'loading' && rows.length === 0,
      isRefreshing: status === 'refreshing',
      isLoadingMore: moreStatus === 'loading',
      hasMore,
      isEmpty: rows.length === 0 && status === 'succeeded',
      canRead,
      error,
      status,
      loadMore,
      refetch,
      showCorrections,
      toggleCorrections,
      superseded,
    }),
    [
      groups,
      summary,
      status,
      moreStatus,
      hasMore,
      rows.length,
      canRead,
      error,
      loadMore,
      refetch,
      showCorrections,
      toggleCorrections,
      superseded,
    ]
  );
};
