import { createSlice, isAnyOf, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import type { RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { correctEntry, postEntry, reverseEntry } from './ledgerEntryThunk';

import type {
  LedgerDirection,
  LedgerEntry,
  LedgerEntryFormValues,
  LedgerWarning,
} from '../types/ledger.types';

/**
 * Part 19 §19.3.2 Shape A — the entry drawer's own slice.
 *
 * ── Why the open flag is store state rather than `useState` ─────────────────
 * The same reason `partyFormSlice` gives, and more callers: the khata page's
 * two buttons open this drawer, a list row's quick action will, and RPT-01's
 * dashboard tile will. None of them can reach a `useState` setter, and a
 * component that lifted it would become the thing everything else has to be
 * rendered inside.
 *
 * ── What `draft` is for, and what it is not ────────────────────────────────
 * FR-12 / AC-6: the request fails on a bad connection, and the merchant must
 * not lose what they typed. The values survive the failure here so the drawer
 * can be reopened with them and Retry can resend — with the SAME idempotency
 * key, which is what stops a first request that actually arrived from becoming
 * a second entry.
 *
 * It is NOT the outbox. `src/utils/outbox.ts` is a write that survives the tab
 * closing, in IndexedDB, replayed serially; this is a value that survives a
 * failed fetch. Shipping half of the outbox would leave entries in a store
 * nothing drains, which is worse than not having one.
 */
export interface LedgerFormState {
  /** `null` when closed; otherwise the party the entry is for. */
  openFor: string | null;
  /** Which button opened it. The direction is switchable inside the drawer. */
  direction: LedgerDirection;
  /**
   * An amount the opener already knows — the archive dialog's Record payment
   * passes the outstanding magnitude, so the merchant confirms a figure rather
   * than retyping one they were just shown (UAT). Editable in the drawer; a
   * failed save's `draft` still wins over it.
   */
  prefillAmount: string | null;
  status: RequestStatus;
  error: ApiErrorShape | null;
  /** Survives a failed post so Retry has something to resend (FR-12). */
  draft: LedgerEntryFormValues | null;
  /**
   * The credit-limit refusal, kept apart from `error`.
   *
   * It is not a failure the drawer reports and clears; it is a decision the
   * drawer has to offer — "Save anyway" for an owner, "Cancel" for staff — and
   * it has to survive the re-render that follows the rejection. Folding it into
   * `error` would mean the banner and the generic error strip were the same
   * state, and the generic strip would show a message about a limit.
   */
  blockedBy: LedgerWarning | null;
  /** Warnings beside a 201 (Alternate C). Outlive the drawer closing. */
  warnings: LedgerWarning[];
  /** The balance the last successful post produced (FR-3). */
  lastBalance: string | null;

  // ── LED-03, in THIS slice rather than a fourth one ────────────────────────
  //
  // `bundle-budgets.json` is the reason, and it is a measured one: every slice
  // `store.ts` registers statically ships to every route, and the two this
  // feature already added cost 1.0 KB on the login screen. §19.3.9's lazy
  // registration is the real answer and is still the owner's call; until it is
  // made, a third ledger slice would be a third of that again for state that
  // belongs to the same thing this one already holds — the ledger's write
  // forms, one at a time, on one khata.
  //
  // They are genuinely one concern: a merchant is either posting an entry,
  // reversing one, or correcting one, and never two at once. The invariant is
  // enforced by `entryDrawerOpened` and `correctionOpened` clearing each other.

  /** The entry the correction drawer is editing, or `null`. */
  correcting: LedgerEntry | null;
  /** The entry the reverse dialog is confirming, or `null`. */
  reversing: LedgerEntry | null;
  correctionStatus: RequestStatus;
  correctionError: ApiErrorShape | null;
}

const initialState: LedgerFormState = {
  openFor: null,
  direction: 'debit',
  prefillAmount: null,
  status: 'idle',
  error: null,
  draft: null,
  blockedBy: null,
  warnings: [],
  lastBalance: null,
  correcting: null,
  reversing: null,
  correctionStatus: 'idle',
  correctionError: null,
};

export interface OpenEntryPayload {
  readonly partyId: string;
  readonly direction: LedgerDirection;
  /** A plain decimal string (`"2300.00"`), or absent for an empty amount. */
  readonly amount?: string | null;
}

const ledgerFormSlice = createSlice({
  name: 'ledgerForm',
  initialState,
  reducers: {
    entryDrawerOpened(state, action: PayloadAction<OpenEntryPayload>) {
      // One write form at a time — see the interface. Opening the entry drawer
      // from behind an open correction would stack two dialogs, and the one
      // underneath would still be holding a row it was about to rewrite.
      state.correcting = null;
      state.reversing = null;
      state.openFor = action.payload.partyId;
      state.direction = action.payload.direction;
      state.prefillAmount = action.payload.amount ?? null;
      state.status = 'idle';
      state.error = null;
      state.blockedBy = null;
      /* The draft is NOT cleared here. Opening the drawer after a failed save
         is how a merchant retries, and clearing it would throw away what they
         typed at exactly the moment they came back for it. It is cleared on a
         successful post and on an explicit discard. */
    },
    entryDrawerClosed(state) {
      state.openFor = null;
      state.status = 'idle';
      state.error = null;
      state.blockedBy = null;
    },
    /** The merchant gave up on a failed entry. The typed values go. */
    entryDraftDiscarded(state) {
      state.draft = null;
      state.error = null;
      state.blockedBy = null;
    },
    /** The limit banner is dismissed without saving — the form stays open. */
    creditBlockCleared(state) {
      state.blockedBy = null;
    },
    entryWarningsDismissed(state) {
      state.warnings = [];
    },

    // ── LED-03 ───────────────────────────────────────────────────────────────
    /** FR-3 — the correction drawer, opened on the row the merchant chose. */
    correctionOpened(state, action: PayloadAction<LedgerEntry>) {
      state.openFor = null;
      state.reversing = null;
      state.correcting = action.payload as Draft<LedgerEntry>;
      state.correctionStatus = 'idle';
      state.correctionError = null;
    },
    /** FR-2 — the reverse confirmation, which asks for a reason and nothing else. */
    reverseOpened(state, action: PayloadAction<LedgerEntry>) {
      state.openFor = null;
      state.correcting = null;
      state.reversing = action.payload as Draft<LedgerEntry>;
      state.correctionStatus = 'idle';
      state.correctionError = null;
    },
    correctionClosed(state) {
      state.correcting = null;
      state.reversing = null;
      state.correctionStatus = 'idle';
      state.correctionError = null;
    },
    resetLedgerForm: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(postEntry.pending, (state, action) => {
        state.status = 'loading';
        state.error = null;
        state.blockedBy = null;
        // Held BEFORE the request rather than after it fails: a rejection
        // handler cannot read the form, and `action.meta.arg` is the only place
        // the typed values still exist once the thunk has thrown.
        state.draft = action.meta.arg.values as Draft<LedgerEntryFormValues>;
      })
      .addCase(postEntry.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.openFor = null;
        state.draft = null;
        state.blockedBy = null;
        state.warnings = action.payload.warnings as Draft<LedgerWarning>[];
        state.lastBalance = action.payload.balance || null;
      })
      .addCase(postEntry.rejected, (state, action) => {
        state.status = 'failed';
        const error = action.payload ?? null;
        /* A credit-limit refusal is a decision, not an error. It carries the
           figures the banner prints, and the drawer STAYS OPEN with what the
           merchant typed — closing it and toasting would make them retype an
           entry the server is willing to accept from an owner. */
        if (error?.code === 'credit_limit_exceeded') {
          state.blockedBy = {
            code: error.code,
            limit: (error.details?.limit as string | null) ?? null,
            balanceAfter: (error.details?.balance_after as string) ?? '',
            overBy: (error.details?.over_by as string) ?? '',
          };
          return;
        }
        state.error = error as Draft<ApiErrorShape> | null;
      })
      .addCase(resetAllFeatureState, () => initialState)
      /* Both LED-03 writes share these three reducers, because from this
         slice's point of view they are the same event: a form is in flight, a
         form succeeded and closed, a form failed and stayed open with what was
         typed. What differs is the body, and the body is the service's.

         `isAnyOf` rather than two pairs of `addCase`, and the matchers come
         last because RTK requires it — `addCase` may not follow `addMatcher`,
         which is a build error rather than a silent one, but only if you try.

         `party_archived` and `use_document_void` are kept in `correctionError`
         rather than left to the global snackbar, for the reason the entry
         drawer keeps `credit_limit_exceeded`: both are answerable in place —
         restore the party, or go and void the document — and a toast over a
         closing dialog answers neither. */
      .addMatcher(isAnyOf(reverseEntry.pending, correctEntry.pending), (state) => {
        state.correctionStatus = 'loading';
        state.correctionError = null;
      })
      .addMatcher(isAnyOf(reverseEntry.fulfilled, correctEntry.fulfilled), (state, action) => {
        state.correctionStatus = 'succeeded';
        state.correcting = null;
        state.reversing = null;
        state.lastBalance = action.payload.balance || null;
      })
      .addMatcher(isAnyOf(reverseEntry.rejected, correctEntry.rejected), (state, action) => {
        state.correctionStatus = 'failed';
        state.correctionError = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      });
  },
});

export const {
  entryDrawerOpened,
  entryDrawerClosed,
  entryDraftDiscarded,
  creditBlockCleared,
  entryWarningsDismissed,
  correctionOpened,
  reverseOpened,
  correctionClosed,
  resetLedgerForm,
} = ledgerFormSlice.actions;

export const ledgerFormReducer = ledgerFormSlice.reducer;

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectEntryOpenFor = (state: RootState): string | null => state.ledgerForm.openFor;
export const selectEntryDirection = (state: RootState): LedgerDirection =>
  state.ledgerForm.direction;
export const selectEntryStatus = (state: RootState): RequestStatus => state.ledgerForm.status;
export const selectEntryError = (state: RootState): ApiErrorShape | null => state.ledgerForm.error;
export const selectEntryDraft = (state: RootState): LedgerEntryFormValues | null =>
  state.ledgerForm.draft;
export const selectEntryPrefillAmount = (state: RootState): string | null =>
  state.ledgerForm.prefillAmount;
export const selectEntryBlockedBy = (state: RootState): LedgerWarning | null =>
  state.ledgerForm.blockedBy;
export const selectEntryWarnings = (state: RootState): readonly LedgerWarning[] =>
  state.ledgerForm.warnings;
export const selectEntryLastBalance = (state: RootState): string | null =>
  state.ledgerForm.lastBalance;

export const selectCorrectingEntry = (state: RootState): LedgerEntry | null =>
  state.ledgerForm.correcting;
export const selectReversingEntry = (state: RootState): LedgerEntry | null =>
  state.ledgerForm.reversing;
export const selectCorrectionStatus = (state: RootState): RequestStatus =>
  state.ledgerForm.correctionStatus;
export const selectCorrectionError = (state: RootState): ApiErrorShape | null =>
  state.ledgerForm.correctionError;
