'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDegradedNetwork } from 'src/hooks/useDegradedNetwork';
import { useIdempotencyKey } from 'src/hooks/useIdempotencyKey';
import { usePermissions } from 'src/hooks/usePermissions';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';
import { applyServerErrors } from 'src/utils/applyServerErrors';
import { formatAmount } from 'src/utils/money';

import {
  selectOpenDocuments,
  selectOpenDocumentsStatus,
  selectPaymentDraft,
  selectPaymentSaveStatus,
} from '../redux/paymentFormSlice';
import { fetchOpenDocuments, recordPayment } from '../redux/paymentThunk';

import type {
  OpenDocument,
  PaymentContext,
  PaymentDirection,
  PaymentFormValues,
  PaymentSaveResult,
} from '../types/payment.types';
import type { UseFormSetError } from 'react-hook-form';

/** The form fields a server `details` key can land on (everything else is a banner). */
const FORM_FIELDS = ['partyId', 'paymentDate', 'lines', 'note'] as const;

/** `mode_breakup.1.amount` → `lines.1.amount`; the lines are sent in the order typed. */
export const toFormPath = (path: string): string | null => {
  if (path.startsWith('mode_breakup.')) {
    const rest = path.slice('mode_breakup.'.length);
    return `lines.${rest.replace('upi_app', 'upiApp')}`;
  }
  if (path === 'payment_date') return 'paymentDate';
  if (path === 'party_id') return 'partyId';
  if (path === 'note') return 'note';
  return null;
};

/**
 * Part 19 §19.4 — the Record-payment drawer's state and its one write, so the
 * components only render. Used by the drawer itself (which every entry point
 * loads lazily), never by the pages that open it.
 */
export interface UsePaymentFormResult {
  readonly canWrite: boolean;
  readonly isSaving: boolean;
  readonly draft: PaymentFormValues | null;
  readonly formErrors: readonly string[];
  readonly openDocuments: readonly OpenDocument[];
  readonly openStatus: RequestStatus;
  readonly loadOpenDocuments: (partyId: string, direction: PaymentDirection) => void;
  readonly submit: (
    values: PaymentFormValues,
    setError: UseFormSetError<PaymentFormValues>
  ) => Promise<PaymentSaveResult | null>;
}

export const usePaymentForm = (context: PaymentContext): UsePaymentFormResult => {
  const dispatch = useAppDispatch();
  const { can, hasModule } = usePermissions();
  const { canWrite: canWriteIn } = useDegradedNetwork();
  const status = useAppSelector(selectPaymentSaveStatus);
  const draft = useAppSelector(selectPaymentDraft);
  const openDocuments = useAppSelector(selectOpenDocuments);
  const openStatus = useAppSelector(selectOpenDocumentsStatus);
  const { key, rotate } = useIdempotencyKey();
  const [formErrors, setFormErrors] = useState<readonly string[]>([]);

  /* Class A, queueable (§19.10.4): the idempotency key makes a replay harmless. */
  const canWrite =
    hasModule('payments') && can('payments.payment.write') && canWriteIn('queueable');

  const loadOpenDocuments = useCallback(
    (partyId: string, direction: PaymentDirection) => {
      if (!partyId) return;
      void dispatch(fetchOpenDocuments({ partyId, direction }));
    },
    [dispatch]
  );

  // The drawer opened on a known party lists its bills at once (FR-2, NFR ≤ 200 ms).
  const { partyId, direction } = context;
  useEffect(() => {
    if (partyId) loadOpenDocuments(partyId, direction);
  }, [partyId, direction, loadOpenDocuments]);

  const submit = useCallback(
    async (
      values: PaymentFormValues,
      setError: UseFormSetError<PaymentFormValues>
    ): Promise<PaymentSaveResult | null> => {
      setFormErrors([]);
      try {
        const saved = await dispatch(
          recordPayment({ values, idempotencyKey: key, context: context.entry })
        ).unwrap();
        // The key now names the payment just written; the next save is a new one.
        rotate();
        /* "Received ₹500 · RCT/26-27/0017". `formatAmount`: the copy carries its
           own ₹ (Hindi places it elsewhere), and `formatInr` would print ₹₹. */
        dispatch(
          showSnackbar({
            severity: 'success',
            id: values.direction === 'in' ? 'payments.saved' : 'payments.savedOut',
            params: {
              amount: formatAmount(saved.payment.amount),
              number: saved.payment.number,
            },
          })
        );
        return saved;
      } catch (thrown) {
        const apiError = thrown as ApiErrorShape;
        if (apiError.code === 'validation_error') {
          rotate(); // a corrected field is a new logical write
          const anchored: Record<string, readonly string[]> = {};
          const loose: string[] = [];
          Object.entries(apiError.details ?? {}).forEach(([path, messages]) => {
            const target = toFormPath(path);
            const list = (Array.isArray(messages) ? messages : [String(messages)]) as string[];
            if (target) anchored[target] = list;
            else loose.push(...list);
          });
          const rest = applyServerErrors({ ...apiError, details: anchored }, setError, [
            ...FORM_FIELDS,
          ]);
          setFormErrors([...loose, ...rest]);
          return null;
        }
        if (apiError.code === 'document_not_open') {
          // §9 — a listed bill was settled meanwhile: say so, and re-read the list.
          rotate();
          setFormErrors([apiError.message]);
          if (values.partyId) loadOpenDocuments(values.partyId, values.direction);
          return null;
        }
        if (apiError.code === 'party_archived' || apiError.code === 'not_found') {
          rotate();
          setFormErrors([apiError.message]);
          return null;
        }
        /* Everything else — a dropped connection included — has been toasted by
           the interceptor. The drawer keeps the draft, and Save resends it with
           the SAME key. */
        return null;
      }
    },
    [dispatch, key, rotate, context.entry, loadOpenDocuments]
  );

  return useMemo(
    () => ({
      canWrite,
      isSaving: status === 'loading',
      draft,
      formErrors,
      openDocuments,
      openStatus,
      loadOpenDocuments,
      submit,
    }),
    [canWrite, status, draft, formErrors, openDocuments, openStatus, loadOpenDocuments, submit]
  );
};
