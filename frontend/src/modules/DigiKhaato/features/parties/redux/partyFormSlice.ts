import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import type { RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { saveParty } from './partyFormThunk';

import type { PartyDetail, PartyWarning } from '../types/party.types';

/**
 * Part 19 §19.3.2 — the form drawer's own slice.
 *
 * ── Why the OPEN flag is store state and not `useState` in the list page ────
 * Because three different things open this drawer: the header's Add button,
 * the empty state's call to action, and a row's Edit action. With a `useState`
 * in the list page, each of those has to be handed a setter through props, and
 * the next caller — the party detail screen in PTY-03, the invoice editor's
 * quick-create in SAL-02 — has no way to reach it at all.
 *
 * ── Why the WARNINGS are here ───────────────────────────────────────────────
 * A `gstin_state_mismatch` arrives with a 201. The record saved, the drawer
 * closes, and the merchant still has to be told — so the note has to outlive
 * the component that submitted it. In `useState` it dies with the drawer, one
 * render before anyone could read it.
 */
export interface PartyFormState {
  /** `null` when closed. `'new'` for a create; a party id for an edit. */
  openFor: string | null;
  /** The record being edited, loaded from the list row the merchant clicked. */
  editing: PartyDetail | null;
  status: RequestStatus;
  error: ApiErrorShape | null;
  /** Survives the drawer closing; the screen shows it and then dismisses it. */
  warnings: PartyWarning[];
  /** The party the last save produced, so the screen can say its name. */
  lastSaved: PartyDetail | null;
}

const initialState: PartyFormState = {
  openFor: null,
  editing: null,
  status: 'idle',
  error: null,
  warnings: [],
  lastSaved: null,
};

const partyFormSlice = createSlice({
  name: 'partyForm',
  initialState,
  reducers: {
    partyCreateOpened(state) {
      state.openFor = 'new';
      state.editing = null;
      state.status = 'idle';
      state.error = null;
    },
    partyEditOpened(state, action: PayloadAction<PartyDetail>) {
      state.openFor = action.payload.id;
      state.editing = action.payload as Draft<PartyDetail>;
      state.status = 'idle';
      state.error = null;
    },
    partyFormClosed(state) {
      state.openFor = null;
      state.editing = null;
      state.error = null;
      state.status = 'idle';
    },
    /** The merchant has read the note. Warnings are advice, not a record. */
    partyWarningsDismissed(state) {
      state.warnings = [];
      state.lastSaved = null;
    },
    resetPartyForm: () => initialState,
  },
  extraReducers: (builder) => {
    /**
     * No `acceptInvalidation` here, and that is not an omission.
     *
     * That helper is for slices holding SERVER ROWS: it sets a `stale` flag so
     * a list knows to refetch. This slice holds a drawer's open flag, a form's
     * status and a warning — nothing that can be out of date with the server,
     * because none of it came from the server. Giving it `stale` and
     * `staleUrgency` fields to satisfy the type would be inventing state to
     * describe a condition it cannot be in.
     *
     * What it does need is the teardown: a logout or a tenant switch must not
     * leave a half-typed party from another business sitting in a drawer.
     */
    builder
      .addCase(resetAllFeatureState, () => initialState)
      .addCase(saveParty.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(saveParty.fulfilled, (state, action) => {
        state.status = 'succeeded';
        // The drawer closes on success and the note takes its place. Leaving it
        // open with a green banner invites a second submit of a form that has
        // already been saved.
        state.openFor = null;
        state.editing = null;
        state.warnings = [...action.payload.warnings] as Draft<PartyWarning>[];
        state.lastSaved = action.payload.party as Draft<PartyDetail>;
      })
      .addCase(saveParty.rejected, (state, action) => {
        state.status = 'failed';
        // Kept for the banner. The FIELD errors inside it are read by
        // `usePartyForm`, which is the only thing that knows which field is
        // which — a slice that mapped them would have to know the form.
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      });
  },
});

export const {
  partyCreateOpened,
  partyEditOpened,
  partyFormClosed,
  partyWarningsDismissed,
  resetPartyForm,
} = partyFormSlice.actions;

export const partyFormReducer = partyFormSlice.reducer;

export const selectPartyFormOpenFor = (state: RootState): string | null =>
  state.partyForm.openFor;
export const selectPartyFormEditing = (state: RootState): PartyDetail | null =>
  state.partyForm.editing;
export const selectPartyFormStatus = (state: RootState): RequestStatus =>
  state.partyForm.status;
export const selectPartyFormError = (state: RootState): ApiErrorShape | null =>
  state.partyForm.error;
export const selectPartyFormWarnings = (state: RootState): readonly PartyWarning[] =>
  state.partyForm.warnings;
export const selectPartyFormLastSaved = (state: RootState): PartyDetail | null =>
  state.partyForm.lastSaved;
