import type { RootState } from 'src/redux/store';

import type { TMutationName } from './registry';

/**
 * Part 19 §19.3.6 — the types that make the invalidation map fail to COMPILE
 * when a mutation has no entry or names a slice that does not exist. This is
 * the half of the machinery that nobody has to remember.
 */

/** Every key of the store, and nothing else. A typo does not compile. */
export type TSliceKey = keyof RootState;

/** [slice, the field this mutation's own extraReducers writes in place] */
export type TPatch = readonly [slice: TSliceKey, field: string];

export interface TInvalidationEntry {
  /** Documented and asserted; applied by the named slice's extraReducers. */
  readonly patch?: readonly TPatch[];
  /** Refetch on next mount. The default and the cheap one. */
  readonly stale?: readonly TSliceKey[];
  /** Refetch now if mounted — only when the user is looking at what changed. */
  readonly refetch?: readonly TSliceKey[];
  /** Tenant switch only. */
  readonly resetAll?: true;
}

/**
 * Total over `TMutationName`: adding a thunk to MUTATIONS without an entry here
 * is `error TS2741`, not a code-review miss.
 */
export type TInvalidationMap = Readonly<Record<TMutationName, TInvalidationEntry>>;

/** The shape every slice that accepts the signal must carry (§19.3.2). */
export interface TStaleState {
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
  /**
   * NEW-2 — how many invalidations this slice has received, for the slices
   * whose refetch races a write the SAME slice has already patched.
   *
   * Optional, because only such a slice needs it. The khata header is the case
   * that made it necessary: a post patches the balance from the 201 and asks
   * for a refetch of the credit block; a SECOND post a moment later patches the
   * balance again — and the first refetch, requested before the second write,
   * then lands and puts the first balance back. The number the merchant reads
   * out at the counter would go backwards.
   *
   * A slice that carries it snapshots it when a fetch starts (the thunk's
   * `getPendingMeta`), discards a response whose snapshot is older than the
   * current value, and its hook re-fires on every change of it, so the refetch
   * that DOES land was asked for after the last write.
   */
  staleSeq?: number;
}
