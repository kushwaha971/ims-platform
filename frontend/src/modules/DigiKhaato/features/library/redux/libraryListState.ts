import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import type { CataloguePage } from '../types/catalogue.types';
import type { Draft } from '@reduxjs/toolkit';

/**
 * F03 — the state and the three fetch reducers every library list shares, so
 * the titles and copies lists (and the members list after them) follow one
 * rule rather than two copies of it.
 *
 *  - The filters live here; `useLibraryListUrl` seeds them from the address
 *    bar and writes them back.
 *  - A response for filters the screen has since left is dropped (the late-
 *    response guard), and a refetch keeps the rows on screen, dimmed, rather
 *    than blanking them (LIB-02 §8, "refreshing").
 */
export interface LibraryListState<F, R> {
  filters: F;
  rows: R[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** The filters the rows on screen answer, serialised. */
  answered: string | null;
  status: RequestStatus;
  error: ApiErrorShape | null;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

export const initialListState = <F, R>(defaults: F): LibraryListState<F, R> => ({
  filters: defaults,
  rows: [],
  page: 1,
  pageSize: 0,
  total: 0,
  totalPages: 1,
  answered: null,
  status: 'idle',
  error: null,
  stale: false,
  staleUrgency: null,
});

const sameFilters = <F>(a: F | null, b: F): boolean =>
  !!a && JSON.stringify(a) === JSON.stringify(b);

/**
 * A filter change. Any axis but `page` returns the merchant to page one: page
 * three of last month's search is not a page of this one.
 */
export const applyFilterPatch = <F extends { page: string }>(
  state: { filters: Draft<F> },
  patch: Partial<F>
): void => {
  const next = { ...(state.filters as F), ...patch };
  const onlyPage = Object.keys(patch).every((key) => key === 'page');
  if (!onlyPage && !('page' in patch)) next.page = '1';
  state.filters = next as Draft<F>;
};

export const listPending = <F, R>(state: Draft<LibraryListState<F, R>>): void => {
  state.status = state.rows.length > 0 ? 'refreshing' : 'loading';
  state.error = null;
};

export const listFulfilled = <F, R>(
  state: Draft<LibraryListState<F, R>>,
  filters: F,
  page: CataloguePage<R>
): void => {
  if (!sameFilters(state.filters as F, filters)) return;
  state.rows = page.rows as Draft<R>[];
  state.page = page.page;
  state.pageSize = page.pageSize;
  state.total = page.total;
  state.totalPages = page.totalPages;
  state.answered = JSON.stringify(filters);
  state.status = 'succeeded';
  state.stale = false;
  state.staleUrgency = null;
};

export const listRejected = <F, R>(
  state: Draft<LibraryListState<F, R>>,
  filters: F,
  aborted: boolean,
  error: ApiErrorShape | undefined
): void => {
  if (aborted || !sameFilters(state.filters as F, filters)) return;
  state.status = 'failed';
  state.error = (error ?? null) as Draft<ApiErrorShape> | null;
};
