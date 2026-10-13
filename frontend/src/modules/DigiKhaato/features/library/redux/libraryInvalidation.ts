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
  // Library P0 — the door's QR for self check-in
  fetchCheckInPoster: 'libraryCheckin/fetchPoster',
  fetchLibraryMoney: 'libraryMoney/fetch',
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
  loadCounterMember: 'libraryCounter/loadMember',
  fetchMemberCharges: 'libraryMemberDetail/fetchCharges',
  fetchLibraryShifts: 'librarySeats/fetchShifts',
  fetchLibrarySeats: 'librarySeats/fetchSeats',
  fetchLibrarySeatMap: 'librarySeats/fetchMap',
  fetchLibraryHome: 'libraryHome/fetch',
  fetchLibraryFeesBoard: 'libraryHome/fetchFeesBoard',
  fetchLibraryAttendance: 'libraryAttendance/fetch',
  fetchMemberAttendance: 'libraryAttendance/fetchMember',
  fetchFeeReminders: 'libraryMessages/fetch',
  prepareLibraryMessage: 'libraryMessages/prepare',
  // QA F4 / B51 — preparing a group records nothing; the log only reads.
  prepareBulkMessages: 'libraryMessages/bulk',
  fetchMessageLog: 'libraryMessages/log',
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
  processCounterItem: 'libraryCounter/process',
  undoCounterIssue: 'libraryCounter/undo',
  renewAllAtCounter: 'libraryCounter/renewAll',
  waiveLibraryCharge: 'libraryMemberDetail/waiveCharge',
  reverseLibraryCharge: 'libraryMemberDetail/reverseCharge',
  createLibraryCharge: 'libraryMemberDetail/createCharge',
  markLibraryLoanLost: 'libraryCounter/markLost',
  markLibraryCopyFound: 'libraryCopyDetail/found',
  saveLibraryShift: 'librarySeats/saveShift',
  setLibraryShiftActive: 'librarySeats/setShiftActive',
  addLibrarySeatRow: 'librarySeats/addRow',
  setLibrarySeatActive: 'librarySeats/setSeatActive',
  placeLibraryMember: 'libraryMemberDetail/place',
  editLibraryMember: 'libraryMemberDetail/edit',
  saveLibraryPlan: 'libraryMemberList/savePlan',
  checkInLibraryStudent: 'libraryAttendance/checkIn',
  checkOutLibraryStudent: 'libraryAttendance/checkOut',
  recordLibraryMessage: 'libraryMessages/record',
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
const CIRCULATION_VIEWS = [
  'libraryTitleList',
  'libraryCopyList',
  'libraryTitleDetail',
  'libraryCopyDetail',
  'libraryMemberList',
  'libraryMemberDetail',
  'partyDetail',
  'partyList',
  'libraryHome',
] as const;

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
  enrolLibraryMember: {
    stale: ['libraryMemberList', 'librarySeats', 'libraryHome', 'partyDetail', 'partyList'],
  },
  // W03 — closing a membership frees its seat, so the map is stale too.
  actOnLibraryMember: {
    patch: [['libraryMemberDetail', 'member']],
    stale: ['libraryMemberList', 'librarySeats', 'libraryHome', 'partyDetail', 'partyList'],
  },
  // F05 — a scan issues, returns or renews: every list and page showing a
  // copy's state or a member's books is stale; a fine moves the khata. The
  // counter's own panel takes the member the act answered with.
  processCounterItem: { stale: [...CIRCULATION_VIEWS] },
  undoCounterIssue: { stale: [...CIRCULATION_VIEWS] },
  renewAllAtCounter: { stale: [...CIRCULATION_VIEWS] },
  // F06 — a charge write moves the member's dues and the khata's balance; the
  // member page refetches (its charges and its figures both moved).
  waiveLibraryCharge: { refetch: ['libraryMemberDetail'], stale: [...CIRCULATION_VIEWS] },
  reverseLibraryCharge: { refetch: ['libraryMemberDetail'], stale: [...CIRCULATION_VIEWS] },
  createLibraryCharge: { refetch: ['libraryMemberDetail'], stale: [...CIRCULATION_VIEWS] },
  markLibraryLoanLost: { stale: [...CIRCULATION_VIEWS] },
  markLibraryCopyFound: { refetch: ['libraryCopyDetail'], stale: [...CIRCULATION_VIEWS] },
  // W02 — a shift's name or times show on every student row and on the map;
  // the settings list takes the saved row itself. A new row of seats is only
  // in the map, which refetches.
  saveLibraryShift: { patch: [['librarySeats', 'shifts']], stale: ['libraryMemberList'] },
  setLibraryShiftActive: { patch: [['librarySeats', 'shifts']] },
  addLibrarySeatRow: { refetch: ['librarySeats'] },
  setLibrarySeatActive: { patch: [['librarySeats', 'seats']], stale: ['librarySeats'] },
  // Moving or freeing a seat changes the student page (which takes the answer),
  // the list's seat column and the map.
  placeLibraryMember: {
    patch: [['libraryMemberDetail', 'member']],
    stale: ['libraryMemberList', 'librarySeats', 'libraryHome'],
  },
  // 12 Oct 2026 — the owner edits a student's number, group, end date or note:
  // the page takes the answer; the list's columns and the home's "plans ending"
  // both show those fields. No money moves, so the khata is untouched.
  editLibraryMember: {
    patch: [['libraryMemberDetail', 'member']],
    stale: ['libraryMemberList', 'libraryHome'],
  },
  // A plan's fee and length show on every student row that holds it.
  saveLibraryPlan: { refetch: ['libraryMemberList'] },
  // W05 — a check-in or -out changes the day register the desk is looking at
  // (refetched: the answer is one row's mark, not the day) and the home.
  checkInLibraryStudent: { refetch: ['libraryAttendance'], stale: ['libraryHome'] },
  checkOutLibraryStudent: { refetch: ['libraryAttendance'], stale: ['libraryHome'] },
  // W06 — a recorded message ticks "sent today" on the list.
  recordLibraryMessage: { refetch: ['libraryMessages'] },
};

registerInvalidation({
  module: 'library',
  queries: LIBRARY_QUERIES,
  mutations: LIBRARY_MUTATIONS,
  map: LIBRARY_INVALIDATION,
  // F06 — a payment collected against a library charge (the core drawer) moves
  // the member's dues: the member page refetches and the lists go stale.
  core: {
    recordPayment: {
      refetch: ['libraryMemberDetail'],
      stale: ['libraryMemberList', 'libraryHome', 'librarySeats'],
    },
  },
  ownSlices: [
    'libraryTitleList',
    'libraryTitleDetail',
    'libraryCopyList',
    'libraryCopyDetail',
    'libraryCatalogueForm',
    'librarySettings',
    'libraryMemberList',
    'libraryMemberDetail',
    'libraryCounter',
    'librarySeats',
    'libraryHome',
    'libraryAttendance',
    'libraryMessages',
  ],
});
