'use client';

import { useEffect, useRef } from 'react';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * A list screen's filters, in the address bar — the mechanism, shared.
 *
 * Extracted from PTY-02/PTY-05's `usePartyListUrl` (F01) so the library's
 * lists and the party list follow one rule rather than two copies of it. The
 * reasoning lives in `usePartyListUrl`'s docstring; in short:
 *
 *  - **Read once, write always.** The URL seeds the slice on mount (and on a
 *    navigation from outside while the screen stays mounted); after that the
 *    slice is the source of truth and the URL follows it with `replace`.
 *  - **On mount the URL is the whole answer** (UAT D7): an axis the URL does
 *    not name means its DEFAULT, not "whatever the slice still held".
 *  - **Defaults are left out** of the written query, and the axes are written
 *    in `keys` order, so one filter set is one URL.
 *
 * `codec` must be a module-level constant: its identity is an effect input.
 */
export interface ListUrlCodec<F> {
  /** The axes that travel in the URL, in the order they are written. */
  readonly keys: readonly (keyof F & string)[];
  /** The URL is untrusted input: return only values the list can use. */
  readonly read: (params: URLSearchParams) => Partial<F>;
}

/** The query string `filters` should be at, with defaults omitted. */
export const writeListQuery = <F>(
  keys: readonly (keyof F & string)[],
  filters: F,
  defaults: F
): string => {
  const params = new URLSearchParams();
  for (const key of keys) {
    const value = String(filters[key] ?? '');
    if (!value || value === String(defaults[key] ?? '')) continue;
    params.set(key, value);
  }
  return params.toString();
};

/**
 * What the slice must change to show exactly what the URL says (UAT D7): every
 * axis the URL names takes its value, every other one its default; only the
 * axes that differ are returned, so returning to the same URL is an empty patch.
 */
export const seedListPatch = <F>(
  keys: readonly (keyof F & string)[],
  fromUrl: Partial<F>,
  current: F,
  defaults: F
): Partial<F> => {
  const patch: Partial<F> = {};
  for (const key of keys) {
    const wanted = fromUrl[key] ?? defaults[key];
    if (wanted !== current[key]) patch[key] = wanted;
  }
  return patch;
};

export interface UseListUrlOptions<F> {
  readonly codec: ListUrlCodec<F>;
  readonly filters: F;
  readonly defaults: F;
  readonly onSeed: (patch: Partial<F>) => void;
}

export function useListUrl<F>({ codec, filters, defaults, onSeed }: UseListUrlOptions<F>): void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  /* The string, not the object: `useSearchParams()` may hand back a new
     object on every render. */
  const current = searchParams?.toString() ?? '';
  /** The query this hook last SAW in the address bar; null before the seed. */
  const observed = useRef<string | null>(null);
  /** Queries this hook asked the router for and has not yet seen arrive. */
  const requested = useRef<string[]>([]);

  useEffect(() => {
    /* Is this address the merchant's doing or ours? The first run is a mount;
       a change to a query WE requested is our own `replace` arriving; any other
       change is a navigation from outside, read like a mount (UAT D7). */
    let fromOutside = observed.current === null;
    if (observed.current !== null && current !== observed.current) {
      const index = requested.current.lastIndexOf(current);
      if (index >= 0) requested.current.splice(0, index + 1);
      else fromOutside = true;
    }
    observed.current = current;

    if (fromOutside) {
      requested.current = [];
      const patch = seedListPatch(
        codec.keys,
        codec.read(new URLSearchParams(current)),
        filters,
        defaults
      );
      /* Nothing is written in this pass: `filters` is still the PRE-seed
         value, and writing it would `replace` the very link being opened. */
      if (Object.keys(patch).length > 0) {
        onSeed(patch);
        return;
      }
    }

    const next = writeListQuery(codec.keys, filters, defaults);
    if (next === current || requested.current.at(-1) === next) return;
    requested.current.push(next);
    /* `replace`, not `push`: a chip tap refines the screen, it is not a place;
       `scroll: false` keeps the list where the merchant was reading it. */
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [current, codec, filters, defaults, pathname, router, onSeed]);
}
