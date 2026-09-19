import type { TInvalidationMap } from './types';

/**
 * Part 19 §19.3.6 — THE single normative statement of what a mutation
 * invalidates, as code rather than as a table nobody updates.
 *
 * `Record<TMutationName, …>` is total: adding a thunk to MUTATIONS without an
 * entry here is a TypeScript error. `TSliceKey = keyof RootState`, so naming a
 * slice that does not exist is a TypeScript error at this file's own line.
 *
 * Sprint 0 carries the two mutations the chassis has. Every later mutation adds
 * one line here in the same commit that adds it to `MUTATIONS`, and the three
 * enforcement points of §19.3.6 make forgetting either one impossible:
 *   1. compile time — a missing entry,
 *   2. compile time — a slice that does not exist,
 *   3. CI — a thunk that never reached the registry at all.
 */
export const INVALIDATION: TInvalidationMap = {
  // ── platform & settings ───────────────────────────────────────────────────
  // A new tenant means a new token and a new dataset; nothing survives.
  switchTenant: { resetAll: true },
  logout: { resetAll: true },
};
