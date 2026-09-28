'use client';

import { useCallback, useMemo, useState } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDegradedNetwork } from 'src/hooks/useDegradedNetwork';
import { useIdempotencyKey } from 'src/hooks/useIdempotencyKey';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectActiveRole } from 'src/redux/slice/sessionSlice';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';
import { applyServerErrors } from 'src/utils/applyServerErrors';
import { formatAmount } from 'src/utils/money';

import { LEDGER_ENTRY_FIELDS, SERVER_FIELD_TO_FORM } from '../constants/ledgerFormFields';
import { postEntry } from '../redux/ledgerEntryThunk';
import {
  creditBlockCleared,
  entryDraftDiscarded,
  entryDrawerClosed,
  entryDrawerOpened,
  entryWarningsDismissed,
  selectEntryBlockedBy,
  selectEntryDirection,
  selectEntryDraft,
  selectEntryOpenFor,
  selectEntryPrefillAmount,
  selectEntryStatus,
  selectEntryWarnings,
} from '../redux/ledgerFormSlice';

import type { LedgerDirection, LedgerEntryFormValues, LedgerWarning } from '../types/ledger.types';
import type { UseFormSetError } from 'react-hook-form';

/**
 * Part 19 §19.4 — everything the entry drawer does, so the drawer only renders.
 *
 * ── The credit-limit hand-off ──────────────────────────────────────────────
 * A blocking refusal is not an error this hook reports and clears. It is a
 * decision the drawer has to offer, and which offer depends on the actor: an
 * owner or admin sees "Save anyway", staff see only Cancel. `canOverride` is a
 * ROLE check rather than a codename one (BR-8) — a tenant that grants a staff
 * member `ledger.entry.write`, which is the ordinary thing to do because staff
 * work the counter, must not thereby hand them the power to lend past the cap
 * the owner set. The server decides again inside the transaction that writes;
 * this only decides which button to draw.
 */
export interface UseLedgerEntryFormResult {
  readonly open: boolean;
  readonly partyId: string | null;
  readonly direction: LedgerDirection;
  readonly isSaving: boolean;
  readonly canWrite: boolean;
  readonly canOverride: boolean;
  readonly formErrors: readonly string[];
  /** The refusal's figures, or `null`. Drives the in-drawer banner. */
  readonly blockedBy: LedgerWarning | null;
  readonly warnings: readonly LedgerWarning[];
  /** What was typed when a save failed, so Retry has something to resend. */
  readonly draft: LedgerEntryFormValues | null;
  readonly status: RequestStatus;
  /** An amount the drawer opens with, when the opener knows it (still editable). */
  readonly prefillAmount: string | null;
  readonly openEntry: (
    partyId: string,
    direction: LedgerDirection,
    options?: { readonly amount?: string | null }
  ) => void;
  readonly close: () => void;
  readonly discardDraft: () => void;
  readonly dismissBlock: () => void;
  readonly dismissWarnings: () => void;
  readonly submit: (
    values: LedgerEntryFormValues,
    setError: UseFormSetError<LedgerEntryFormValues>,
    options?: { readonly override?: boolean }
  ) => Promise<void>;
}

export const useLedgerEntryForm = (): UseLedgerEntryFormResult => {
  const dispatch = useAppDispatch();
  const { can } = usePermissions();
  const { canWrite: canWriteIn } = useDegradedNetwork();
  const role = useAppSelector(selectActiveRole);
  const openFor = useAppSelector(selectEntryOpenFor);
  const direction = useAppSelector(selectEntryDirection);
  const status = useAppSelector(selectEntryStatus);
  const blockedBy = useAppSelector(selectEntryBlockedBy);
  const warnings = useAppSelector(selectEntryWarnings);
  const draft = useAppSelector(selectEntryDraft);
  const prefillAmount = useAppSelector(selectEntryPrefillAmount);

  const { key, rotate } = useIdempotencyKey();
  const [formErrors, setFormErrors] = useState<readonly string[]>([]);

  /**
   * Class **A, queueable** (§19.10.4) — the canonical one.
   *
   * A ledger entry is safe to attempt on a bad connection in a way a party
   * create is not: the idempotency key makes a replay harmless, and there is no
   * cross-record check the server could refuse hours later. The credit limit is
   * the one thing it can refuse, and a refusal there is a decision the merchant
   * can act on, not a record that turns out never to have existed.
   *
   * `canWriteIn('queueable')` therefore keeps the buttons live on a connection
   * `deferred` would have taken the party form's Save away on.
   */
  const canWrite = can('ledger.entry.write') && canWriteIn('queueable');
  const canOverride = role === 'owner' || role === 'admin';

  const openEntry = useCallback(
    (partyId: string, next: LedgerDirection, options?: { readonly amount?: string | null }) => {
      setFormErrors([]);
      dispatch(entryDrawerOpened({ partyId, direction: next, amount: options?.amount ?? null }));
    },
    [dispatch]
  );

  const close = useCallback(() => {
    setFormErrors([]);
    dispatch(entryDrawerClosed());
  }, [dispatch]);

  const discardDraft = useCallback(() => {
    setFormErrors([]);
    dispatch(entryDraftDiscarded());
  }, [dispatch]);

  const dismissBlock = useCallback(() => dispatch(creditBlockCleared()), [dispatch]);
  const dismissWarnings = useCallback(() => dispatch(entryWarningsDismissed()), [dispatch]);

  const submit = useCallback(
    async (
      values: LedgerEntryFormValues,
      setError: UseFormSetError<LedgerEntryFormValues>,
      options: { override?: boolean } = {}
    ) => {
      if (!openFor) return;
      setFormErrors([]);
      try {
        const saved = await dispatch(
          postEntry({
            partyId: openFor,
            values,
            idempotencyKey: key,
            override: options.override,
          })
        ).unwrap();
        // A new key for the NEXT logical entry. The old one now identifies the
        // one just written, and reusing it would replay that instead of
        // recording the next sale.
        rotate();

        /* The drawer has closed, so the confirmation lives outside it — and it
           says the thing the merchant is about to say out loud: not "saved",
           but what this customer owes now. FR-3 replaces the header figure from
           the same number, so the snackbar and the header cannot disagree.

           Every figure goes through `formatAmount` and NOT `formatInr`. The
           copy carries the ₹ because Hindi puts the symbol elsewhere in the
           line, so a formatter that carried its own would produce "₹₹2,800.00";
           passing the raw decimal string instead produces "₹2800.00", which is
           the number a merchant reads out at the counter, ungrouped.

           This is the THIRD place in this codebase where those two mistakes
           have met — `creditCaption` and the credit-limit form hint were the
           first two — which is why the test for it names the pattern rather
           than the line. */
        const warning = saved.warnings.find((item) => item.code === 'credit_limit_exceeded');
        dispatch(
          showSnackbar(
            warning
              ? {
                  severity: 'warning',
                  id: 'ledger.entry.savedOverLimit',
                  params: {
                    over: formatAmount(warning.overBy),
                    limit: formatAmount(warning.limit),
                  },
                }
              : {
                  severity: 'success',
                  id: 'ledger.entry.saved',
                  params: {
                    amount: formatAmount(saved.entry.amount),
                    balance: formatAmount(saved.balance),
                  },
                }
          )
        );
      } catch (thrown) {
        const apiError = thrown as ApiErrorShape;
        if (apiError.code === 'validation_error') {
          // A corrected field is a NEW logical write: the server has already
          // answered this key, and resending it would get a 409 rather than the
          // entry the merchant just fixed.
          rotate();
          const translated: ApiErrorShape = {
            ...apiError,
            details: Object.fromEntries(
              Object.entries(apiError.details ?? {}).map(([path, messages]) => [
                SERVER_FIELD_TO_FORM[path] ?? path,
                messages,
              ])
            ),
          };
          setFormErrors(applyServerErrors(translated, setError, [...LEDGER_ENTRY_FIELDS]));
          return;
        }
        /* Two codes the drawer renders ITSELF rather than letting the global
           snackbar take them, because both are answerable in place and a toast
           over a closing drawer answers nothing:
             · `credit_limit_exceeded` — the slice has already turned it into
               `blockedBy`, and the banner offers Save anyway or Cancel.
             · `party_archived` — the entry cannot be written at all, and the
               sentence belongs above the form that will not submit. */
        if (apiError.code === 'credit_limit_exceeded') return;
        if (apiError.code === 'party_archived') {
          setFormErrors([apiError.message]);
          return;
        }
        /* Everything else — including the network failure AC-6 is about — has
           already been toasted by the response interceptor (R-E-2), and the
           draft is in the slice. The drawer stays open with what was typed and
           offers Retry, which resends with the SAME key. */
      }
    },
    [dispatch, key, openFor, rotate]
  );

  return useMemo(
    () => ({
      open: openFor !== null,
      partyId: openFor,
      direction,
      isSaving: status === 'loading',
      canWrite,
      canOverride,
      formErrors,
      blockedBy,
      warnings,
      draft,
      prefillAmount,
      status,
      openEntry,
      close,
      discardDraft,
      dismissBlock,
      dismissWarnings,
      submit,
    }),
    [
      openFor,
      direction,
      status,
      canWrite,
      canOverride,
      formErrors,
      blockedBy,
      warnings,
      draft,
      prefillAmount,
      openEntry,
      close,
      discardDraft,
      dismissBlock,
      dismissWarnings,
      submit,
    ]
  );
};
