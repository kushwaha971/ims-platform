import {
  fetchSession,
  logout,
  switchTenant,
} from 'modules/UdhaarBook/features/auth/redux/sessionThunk';
import { fetchPartyList } from 'modules/UdhaarBook/features/parties/redux/partyListThunk';

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
  // parties (the walking skeleton, Part 32 S0-71)
  fetchPartyList,
} as const;

export const MUTATIONS = {
  // platform & settings
  switchTenant,
  logout,
} as const;

export type TQueryName = keyof typeof QUERIES;
export type TMutationName = keyof typeof MUTATIONS;

/** Every registered thunk, for the completeness test and the listener. */
export const REGISTERED_THUNK_NAMES: readonly string[] = [
  ...Object.keys(QUERIES),
  ...Object.keys(MUTATIONS),
];
