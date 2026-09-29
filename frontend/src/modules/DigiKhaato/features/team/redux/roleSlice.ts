import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';
import type { RequestStatus } from 'src/types/api.types';

import { fetchRoles } from './roleThunk';

import type { RoleOption } from '../types/role.types';

/**
 * A13 (PLT-X12 §7) — the roles `GET /roles` offers, lazily injected (CR-134):
 * only the team screen and its dialogs read it, so it adds nothing to the app
 * shell. Cleared on logout and tenant switch with the rest of feature state,
 * because which module roles exist depends on which modules THIS tenant has on.
 */
export interface RoleState {
  rows: RoleOption[];
  status: RequestStatus;
}

const initialState: RoleState = { rows: [], status: 'idle' };

const roleSlice = createSlice({
  name: 'role',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchRoles.pending, (state) => {
        state.status = state.rows.length ? 'refreshing' : 'loading';
      })
      .addCase(fetchRoles.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.rows = action.payload as Draft<RoleOption>[];
      })
      .addCase(fetchRoles.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof roleSlice> {}
}

const injected = roleSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

export const selectRoles = (state: RootState): readonly RoleOption[] => slice$(state).rows;
export const selectRolesStatus = (state: RootState): RequestStatus => slice$(state).status;
