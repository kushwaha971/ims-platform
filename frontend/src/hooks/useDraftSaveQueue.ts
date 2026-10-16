'use client';

import { useCallback, useMemo, useRef } from 'react';

import { useStore } from 'react-redux';

import type { RootState } from 'src/redux/store';

/**
 * ADR-063 / SH-011 — one save lane per autosaving document editor.
 *
 * Manual save, autosave, a save fired by a field (the supplier pick) and the
 * save before issue/record all go through `enqueue`, so they run one after the
 * other and each reads the newest acknowledged id/version and form when it
 * STARTS. Without it two of them could both see "no id yet" and both POST.
 *
 * `invalidate()` marks a teardown (unmount, a different document, restart):
 * the in-flight request is aborted and every task already queued sees
 * `currentScope()` turn false, as it does when the signed-in user or business
 * changes, so a late reply can never seed the next editor. Aborting a request
 * does not mean the server rolled it back — the creation key is what recovers it.
 */
export interface DraftSaveQueue {
  enqueue: <T>(task: (currentScope: () => boolean) => Promise<T | null>) => Promise<T | null>;
  /** The request a task is waiting on, so teardown can abort it. */
  track: (pending: { readonly abort: () => void }) => void;
  invalidate: () => void;
}

export const useDraftSaveQueue = (
  tenantId: string | undefined,
  userId: string | undefined
): DraftSaveQueue => {
  const store = useStore<RootState>();
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const generation = useRef(0);
  const active = useRef<{ readonly abort: () => void } | null>(null);

  const enqueue = useCallback(
    <T>(task: (currentScope: () => boolean) => Promise<T | null>): Promise<T | null> => {
      const epoch = generation.current;
      const currentScope = () => {
        const session = store.getState().session;
        return (
          epoch === generation.current &&
          tenantId === session.activeTenant?.id &&
          userId === session.user?.id
        );
      };
      const run = () => task(currentScope);
      const pending = queue.current.then(run, run);
      queue.current = pending;
      return pending;
    },
    [store, tenantId, userId]
  );
  const track = useCallback((pending: { readonly abort: () => void }) => {
    active.current = pending;
  }, []);
  const invalidate = useCallback(() => {
    generation.current += 1;
    active.current?.abort();
    active.current = null;
  }, []);
  return useMemo(() => ({ enqueue, track, invalidate }), [enqueue, track, invalidate]);
};
