'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Owner, 5 Oct 2026 — "on focus there should be a list, with pagination, and
 * on scroll that pagination should work, or filter based on the search."
 *
 * The one search source every picker and search box is built on. Before it,
 * each search fetched nothing until the person had typed two characters, so a
 * box opened onto an empty panel, and a shopkeeper who did not remember how a
 * supplier was spelt could not find them at all. Now:
 *
 *  · nothing is fetched until the box is ACTIVATED (focused or opened) — the
 *    header search is on every page, and a request on every page load for a
 *    list nobody opened would be a tax on every screen;
 *  · activated with nothing typed, it lists the first page (the caller says
 *    in what order — most recent for parties);
 *  · typing narrows it, debounced, and a new keystroke aborts the request in
 *    flight, so the answer for "ram" can never land after the one for "ramesh";
 *  · `loadMore()` appends the next page — the panel calls it when its last row
 *    scrolls into view — and is a no-op while a page is loading or when there
 *    is no more;
 *  · a change of term starts again at page one.
 *
 * Results are component state, not a slice: they belong to one open box for
 * the seconds it is open, and two pickers on one screen must not share them.
 */
export interface PagedSearchPage<T> {
  readonly rows: readonly T[];
  readonly hasMore: boolean;
}

export type PagedSearchStatus = 'idle' | 'loading' | 'loadingMore' | 'succeeded' | 'failed';

export interface UsePagedSearchOptions<T> {
  /** False when the session may not search this source at all. */
  readonly enabled: boolean;
  /** Fetch one page. `page` starts at 1. Must honour `signal`. */
  readonly fetchPage: (
    term: string,
    page: number,
    signal: AbortSignal
  ) => Promise<PagedSearchPage<T>>;
  /** Anything else the request depends on (a type, a flag): a change refetches. */
  readonly key?: string;
  readonly debounceMs?: number;
  /** Row identity, so a row that moved between pages is not listed twice. */
  readonly idOf: (row: T) => string;
}

export interface UsePagedSearchResult<T> {
  readonly query: string;
  readonly setQuery: (next: string) => void;
  readonly results: readonly T[];
  readonly status: PagedSearchStatus;
  readonly hasMore: boolean;
  readonly loadMore: () => void;
  /** Start listing (on focus or open). Idempotent. */
  readonly activate: () => void;
  readonly active: boolean;
  /** True once a search has answered and matched nothing — the "no match" row. */
  readonly isEmpty: boolean;
  /**
   * True while the rows on screen do not answer what is in the box: the term
   * changed and its page is still debounced or in flight. An Enter then would
   * take the OLD answer's top row (WP-05: K001 billed for K003).
   */
  readonly pending: boolean;
  readonly clear: () => void;
}

export const PAGED_SEARCH_DEBOUNCE_MS = 250;

export function usePagedSearch<T>({
  enabled,
  fetchPage,
  key = '',
  debounceMs = PAGED_SEARCH_DEBOUNCE_MS,
  idOf,
}: UsePagedSearchOptions<T>): UsePagedSearchResult<T> {
  const [query, setQueryState] = useState('');
  const [active, setActive] = useState(false);
  const [results, setResults] = useState<readonly T[]>([]);
  const [status, setStatus] = useState<PagedSearchStatus>('idle');
  const [hasMore, setHasMore] = useState(false);
  /** The signature the rows in `results` answer, as state so `pending` renders. */
  const [answered, setAnswered] = useState<string | null>(null);
  const page = useRef(0);
  const controller = useRef<AbortController | null>(null);
  /** The term (and key) the rows on screen answer — a stale page is dropped. */
  const answering = useRef('');
  const fetchRef = useRef(fetchPage);
  useEffect(() => {
    fetchRef.current = fetchPage;
  }, [fetchPage]);

  const term = query.trim();
  const running = enabled && active;
  const signature = `${key}\u0000${term}`;

  const run = useCallback(
    (forTerm: string, forSignature: string, nextPage: number) => {
      controller.current?.abort();
      const next = new AbortController();
      controller.current = next;
      setStatus(nextPage === 1 ? 'loading' : 'loadingMore');
      fetchRef
        .current(forTerm, nextPage, next.signal)
        .then((answer) => {
          if (next.signal.aborted) return;
          page.current = nextPage;
          answering.current = forSignature;
          setAnswered(forSignature);
          setHasMore(answer.hasMore);
          setResults((held) => {
            if (nextPage === 1) return answer.rows;
            const seen = new Set(held.map(idOf));
            return [...held, ...answer.rows.filter((row) => !seen.has(idOf(row)))];
          });
          setStatus('succeeded');
        })
        .catch(() => {
          if (next.signal.aborted) return;
          setAnswered(forSignature);
          if (nextPage === 1) setResults([]);
          setHasMore(false);
          setStatus('failed');
        });
    },
    [idOf]
  );

  // Page one, for every term the box is asked about while it is open. Nothing
  // typed answers at once (the box just opened); a keystroke waits for the next.
  useEffect(() => {
    if (!running) {
      controller.current?.abort();
      return undefined;
    }
    if (answering.current === signature && page.current > 0) return undefined;
    const timer = window.setTimeout(() => run(term, signature, 1), term ? debounceMs : 0);
    return () => window.clearTimeout(timer);
  }, [running, signature, term, debounceMs, run]);

  useEffect(() => () => controller.current?.abort(), []);

  const loadMore = useCallback(() => {
    if (!running || !hasMore || status === 'loading' || status === 'loadingMore') return;
    if (answering.current !== signature) return;
    run(term, signature, page.current + 1);
  }, [running, hasMore, status, signature, term, run]);

  const setQuery = useCallback((next: string) => {
    setQueryState(next);
    setActive(true);
  }, []);
  const activate = useCallback(() => setActive(true), []);
  const clear = useCallback(() => {
    setQueryState('');
    setActive(false);
    page.current = 0;
    answering.current = '';
    setAnswered(null);
    setResults([]);
    setHasMore(false);
    setStatus('idle');
  }, []);

  /* What is on screen must answer what is in the box: while page one of a new
     term is on its way, the old term's rows stay (no flash of empty), but they
     are never shown for a box that is not running. */
  const shown = running ? results : (EMPTY as readonly T[]);
  const shownStatus: PagedSearchStatus = running ? status : 'idle';
  const pending = running && (answered !== signature || status === 'loading');

  return useMemo(
    () => ({
      query,
      setQuery,
      results: shown,
      status: shownStatus,
      hasMore: running && hasMore,
      loadMore,
      activate,
      active: running,
      isEmpty: running && shownStatus === 'succeeded' && shown.length === 0,
      pending,
      clear,
    }),
    [query, setQuery, shown, shownStatus, running, hasMore, loadMore, activate, clear, pending]
  );
}

const EMPTY: readonly never[] = [];
