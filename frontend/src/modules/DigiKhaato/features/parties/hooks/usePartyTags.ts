'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { selectNetworkImpaired } from 'src/redux/slice/networkSlice';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  selectPartyTagError,
  selectPartyTags,
  selectPartyTagsLoaded,
  selectPartyTagsStale,
  selectPartyTagStatus,
} from '../redux/partyTagSlice';
import { fetchPartyTags } from '../redux/partyTagThunk';

import type { PartyTagWithCount } from '../types/party.types';

export interface UsePartyTagsResult {
  readonly tags: readonly PartyTagWithCount[];
  /** Most-used first, then alphabetical — FR-5's picker order. */
  readonly byUsage: readonly PartyTagWithCount[];
  readonly byName: (name: string) => PartyTagWithCount | undefined;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  readonly isLoading: boolean;
  readonly refetch: () => void;
}

/**
 * PTY-05 — the tenant's tags, for every screen that needs to name one.
 *
 * ── Why the fetch is unconditional here and guarded in the thunk ────────────
 * Four screens call this hook, and three of them are mounted at once on a
 * desktop: the list's filter, the form drawer over it, and the bulk dialog over
 * that. Guarding in each caller would be three copies of the same `if`, and the
 * one that got it wrong would be invisible — an extra request is not a bug
 * anybody notices. The thunk's `condition` is the single place that decides,
 * and it decides once for everybody (§19.3.5).
 *
 * `force` is the manager's, because there the counts are the CONTENT rather
 * than a hint: "Camp Area · 34" is the number a merchant is about to make a
 * delete decision on.
 */
export function usePartyTags(options: { readonly force?: boolean } = {}): UsePartyTagsResult {
  const dispatch = useAppDispatch();
  const tags = useAppSelector(selectPartyTags);
  const status = useAppSelector(selectPartyTagStatus);
  const error = useAppSelector(selectPartyTagError);
  const loaded = useAppSelector(selectPartyTagsLoaded);
  const stale = useAppSelector(selectPartyTagsStale);
  const isImpaired = useAppSelector(selectNetworkImpaired);
  const { force } = options;

  useEffect(() => {
    const promise = dispatch(fetchPartyTags(force ? { force: true } : undefined));
    return () => promise.abort();
  }, [dispatch, force]);

  /* Marked stale by a bulk tag, which moved counts this slice does not compute.
     Not while the link is impaired: the picker already has every NAME it needs
     and only the counts beside them are out of date, so this must not compete
     with the request the merchant is actually waiting for. */
  useEffect(() => {
    if (!stale || isImpaired) return;
    const promise = dispatch(fetchPartyTags({ force: true }));
    return () => promise.abort();
  }, [stale, isImpaired, dispatch]);

  /**
   * FR-5 — the twenty most-used first when the query is empty, because a
   * merchant reaching for a tag is overwhelmingly reaching for one they already
   * use. Alphabetical within a count, so the order is stable rather than
   * whatever the server's scan happened to produce, and so two tags on eleven
   * parties do not swap places between renders.
   */
  const byUsage = useMemo(
    () =>
      [...tags].sort(
        (left, right) =>
          right.partyCount - left.partyCount ||
          left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
      ),
    [tags]
  );

  const index = useMemo(() => {
    const map = new Map<string, PartyTagWithCount>();
    /* Keyed by the FOLDED name, because the server's uniqueness is
       case-insensitive: a filter carrying "camp area" in the URL has to find
       the tag the merchant created as "Camp Area", or the chip renders with the
       wrong casing beside a list that filtered correctly. */
    for (const tag of tags) map.set(tag.name.trim().toLocaleLowerCase(), tag);
    return map;
  }, [tags]);

  const byName = useCallback(
    (name: string) => index.get(name.trim().toLocaleLowerCase()),
    [index]
  );

  const refetch = useCallback(() => {
    void dispatch(fetchPartyTags({ force: true }));
  }, [dispatch]);

  return {
    tags,
    byUsage,
    byName,
    status,
    error,
    /* `loaded` and not `status === 'loading'`: a picker that has never been
       filled is loading even in the instant before the request leaves, and a
       spinner that appears one frame late reads as a flash. */
    isLoading: !loaded && status !== 'failed',
    refetch,
  };
}
