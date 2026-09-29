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

import { selectPaymentReceipt, type PaymentReceiptState } from '../redux/paymentReceiptSlice';
import { fetchCollectQr, fetchPayment, shareReceipt, voidPayment } from '../redux/paymentThunk';

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
  readonly print: () => void;
  readonly startShare: () => Promise<boolean>;
  readonly submitVoid: (reason: string) => Promise<boolean>;
}

export const usePaymentReceipt = (id: string, autoPrint: boolean): UsePaymentReceiptResult => {
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectPaymentReceipt);
  const branding = usePrintBranding();
  const locale = useAppSelector(selectLocale);
  const { can, hasModule } = usePermissions();
  const voidKey = useIdempotencyKey();
  const shareKey = useIdempotencyKey();
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
      print,
      startShare,
      submitVoid,
    }),
    [
      state,
      branding,
      enabled,
      can,
      shareText,
      shareMobile,
      voidErrors,
      print,
      startShare,
      submitVoid,
    ]
  );
};
