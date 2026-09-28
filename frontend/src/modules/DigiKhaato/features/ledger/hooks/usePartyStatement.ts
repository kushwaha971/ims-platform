'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectNetworkImpaired } from 'src/redux/slice/networkSlice';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';
import { todayInTenantTz } from 'src/utils/dates';

import {
  printRowsDiscarded,
  selectStatementCursor,
  selectStatementError,
  selectStatementFilters,
  selectStatementHasMore,
  selectStatementMoreStatus,
  selectStatementParty,
  selectStatementPrintRows,
  selectStatementPrintStatus,
  selectStatementRows,
  selectStatementShop,
  selectStatementStale,
  selectStatementStatus,
  selectStatementSummary,
  statementFiltersChanged,
  statementOpened,
} from '../redux/statementSlice';
import {
  fetchPartyStatement,
  fetchStatementAllRows,
  fetchStatementShop,
} from '../redux/statementThunk';
import {
  filtersFromQuery,
  queryFromFilters,
  rangeProblem,
  resolvePreset,
} from '../view-model/statementDisplay';

import type {
  StatementFilters,
  StatementParty,
  StatementPreset,
  StatementRow,
  StatementShop,
  StatementSummary,
} from '../types/statement.types';

/**
 * Part 19 §19.4 — everything the statement page does, so the page only renders.
 *
 * ── Why the filter lives in the URL and the store both ─────────────────────
 * The URL is the source of truth: FR-8 makes the page linkable, and PTY-05
 * learned what happens when it is not — the tag manager's "Camp Area · 34" link
 * was inert for a week because the list's filters lived only in Redux and were
 * seeded from defaults on every mount. The store's copy is what the thunk and
 * the reducers read, and it is written FROM the URL rather than beside it, so
 * there is one direction of travel and no pair to keep in step.
 */
export interface UsePartyStatementResult {
  readonly party: StatementParty | null;
  readonly summary: StatementSummary | null;
  readonly rows: readonly StatementRow[];
  readonly filters: StatementFilters;
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;
  readonly isLoadingMore: boolean;
  readonly hasMore: boolean;
  readonly isEmpty: boolean;
  readonly canRead: boolean;
  readonly canExport: boolean;
  readonly error: ApiErrorShape | null;
  readonly status: RequestStatus;
  readonly rangeProblem: 'inverted' | 'tooLong' | null;
  /** FR-8 — every row in the period, for print. `null` until asked for. */
  readonly printRows: readonly StatementRow[] | null;
  readonly printStatus: RequestStatus;
  /** UAT D3 — the print sheet's letterhead; `null` until loaded or if it fails. */
  readonly shop: StatementShop | null;
  readonly setPreset: (preset: StatementPreset) => void;
  readonly setCustomRange: (from: string | null, to: string | null) => void;
  readonly setIncludeCorrections: (next: boolean) => void;
  readonly loadMore: () => void;
  readonly refetch: () => void;
  readonly prepareForPrint: () => void;
  readonly discardPrintRows: () => void;
}

export const usePartyStatement = (partyId: string): UsePartyStatementResult => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const search = useSearchParams();
  const { can, hasModule } = usePermissions();
  const timezone = useAppSelector(selectTenantTimezone);

  const party = useAppSelector(selectStatementParty);
  const summary = useAppSelector(selectStatementSummary);
  const rows = useAppSelector(selectStatementRows);
  const filters = useAppSelector(selectStatementFilters);
  const status = useAppSelector(selectStatementStatus);
  const moreStatus = useAppSelector(selectStatementMoreStatus);
  const error = useAppSelector(selectStatementError);
  const hasMore = useAppSelector(selectStatementHasMore);
  const cursor = useAppSelector(selectStatementCursor);
  const stale = useAppSelector(selectStatementStale);
  const printRows = useAppSelector(selectStatementPrintRows);
  const printStatus = useAppSelector(selectStatementPrintStatus);
  const isImpaired = useAppSelector(selectNetworkImpaired);
  const shop = useAppSelector(selectStatementShop);

  const canRead = hasModule('ledger') && can('ledger.entry.read');
  /* §12 — reading a customer's history at the counter and walking out with the
     whole book in a file are not the same act, and staff hold one and not the
     other. The server checks the same codename on the same URL, because the
     export is a query parameter rather than a route. */
  const canExport = canRead && can('ledger.statement.export');

  /* "Today" from the TENANT's timezone, never the device clock. A phone set to
     UTC at 11.50 p.m. IST resolves "This month" to a range ending yesterday,
     and a merchant printing a month-end statement gets one missing its last
     day. Same rule as the entry drawer's date default (EC-8). */
  const today = useMemo(() => todayInTenantTz(timezone ?? undefined), [timezone]);

  /* The URL decides. This runs on every navigation, including the back button,
     which is what makes a shared link and a bookmark both work.
 
     Memoised on the query STRING and not on the `URLSearchParams` object, and
     the difference is an infinite render loop rather than a wasted comparison:
     `useSearchParams()` hands back a new object on every render, so a memo keyed
     on it recomputes every time, `urlFilters` gets a new identity every time,
     the effect below re-dispatches every time, and the store update re-renders.
     React stopped it with "Maximum update depth exceeded"; on a phone it would
     have been a page that never settled. */
  const queryString = search?.toString() ?? '';
  const urlFilters = useMemo(
    () => filtersFromQuery(new URLSearchParams(queryString), today),
    [queryString, today]
  );

  useEffect(() => {
    if (!canRead) return;
    dispatch(statementOpened(partyId));
  }, [dispatch, partyId, canRead]);

  /* UAT D3 — the letterhead, once per statement page visit. Before Print is
     pressed rather than after, because `window.print()` reads the DOM it is
     given and cannot wait for a request. */
  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchStatementShop());
    return () => promise.abort();
  }, [dispatch, canRead]);

  useEffect(() => {
    if (!canRead) return;
    dispatch(statementFiltersChanged(urlFilters));
  }, [dispatch, urlFilters, canRead]);

  /* The fetch is keyed on the RESOLVED filters rather than on the preset, so
     that a preset and the custom range it resolves to make the same request —
     and so that a range the client already knows is impossible never becomes
     one. `rangeProblem` short-circuits it: §10's five-year cap and the
     inverted-range check are both answerable without a round trip. */
  const problem = useMemo(() => rangeProblem(urlFilters), [urlFilters]);

  useEffect(() => {
    if (!canRead || problem) return undefined;
    const promise = dispatch(fetchPartyStatement({ partyId, filters: urlFilters }));
    return () => promise.abort();
  }, [dispatch, partyId, canRead, urlFilters, problem]);

  /* The silent refresh the invalidation listener asks for — an entry posted on
     the khata page behind this one marks the statement stale. Skipped while the
     network is impaired: a background request on a connection that is already
     failing turns one visible error into two. */
  useEffect(() => {
    if (!stale || isImpaired || !canRead || problem) return undefined;
    const promise = dispatch(fetchPartyStatement({ partyId, filters: urlFilters }));
    return () => promise.abort();
  }, [stale, isImpaired, canRead, problem, dispatch, partyId, urlFilters]);

  const push = useCallback(
    (next: StatementFilters) => {
      /* `replace`, not `push`. A merchant trying five presets and then hitting
         back expects the party page, not four statements — the filter is a way
         of looking at one screen rather than four places they have been. */
      router.replace(`?${queryFromFilters(next)}`, { scroll: false });
    },
    [router]
  );

  const setPreset = useCallback(
    (preset: StatementPreset) => {
      const resolved = preset === 'custom' ? urlFilters : resolvePreset(preset, today);
      push({ ...urlFilters, preset, dateFrom: resolved.dateFrom, dateTo: resolved.dateTo });
    },
    [push, urlFilters, today]
  );

  const setCustomRange = useCallback(
    (from: string | null, to: string | null) => {
      push({ ...urlFilters, preset: 'custom', dateFrom: from, dateTo: to });
    },
    [push, urlFilters]
  );

  const setIncludeCorrections = useCallback(
    (next: boolean) => {
      push({ ...urlFilters, includeCorrections: next });
    },
    [push, urlFilters]
  );

  const loadMore = useCallback(() => {
    if (!hasMore || !cursor || moreStatus === 'loading') return;
    void dispatch(fetchPartyStatement({ partyId, filters, cursor }));
  }, [dispatch, partyId, filters, hasMore, cursor, moreStatus]);

  const refetch = useCallback(() => {
    void dispatch(fetchPartyStatement({ partyId, filters }));
  }, [dispatch, partyId, filters]);

  /* FR-8 — print gets the whole period, because a print dialog gets what is in
     the DOM and cannot page. On a statement that already fits, this is one more
     request that returns what is already on screen; the alternative is a branch
     that decides whether to fetch, and a branch that is wrong prints a
     twelve-page statement with fifty rows in it. */
  const prepareForPrint = useCallback(() => {
    void dispatch(fetchStatementAllRows({ partyId, filters }));
  }, [dispatch, partyId, filters]);

  const discardPrintRows = useCallback(() => {
    dispatch(printRowsDiscarded());
  }, [dispatch]);

  return useMemo(
    () => ({
      party,
      summary,
      rows,
      filters: urlFilters,
      // The skeleton only on a FIRST load: a refresh behind rows already on
      // screen must not replace them, because the merchant is reading them.
      isLoading: status === 'loading' && rows.length === 0,
      isRefreshing: status === 'refreshing',
      isLoadingMore: moreStatus === 'loading',
      hasMore,
      isEmpty: rows.length === 0 && status === 'succeeded',
      canRead,
      canExport,
      error,
      status,
      rangeProblem: problem,
      printRows,
      printStatus,
      shop,
      setPreset,
      setCustomRange,
      setIncludeCorrections,
      loadMore,
      refetch,
      prepareForPrint,
      discardPrintRows,
    }),
    [
      party,
      summary,
      rows,
      urlFilters,
      status,
      moreStatus,
      hasMore,
      canRead,
      canExport,
      error,
      problem,
      printRows,
      printStatus,
      shop,
      setPreset,
      setCustomRange,
      setIncludeCorrections,
      loadMore,
      refetch,
      prepareForPrint,
      discardPrintRows,
    ]
  );
};
