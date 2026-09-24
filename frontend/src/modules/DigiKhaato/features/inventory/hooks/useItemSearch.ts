'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { UbAsyncComboboxOption } from 'src/design-system';
import { usePermissions } from 'src/hooks/usePermissions';
import { formatQuantity } from 'src/utils/quantity';

import { lookupItemByBarcode, searchItems } from '../api/itemService';
import { ITEM_SEARCH_DEBOUNCE_MS, ITEM_SEARCH_MIN_CHARS } from '../constants/inventoryConstants';

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
  readonly status: 'idle' | 'loading' | 'succeeded' | 'failed';
  readonly canSearch: boolean;
  readonly find: (id: string) => ItemListRow | undefined;
  readonly lookup: (code: string) => Promise<ItemListRow | null>;
  readonly clear: () => void;
}

const EMPTY: readonly ItemListRow[] = [];

export function useItemSearch(options: UseItemSearchOptions = {}): UseItemSearchResult {
  const { can, hasModule } = usePermissions();
  const canSearch = hasModule('inventory') && can('inventory.item.read');
  const { trackedOnly = false } = options;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly ItemListRow[]>([]);
  const [status, setStatus] = useState<UseItemSearchResult['status']>('idle');
  const controller = useRef<AbortController | null>(null);

  const term = query.trim();
  const searching = canSearch && term.length >= ITEM_SEARCH_MIN_CHARS;

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
      searchItems(term, next.signal, { trackedOnly })
        .then((rows) => {
          if (next.signal.aborted) return;
          setResults(rows);
          setStatus('succeeded');
        })
        .catch(() => {
          if (next.signal.aborted) return;
          setResults([]);
          setStatus('failed');
        });
    }, ITEM_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [term, searching, trackedOnly]);

  useEffect(() => () => controller.current?.abort(), []);

  const visible = searching ? results : EMPTY;

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

  const clear = useCallback(() => setQuery(''), []);

  return useMemo(
    () => ({
      query,
      setQuery,
      results: visible,
      options: comboOptions,
      status: searching ? status : 'idle',
      canSearch,
      find,
      lookup,
      clear,
    }),
    [query, visible, comboOptions, searching, status, canSearch, find, lookup, clear]
  );
}
