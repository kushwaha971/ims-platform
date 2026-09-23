'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { selectNetworkImpaired } from 'src/redux/slice/networkSlice';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  partyDetailOpened,
  selectCollectionStatus,
  selectPartyCredit,
  selectPartyDetail,
  selectPartyDetailError,
  selectPartyDetailStale,
  selectPartyDetailStatus,
  selectPartySummary,
} from '../redux/partyDetailSlice';
import { fetchPartyDetail, saveCollectionDate } from '../redux/partyDetailThunk';
import { selectPartyRows } from '../redux/partyListSlice';

import type { Party, PartyCredit, PartyDetail, PartySummary } from '../types/party.types';

export interface UsePartyDetailResult {
  readonly party: PartyDetail | null;
  /**
   * The row the LIST already has for this party, when the merchant came from
   * there. Enough to paint the name and the balance while the detail request
   * is in flight — FR-1's "no header skeleton for a navigated-from-list entry".
   */
  readonly cachedRow: Party | null;
  readonly summary: PartySummary | null;
  readonly credit: PartyCredit | null;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  readonly isLoading: boolean;
  /** The party fetch came back 404 — a different screen from a failure. */
  readonly notFound: boolean;
  readonly isArchived: boolean;
  readonly collectionStatus: RequestStatus;
  readonly setCollectionDate: (date: string | null) => void;
  readonly refetch: () => void;
}

/**
 * Part 19 §19.1.1 layer 4 — the khata page's only door to Redux.
 *
 * ── The cached row is the whole of FR-1 ─────────────────────────────────────
 * "When the user arrived from PTY-02, the cached row renders the header
 * instantly (name + balance) while both requests are in flight — no header
 * skeleton for a navigated-from-list entry."
 *
 * The list's rows are already in the store; the party being opened is one of
 * them. Reading it is a lookup in an array of at most 100, not a cache with a
 * lifetime, an eviction policy and a staleness question of its own — and it is
 * correct by construction, because those rows came from the same server on the
 * same screen a moment ago. When the merchant arrived from a notification or a
 * pasted URL the list is empty and this is `null`, which is exactly when a
 * skeleton IS the right answer.
 */
export function usePartyDetail(id: string): UsePartyDetailResult {
  const dispatch = useAppDispatch();

  const party = useAppSelector(selectPartyDetail);
  const summary = useAppSelector(selectPartySummary);
  const credit = useAppSelector(selectPartyCredit);
  const status = useAppSelector(selectPartyDetailStatus);
  const error = useAppSelector(selectPartyDetailError);
  const stale = useAppSelector(selectPartyDetailStale);
  const collectionStatus = useAppSelector(selectCollectionStatus);
  const rows = useAppSelector(selectPartyRows);
  const isImpaired = useAppSelector(selectNetworkImpaired);

  const cachedRow = useMemo(() => rows.find((row) => row.id === id) ?? null, [rows, id]);

  /* Announce which party the page is for BEFORE the fetch, so the slice can
     drop the previous party's data and reject a late response for it. Without
     this the store briefly holds one party's name above another's balance. */
  useEffect(() => {
    dispatch(partyDetailOpened(id));
  }, [dispatch, id]);

  useEffect(() => {
    const promise = dispatch(fetchPartyDetail(id));
    return () => promise.abort();
  }, [dispatch, id]);

  /* A mutation elsewhere marked us stale — refetch once, silently, and not
     while the link is impaired. Same judgement as the list: the page is already
     painted, the merchant asked for nothing, and on a degraded connection this
     would compete with a request they ARE waiting for. `isImpaired` is a
     dependency, so the refresh happens the moment the link recovers. */
  useEffect(() => {
    if (!stale || isImpaired) return;
    const promise = dispatch(fetchPartyDetail(id));
    return () => promise.abort();
  }, [stale, isImpaired, dispatch, id]);

  const setCollectionDate = useCallback(
    (date: string | null) => {
      void dispatch(saveCollectionDate({ id, collectionDate: date }));
    },
    [dispatch, id]
  );

  const refetch = useCallback(() => {
    void dispatch(fetchPartyDetail(id));
  }, [dispatch, id]);

  return {
    party,
    cachedRow,
    summary,
    credit,
    status,
    error,
    /* Not `status === 'loading'`: with a cached row there is a header on
       screen, and the page must not paint a skeleton over something the
       merchant can already read. */
    isLoading: status === 'loading' && party === null && cachedRow === null,
    /* A 404 is not a failure to be retried, it is a different screen. Retrying
       an id that does not exist is a button that cannot work, and offering it
       is worse than saying plainly that the party is not there. */
    notFound: status === 'failed' && error?.status === 404,
    isArchived: (party ?? cachedRow)?.status === 'archived',
    collectionStatus,
    setCollectionDate,
    refetch,
  };
}
