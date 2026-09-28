'use client';

import { useCallback, useMemo } from 'react';

import type { UbShareChannel } from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { showSnackbar, type ShowSnackbarPayload } from 'src/redux/slice/snackbarSlice';

/**
 * `UbShareSheet`'s outcomes, routed to the ONE global snackbar.
 *
 * The design system cannot read Redux, so the sheet reports and the caller
 * speaks. Written once here so the second caller (LED-04's statement share,
 * PAY-04's receipt) says exactly what the first does — and so none of them can
 * drift into "Reminder sent".
 *
 * ── What each channel may claim ────────────────────────────────────────────
 * DEC-012 and NTF-03 BR-1: the product PREPARES a message, the merchant SENDS
 * it. So WhatsApp and SMS report that the app was opened, in a neutral `info`
 * tone rather than a green tick — a green tick reads as "done", and nothing is
 * done until the merchant presses send in another app. A copy is the one
 * outcome this code can verify, so it is the one `success`.
 *
 * The platform sheet (`native`) says nothing: the OS has just shown its own
 * confirmation, and it resolves when the merchant picked an app, which is
 * again not the same as sending.
 */
const OPENED: Readonly<Partial<Record<UbShareChannel, ShowSnackbarPayload>>> = {
  whatsapp: { severity: 'info', id: 'share.opened.whatsapp' },
  sms: { severity: 'info', id: 'share.opened.sms' },
  copy: { severity: 'success', id: 'share.copied' },
};

const FAILED: Readonly<Partial<Record<UbShareChannel, ShowSnackbarPayload>>> = {
  copy: { severity: 'error', id: 'share.copyFailed' },
  native: { severity: 'error', id: 'share.failed' },
};

export interface UseShareFeedbackResult {
  readonly onShared: (channel: UbShareChannel) => void;
  readonly onFailed: (channel: UbShareChannel) => void;
}

export const useShareFeedback = (): UseShareFeedbackResult => {
  const dispatch = useAppDispatch();
  const onShared = useCallback(
    (channel: UbShareChannel) => {
      const payload = OPENED[channel];
      if (payload) dispatch(showSnackbar(payload));
    },
    [dispatch]
  );
  const onFailed = useCallback(
    (channel: UbShareChannel) => {
      const payload = FAILED[channel];
      if (payload) dispatch(showSnackbar(payload));
    },
    [dispatch]
  );
  return useMemo(() => ({ onShared, onFailed }), [onShared, onFailed]);
};
