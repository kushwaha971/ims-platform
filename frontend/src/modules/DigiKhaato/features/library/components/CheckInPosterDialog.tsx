'use client';

import { useEffect, useState } from 'react';

import { Printer } from 'lucide-react';
import { flushSync } from 'react-dom';

import {
  UbBox,
  UbButton,
  UbDialog,
  UbQrCode,
  UbSkeleton,
  UbStack,
  UbStatusBanner,
  UbText,
} from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import type { ApiErrorShape } from 'src/types/api.types';

import { fetchCheckInPoster } from '../redux/libraryCheckinThunk';

import type { CheckInPoster } from '../types/attendance.types';

// Loaded with dynamic(), so its own words come with its own chunk.
import 'src/i18n/catalogues/library';

/**
 * Library P0 — the door's QR. A student scans it with their own phone, types their
 * student number and the last four digits of their mobile, and is checked in exactly
 * as the desk's tap would. "Print poster" puts one A4 sheet on paper — the library's
 * name, the QR and three lines of how — and nothing of the product.
 */
export function CheckInPosterDialog({
  onClose,
}: Readonly<{ onClose: () => void }>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [poster, setPoster] = useState<CheckInPoster | null>(null);
  const [error, setError] = useState<ApiErrorShape | null>(null);
  // Found by looking: printing with the dialog open put the dialog and its grey overlay
  // on the poster. The dialog steps aside for the print and comes back after it.
  const [printing, setPrinting] = useState(false);
  const print = () => {
    flushSync(() => setPrinting(true));
    window.print();
    setPrinting(false);
  };

  useEffect(() => {
    const request = dispatch(fetchCheckInPoster());
    void request.then((result) => {
      if (fetchCheckInPoster.fulfilled.match(result)) setPoster(result.payload);
      else if (!result.meta.aborted) setError(result.payload ?? null);
    });
    return () => request.abort();
  }, [dispatch]);

  return (
    <>
      <UbDialog
        open={!printing}
        onOpenChange={(next) => !next && !printing && onClose()}
        title={t('library.checkin.title')}
        closeLabel={t('common.action.close')}
        footer={
          <>
            <UbButton variant="secondary" onClick={onClose}>
              {t('common.action.close')}
            </UbButton>
            <UbButton
              icon={<Printer className="h-4 w-4" aria-hidden />}
              disabled={!poster}
              onClick={print}
              data-testid="library-checkin-print"
            >
              {t('library.checkin.print')}
            </UbButton>
          </>
        }
      >
        {error && <UbStatusBanner tone="error" title={error.message} />}
        {!poster && !error && <UbSkeleton variant="card" />}
        {poster && (
          <UbStack gap={2} align="center" data-testid="library-checkin-qr">
            <UbStack className="rounded-card bg-white p-3">
              <UbQrCode
                modules={poster.qrModules}
                size="220px"
                label={t('library.checkin.qrLabel')}
              />
            </UbStack>
            <UbText variant="body-sm" tone="secondary" align="center">
              {t('library.checkin.hint')}
            </UbText>
          </UbStack>
        )}
      </UbDialog>
      {poster && (
        <UbBox className="ub-print-only ub-print-sheet hidden" data-testid="library-checkin-poster">
          <UbStack gap={6} align="center" className="pt-16 text-center">
            <UbText variant="display">{poster.library}</UbText>
            <UbText variant="h2">{t('library.checkin.posterTitle')}</UbText>
            <UbQrCode
              modules={poster.qrModules}
              size="110mm"
              label={t('library.checkin.qrLabel')}
            />
            <UbStack gap={2}>
              <UbText variant="h4">{t('library.checkin.step1')}</UbText>
              <UbText variant="h4">{t('library.checkin.step2')}</UbText>
              <UbText variant="h4">{t('library.checkin.step3')}</UbText>
            </UbStack>
          </UbStack>
        </UbBox>
      )}
    </>
  );
}
