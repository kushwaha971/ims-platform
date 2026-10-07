import {
  registerInvalidation,
  type TModuleInvalidationEntry,
} from 'src/redux/invalidation/moduleRegistry';

/**
 * ADR-062 — lending's thunk registries and invalidation map, the only place
 * lending calls `registerInvalidation`. Every lending thunk file bare-imports
 * this module, and `package.json` `sideEffects` keeps it in the build.
 */
export const LENDING_QUERIES = {
  fetchLendingToday: 'lendingToday/fetch',
  fetchLendingRoutes: 'lendingToday/fetchRoutes',
  fetchLendingLoans: 'lendingLoans/fetch',
  fetchLendingLoan: 'lendingLoans/fetchOne',
  fetchLendingBorrowers: 'lendingForm/fetchBorrowers',
  previewLendingLoan: 'lendingForm/preview',
  previewLendingCollection: 'lendingForm/previewCollection',
  fetchLendingReminders: 'lendingMessages/fetch',
  prepareLendingMessage: 'lendingMessages/prepare',
  fetchLendingDue: 'lendingForm/fetchDue',
} as const satisfies Record<string, string>;

export const LENDING_MUTATIONS = {
  createLendingLoan: 'lendingForm/create',
  collectLendingLoan: 'lendingForm/collect',
  recordLendingVisit: 'lendingForm/visit',
  saveLendingRoute: 'lendingToday/saveRoute',
  recordLendingMessage: 'lendingMessages/record',
  adjustLendingDue: 'lendingForm/adjustDue',
  endLendingLoan: 'lendingForm/endLoan',
} as const satisfies Record<string, string>;

export type TLendingMutationName = keyof typeof LENDING_MUTATIONS;

/*
 * A new loan, a collection or a visit changes today's round the agent is
 * looking at (refetched) and the loan page; a collection moves the borrower's
 * khata too. A new route only changes the route list, which the round holds.
 */
export const LENDING_INVALIDATION: Readonly<
  Record<TLendingMutationName, TModuleInvalidationEntry>
> = {
  createLendingLoan: { stale: ['lendingToday', 'lendingLoans', 'partyList', 'partyDetail'] },
  collectLendingLoan: {
    refetch: ['lendingToday', 'lendingLoans'],
    stale: ['partyList', 'partyDetail'],
  },
  recordLendingVisit: { refetch: ['lendingToday', 'lendingLoans'] },
  saveLendingRoute: { refetch: ['lendingToday'] },
  // L03 — a recorded message ticks "reminded today" on the round and the
  // list, and joins the loan's activity.
  recordLendingMessage: { refetch: ['lendingToday', 'lendingLoans', 'lendingMessages'] },
  // LEN-09 — a late fee or a waiver moves what is owed on the loan, the round and the
  // borrower's khata.
  adjustLendingDue: {
    refetch: ['lendingToday', 'lendingLoans'],
    stale: ['partyList', 'partyDetail'],
  },
  // LEN-10 — a written-off or cancelled loan leaves the round, the list and the khata.
  endLendingLoan: {
    refetch: ['lendingToday', 'lendingLoans', 'lendingMessages'],
    stale: ['partyList', 'partyDetail'],
  },
};

registerInvalidation({
  module: 'lending',
  queries: LENDING_QUERIES,
  mutations: LENDING_MUTATIONS,
  map: LENDING_INVALIDATION,
  ownSlices: ['lendingToday', 'lendingLoans', 'lendingForm', 'lendingMessages'],
});
