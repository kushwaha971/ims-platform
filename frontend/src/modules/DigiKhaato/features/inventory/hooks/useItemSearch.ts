'use client';

import { useCallback, useMemo } from 'react';

import type { UbAsyncComboboxOption } from 'src/design-system';
import { usePagedSearch, type PagedSearchStatus } from 'src/hooks/usePagedSearch';
import { usePermissions } from 'src/hooks/usePermissions';
import { formatQuantity } from 'src/utils/quantity';

import { lookupItemByBarcode, searchItems } from '../api/itemService';
import { ITEM_SEARCH_DEBOUNCE_MS } from '../constants/inventoryConstants';

import type { ItemListRow } from '../types/item.types';

/**
 * THE item picker source — exported for the sale, purchase and adjustment
 * editors (Part 32 §32.9.3: "the item search combobox the invoice editor
 * consumes"), the way `usePartySearch` is the party picker's. There is no
 * second debounced item fetch anywhere.
 *
 * - 250 ms debounce, the in-flight request aborted on every keystroke;
 * - active items only (archived items are excluded from pickers to prevent
 *   accidental billing — INV-02 §19); `trackedOnly` for stock screens;
 * - `lookup(code)` is the SCANNER path: exact barcode, then exact SKU, one
 *   request, `null` for "no such item" — a HID scanner types the code and
 *   presses Enter faster than any search can answer, and the Enter is the cue
 *   (`UbAsyncCombobox.onSubmitQuery`).
 * - `options` are ready for `UbAsyncCombobox`: name, then "SKU · on hand".
 */
export interface UseItemSearchOptions {
  readonly trackedOnly?: boolean;
}

export interface UseItemSearchResult {
  readonly query: string;
  readonly setQuery: (next: string) => void;
  readonly results: readonly ItemListRow[];
  readonly options: readonly UbAsyncComboboxOption[];
  readonly status: PagedSearchStatus;
  /** The options on screen answer an earlier term (see `usePagedSearch`). */
  readonly pending: boolean;
  readonly canSearch: boolean;
  /** Start listing — the picker's `onOpen`. */
  readonly activate: () => void;
  readonly hasMore: boolean;
  readonly loadMore: () => void;
  readonly find: (id: string) => ItemListRow | undefined;
  readonly lookup: (code: string) => Promise<ItemListRow | null>;
  readonly clear: () => void;
}

const itemId = (row: ItemListRow): string => row.id;

/**
 * Owner, 5 Oct 2026 — the picker lists every active item (by name) the moment
 * it opens, pages as the list scrolls, and narrows as the merchant types
 * (`src/hooks/usePagedSearch`). A line's "which item?" is often answered by
 * looking, not by remembering how it was spelt.
 */
export function useItemSearch(options: UseItemSearchOptions = {}): UseItemSearchResult {
  const { can, hasModule } = usePermissions();
  const canSearch = hasModule('inventory') && can('inventory.item.read');
  const { trackedOnly = false } = options;

  const fetchPage = useCallback(
    (term: string, page: number, signal: AbortSignal) =>
      searchItems(term, page, signal, { trackedOnly }),
    [trackedOnly]
  );
  const search = usePagedSearch<ItemListRow>({
    enabled: canSearch,
    fetchPage,
    key: trackedOnly ? 'tracked' : 'all',
    debounceMs: ITEM_SEARCH_DEBOUNCE_MS,
    idOf: itemId,
  });
  const visible = search.results;

  const comboOptions = useMemo(
    () =>
      visible.map((row) => ({
        value: row.id,
        label: row.name,
        description:
          row.onHand !== null
            ? `${row.sku} · ${formatQuantity(row.onHand, row.unit.code)}`
            : row.sku,
      })),
    [visible]
  );

  const find = useCallback((id: string) => visible.find((row) => row.id === id), [visible]);

  const lookup = useCallback(
    async (code: string) => {
      const row = await lookupItemByBarcode(code.trim());
      if (row && trackedOnly && !row.trackStock) return null;
      return row;
    },
    [trackedOnly]
  );

  return useMemo(
    () => ({
      query: search.query,
      setQuery: search.setQuery,
      results: visible,
      options: comboOptions,
      status: search.status,
      pending: search.pending,
      canSearch,
      activate: search.activate,
      hasMore: search.hasMore,
      loadMore: search.loadMore,
      find,
      lookup,
      clear: search.clear,
    }),
    [search, visible, comboOptions, canSearch, find, lookup]
  );
}
