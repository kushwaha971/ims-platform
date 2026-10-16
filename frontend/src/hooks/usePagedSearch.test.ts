import { act, renderHook, waitFor } from '@testing-library/react';

import { usePagedSearch, type PagedSearchPage } from './usePagedSearch';

/**
 * Owner, 5 Oct 2026 — "until the user starts typing there is no list; on
 * focus there should be a list, with pagination, and on scroll that
 * pagination should work, or filter based on the search."
 *
 * Every picker is built on this hook, so these are the rules for all of them.
 */
type Row = { readonly id: string };
const rows = (from: number, count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: `r${from + i}` }));

const setup = (pages: number) => {
  const fetchPage = jest.fn(async (term: string, page: number): Promise<PagedSearchPage<Row>> => ({
    rows: rows((page - 1) * 3, 3).map((row) => ({ id: `${term}${row.id}` })),
    hasMore: page < pages,
  }));
  const hook = renderHook(() =>
    usePagedSearch<Row>({ enabled: true, fetchPage, debounceMs: 10, idOf: (row) => row.id })
  );
  return { fetchPage, hook };
};

it('fetches nothing until the box is opened — the header search is on every page', async () => {
  const { fetchPage, hook } = setup(2);
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(fetchPage).not.toHaveBeenCalled();
  expect(hook.result.current.results).toEqual([]);
  expect(hook.result.current.active).toBe(false);
});

it('lists the first page on focus, with nothing typed', async () => {
  const { fetchPage, hook } = setup(2);
  act(() => hook.result.current.activate());
  await waitFor(() => expect(hook.result.current.results).toHaveLength(3));
  expect(fetchPage).toHaveBeenCalledWith('', 1, expect.any(AbortSignal));
  expect(hook.result.current.hasMore).toBe(true);
});

it('appends the next page when asked, and stops when there is no more', async () => {
  const { fetchPage, hook } = setup(2);
  act(() => hook.result.current.activate());
  await waitFor(() => expect(hook.result.current.results).toHaveLength(3));

  act(() => hook.result.current.loadMore());
  await waitFor(() => expect(hook.result.current.results).toHaveLength(6));
  expect(fetchPage).toHaveBeenLastCalledWith('', 2, expect.any(AbortSignal));
  expect(hook.result.current.hasMore).toBe(false);

  act(() => hook.result.current.loadMore());
  expect(fetchPage).toHaveBeenCalledTimes(2);
});

it('narrows as the merchant types, starting again at page one', async () => {
  const { fetchPage, hook } = setup(3);
  act(() => hook.result.current.activate());
  await waitFor(() => expect(hook.result.current.results).toHaveLength(3));
  act(() => hook.result.current.loadMore());
  await waitFor(() => expect(hook.result.current.results).toHaveLength(6));

  act(() => hook.result.current.setQuery('ram'));
  await waitFor(() => expect(hook.result.current.results[0]?.id).toBe('ramr0'));
  expect(hook.result.current.results).toHaveLength(3);
  expect(fetchPage).toHaveBeenLastCalledWith('ram', 1, expect.any(AbortSignal));
});

it('says "no match" only once a search has answered with nothing', async () => {
  const fetchPage = jest.fn(async (): Promise<PagedSearchPage<Row>> => ({
    rows: [],
    hasMore: false,
  }));
  const { result } = renderHook(() =>
    usePagedSearch<Row>({ enabled: true, fetchPage, debounceMs: 10, idOf: (row) => row.id })
  );
  expect(result.current.isEmpty).toBe(false);
  act(() => result.current.activate());
  await waitFor(() => expect(result.current.isEmpty).toBe(true));
});

it('lists nothing for a session that may not search', async () => {
  const fetchPage = jest.fn();
  const { result } = renderHook(() =>
    usePagedSearch<Row>({ enabled: false, fetchPage, idOf: (row) => row.id })
  );
  act(() => result.current.activate());
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(fetchPage).not.toHaveBeenCalled();
  expect(result.current.active).toBe(false);
});

/**
 * WP-05's timed counter run billed K001 for K003: the old term's rows stay on
 * screen while the new term's page is debounced and fetched, and an Enter in
 * that window took the top row of the OLD answer. `pending` says the rows do
 * not answer what is in the box yet, so a picker can hold that Enter.
 */
it('says the rows are pending until they answer the term in the box', async () => {
  const { hook } = setup(1);
  act(() => hook.result.current.activate());
  await waitFor(() => expect(hook.result.current.pending).toBe(false));

  act(() => hook.result.current.setQuery('K003'));
  expect(hook.result.current.pending).toBe(true);
  expect(hook.result.current.results[0]?.id).toBe('r0'); // the old answer, still shown

  await waitFor(() => expect(hook.result.current.pending).toBe(false));
  expect(hook.result.current.results[0]?.id).toBe('K003r0');
});
