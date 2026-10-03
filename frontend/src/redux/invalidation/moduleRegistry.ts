import {
  MODULE_INVALIDATION,
  moduleEntriesFor,
  type TModuleInvalidationEntry,
} from './moduleEntries';
import { MUTATIONS, type TMutationName } from './registry';

import type { TSliceKey } from './types';

export { moduleEntriesFor, type TModuleInvalidationEntry };

/**
 * ADR-062 (with its 1 Oct amendment) — the invalidation entries of a vertical
 * or an engine, registered at runtime instead of being written into core's
 * `map.ts`.
 *
 * ── Why ─────────────────────────────────────────────────────────────────────
 * The store imports the listener and the listener imports `map.ts`, so every
 * entry in the core map ships to every route, `/login` included. Waves B–D add
 * three verticals and three engines; written into the core map their rules
 * would cost every merchant 2–3 KB for modules most never switch on. Each
 * module therefore declares its own registries and map in ONE file,
 * `features/<module>/redux/<module>Invalidation.ts`, which calls
 * `registerInvalidation` once and which every thunk file of the module
 * bare-imports — so the map is registered, by construction, before any of the
 * module's thunks can be dispatched (the amendment: thunk files do not import
 * slices, so registering from the slice file would miss a thunk dispatched by
 * a dialog that never loaded its slice).
 *
 * ── The rules this file enforces at registration ────────────────────────────
 *  - Keyed by module: a second call for the same module REPLACES its rows (a
 *    hot reload, a re-evaluated chunk), so nothing is ever doubled.
 *  - The map is written by mutation NAME (so a missing entry is a compile
 *    error against the module's own `MUTATIONS`) and registered by
 *    `typePrefix`, which is what the listener sees.
 *  - `resetAll` is core's alone (the tenant switch); the type forbids it.
 *  - `patch` may name only the module's OWN slices: a core slice's reducer
 *    must not learn a module's action type (ADR-041), so a module write that
 *    moves a core figure uses `stale` or `refetch` on that core slice.
 *  - A module that must react to a CORE mutation (archiving a party stales the
 *    library's member list) registers an entry under the core thunk's name in
 *    `core`; core never names a module slice.
 */

export interface TModuleInvalidation<Q extends string, M extends string> {
  /** The module code (`library`, `dues`, …) — the registration's key. */
  readonly module: string;
  /** name → `typePrefix`, as core's `QUERIES`. */
  readonly queries: Readonly<Record<Q, string>>;
  /** name → `typePrefix`, as core's `MUTATIONS`. */
  readonly mutations: Readonly<Record<M, string>>;
  /** Total over the module's own mutations. */
  readonly map: Readonly<Record<M, TModuleInvalidationEntry>>;
  /** Entries this module adds to CORE mutations, by core thunk name. */
  readonly core?: Readonly<Partial<Record<TMutationName, TModuleInvalidationEntry>>>;
  /** The store keys this module owns — the only ones its `patch` may name. */
  readonly ownSlices?: readonly TSliceKey[];
}

const MODULES = MODULE_INVALIDATION;

const fulfilled = (typePrefix: string): string => `${typePrefix}/fulfilled`;

export function registerInvalidation<Q extends string, M extends string>(
  spec: TModuleInvalidation<Q, M>
): void {
  const own = new Set<string>(spec.ownSlices ?? []);
  const byAction = new Map<string, TModuleInvalidationEntry>();
  const add = (label: string, typePrefix: string | undefined, entry: TModuleInvalidationEntry) => {
    if (!typePrefix) {
      throw new Error(`${spec.module}: invalidation entry '${label}' names no registered thunk`);
    }
    if ('resetAll' in entry) {
      throw new Error(`${spec.module}: '${label}' may not reset everything — that is core's`);
    }
    const foreign = (entry.patch ?? []).filter(([slice]) => !own.has(slice));
    if (foreign.length > 0) {
      throw new Error(
        `${spec.module}: '${label}' patches ${foreign.map(([s]) => s).join(', ')}, which it ` +
          'does not own — use stale or refetch on a core slice (ADR-062 amendment)'
      );
    }
    byAction.set(fulfilled(typePrefix), entry);
  };
  const mutations = spec.mutations as Readonly<Record<string, string>>;
  for (const [name, entry] of Object.entries(spec.map) as [string, TModuleInvalidationEntry][]) {
    add(name, mutations[name], entry);
  }
  const coreMutations = MUTATIONS as Readonly<Record<string, string>>;
  for (const [name, entry] of Object.entries(spec.core ?? {}) as [
    string,
    TModuleInvalidationEntry,
  ][]) {
    add(`core:${name}`, coreMutations[name], entry);
  }
  MODULES.set(spec.module, {
    queries: { ...(spec.queries as Readonly<Record<string, string>>) },
    mutations: { ...mutations },
    byAction,
  });
}

/** The modules that have registered, for the per-module registration tests. */
export function registeredInvalidationModules(): readonly string[] {
  return [...MODULES.keys()].sort();
}

/** One module's registries, for the completeness tests. */
export function moduleThunks(module: string): {
  readonly queries: Readonly<Record<string, string>>;
  readonly mutations: Readonly<Record<string, string>>;
} | null {
  const registered = MODULES.get(module);
  return registered ? { queries: registered.queries, mutations: registered.mutations } : null;
}

/** Tests only: forget every registration. */
export function resetModuleInvalidationForTests(): void {
  MODULES.clear();
}
