'use client';

import { useCallback, useMemo, useState } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDegradedNetwork } from 'src/hooks/useDegradedNetwork';
import { useIdempotencyKey } from 'src/hooks/useIdempotencyKey';
import { usePermissions } from 'src/hooks/usePermissions';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';
import { applyServerErrors } from 'src/utils/applyServerErrors';
import { formatAmount } from 'src/utils/money';

import { LEDGER_CORRECTION_FIELDS, SERVER_FIELD_TO_FORM } from '../constants/ledgerFormFields';
import { correctEntry, reverseEntry } from '../redux/ledgerEntryThunk';
import {
  correctionClosed,
  correctionOpened,
  reverseOpened,
  selectCorrectingEntry,
  selectCorrectionError,
  selectCorrectionStatus,
  selectReversingEntry,
} from '../redux/ledgerFormSlice';

import type {
  LedgerCorrectionFormValues,
  LedgerCorrectionValues,
  LedgerEntry,
} from '../types/ledger.types';
import type { UseFormSetError } from 'react-hook-form';

/**
 * Part 19 §19.4 — LED-03's two write flows, so the dialog and the drawer only
 * render.
 *
 * ── Why both live in one hook ──────────────────────────────────────────────
 * They are one decision seen twice. A merchant looking at a wrong line either
 * wants it gone or wants it different, and the menu offers both on the same
 * row; the permission, the network class, the idempotency key and every error
 * code are identical. Two hooks would be two copies of the error mapping, and
 * the error mapping is where the interesting cases are.
 *
 * ── Why `canCorrect` is a CODENAME check ──────────────────────────────────
 * Unlike `canOverride` in `useLedgerEntryForm`, which is a role check because a
 * tenant must not be able to hand the credit-limit override to the counter by
 * granting a permission. A correction is an ordinary capability: a shop that
 * wants its senior cashier to fix typos should be able to say so, and
 * `permissions_registry.py` gives `ledger.entry.correct` to the owner and the
 * manager by default and not to staff. The server checks the same codename.
 */
export interface UseEntryCorrectionResult {
  readonly correcting: LedgerEntry | null;
  readonly reversing: LedgerEntry | null;
  readonly isSaving: boolean;
  readonly canCorrect: boolean;
  readonly status: RequestStatus;
  readonly formErrors: readonly string[];
  readonly openCorrect: (entry: LedgerEntry) => void;
  readonly openReverse: (entry: LedgerEntry) => void;
  readonly close: () => void;
  readonly submitReverse: (reason: string) => Promise<void>;
  readonly submitCorrect: (
    values: LedgerCorrectionFormValues,
    setError: UseFormSetError<LedgerCorrectionFormValues>
  ) => Promise<void>;
}

export const useEntryCorrection = (): UseEntryCorrectionResult => {
  const dispatch = useAppDispatch();
  const { can } = usePermissions();
  const { canWrite: canWriteIn } = useDegradedNetwork();
  const correcting = useAppSelector(selectCorrectingEntry);
  const reversing = useAppSelector(selectReversingEntry);
  const status = useAppSelector(selectCorrectionStatus);
  const serverError = useAppSelector(selectCorrectionError);

  const { key, rotate } = useIdempotencyKey();
  const [localErrors, setLocalErrors] = useState<readonly string[]>([]);

  /**
   * Class **A, queueable** (§19.10.4), the same as posting an entry.
   *
   * The idempotency key makes a replay harmless, which is the whole test: a
   * reverse that arrives twice on a flaky connection writes one reversal. There
   * is no cross-record check the server could refuse hours later either — the
   * one refusal it has, `entry_already_reversed`, is about the row itself and
   * is answerable the moment it arrives.
   */
  const canCorrect = can('ledger.entry.correct') && canWriteIn('queueable');

  const openCorrect = useCallback(
    (entry: LedgerEntry) => {
      setLocalErrors([]);
      dispatch(correctionOpened(entry));
    },
    [dispatch]
  );

  const openReverse = useCallback(
    (entry: LedgerEntry) => {
      setLocalErrors([]);
      dispatch(reverseOpened(entry));
    },
    [dispatch]
  );

  const close = useCallback(() => {
    setLocalErrors([]);
    dispatch(correctionClosed());
  }, [dispatch]);

  /**
   * The codes this feature answers ITSELF rather than letting the global
   * snackbar take, and why each one belongs in the dialog it was raised from.
   *
   * `entry_already_reversed` — somebody else got there first, on another device
   * or in another tab. The row on screen is stale and the merchant's next action
   * is to close and look again, which is a sentence, not a toast that vanishes
   * while they are still reading the line it is about.
   *
   * `use_document_void` — the entry came from an invoice. The answer is "go and
   * void the invoice", which is a different screen; saying so where they are
   * standing is the only version of that message that helps. (There is nothing
   * to link to yet — SAL-05 does not exist — which is why this is a sentence
   * rather than a button.)
   *
   * `party_archived` — the khata is closed. Restore, then correct.
   *
   * Everything else has already been toasted by the response interceptor
   * (R-E-2) and the dialog stays open with what was typed.
   */
  const handledInPlace = useCallback((error: ApiErrorShape): boolean => {
    const codes = ['entry_already_reversed', 'use_document_void', 'party_archived'];
    if (!codes.includes(error.code)) return false;
    setLocalErrors([error.message]);
    return true;
  }, []);

  const submitReverse = useCallback(
    async (reason: string) => {
      if (!reversing) return;
      setLocalErrors([]);
      try {
        const result = await dispatch(
          reverseEntry({ entry: reversing, reason, idempotencyKey: key })
        ).unwrap();
        // A new key for the NEXT logical correction. The old one now identifies
        // this reversal, and reusing it would replay this instead of doing the
        // next thing the merchant asks for.
        rotate();
        dispatch(
          showSnackbar({
            severity: 'success',
            id: 'ledger.correction.reversed',
            params: {
              amount: formatAmount(reversing.amount),
              balance: formatAmount(result.balance),
            },
          })
        );
      } catch (thrown) {
        const error = thrown as ApiErrorShape;
        /* A refusal means nothing was written, so the key is spent on a request
           the server has now answered — the next attempt is a NEW logical write
           and needs its own, or it would replay the refusal. */
        rotate();
        handledInPlace(error);
      }
    },
    [dispatch, key, reversing, rotate, handledInPlace]
  );

  const submitCorrect = useCallback(
    async (
      values: LedgerCorrectionFormValues,
      setError: UseFormSetError<LedgerCorrectionFormValues>
    ) => {
      if (!correcting) return;
      setLocalErrors([]);
      const payload: LedgerCorrectionValues = { ...values };
      try {
        const result = await dispatch(
          correctEntry({ entry: correcting, values: payload, idempotencyKey: key })
        ).unwrap();
        rotate();
        dispatch(
          showSnackbar({
            severity: 'success',
            id: 'ledger.correction.corrected',
            params: {
              amount: formatAmount(result.entry.amount),
              balance: formatAmount(result.balance),
            },
          })
        );
      } catch (thrown) {
        const error = thrown as ApiErrorShape;
        rotate();
        if (error.code === 'validation_error') {
          const translated: ApiErrorShape = {
            ...error,
            details: Object.fromEntries(
              Object.entries(error.details ?? {}).map(([path, messages]) => [
                SERVER_FIELD_TO_FORM[path] ?? path,
                messages,
              ])
            ),
          };
          /* `non_field_errors` is the one the server uses for "nothing changed",
             and `applyServerErrors` routes it to the form-level block — which is
             where it belongs, because the objection is about the form as a whole
             rather than any control in it. */
          setLocalErrors(applyServerErrors(translated, setError, [...LEDGER_CORRECTION_FIELDS]));
          return;
        }
        handledInPlace(error);
      }
    },
    [dispatch, key, correcting, rotate, handledInPlace]
  );

  const formErrors = useMemo(
    () =>
      localErrors.length > 0
        ? localErrors
        : /* The slice's copy is what survives a re-render the local state does
             not, which is the case when the dialog is re-mounted by a parent
             that re-rendered on the same rejection. */
          serverError && serverError.code !== 'validation_error'
          ? [serverError.message]
          : [],
    [localErrors, serverError]
  );

  return useMemo(
    () => ({
      correcting,
      reversing,
      isSaving: status === 'loading',
      canCorrect,
      status,
      formErrors,
      openCorrect,
      openReverse,
      close,
      submitReverse,
      submitCorrect,
    }),
    [
      correcting,
      reversing,
      status,
      canCorrect,
      formErrors,
      openCorrect,
      openReverse,
      close,
      submitReverse,
      submitCorrect,
    ]
  );
};
