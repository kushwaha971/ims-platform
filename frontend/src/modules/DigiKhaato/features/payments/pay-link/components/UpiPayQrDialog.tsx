'use client';

import { useCallback, useEffect, useState } from 'react';

import { Copy, Share2, Smartphone } from 'lucide-react';

import {
  finalMessage,
  isBlankMessage,
  UbActionLink,
  UbButton,
  UbDialog,
  UbMessageBox,
  UbQrCode,
  UbSkeleton,
  UbStack,
  UbStatusBanner,
  UbText,
} from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useShareSheetLabels } from 'src/hooks/useShareSheetLabels';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { ROUTES } from 'src/routes';
import type { ApiErrorShape } from 'src/types/api.types';
import { formatInr } from 'src/utils/money';
import { qrPngBlob } from 'src/utils/qrImage';

import { createPayLink } from '../redux/payLinkThunk';

import type { PayLink } from '../types/payLink.types';

// Loaded with dynamic(), so its own words come with its own chunk.
import 'src/i18n/catalogues/payLink';

/**
 * Shop P0 (owner, 7 Oct 2026) — "UPI QR" for any amount owed, in any module: a
 * library fee, a loan instalment. The QR is the business's own UPI ID with the
 * amount filled in, for a payer at the desk to scan; "Share" hands the PICTURE to
 * the phone's share sheet (WhatsApp takes an image from there, never from a
 * prefilled message) with the pay page's link as its text, and "Copy link" is the
 * same link for anywhere else. Nothing is recorded by showing a QR — the money is
 * recorded where it always is, once it has arrived.
 *
 * WP-04 M-11 — the words that go with the picture sit in the share sheet's
 * editable box: Share hands the phone exactly what the box holds, and a blank
 * message disables Share and says why. Copy link carries only the link.
 */
export function UpiPayQrDialog({
  amount,
  reference,
  title,
  onClose,
}: Readonly<{
  amount: string;
  reference: string;
  title: string;
  onClose: () => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [link, setLink] = useState<PayLink | null>(null);
  const [error, setError] = useState<ApiErrorShape | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const labels = useShareSheetLabels();

  useEffect(() => {
    const request = dispatch(createPayLink({ amount, reference }));
    void request.then((result) => {
      if (createPayLink.fulfilled.match(result)) setLink(result.payload);
      else if (!result.meta.aborted) setError(result.payload ?? null);
    });
    return () => request.abort();
  }, [dispatch, amount, reference]);

  const defaultText = link
    ? t('payLink.shareText', { amount: formatInr(link.amount), url: link.url })
    : '';
  const text = finalMessage(defaultText, draft);
  const blank = isBlankMessage(text);

  const copy = useCallback(async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      dispatch(showSnackbar({ severity: 'success', id: 'payLink.copied' }));
    } catch {
      dispatch(showSnackbar({ severity: 'error', id: 'payLink.copyFailed' }));
    }
  }, [dispatch, link]);

  const share = useCallback(async () => {
    if (!link || blank) return;
    const blob = await qrPngBlob(link.qrModules);
    const file = blob ? new File([blob], 'upi-qr.png', { type: 'image/png' }) : null;
    try {
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
      } else if (typeof navigator.share === 'function') {
        await navigator.share({ text, url: link.url });
      } else {
        await copy();
      }
    } catch {
      /* The person closed the share sheet: nothing to say. */
    }
  }, [copy, link, text, blank]);

  const missing = error?.code === 'upi_not_configured';
  return (
    <UbDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={title}
      closeLabel={t('common.action.close')}
      footer={
        link ? (
          <>
            <UbButton
              variant="secondary"
              icon={<Copy className="h-4 w-4" aria-hidden />}
              onClick={() => void copy()}
              data-testid="pay-link-copy"
            >
              {t('payLink.copy')}
            </UbButton>
            <UbButton
              icon={<Share2 className="h-4 w-4" aria-hidden />}
              onClick={() => void share()}
              disabled={blank}
              data-testid="pay-link-share"
            >
              {t('payLink.share')}
            </UbButton>
          </>
        ) : (
          <UbButton variant="secondary" onClick={onClose}>
            {t('common.action.close')}
          </UbButton>
        )
      }
    >
      {missing && (
        <UbStatusBanner
          tone="info"
          title={t('payLink.missing')}
          action={
            <UbActionLink href={ROUTES.SETTINGS_PROFILE} size="sm">
              {t('payLink.openProfile')}
            </UbActionLink>
          }
        />
      )}
      {error && !missing && <UbStatusBanner tone="error" title={t('payLink.error')} />}
      {!link && !error && <UbSkeleton variant="card" />}
      {link && (
        <UbStack gap={2} align="center" data-testid="pay-link-qr">
          <UbStack className="rounded-card bg-white p-3">
            <UbQrCode
              modules={link.qrModules}
              size="240px"
              label={t('payLink.qrLabel', { amount: formatInr(link.amount) })}
            />
          </UbStack>
          <UbText variant="body-sm-medium">{formatInr(link.amount)}</UbText>
          <UbText variant="caption" tone="tertiary" className="break-all">
            {link.vpa}
          </UbText>
          <UbText variant="caption" tone="tertiary" align="center">
            {t('payLink.scanAny')}
          </UbText>
          <UbStack className="sm:hidden">
            <UbActionLink
              href={link.upiUrl}
              variant="secondary"
              icon={<Smartphone className="h-4 w-4" aria-hidden />}
            >
              {t('payLink.openApp')}
            </UbActionLink>
          </UbStack>
          <UbStack className="w-full">
            <UbMessageBox
              message={defaultText}
              draft={draft}
              onDraftChange={setDraft}
              labels={labels}
              rows={3}
            />
          </UbStack>
        </UbStack>
      )}
    </UbDialog>
  );
}
