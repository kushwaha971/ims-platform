import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import type { RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchPlanLimits } from './planThunk';

import type { PlanEntitlements, PlanLimit, PlanLimitHit } from '../types/plan.types';

/**
 * Part 19 §19.3.2 — PLT-15's slice: `limits`, `lastHit`, `dialogOpen` (FR-14).
 *
 * `lastHit` is set by the TRANSPORT layer, not by a feature: a plan limit can
 * be hit by any write in any module, so the axios interceptor maps
 * `plan_limit_reached` onto `limitHit()` through the transport bridge and this
 * one dialog answers for the whole application (FR-6). The originating form
 * keeps its data, because nothing here touches it.
 *
 * DEC-001: the ledger is never capped, and no counter for parties or invoices
 * is kept — `limits` holds whatever the server sends, and only `max_users` is
 * rendered as a meter.
 */
export interface PlanState {
  planCode: string | null;
  limits: PlanLimit[];
  modules: string[];
  supportContact: PlanEntitlements['supportContact'];
  status: RequestStatus;
  error: ApiErrorShape | null;
  /** The 403 that opened the dialog, with used/limit and the contact route. */
  lastHit: PlanLimitHit | null;
  dialogOpen: boolean;
}

const initialState: PlanState = {
  planCode: null,
  limits: [],
  modules: [],
  supportContact: { phone: null, whatsapp: null, email: null, name: null },
  status: 'idle',
  error: null,
  lastHit: null,
  dialogOpen: false,
};

const planSlice = createSlice({
  name: 'plan',
  initialState,
  reducers: {
    /** FR-6 — dispatched by the transport layer on any 403 plan_limit_reached. */
    limitHit(state, action: PayloadAction<PlanLimitHit>) {
      state.lastHit = action.payload as Draft<PlanLimitHit>;
      state.dialogOpen = true;
    },
    limitDialogClosed(state) {
      state.dialogOpen = false;
    },
    resetPlan: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPlanLimits.pending, (state) => {
        state.status = state.limits.length > 0 ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchPlanLimits.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.planCode = action.payload.planCode;
        state.limits = [...action.payload.limits] as Draft<PlanLimit>[];
        state.modules = [...action.payload.modules];
        state.supportContact = action.payload.supportContact;
      })
      .addCase(fetchPlanLimits.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      // A different business is a different plan; nothing survives a switch.
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { limitHit, limitDialogClosed, resetPlan } = planSlice.actions;

export default planSlice.reducer;

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectPlanCode = (state: RootState): string | null => state.plan.planCode;
export const selectPlanLimits = (state: RootState): readonly PlanLimit[] => state.plan.limits;
export const selectPlanModules = (state: RootState): readonly string[] => state.plan.modules;
export const selectPlanSupportContact = (state: RootState): PlanState['supportContact'] =>
  state.plan.supportContact;
export const selectPlanStatus = (state: RootState): RequestStatus => state.plan.status;
export const selectPlanError = (state: RootState): ApiErrorShape | null => state.plan.error;
export const selectPlanLastHit = (state: RootState): PlanLimitHit | null => state.plan.lastHit;
export const selectPlanDialogOpen = (state: RootState): boolean => state.plan.dialogOpen;
