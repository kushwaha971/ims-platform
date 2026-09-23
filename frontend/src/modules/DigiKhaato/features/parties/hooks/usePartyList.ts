'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { SEARCH_DEBOUNCE_MS } from 'src/constants';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDebounce } from 'src/hooks/useDebounce';
import { selectNetworkImpaired } from 'src/redux/slice/networkSlice';
import type { ApiErrorShape, PageMeta, RequestStatus } from 'src/types/api.types';

import {
  DEFAULT_PARTY_FILTERS,
  filtersChanged,
  filtersCleared,
  pageChanged,
  selectionChanged,
  selectPartyFilters,
  selectPartyListError,
  selectPartyListMeta,
  selectPartyListStale,
  selectPartyListStatus,
  selectPartyListTotals,
  selectPartyListTotalsScope,
  selectPartyOverLimit,
  selectPartyRows,
  selectPartySelection,
} from '../redux/partyListSlice';
import { fetchPartyList } from '../redux/partyListThunk';
import { abortWarmPartyList, claimWarmPartyList } from '../redux/partyListWarmup';
import { partyTotals } from '../view-model/partyDisplay';

import { usePartyListUrl } from './usePartyListUrl';

import type { PartyBalanceFilter } from '../constants/partyFilters';
import type { Party, PartyListFilters } from '../types/party.types';
import type { PartyListTotals } from '../view-model/partyDisplay';


export interface UsePartyListResult {
  readonly rows: readonly Party[];
  readonly meta: PageMeta;
  readonly filters: PartyListFilters;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  /** The two header figures, and which set they describe. */
  readonly totals: PartyListTotals;
  readonly totalsScope: 'filtered' | 'page';
  /** PTY-06 FR-12 — how many matched parties are over their limit, or null. */
  readonly overLimit: number | null;
  readonly selectedIds: readonly string[];
  readonly setSelectedIds: (ids: readonly string[]) => void;
  /** Sorting is SERVER-side: it changes `ordering` and resets to page 1. */
  readonly setOrdering: (ordering: string) => void;
  readonly searchInput: string;
  readonly setSearchInput: (value: string) => void;
  readonly setFilters: (patch: Partial<PartyListFilters>) => void;
  readonly setPage: (page: number, pageSize?: number) => void;
  readonly clearFilters: () => void;
  readonly refetch: () => void;
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;
  /** Any narrowing at all is applied — the search box or any of the chips. */
  readonly isFiltered: boolean;
  /** How many, for the "Clear filters (2)" affordance (§19.3.4's example). */
  readonly activeFilterCount: number;
  /** Applies a balance filter, or clears it when it is already the one applied. */
  readonly toggleBalance: (value: PartyBalanceFilter) => void;
}

/**
 * Part 19 §19.1.1 layer 4 — the only place a component touches Redux for this
 * screen. It binds React to the store: selectors in, a thunk out, memoised
 * handlers back, and a plain typed result object (R-H-1, R-H-2). No JSX.
 */
export function usePartyList(mode: 'replace' | 'append' = 'replace'): UsePartyListResult {
  const dispatch = useAppDispatch();

  const rows = useAppSelector(selectPartyRows);
  const meta = useAppSelector(selectPartyListMeta);
  const filters = useAppSelector(selectPartyFilters);
  const status = useAppSelector(selectPartyListStatus);
  const error = useAppSelector(selectPartyListError);
  const stale = useAppSelector(selectPartyListStale);
  const serverTotals = useAppSelector(selectPartyListTotals);
  const totalsScope = useAppSelector(selectPartyListTotalsScope);
  const overLimit = useAppSelector(selectPartyOverLimit);

  /**
   * The page-sum fallback, computed HERE rather than in the reducer.
   *
   * `partyTotals()` reaches `utils/money`, which is `decimal.js-light`, and a
   * slice `store.ts` registers statically lives in the app shell (§19.3.9) —
   * so summing in the reducer put an 11 KB money library on `/legal/terms`,
   * `/login` and every other route that will never show a rupee. Measured
   * saving: app shell 101.1 -> 94.4 KB gz, which is more than three feature
   * slices' worth, for a computation that belongs on the screen anyway.
   *
   * `totalsScope` still says which of the two the header is showing, because a
   * merchant told "₹2,40,000 receivable" has to know whether that is their book
   * or the twenty-five rows in front of them.
   */
  const totals = useMemo(
    () => serverTotals ?? partyTotals(rows),
    [serverTotals, rows]
  );
  const selectedIds = useAppSelector(selectPartySelection);
  const isImpaired = useAppSelector(selectNetworkImpaired);

  // The raw input is local; only the debounced value is committed to the slice,
  // so every keystroke does not produce a request or a store write (§19.3.1).
  const [searchInput, setSearchInput] = useState(filters.q);
  const debouncedSearch = useDebounce(searchInput, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    /* Only once the debounce has CAUGHT UP with the box.
     *
     * `debouncedSearch` trails `searchInput` by the debounce, so for a few
     * hundred milliseconds after any change it holds the previous value. That
     * was harmless while the box was the only writer. It stopped being harmless
     * when the URL became a second one: a link carrying `?q=ramesh` seeded the
     * slice and the box, and this effect then committed the stale empty
     * `debouncedSearch` straight back over it — the list filtered correctly for
     * one frame and then unfiltered itself, with "ramesh" still sitting in the
     * search field.
     *
     * The guard also fixes the pre-existing version of the same race: a
     * merchant who typed and then hit "Clear filters" within the debounce
     * window had their cleared search re-applied a moment later. */
    if (debouncedSearch !== searchInput) return;
    const committed = debouncedSearch.trim();
    if (committed !== filters.q) dispatch(filtersChanged({ q: committed }));
  }, [debouncedSearch, searchInput, filters.q, dispatch]);

  /**
   * A `q` that arrived from the URL has to appear in the SEARCH BOX.
   *
   * The effect above commits the box into the slice; this is the other
   * direction, and it exists only for the seed and for "Clear filters".
   * Without it a link carrying `?q=ramesh` filtered the list correctly over an
   * EMPTY search field, so the merchant could see neither what was applied nor
   * how to clear it — and the first keystroke would have silently replaced a
   * filter they did not know was there.
   *
   * Adjusted DURING RENDER rather than in an effect, on a change of `filters.q`
   * that this component did not cause. An effect here is a build failure
   * (`react-hooks/set-state-in-effect`) and would also paint one frame of the
   * stale box. `lastAppliedQ` is what makes "did I cause this" answerable: the
   * box writes to the slice through the debounce, so seeing a `q` we have not
   * recorded means somebody else set it.
   */
  const [lastAppliedQ, setLastAppliedQ] = useState(filters.q);
  if (filters.q !== lastAppliedQ) {
    setLastAppliedQ(filters.q);
    if (filters.q !== searchInput.trim()) setSearchInput(filters.q);
  }

  // One effect, one request. The promise is aborted when the filter set changes
  // mid-flight so a slow page 1 can never overwrite a fast page 2.
  //
  // On the FIRST mount the request has usually already left the device:
  // `AppRouteWarmup` starts it above `RequireSession` so it overlaps
  // `GET /auth/me` instead of queueing behind it (see `partyListWarmup.ts`).
  // Claiming it takes over that exact request — abort handle included — rather
  // than issuing a second identical GET.
  useEffect(() => {
    const arg = { params: filters, mode };
    // Claimed: the warm-up owns that request's lifetime, so there is nothing to
    // dispatch and nothing to abort here. Not claimed: this is something the
    // warm-up did not predict, so anything still speculating is superseded
    // before the real request goes out.
    if (claimWarmPartyList(arg)) return undefined;
    abortWarmPartyList();
    const promise = dispatch(fetchPartyList(arg));
    return () => promise.abort();
  }, [dispatch, filters, mode]);

  // A mutation elsewhere marked us stale — refetch once, silently (§19.3.6).
  //
  // Not while the link is impaired. This is the one fetch on this screen that
  // is genuinely NON-CRITICAL: the rows are already painted, the merchant asked
  // for nothing, and the only thing at stake is that a figure changed in
  // another tab. On a degraded connection it would compete with the request the
  // merchant IS waiting for, so it waits — `isImpaired` is a dependency, so the
  // moment the state returns to `online` this effect re-runs and the refresh
  // happens then. §19.10.3's model is supposed to make the application do less
  // when the pipe is the scarce thing; this is one of the two places it now
  // actually does.
  useEffect(() => {
    if (!stale || isImpaired) return;
    const promise = dispatch(fetchPartyList({ params: filters, mode: 'replace' }));
    return () => promise.abort();
  }, [stale, isImpaired, dispatch, filters]);

  /**
   * Every narrowing the merchant has applied, counted.
   *
   * `isFiltered` was `filters.q.length > 0`, and it decides which EMPTY STATE
   * the grid shows. So a merchant with three hundred parties who tapped
   * "Settled" and had none was told "No customers yet — add the first person
   * you give udhaar to", with a button to create one, on a book full of them.
   * The state was right about the rows and wrong about the reason, which is
   * the only thing an empty state is for.
   *
   * `status` is excluded on purpose. It always has a value, so counting it
   * would make the list permanently "filtered" and the first-use empty state
   * unreachable — a brand-new tenant would be told to clear filters they never
   * set.
   *
   * PTY-05's `tag` is counted here for exactly the reason the comment above
   * exists. A merchant who filters to "Camp Area" and finds nobody would
   * otherwise be shown the first-use empty state — "No customers yet, add the
   * first person you give udhaar to" — on a book with three hundred parties in
   * it, and no Clear affordance to get back out.
   */
  const activeFilterCount = useMemo(
    () =>
      [
        filters.q,
        filters.type,
        filters.balance,
        filters.collection,
        filters.tag,
        filters.credit,
      ].filter(Boolean).length,
    [
      filters.q,
      filters.type,
      filters.balance,
      filters.collection,
      filters.tag,
      filters.credit,
    ]
  );

  const setFilters = useCallback(
    (patch: Partial<PartyListFilters>) => {
      dispatch(filtersChanged(patch));
    },
    [dispatch]
  );

  /**
   * The filters travel in the address bar (see `usePartyListUrl`).
   *
   * It is wired here rather than in the screen because the URL and the slice
   * are two representations of ONE thing, and the place that already owns the
   * slice is the only place that can keep them from disagreeing. The hook seeds
   * from the URL once and follows the slice afterwards.
   */
  usePartyListUrl({ filters, defaults: DEFAULT_PARTY_FILTERS, onSeed: setFilters });
  const setPage = useCallback(
    (page: number, pageSize?: number) => {
      dispatch(pageChanged({ page, pageSize }));
    },
    [dispatch]
  );
  const setSelectedIds = useCallback(
    (ids: readonly string[]) => {
      dispatch(selectionChanged([...ids]));
    },
    [dispatch]
  );
  /**
   * The money tiles and the balance chips are the SAME control in two places,
   * so the toggle lives here rather than in either of them.
   *
   * Tapping the applied one clears it. A tile that only ever applied would
   * leave a merchant who tapped "You will get" to go and find the chip to get
   * their whole list back, and the tile gives no hint that the chip is where
   * the way out is.
   */
  const toggleBalance = useCallback(
    (value: PartyBalanceFilter) => {
      dispatch(filtersChanged({ balance: filters.balance === value ? '' : value }));
    },
    [dispatch, filters.balance]
  );
  const setOrdering = useCallback(
    (ordering: string) => {
      dispatch(filtersChanged({ ordering }));
    },
    [dispatch]
  );
  const clearFilters = useCallback(() => {
    setSearchInput('');
    dispatch(filtersCleared());
  }, [dispatch]);
  const refetch = useCallback(() => {
    void dispatch(fetchPartyList({ params: filters, mode: 'replace' }));
  }, [dispatch, filters]);

  return {
    rows,
    meta,
    filters,
    status,
    error,
    totals,
    totalsScope,
    overLimit,
    selectedIds,
    setSelectedIds,
    setOrdering,
    searchInput,
    setSearchInput,
    setFilters,
    setPage,
    clearFilters,
    refetch,
    toggleBalance,
    isLoading: status === 'loading',
    isRefreshing: status === 'refreshing',
    isFiltered: activeFilterCount > 0,
    activeFilterCount,
  };
}
