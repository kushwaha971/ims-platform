import {
  confirmPasswordReset,
  passwordLogin,
  registerAccount,
  requestPasswordReset,
  setPassword,
} from 'modules/DigiKhaato/features/auth/redux/authThunk';
import {
  fetchSession,
  logout,
  switchTenant,
} from 'modules/DigiKhaato/features/auth/redux/sessionThunk';
import {
  fetchLedgerAging,
  fetchLedgerSummary,
} from 'modules/DigiKhaato/features/ledger/redux/agingThunk';
import {
  correctEntry,
  fetchEntryHistory,
  fetchPartyEntries,
  postEntry,
  postOpeningBalance,
  reverseEntry,
} from 'modules/DigiKhaato/features/ledger/redux/ledgerEntryThunk';
import {
  fetchPartyStatement,
  fetchStatementAllRows,
} from 'modules/DigiKhaato/features/ledger/redux/statementThunk';
import {
  completeOnboarding,
  createTenant,
  saveAddressStep,
  saveBusinessStep,
  saveGstStep,
} from 'modules/DigiKhaato/features/onboarding/redux/onboardingThunk';
import {
  archiveParty,
  bulkArchiveParties,
  restoreParty,
} from 'modules/DigiKhaato/features/parties/redux/partyArchiveThunk';
import {
  fetchPartyDetail,
  saveCollectionDate,
} from 'modules/DigiKhaato/features/parties/redux/partyDetailThunk';
import { saveParty } from 'modules/DigiKhaato/features/parties/redux/partyFormThunk';
import { fetchPartyList } from 'modules/DigiKhaato/features/parties/redux/partyListThunk';
import {
  bulkTagPartiesThunk,
  createPartyTag,
  deletePartyTag,
  fetchPartyTags,
  mergePartyTags,
  updatePartyTag,
} from 'modules/DigiKhaato/features/parties/redux/partyTagThunk';
import { fetchPlanLimits } from 'modules/DigiKhaato/features/plan/redux/planThunk';
import {
  fetchInvitations,
  inviteMember,
  revokeInvitation,
} from 'modules/DigiKhaato/features/team/redux/invitationThunk';
import {
  addMember,
  fetchMembers,
  regenerateCredentials,
} from 'modules/DigiKhaato/features/team/redux/memberThunk';
import {
  leaveTenant,
  setDefaultTenant,
} from 'modules/DigiKhaato/features/tenant-switcher/redux/tenantSwitcherThunk';

/**
 * Part 19 §19.3.6 — every async thunk in the codebase is registered exactly
 * once, as a QUERY or a MUTATION. This is what makes completeness CHECKABLE
 * rather than remembered: `invalidation.registry.test.ts` parses every
 * `features/**\/redux/*Thunk.ts`, collects every `createAsyncThunk(` call and
 * fails CI naming any thunk that is in neither list.
 *
 * Sprint 0 has exactly the thunks the chassis and the walking skeleton need.
 * The lists grow one line per thunk; the machinery does not.
 */
export const QUERIES = {
  // session
  fetchSession,
  // PLT-15 — the plan's modules and member count, read from /auth/me
  fetchPlanLimits,
  // parties (the walking skeleton, Part 32 S0-71)
  fetchPartyList,
  // PTY-03 — the khata page's header and info panel
  fetchPartyDetail,
  // PTY-05 — every tag in the tenant, held once for the session
  fetchPartyTags,
  // PLT-05 — the team screen's invitation list
  fetchInvitations,
  // DEC-012 — the team screen's member list
  fetchMembers,
  // LED-01 — one page of a party's khata
  fetchPartyEntries,
  // LED-03 — the correction chain behind ONE entry, for the history sheet
  fetchEntryHistory,
  // LED-04 — one page of a statement, and the whole period for print
  fetchPartyStatement,
  fetchStatementAllRows,
  // LED-09 — the aging report, and the two figures above it
  fetchLedgerAging,
  fetchLedgerSummary,
} as const;

export const MUTATIONS = {
  // platform & settings
  switchTenant,
  logout,
  // CR-2026-09-19-A — email + password sign-up replaces the OTP pair
  registerAccount,
  // DEC-012 — owner-issued credentials
  addMember,
  regenerateCredentials,
  // PLT-02 — password login, set and reset
  passwordLogin,
  setPassword,
  requestPasswordReset,
  confirmPasswordReset,
  // PLT-03 — the onboarding wizard, one mutation per step
  createTenant,
  saveBusinessStep,
  saveGstStep,
  saveAddressStep,
  completeOnboarding,
  // PLT-04 — multiple businesses
  setDefaultTenant,
  leaveTenant,
  // PLT-05 — the team screen
  inviteMember,
  revokeInvitation,
  // PTY-01 — create and edit a party
  saveParty,
  // PTY-03 — the khata page's one editable control
  saveCollectionDate,
  // LED-01 — the write everything else in the ledger is downstream of
  postEntry,
  // LED-02 — the first row of a khata migrated from paper
  postOpeningBalance,
  // LED-03 — the two writes that change a line already in the book
  reverseEntry,
  correctEntry,
  // PTY-04 — archive and restore
  archiveParty,
  restoreParty,
  bulkArchiveParties,
  // PTY-05 — tags
  createPartyTag,
  updatePartyTag,
  deletePartyTag,
  mergePartyTags,
  bulkTagPartiesThunk,
} as const;

export type TQueryName = keyof typeof QUERIES;
export type TMutationName = keyof typeof MUTATIONS;

/** Every registered thunk, for the completeness test and the listener. */
export const REGISTERED_THUNK_NAMES: readonly string[] = [
  ...Object.keys(QUERIES),
  ...Object.keys(MUTATIONS),
];
