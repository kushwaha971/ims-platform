import { createSlice, type Draft, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchDevices, logoutEverywhere, renameDevice, revokeDevice } from './sessionsThunk';

import type { DeviceSession } from '../types/session.types';

/**
 * Part 19 §19.3.2 — PLT-09's slice (`items`, `status`), plus which card has a
 * dialog open. Route-local — only `/settings/devices` reads it — so it is
 * injected lazily (CR-134) rather than shipped to every route.
 */
export interface SessionsState {
  items: DeviceSession[];
  status: RequestStatus;
  error: ApiErrorShape | null;
  renameTargetId: string | null;
  renameStatus: RequestStatus;
  revokeTargetId: string | null;
  revokeStatus: RequestStatus;
  logoutAllOpen: boolean;
  logoutAllStatus: RequestStatus;
}

const initialState: SessionsState = {
  items: [],
  status: 'idle',
  error: null,
  renameTargetId: null,
  renameStatus: 'idle',
  revokeTargetId: null,
  revokeStatus: 'idle',
  logoutAllOpen: false,
  logoutAllStatus: 'idle',
};

const sessionsSlice = createSlice({
  name: 'sessions',
  initialState,
  reducers: {
    renameOpened(state, action: PayloadAction<string>) {
      state.renameTargetId = action.payload;
      state.renameStatus = 'idle';
    },
    renameClosed(state) {
      state.renameTargetId = null;
    },
    revokeRequested(state, action: PayloadAction<string>) {
      state.revokeTargetId = action.payload;
    },
    revokeCancelled(state) {
      state.revokeTargetId = null;
    },
    logoutAllRequested(state) {
      state.logoutAllOpen = true;
    },
    logoutAllCancelled(state) {
      state.logoutAllOpen = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDevices.pending, (state) => {
        state.status = state.items.length > 0 ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchDevices.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload as Draft<DeviceSession>[];
      })
      .addCase(fetchDevices.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(renameDevice.pending, (state) => {
        state.renameStatus = 'loading';
      })
      .addCase(renameDevice.fulfilled, (state, action) => {
        state.renameStatus = 'succeeded';
        state.renameTargetId = null;
        state.items = state.items.map((item) =>
          item.id === action.payload.id ? { ...item, label: action.payload.label } : item
        );
      })
      .addCase(renameDevice.rejected, (state) => {
        state.renameStatus = 'failed';
      })
      .addCase(revokeDevice.pending, (state) => {
        state.revokeStatus = 'loading';
      })
      .addCase(revokeDevice.fulfilled, (state, action) => {
        state.revokeStatus = 'succeeded';
        state.revokeTargetId = null;
        state.items = state.items.filter((item) => item.id !== action.payload);
      })
      .addCase(revokeDevice.rejected, (state) => {
        // The confirm closes; the refusal (a 409 for this device) is toasted.
        state.revokeStatus = 'failed';
        state.revokeTargetId = null;
      })
      .addCase(logoutEverywhere.pending, (state) => {
        state.logoutAllStatus = 'loading';
      })
      .addCase(logoutEverywhere.fulfilled, (state) => {
        state.logoutAllStatus = 'succeeded';
        state.logoutAllOpen = false;
      })
      .addCase(logoutEverywhere.rejected, (state) => {
        state.logoutAllStatus = 'failed';
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const {
  renameOpened,
  renameClosed,
  revokeRequested,
  revokeCancelled,
  logoutAllRequested,
  logoutAllCancelled,
} = sessionsSlice.actions;

export const sessionsReducer = sessionsSlice.reducer;

// ── Lazy registration (CR-134) ───────────────────────────────────────────────

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof sessionsSlice> {}
}

const injected = sessionsSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

export const selectDevices = (state: RootState): readonly DeviceSession[] => slice$(state).items;
export const selectDevicesStatus = (state: RootState): RequestStatus => slice$(state).status;
export const selectDevicesError = (state: RootState): ApiErrorShape | null => slice$(state).error;
export const selectRenameTargetId = (state: RootState): string | null =>
  slice$(state).renameTargetId;
export const selectRenameStatus = (state: RootState): RequestStatus => slice$(state).renameStatus;
export const selectRevokeTargetId = (state: RootState): string | null =>
  slice$(state).revokeTargetId;
export const selectRevokeStatus = (state: RootState): RequestStatus => slice$(state).revokeStatus;
export const selectLogoutAllOpen = (state: RootState): boolean => slice$(state).logoutAllOpen;
export const selectLogoutAllStatus = (state: RootState): RequestStatus =>
  slice$(state).logoutAllStatus;
