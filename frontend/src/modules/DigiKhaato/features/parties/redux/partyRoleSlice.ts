import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';
import type { RequestStatus } from 'src/types/api.types';

import { fetchPartyRoles } from './partyRoleThunk';

import type { PartyRole } from '../types/party.types';

/**
 * A6 (PLT-X04 §7) — the roles the enabled modules give parties, for the list's
 * "Role" chips. Lazily injected (CR-134): only the party list reads it, and only
 * when the list says a module with roles is on.
 */
export interface PartyRoleState {
  roles: PartyRole[];
  status: RequestStatus;
}

const initialState: PartyRoleState = { roles: [], status: 'idle' };

const partyRoleSlice = createSlice({
  name: 'partyRole',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchPartyRoles.pending, (state) => {
        state.status = state.status === 'succeeded' ? 'refreshing' : 'loading';
      })
      .addCase(fetchPartyRoles.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.roles = [...action.payload] as Draft<PartyRole>[];
      })
      .addCase(fetchPartyRoles.rejected, (state, action) => {
        if (action.meta.aborted) return;
        // No chips rather than an error: the row is an extra above a list that
        // has its own error state, and the roles it named have not changed.
        state.status = 'failed';
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof partyRoleSlice> {}
}

const injected = partyRoleSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

export const selectPartyRoles = (state: RootState): readonly PartyRole[] => slice$(state).roles;
export const selectPartyRoleStatus = (state: RootState): RequestStatus => slice$(state).status;
