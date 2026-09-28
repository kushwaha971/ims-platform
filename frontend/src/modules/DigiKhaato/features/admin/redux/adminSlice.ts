import { createSlice, type Draft, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, PageMeta, RequestStatus } from 'src/types/api.types';

import {
  fetchHealth,
  fetchOverview,
  fetchPartners,
  fetchPlans,
  fetchTenantDetail,
  fetchTenants,
  requestSupportAccess,
  startImpersonation,
  updateTenant,
} from './adminThunk';

import type {
  AdminHealth,
  AdminOverview,
  AdminPartnerRow,
  AdminPlan,
  AdminTenantDetail,
  AdminTenantFilters,
  AdminTenantRow,
  AdminTenantStatus,
} from '../types/admin.types';

/**
 * PLT-14 — the console's state. Route-local to `/admin/*`, so it is injected
 * lazily (CR-134) and no merchant's route ever carries it.
 */
export interface AdminState {
  overview: AdminOverview | null;
  filters: AdminTenantFilters;
  tenants: AdminTenantRow[];
  tenantsMeta: PageMeta | null;
  tenantsStatus: RequestStatus;
  tenantsError: ApiErrorShape | null;
  detail: AdminTenantDetail | null;
  detailStatus: RequestStatus;
  detailError: ApiErrorShape | null;
  partners: AdminPartnerRow[];
  partnersStatus: RequestStatus;
  partnersError: ApiErrorShape | null;
  plans: AdminPlan[];
  health: AdminHealth | null;
  healthStatus: RequestStatus;
  healthError: ApiErrorShape | null;
  saveStatus: RequestStatus;
  accessStatus: RequestStatus;
  enterStatus: RequestStatus;
}

export const ADMIN_PAGE_SIZE = 25;

const initialState: AdminState = {
  overview: null,
  filters: { q: '', status: null, page: 1, pageSize: ADMIN_PAGE_SIZE },
  tenants: [],
  tenantsMeta: null,
  tenantsStatus: 'idle',
  tenantsError: null,
  detail: null,
  detailStatus: 'idle',
  detailError: null,
  partners: [],
  partnersStatus: 'idle',
  partnersError: null,
  plans: [],
  health: null,
  healthStatus: 'idle',
  healthError: null,
  saveStatus: 'idle',
  accessStatus: 'idle',
  enterStatus: 'idle',
};

const failed = (payload: ApiErrorShape | undefined): Draft<ApiErrorShape> | null =>
  (payload ?? null) as Draft<ApiErrorShape> | null;

const adminSlice = createSlice({
  name: 'admin',
  initialState,
  reducers: {
    searchChanged(state, action: PayloadAction<string>) {
      state.filters.q = action.payload;
      state.filters.page = 1;
    },
    statusFilterChanged(state, action: PayloadAction<AdminTenantStatus | null>) {
      state.filters.status = action.payload;
      state.filters.page = 1;
    },
    pageChanged(state, action: PayloadAction<{ page: number; pageSize?: number }>) {
      state.filters.page = action.payload.page;
      if (action.payload.pageSize) state.filters.pageSize = action.payload.pageSize;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOverview.fulfilled, (state, action) => {
        state.overview = action.payload;
      })
      .addCase(fetchTenants.pending, (state) => {
        state.tenantsStatus = state.tenants.length > 0 ? 'refreshing' : 'loading';
        state.tenantsError = null;
      })
      .addCase(fetchTenants.fulfilled, (state, action) => {
        state.tenantsStatus = 'succeeded';
        state.tenants = action.payload.rows as Draft<AdminTenantRow>[];
        state.tenantsMeta = action.payload.meta;
      })
      .addCase(fetchTenants.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.tenantsStatus = 'failed';
        state.tenantsError = failed(action.payload);
      })
      .addCase(fetchTenantDetail.pending, (state, action) => {
        const same = state.detail?.id === action.meta.arg;
        state.detailStatus = same ? 'refreshing' : 'loading';
        if (!same) state.detail = null;
        state.detailError = null;
      })
      .addCase(fetchTenantDetail.fulfilled, (state, action) => {
        state.detailStatus = 'succeeded';
        state.detail = action.payload as Draft<AdminTenantDetail>;
      })
      .addCase(fetchTenantDetail.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.detailStatus = 'failed';
        state.detailError = failed(action.payload);
      })
      .addCase(updateTenant.pending, (state) => {
        state.saveStatus = 'loading';
      })
      .addCase(updateTenant.fulfilled, (state, action) => {
        state.saveStatus = 'succeeded';
        state.detail = action.payload as Draft<AdminTenantDetail>;
      })
      .addCase(updateTenant.rejected, (state) => {
        state.saveStatus = 'failed';
      })
      .addCase(fetchPartners.pending, (state) => {
        state.partnersStatus = state.partners.length > 0 ? 'refreshing' : 'loading';
        state.partnersError = null;
      })
      .addCase(fetchPartners.fulfilled, (state, action) => {
        state.partnersStatus = 'succeeded';
        state.partners = action.payload;
      })
      .addCase(fetchPartners.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.partnersStatus = 'failed';
        state.partnersError = failed(action.payload);
      })
      .addCase(fetchPlans.fulfilled, (state, action) => {
        state.plans = action.payload;
      })
      .addCase(fetchHealth.pending, (state) => {
        state.healthStatus = state.health ? 'refreshing' : 'loading';
        state.healthError = null;
      })
      .addCase(fetchHealth.fulfilled, (state, action) => {
        state.healthStatus = 'succeeded';
        state.health = action.payload;
      })
      .addCase(fetchHealth.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.healthStatus = 'failed';
        state.healthError = failed(action.payload);
      })
      .addCase(requestSupportAccess.pending, (state) => {
        state.accessStatus = 'loading';
      })
      .addCase(requestSupportAccess.fulfilled, (state, action) => {
        state.accessStatus = 'succeeded';
        if (state.detail) {
          state.detail.supportAccess = action.payload as Draft<AdminTenantDetail['supportAccess']>;
        }
      })
      .addCase(requestSupportAccess.rejected, (state) => {
        state.accessStatus = 'failed';
      })
      .addCase(startImpersonation.pending, (state) => {
        state.enterStatus = 'loading';
      })
      .addCase(startImpersonation.fulfilled, (state) => {
        // Stays "loading": the page is about to be replaced by a document load.
        state.enterStatus = 'loading';
      })
      .addCase(startImpersonation.rejected, (state) => {
        state.enterStatus = 'failed';
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { searchChanged, statusFilterChanged, pageChanged } = adminSlice.actions;
export const adminReducer = adminSlice.reducer;

// ── Lazy registration (CR-134) ───────────────────────────────────────────────

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof adminSlice> {}
}

const injected = adminSlice.injectInto(rootReducer);

export const selectAdmin = (state: RootState): AdminState => injected.selectSlice(state);
