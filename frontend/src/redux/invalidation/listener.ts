import {
  createAction,
  createListenerMiddleware,
  type ActionReducerMapBuilder,
  type UnknownAction,
} from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';

import { INVALIDATION } from './map';
import { MUTATIONS, type TMutationName } from './registry';

import type { TSliceKey, TStaleState } from './types';

/**
 * Part 19 §19.3.6 — one listener applies the map.
 *
 * No slice imports another slice's reducer (R-RX-8): the listener dispatches
 * ONE shared action and every slice that cares reacts to it in its own
 * `extraReducers` through `acceptInvalidation()`.
 */

/** The one cross-slice invalidation signal. */
export const cacheInvalidated = createAction<{
  readonly slices: readonly TSliceKey[];
  readonly urgency: 'now' | 'next-mount';
}>('cache/invalidated');

const FULFILLED = new Map<string, TMutationName>(
  Object.entries(MUTATIONS).map(
    ([name, thunk]) => [thunk.fulfilled.type, name as TMutationName] as const
  )
);

export const invalidationListener = createListenerMiddleware();

invalidationListener.startListening({
  predicate: (action: UnknownAction) => FULFILLED.has(action.type),
  effect: (action, api) => {
    const name = FULFILLED.get(action.type);
    if (!name) return;
    const entry = INVALIDATION[name];

    if (entry.resetAll) {
      api.dispatch(resetAllFeatureState());
      return;
    }
    // `patch` is applied by the owning slice's own extraReducers on this same
    // action — it is declared in the map so the map is the complete statement,
    // and asserted by invalidation.map.test.ts. The listener signals the
    // other two.
    if (entry.stale?.length) {
      api.dispatch(cacheInvalidated({ slices: entry.stale, urgency: 'next-mount' }));
    }
    if (entry.refetch?.length) {
      api.dispatch(cacheInvalidated({ slices: entry.refetch, urgency: 'now' }));
    }
  },
});

/**
 * Every list or detail slice accepts the signal through this one helper, so the
 * slice author writes one line rather than a switch:
 *
 *     extraReducers: (builder) => {
 *       acceptInvalidation('partyList')(builder);
 *       …
 *     }
 *
 * A slice that holds server rows and does NOT accept it is a stale screen
 * waiting to happen, and the registry test names it.
 */
export function acceptInvalidation<S extends TStaleState>(key: TSliceKey) {
  return (builder: ActionReducerMapBuilder<S>): ActionReducerMapBuilder<S> =>
    builder.addCase(cacheInvalidated, (state, action) => {
      if (!action.payload.slices.includes(key)) return;
      state.stale = true;
      // 'now' wins over a pending 'next-mount'.
      if (action.payload.urgency === 'now' || state.staleUrgency === null) {
        state.staleUrgency = action.payload.urgency;
      }
    });
}
