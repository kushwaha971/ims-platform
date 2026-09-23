import {
  createAction,
  createListenerMiddleware,
  type ActionReducerMapBuilder,
  type UnknownAction,
} from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import type { RootState } from 'src/redux/store';

import { fetchSession } from 'modules/DigiKhaato/features/auth/redux/sessionThunk';

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
 * NEW-1 — the session probe that finds no session, while the store still held
 * one, tears the features down with it.
 *
 * `sessionSlice` already goes `anonymous` on a rejected `fetchSession`; the
 * feature slices did not hear about it. A 401 there is covered — the refresh
 * fails first and the transport's `onSessionExpired` runs logout's teardown —
 * but any other failure (the link dropped, the API answered 500) left the
 * previous session's party list and khata in memory behind the login screen
 * `RequireSession` then sends the user to, which only tears down a session it
 * can still SEE. Aborted probes are remounts, not endings, and are ignored, as
 * the slice ignores them.
 */
invalidationListener.startListening({
  actionCreator: fetchSession.rejected,
  effect: (action, api) => {
    if (action.meta.aborted) return;
    const before = (api.getOriginalState() as RootState).session.status;
    if (before === 'authenticated' || before === 'no_tenant') {
      api.dispatch(resetAllFeatureState());
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
      // NEW-2 — see `TStaleState.staleSeq`. Only for a slice that opted in.
      if (typeof state.staleSeq === 'number') state.staleSeq += 1;
    });
}

/**
 * NEW-2 — the other half of `TStaleState.staleSeq`, for a slice that opted in.
 *
 * The slice records `staleSeq` against the request id in its query's `pending`
 * case, and takes it back here in `fulfilled` and `rejected` — removed as it is
 * read, so the record only ever holds what is in flight. A fulfilled read whose
 * value differs from the slice's current `staleSeq` was requested before the
 * latest write and cannot contain it.
 *
 * `undefined` for a read the slice never saw start, which the caller treats as
 * current: the guard exists to drop a response that is provably older, never to
 * drop one it merely cannot place.
 */
export function takeReadSeq(
  readSeq: Record<string, number>,
  requestId: string
): number | undefined {
  const startedAt = readSeq[requestId];
  delete readSeq[requestId];
  return startedAt;
}
