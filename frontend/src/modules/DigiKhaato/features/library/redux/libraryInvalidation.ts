import {
  registerInvalidation,
  type TModuleInvalidationEntry,
} from 'src/redux/invalidation/moduleRegistry';

/**
 * ADR-062 (1 Oct amendment) — the library's thunk registries and invalidation
 * map, and the ONLY place the library calls `registerInvalidation`.
 *
 * Every library thunk file bare-imports this module
 * (`import './libraryInvalidation';`), so the map is registered before any
 * library thunk can be dispatched — a dialog opened from a core screen that
 * never loaded a library slice still invalidates what it should. The file is
 * listed in `package.json` `sideEffects`, or the production build would drop
 * that bare import while every jest test passed.
 *
 * Empty in F01: F02 onward add each thunk here as it is written —
 * `LIBRARY_QUERIES`/`LIBRARY_MUTATIONS` map the thunk's name to its
 * `typePrefix` (the registry test holds each string to the real thunk), and
 * `LIBRARY_INVALIDATION` is total over the mutations by type.
 */
export const LIBRARY_QUERIES = {} as const satisfies Record<string, string>;

export const LIBRARY_MUTATIONS = {} as const satisfies Record<string, string>;

export type TLibraryQueryName = keyof typeof LIBRARY_QUERIES;
export type TLibraryMutationName = keyof typeof LIBRARY_MUTATIONS;

export const LIBRARY_INVALIDATION: Readonly<
  Record<TLibraryMutationName, TModuleInvalidationEntry>
> = {};

registerInvalidation({
  module: 'library',
  queries: LIBRARY_QUERIES,
  mutations: LIBRARY_MUTATIONS,
  map: LIBRARY_INVALIDATION,
  ownSlices: [],
});
