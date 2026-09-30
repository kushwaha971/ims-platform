import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  createPartyRelation,
  deletePartyRelation,
  fetchPartyRelations,
} from './partyRelationThunk';

import type { PartyRelation, PartyRelations } from '../types/party.types';

/**
 * A6 (PLT-X04 §7) — the khata's guardian and payer section. One party at a time
 * (`partyId`), lazily injected: only a khata of a business with a module that
 * has roles ever opens it.
 */
export interface PartyRelationState {
  partyId: string | null;
  data: PartyRelations | null;
  status: RequestStatus;
  error: ApiErrorShape | null;
  dialogOpen: boolean;
  saving: boolean;
  removingId: string | null;
}

const initialState: PartyRelationState = {
  partyId: null,
  data: null,
  status: 'idle',
  error: null,
  dialogOpen: false,
  saving: false,
  removingId: null,
};

/** A re-opened relation replaces its old row; a new one goes first. */
const upsert = (rows: readonly PartyRelation[], row: PartyRelation): PartyRelation[] => {
  const rest = rows.filter((existing) => existing.id !== row.id);
  return [row, ...rest];
};

const partyRelationSlice = createSlice({
  name: 'partyRelation',
  initialState,
  reducers: {
    relationDialogOpened(state) {
      state.dialogOpen = true;
    },
    relationDialogClosed(state) {
      state.dialogOpen = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPartyRelations.pending, (state, action) => {
        if (state.partyId !== action.meta.arg) {
          // Another khata: never show one party's links under another's name.
          state.partyId = action.meta.arg;
          state.data = null;
          state.dialogOpen = false;
        }
        state.status = state.data ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchPartyRelations.fulfilled, (state, action) => {
        if (state.partyId !== action.meta.arg) return;
        state.status = 'succeeded';
        state.data = action.payload as Draft<PartyRelations>;
      })
      .addCase(fetchPartyRelations.rejected, (state, action) => {
        if (action.meta.aborted || state.partyId !== action.meta.arg) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(createPartyRelation.pending, (state) => {
        state.saving = true;
      })
      .addCase(createPartyRelation.fulfilled, (state, action) => {
        state.saving = false;
        state.dialogOpen = false;
        if (state.data && state.partyId === action.meta.arg.partyId) {
          state.data.asPerson = upsert(state.data.asPerson, action.payload) as Draft<
            PartyRelation[]
          >;
        }
      })
      .addCase(createPartyRelation.rejected, (state) => {
        state.saving = false;
      })
      .addCase(deletePartyRelation.pending, (state, action) => {
        state.removingId = action.meta.arg.relationId;
      })
      .addCase(deletePartyRelation.fulfilled, (state, action) => {
        state.removingId = null;
        if (!state.data || state.partyId !== action.meta.arg.partyId) return;
        const removal = action.payload;
        const apply = (rows: readonly PartyRelation[]): PartyRelation[] =>
          removal.outcome === 'deleted'
            ? rows.filter((row) => row.id !== removal.id)
            : rows.map((row) => (row.id === removal.relation.id ? removal.relation : row));
        state.data.asPerson = apply(state.data.asPerson) as Draft<PartyRelation[]>;
        state.data.asRelated = apply(state.data.asRelated) as Draft<PartyRelation[]>;
      })
      .addCase(deletePartyRelation.rejected, (state) => {
        state.removingId = null;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { relationDialogOpened, relationDialogClosed } = partyRelationSlice.actions;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof partyRelationSlice> {}
}

const injected = partyRelationSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

export const selectPartyRelations = (state: RootState): PartyRelations | null => slice$(state).data;
export const selectPartyRelationsFor = (state: RootState): string | null => slice$(state).partyId;
export const selectPartyRelationStatus = (state: RootState): RequestStatus => slice$(state).status;
export const selectPartyRelationError = (state: RootState): ApiErrorShape | null =>
  slice$(state).error;
export const selectRelationDialogOpen = (state: RootState): boolean => slice$(state).dialogOpen;
export const selectRelationSaving = (state: RootState): boolean => slice$(state).saving;
export const selectRelationRemovingId = (state: RootState): string | null =>
  slice$(state).removingId;
