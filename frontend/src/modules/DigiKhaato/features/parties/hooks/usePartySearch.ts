'use client';

import { useCallback, useMemo } from 'react';

import {
  PAGED_SEARCH_DEBOUNCE_MS,
  usePagedSearch,
  type UsePagedSearchResult,
} from 'src/hooks/usePagedSearch';
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
export const PARTY_SEARCH_DEBOUNCE_MS = PAGED_SEARCH_DEBOUNCE_MS;
/** One page of the list a picker shows: enough to fill the panel and scroll. */
export const PARTY_SEARCH_LIMIT = 20;

export interface UsePartySearchOptions {
  /** `customer` / `supplier` narrow the source for a document picker. */
  readonly type?: 'customer' | 'supplier';
  readonly limit?: number;
}

/**
 * Owner, 5 Oct 2026 — the box lists on focus, pages on scroll and narrows as
 * the merchant types (`src/hooks/usePagedSearch`). With nothing typed the list
 * is the people traded with most recently, which is who a counter is asking
 * for; typed, it is by name.
 */
export type UsePartySearchResult = UsePagedSearchResult<Party> & {
  readonly canSearch: boolean;
};

/**
 * Whether this session may search parties at all — the one rule, so a control
 * that only OPENS a search (the phone header's search button, UAT D2) hides on
 * exactly the condition the search itself renders nothing on, without mounting
 * a second search source to ask.
 */
export function useCanSearchParties(): boolean {
  const { can, hasModule } = usePermissions();
  return hasModule('parties') && can('parties.party.read');
}

export function usePartySearch(options: UsePartySearchOptions = {}): UsePartySearchResult {
  const canSearch = useCanSearchParties();
  const { type, limit = PARTY_SEARCH_LIMIT } = options;

  const fetchPage = useCallback(
    async (term: string, page: number, signal: AbortSignal) => {
      const answer = await listParties(
        {
          q: term,
          status: 'active',
          type: type ?? '',
          balance: '',
          collection: '',
          tag: '',
          credit: '',
          ordering: term ? 'name' : '-last_activity_at',
          page,
          pageSize: limit,
        },
        signal
      );
      const { meta } = answer;
      return { rows: answer.rows, hasMore: Boolean(meta && meta.page < meta.totalPages) };
    },
    [type, limit]
  );

  const search = usePagedSearch<Party>({
    enabled: canSearch,
    fetchPage,
    key: `${type ?? ''}:${limit}`,
    idOf: partyId,
  });
  return useMemo(() => ({ ...search, canSearch }), [search, canSearch]);
}

const partyId = (party: Party): string => party.id;
