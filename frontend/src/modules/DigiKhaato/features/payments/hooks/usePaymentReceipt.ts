'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useIdempotencyKey } from 'src/hooks/useIdempotencyKey';
import { usePermissions } from 'src/hooks/usePermissions';
import type { PrintBranding } from 'src/print/brandingPrintService';
import { usePrintBranding } from 'src/print/usePrintBranding';
import { selectLocale } from 'src/redux/slice/localeSlice';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape } from 'src/types/api.types';
import { formatAmount } from 'src/utils/money';

import { selectPaymentReceipt, type PaymentReceiptState } from '../redux/paymentReceiptSlice';
import {
  allocateExistingPayment,
  fetchApplyCandidates,
  fetchCollectQr,
  fetchPayment,
  shareReceipt,
  voidPayment,
} from '../redux/paymentThunk';
import { applyRequestRows, canApplyAdvance } from '../view-model/applyGate';

import type { ApplyRowForm } from '../types/payment.types';

/**
 * PAY-04 / PAY-05 — the receipt page's data and its acts: print
 * (`window.print()` once the sheet is in the DOM and the fonts are in, as the
 * invoice does), share (the server writes the words, the merchant's WhatsApp
 * sends them — DEC-012), and void with a reason.
 */
export interface UsePaymentReceiptResult extends PaymentReceiptState {
  /** The letterhead (R33, A16 — `src/print`); `null` until it arrives. */
  readonly branding: PrintBranding | null;
  readonly canVoid: boolean;
  readonly canShare: boolean;
  readonly shareText: string | null;
  readonly shareMobile: string | null;
  readonly voidErrors: readonly string[];
  /** A4a — may this receipt's advance be applied to later bills, by this member? */
  readonly canApply: boolean;
  readonly applyErrors: readonly string[];
  readonly print: () => void;
  readonly startShare: () => Promise<boolean>;
  readonly submitVoid: (reason: string) => Promise<boolean>;
  /** A4a — load what Apply to bills offers (the payment's direction and bucket). */
  readonly loadApplyCandidates: () => void;
  readonly submitApply: (rows: readonly ApplyRowForm[]) => Promise<boolean>;
}

export const usePaymentReceipt = (id: string, autoPrint: boolean): UsePaymentReceiptResult => {
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectPaymentReceipt);
  const branding = usePrintBranding();
  const locale = useAppSelector(selectLocale);
  const { can, hasModule } = usePermissions();
  const voidKey = useIdempotencyKey();
  const shareKey = useIdempotencyKey();
  const applyKey = useIdempotencyKey();
  const [applyErrors, setApplyErrors] = useState<readonly string[]>([]);
  const [printing, setPrinting] = useState(autoPrint);
  const [shareText, setShareText] = useState<string | null>(null);
  const [shareMobile, setShareMobile] = useState<string | null>(null);
  const [voidErrors, setVoidErrors] = useState<readonly string[]>([]);

  useEffect(() => {
    const payment = dispatch(fetchPayment(id));
    return () => {
      payment.abort();
    };
  }, [dispatch, id]);

  // The receipt's footer QR is the STATIC one (PAY-03 BR-3) — "Pay next time".
  const hasVpa = !!state.payment?.business.upiVpa;
  useEffect(() => {
    if (hasVpa) void dispatch(fetchCollectQr({}));
  }, [dispatch, hasVpa]);

  // A refetch after an invalidation (a void from another screen).
  useEffect(() => {
    if (state.stale && state.payment?.id === id) void dispatch(fetchPayment(id));
  }, [dispatch, state.stale, state.payment?.id, id]);

  const loaded = state.payment?.id === id;
  const number = state.payment?.number;
  useEffect(() => {
    if (!printing || !loaded) return;
    const fonts = typeof document !== 'undefined' ? document.fonts?.ready : undefined;
    void Promise.resolve(fonts).then(() => {
      window.setTimeout(() => {
        const previous = document.title;
        document.title = number ?? previous; // the PDF's filename
        window.print();
        document.title = previous;
        setPrinting(false);
      }, 50);
    });
  }, [printing, loaded, number]);

  const print = useCallback(() => setPrinting(true), []);

  const { key: shareIdem, rotate: rotateShare } = shareKey;
  const startShare = useCallback(async (): Promise<boolean> => {
    setShareText(null);
    const result = await dispatch(shareReceipt({ id, locale, idempotencyKey: shareIdem }));
    rotateShare();
    if (!shareReceipt.fulfilled.match(result)) return false;
    setShareText(result.payload.text);
    setShareMobile(result.payload.mobile);
    return true;
  }, [dispatch, id, locale, shareIdem, rotateShare]);

  const { key: voidIdem, rotate: rotateVoid } = voidKey;
  const submitVoid = useCallback(
    async (reason: string): Promise<boolean> => {
      setVoidErrors([]);
      try {
        const result = await dispatch(
          voidPayment({ id, reason, idempotencyKey: voidIdem })
        ).unwrap();
        rotateVoid();
        dispatch(
          showSnackbar({
            severity: 'success',
            id: 'payments.void.done',
            params: { number: result.payment.number },
          })
        );
        return true;
      } catch (thrown) {
        const apiError = thrown as ApiErrorShape;
        if (apiError.code === 'payment_already_void') {
          // Alternate B — another admin got there first: show it as it is now.
          rotateVoid();
          void dispatch(fetchPayment(id));
          setVoidErrors([apiError.message]);
        } else if (apiError.code === 'validation_error') {
          rotateVoid();
          setVoidErrors([apiError.message]);
        }
        return false;
      }
    },
    [dispatch, id, voidIdem, rotateVoid]
  );

  const payment = state.payment?.id === id ? state.payment : null;
  const loadApplyCandidates = useCallback(() => {
    if (!payment?.party) return;
    setApplyErrors([]);
    void dispatch(
      fetchApplyCandidates({
        partyId: payment.party.id,
        direction: payment.direction,
        bucket: payment.bucket ?? 'main',
      })
    );
  }, [dispatch, payment]);

  const { key: applyIdem, rotate: rotateApply } = applyKey;
  const submitApply = useCallback(
    async (rows: readonly ApplyRowForm[]): Promise<boolean> => {
      setApplyErrors([]);
      try {
        const result = await dispatch(
          allocateExistingPayment({ id, rows: applyRequestRows(rows), idempotencyKey: applyIdem })
        ).unwrap();
        rotateApply();
        dispatch(
          showSnackbar({
            severity: 'success',
            id: 'payments.apply.done',
            params: {
              count: String(result.applied.length),
              amount: formatAmount(result.payment.unallocatedAmount),
            },
          })
        );
        return true;
      } catch (thrown) {
        const apiError = thrown as ApiErrorShape;
        if (
          [
            'over_allocated',
            'validation_error',
            'document_not_open',
            'payment_already_void',
          ].includes(apiError.code)
        ) {
          /* The server's answer is the truth (a bill paid on another counter, an advance
             applied elsewhere): say why here and re-read the receipt behind the dialog. */
          rotateApply();
          void dispatch(fetchPayment(id));
          setApplyErrors([apiError.message]);
        }
        return false;
      }
    },
    [dispatch, id, applyIdem, rotateApply]
  );

  const enabled = hasModule('payments');
  return useMemo(
    () => ({
      ...state,
      branding,
      canVoid: enabled && can('payments.payment.void'),
      canShare: enabled && can('payments.payment.write'),
      shareText,
      shareMobile,
      voidErrors,
      canApply: enabled && can('payments.payment.write') && !!payment && canApplyAdvance(payment),
      applyErrors,
      print,
      startShare,
      submitVoid,
      loadApplyCandidates,
      submitApply,
    }),
    [
      state,
      branding,
      enabled,
      can,
      payment,
      shareText,
      shareMobile,
      voidErrors,
      applyErrors,
      print,
      startShare,
      submitVoid,
      loadApplyCandidates,
      submitApply,
    ]
  );
};
