'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { usePermissions } from 'src/hooks/usePermissions';

import { listParties } from '../api/partyService';

import type { Party } from '../types/party.types';

/**
 * Sprint 3 §32.6.4 — THE party search: a debounced, abortable source for any
 * party picker. The app bar's quick search is the first consumer; sales,
 * purchases, payments and expenses are the next four, and the sprint plan's
 * risk register is explicit that they must not grow four implementations.
 *
 * ── Why component state and not a slice ─────────────────────────────────
 * Every other list in this product keeps server state in Redux, because it is
 * shared: the party list is read by the nav badge, invalidated by writes,
 * restored on back-navigation. A typeahead's results are none of those — they
 * belong to one open input for the few seconds it is open, and two pickers on
 * one screen (a sale's customer and a transfer's counter-party) must not share
 * them. A slice would be global state for a local question.
 *
 * ── The request ──────────────────────────────────────────────────────────
 * `GET /parties?q=…&status=active&page_size=8` — the same trigram-backed
 * endpoint as the list (PTY-02), so a party findable there is findable here.
 * A new keystroke aborts the request in flight: on a slow link the answer for
 * "ram" must never land after, and overwrite, the answer for "ramesh".
 */
export const PARTY_SEARCH_DEBOUNCE_MS = 250;
export const PARTY_SEARCH_LIMIT = 8;
/** Below this many characters nothing is fetched — "r" matches the whole book. */
export const PARTY_SEARCH_MIN_CHARS = 2;
const EMPTY: readonly Party[] = [];

export interface UsePartySearchOptions {
  /** `customer` / `supplier` narrow the source for a document picker. */
  readonly type?: 'customer' | 'supplier';
  readonly limit?: number;
}

export interface UsePartySearchResult {
  readonly query: string;
  readonly setQuery: (next: string) => void;
  readonly results: readonly Party[];
  readonly status: 'idle' | 'loading' | 'succeeded' | 'failed';
  /** True once a search has run and matched nothing — the "no match" row. */
  readonly isEmpty: boolean;
  readonly canSearch: boolean;
  readonly clear: () => void;
}

export function usePartySearch(options: UsePartySearchOptions = {}): UsePartySearchResult {
  const { can, hasModule } = usePermissions();
  const canSearch = hasModule('parties') && can('parties.party.read');
  const { type, limit = PARTY_SEARCH_LIMIT } = options;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly Party[]>([]);
  const [status, setStatus] = useState<UsePartySearchResult['status']>('idle');
  const controller = useRef<AbortController | null>(null);

  const term = query.trim();
  /* Below the threshold the answer is "nothing", derived here rather than
     set from the effect — an effect that only clears state is a second render
     for a value the render already knows. */
  const searching = canSearch && term.length >= PARTY_SEARCH_MIN_CHARS;

  useEffect(() => {
    if (!searching) {
      controller.current?.abort();
      return undefined;
    }
    const timer = window.setTimeout(() => {
      controller.current?.abort();
      const next = new AbortController();
      controller.current = next;
      setStatus('loading');
      listParties(
        {
          q: term,
          status: 'active',
          type: type ?? '',
          balance: '',
          collection: '',
          tag: '',
          credit: '',
          ordering: 'name',
          page: 1,
          pageSize: limit,
        },
        next.signal
      )
        .then((page) => {
          if (next.signal.aborted) return;
          setResults(page.rows);
          setStatus('succeeded');
        })
        .catch(() => {
          if (next.signal.aborted) return;
          setResults([]);
          setStatus('failed');
        });
    }, PARTY_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [term, searching, type, limit]);

  useEffect(() => () => controller.current?.abort(), []);

  const clear = useCallback(() => setQuery(''), []);

  return useMemo(
    () => ({
      query,
      setQuery,
      results: searching ? results : EMPTY,
      status: searching ? status : 'idle',
      isEmpty: searching && status === 'succeeded' && results.length === 0,
      canSearch,
      clear,
    }),
    [query, results, status, searching, canSearch, clear]
  );
}
