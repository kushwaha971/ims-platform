import { createSlice, type Draft, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, PageMeta, RequestStatus } from 'src/types/api.types';

import { fetchActors, fetchAuditRows } from './auditLogThunk';

import type { AuditActor, AuditFilters, AuditRow } from '../types/audit.types';

/**
 * Part 19 §19.3.2 — PLT-08's slice (`rows`, `filters`, `page`, `selected`).
 * Route-local, injected lazily (CR-134).
 *
 * `filters` default to TODAY (FR-3): the question a shopkeeper opens this with
 * is "what did my staff do today", and the whole log is a year of rows.
 * `dateFrom`/`dateTo` start null and are resolved by the page against the
 * tenant's today, because this module cannot know the date at import time.
 */
export const AUDIT_PAGE_SIZE = 25;

export interface AuditLogState {
  filters: AuditFilters;
  rows: AuditRow[];
  meta: PageMeta;
  status: RequestStatus;
  error: ApiErrorShape | null;
  selectedId: string | null;
  actors: AuditActor[];
}

const initialState: AuditLogState = {
  filters: {
    period: 'today',
    dateFrom: null,
    dateTo: null,
    actorId: null,
    group: null,
    q: '',
    page: 1,
    pageSize: AUDIT_PAGE_SIZE,
  },
  rows: [],
  meta: { page: 1, pageSize: AUDIT_PAGE_SIZE, total: 0, totalPages: 0 },
  status: 'idle',
  error: null,
  selectedId: null,
  actors: [],
};

const auditLogSlice = createSlice({
  name: 'auditLog',
  initialState,
  reducers: {
    /** Any filter change goes back to page 1 — page 4 of a narrower set may not exist. */
    auditFiltersChanged(state, action: PayloadAction<Partial<Omit<AuditFilters, 'page'>>>) {
      state.filters = { ...state.filters, ...action.payload, page: 1 };
    },
    auditPageChanged(state, action: PayloadAction<{ page: number; pageSize?: number }>) {
      state.filters.page = action.payload.page;
      if (action.payload.pageSize) state.filters.pageSize = action.payload.pageSize;
    },
    auditRowOpened(state, action: PayloadAction<string>) {
      state.selectedId = action.payload;
    },
    auditRowClosed(state) {
      state.selectedId = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAuditRows.pending, (state) => {
        state.status = state.rows.length > 0 ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchAuditRows.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.rows = action.payload.rows as Draft<AuditRow>[];
        state.meta = action.payload.meta;
      })
      .addCase(fetchAuditRows.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(fetchActors.fulfilled, (state, action) => {
        state.actors = action.payload;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { auditFiltersChanged, auditPageChanged, auditRowOpened, auditRowClosed } =
  auditLogSlice.actions;

export const auditLogReducer = auditLogSlice.reducer;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof auditLogSlice> {}
}

const injected = auditLogSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

export const selectAuditFilters = (state: RootState): AuditFilters => slice$(state).filters;
export const selectAuditRows = (state: RootState): readonly AuditRow[] => slice$(state).rows;
export const selectAuditMeta = (state: RootState): PageMeta => slice$(state).meta;
export const selectAuditStatus = (state: RootState): RequestStatus => slice$(state).status;
export const selectAuditError = (state: RootState): ApiErrorShape | null => slice$(state).error;
export const selectAuditSelectedId = (state: RootState): string | null => slice$(state).selectedId;
export const selectAuditActors = (state: RootState): readonly AuditActor[] => slice$(state).actors;
