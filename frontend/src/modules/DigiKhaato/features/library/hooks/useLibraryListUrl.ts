'use client';

import { useListUrl, type ListUrlCodec } from 'src/hooks/useListUrl';

import type { LibraryListFilters, LibraryListUrlSpec } from '../types/library.types';

/**
 * F01 — one hook for every library list's address bar (FRD library §7,
 * "modelled on `usePartyListUrl`: seed once, write back on change"). The
 * mechanism is the shared `useListUrl`; a list supplies its spec, declared
 * once at module level next to its slice:
 *
 *     const TITLE_LIST_URL = libraryListCodec<TitleFilters>({
 *       keys: ['q', 'status', 'category'],
 *       closed: { status: ['available', 'on_loan', 'withdrawn'] },
 *     });
 */
export const libraryListCodec = <F extends LibraryListFilters>(
  spec: LibraryListUrlSpec<F>
): ListUrlCodec<F> => ({
  keys: spec.keys,
  /* A URL is untrusted input: trimmed, blanks dropped, and a closed axis's
     value outside its vocabulary dropped — a stale link shows the list, not
     an error, and the server never receives a value nobody chose. */
  read: (params) => {
    const patch: Record<string, string> = {};
    for (const key of spec.keys) {
      const value = params.get(key)?.trim();
      if (!value) continue;
      const allowed = spec.closed?.[key];
      if (allowed && !allowed.includes(value)) continue;
      patch[key] = value;
    }
    return patch as Partial<F>;
  },
});

export interface UseLibraryListUrlOptions<F extends LibraryListFilters> {
  readonly codec: ListUrlCodec<F>;
  readonly filters: F;
  readonly defaults: F;
  readonly onSeed: (patch: Partial<F>) => void;
}

export function useLibraryListUrl<F extends LibraryListFilters>(
  options: UseLibraryListUrlOptions<F>
): void {
  useListUrl(options);
}
