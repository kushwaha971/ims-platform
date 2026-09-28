'use client';

import { useCallback, useId, useMemo, useSyncExternalStore } from 'react';

/**
 * Which columns the reader has switched off, and remembering it — ported from
 * BrandHub's `BrandHubDataGrid` visibility block.
 *
 * `false` means hidden. A column that is absent from the map is SHOWN, which is
 * what makes a stored map survive a release that adds or removes a column: the
 * new one appears, the departed one is ignored, and nobody is left with a
 * half-empty table because last month's layout no longer describes this one.
 */
export type UbColumnVisibility = Readonly<Record<string, boolean>>;

const PREFIX = 'ub-grid-columns';

/** `null` when the grid did not opt in — the toggles then live for one mount. */
export const visibilityStorageKey = (storageId?: string): string | null =>
  storageId ? `${PREFIX}:${storageId}` : null;

/**
 * SSR-safe, and tolerant of a corrupt or hostile value: anything that is not a
 * boolean is dropped rather than trusted, so a hand-edited `sessionStorage`
 * entry cannot put a non-boolean into the table's state.
 */
export const loadColumnVisibility = (key: string | null): UbColumnVisibility => {
  if (!key || typeof window === 'undefined') return {};
  try {
    const saved = window.sessionStorage.getItem(key);
    if (!saved) return {};
    const parsed: unknown = JSON.parse(saved);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const out: Record<string, boolean> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'boolean') out[id] = value;
    }
    return out;
  } catch {
    // A private-mode browser throws on read; a half-written value throws on
    // parse. Neither is worth a broken table — the reader gets every column.
    return {};
  }
};

/**
 * ── Why this is an external store and not `useState` + `useEffect` ──────────
 *
 * The obvious shape — state, and an effect that reads `sessionStorage` after
 * mount — is what BrandHub does, and it has two problems that only appear
 * here:
 *
 *  1. **It cannot read the stored map during the first render.** The server
 *     rendered this page and the server has no `sessionStorage`, so a lazy
 *     `useState` initialiser that reads it produces a first client render that
 *     disagrees with the server's HTML. React 19 answers a hydration mismatch
 *     by throwing the server's markup away — for a grid, the whole list. So the
 *     read has to happen after mount, which means `setState` inside an effect,
 *     which means a second render of the list on every load for every reader.
 *
 *  2. **The saved map has to be mirrored back on every change**, and an effect
 *     that does that also fires for the state the mount itself just set — so
 *     the empty default gets written over the reader's layout before their
 *     layout has been read back.
 *
 * `useSyncExternalStore` is the API for exactly this: `getServerSnapshot`
 * returns the empty map, `getSnapshot` returns what is stored, and React
 * reconciles the difference itself after hydration rather than us doing it a
 * frame later by hand. Writes go through the store, so the storage and the
 * state cannot disagree and no effect is involved in either direction.
 *
 * ── The cache ──────────────────────────────────────────────────────────────
 * `getSnapshot` is called on every render and must return the SAME object when
 * nothing changed, or React re-renders forever. Parsing the JSON each time
 * returns a new object each time, so the parse is cached per key and the cache
 * is the store.
 */
const cache = new Map<string, UbColumnVisibility>();
const listeners = new Map<string, Set<() => void>>();

const EMPTY: UbColumnVisibility = {};

const snapshotOf = (key: string, persistent: boolean): UbColumnVisibility => {
  const hit = cache.get(key);
  if (hit) return hit;
  const value = persistent ? loadColumnVisibility(key) : EMPTY;
  cache.set(key, value);
  return value;
};

const writeSnapshot = (key: string, persistent: boolean, next: UbColumnVisibility): void => {
  cache.set(key, next);
  if (persistent && typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Quota, or a browser that refuses storage entirely. The toggle still
      // works for this visit; only the memory of it is lost.
    }
  }
  listeners.get(key)?.forEach((listener) => listener());
};

export interface UbColumnVisibilityApi {
  readonly visibility: UbColumnVisibility;
  readonly setColumnVisible: (id: string, visible: boolean) => void;
  readonly showAllColumns: () => void;
}

export function useColumnVisibility(storageId?: string): UbColumnVisibilityApi {
  /**
   * A grid that did not opt in still needs somewhere to keep its toggles for
   * the mount, and it must not share that somewhere with the grid on the next
   * screen. `useId` gives each mount its own entry, which the unsubscribe below
   * drops — so nothing accumulates and nothing is written to storage.
   */
  const fallbackKey = useId();
  const stored = visibilityStorageKey(storageId);
  const key = stored ?? fallbackKey;
  const persistent = stored !== null;

  const subscribe = useCallback(
    (listener: () => void) => {
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(listener);
      return () => {
        set.delete(listener);
        if (set.size === 0) {
          listeners.delete(key);
          // Dropped rather than kept: a persistent grid re-reads what is
          // stored next time it mounts, and an ephemeral one is meant to
          // forget. Either way, a Map that only ever grows is a leak.
          cache.delete(key);
        }
      };
    },
    [key]
  );

  const visibility = useSyncExternalStore(
    subscribe,
    () => snapshotOf(key, persistent),
    () => EMPTY
  );

  return useMemo(
    () => ({
      visibility,
      setColumnVisible: (id: string, visible: boolean) => {
        if ((visibility[id] ?? true) === visible) return;
        writeSnapshot(key, persistent, { ...visibility, [id]: visible });
      },
      showAllColumns: () => {
        if (Object.values(visibility).every((value) => value)) return;
        writeSnapshot(key, persistent, EMPTY);
      },
    }),
    [key, persistent, visibility]
  );
}
