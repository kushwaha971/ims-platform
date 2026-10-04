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
 * Each F-task adds its thunks here as it writes them — `LIBRARY_QUERIES`/
 * `LIBRARY_MUTATIONS` map the thunk's name to its `typePrefix` (the registry
 * test holds each string to the real thunk), and `LIBRARY_INVALIDATION` is
 * total over the mutations by type. F03 added the catalogue's, F02 the settings'.
 */
export const LIBRARY_QUERIES = {
  fetchLibraryTitles: 'libraryTitleList/fetch',
  fetchLibraryTitle: 'libraryTitleDetail/fetch',
  searchLibraryTitles: 'libraryCatalogueForm/search',
  fetchLibraryCopies: 'libraryCopyList/fetch',
  fetchLibraryCopy: 'libraryCopyDetail/fetch',
  lookupLibraryCode: 'libraryCatalogueForm/lookup',
  fetchLibraryCategories: 'libraryCatalogueForm/fetchCategories',
  fetchLibraryLocations: 'libraryCatalogueForm/fetchLocations',
  fetchLibrarySettings: 'librarySettings/fetch',
  fetchLibraryMembers: 'libraryMemberList/fetch',
  fetchLibraryMember: 'libraryMemberDetail/fetch',
  fetchLibraryMembershipTypes: 'libraryMemberList/fetchTypes',
} as const satisfies Record<string, string>;

export const LIBRARY_MUTATIONS = {
  createLibraryTitle: 'libraryCatalogueForm/createTitle',
  patchLibraryTitle: 'libraryCatalogueForm/patchTitle',
  addLibraryCopies: 'libraryCatalogueForm/addCopies',
  setLibraryTitleArchived: 'libraryTitleDetail/setArchived',
  withdrawLibraryCopy: 'libraryCopyDetail/withdraw',
  moveLibraryCopy: 'libraryCopyDetail/move',
  saveLibraryCategory: 'libraryCatalogueForm/saveCategory',
  deleteLibraryCategory: 'libraryCatalogueForm/deleteCategory',
  mergeLibraryCategory: 'libraryCatalogueForm/mergeCategory',
  saveLibraryLocation: 'libraryCatalogueForm/saveLocation',
  deleteLibraryLocation: 'libraryCatalogueForm/deleteLocation',
  saveLibrarySettings: 'librarySettings/save',
  raiseLibraryNumber: 'librarySettings/raiseNumber',
  enrolLibraryMember: 'libraryMemberList/enrol',
  actOnLibraryMember: 'libraryMemberDetail/act',
} as const satisfies Record<string, string>;

export type TLibraryQueryName = keyof typeof LIBRARY_QUERIES;
export type TLibraryMutationName = keyof typeof LIBRARY_MUTATIONS;

/*
 * F03 (LIB-02 §7) — a write stales every catalogue view that shows what it
 * changed, and REFETCHES the one the merchant is looking at. The detail slices
 * that a write answers with (`withdraw`, `move`, `setArchived`) patch
 * themselves from the response, so they are `patch`, not refetched.
 */
const CATALOGUE_LISTS = ['libraryTitleList', 'libraryCopyList'] as const;

export const LIBRARY_INVALIDATION: Readonly<
  Record<TLibraryMutationName, TModuleInvalidationEntry>
> = {
  createLibraryTitle: { stale: [...CATALOGUE_LISTS] },
  patchLibraryTitle: { patch: [['libraryTitleDetail', 'title']], stale: [...CATALOGUE_LISTS] },
  addLibraryCopies: { refetch: ['libraryTitleDetail'], stale: [...CATALOGUE_LISTS] },
  setLibraryTitleArchived: {
    patch: [['libraryTitleDetail', 'title']],
    stale: ['libraryTitleList'],
  },
  withdrawLibraryCopy: {
    patch: [['libraryCopyDetail', 'copy']],
    stale: ['libraryTitleDetail', ...CATALOGUE_LISTS],
  },
  moveLibraryCopy: {
    patch: [['libraryCopyDetail', 'copy']],
    stale: ['libraryTitleDetail', ...CATALOGUE_LISTS],
  },
  saveLibraryCategory: {
    patch: [['libraryCatalogueForm', 'categories']],
    stale: ['libraryTitleList', 'libraryTitleDetail'],
  },
  deleteLibraryCategory: { patch: [['libraryCatalogueForm', 'categories']] },
  mergeLibraryCategory: {
    refetch: ['libraryCatalogueForm'],
    stale: ['libraryTitleList', 'libraryTitleDetail'],
  },
  saveLibraryLocation: {
    patch: [['libraryCatalogueForm', 'locations']],
    stale: ['libraryCopyList', 'libraryTitleDetail', 'libraryCopyDetail'],
  },
  deleteLibraryLocation: { patch: [['libraryCatalogueForm', 'locations']] },
  // F02 — the save answers with the row as stored, so the screen takes it; a
  // raised counter is not in that answer, so the screen asks again.
  saveLibrarySettings: { patch: [['librarySettings', 'bundle']] },
  raiseLibraryNumber: { refetch: ['librarySettings'] },
  // F04 — fees and deposits move the party's khata, which is REFETCHED (a
  // false `patch` is worse than none, CLAUDE.md LED-01); the member page takes
  // the act's answer as its own.
  enrolLibraryMember: { stale: ['libraryMemberList', 'partyDetail', 'partyList'] },
  actOnLibraryMember: {
    patch: [['libraryMemberDetail', 'member']],
    stale: ['libraryMemberList', 'partyDetail', 'partyList'],
  },
};

registerInvalidation({
  module: 'library',
  queries: LIBRARY_QUERIES,
  mutations: LIBRARY_MUTATIONS,
  map: LIBRARY_INVALIDATION,
  ownSlices: [
    'libraryTitleList',
    'libraryTitleDetail',
    'libraryCopyList',
    'libraryCopyDetail',
    'libraryCatalogueForm',
    'librarySettings',
    'libraryMemberList',
    'libraryMemberDetail',
  ],
});
