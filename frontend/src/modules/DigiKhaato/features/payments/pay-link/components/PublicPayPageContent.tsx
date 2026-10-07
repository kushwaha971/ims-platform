'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  UbActionLink,
  UbButton,
  UbCard,
  UbEmptyState,
  UbQrCode,
  UbSkeleton,
  UbStack,
  UbText,
} from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatInr } from 'src/utils/money';

import { fetchPublicPayLink } from '../redux/publicPayThunk';

import type { PublicPayFailure, PublicPayLink } from '../types/payLink.types';

// The words this page renders arrive with its chunk. Imported in the client module,
// because a server page's imports never reach the browser.
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/publicPay';

/**
 * Shop P0 — what a payer sees after tapping "Pay by UPI or scan the QR" in a reminder:
 * whom they are paying, how much, one big button that opens their UPI app with the
 * amount filled in, and the QR for paying from another phone. It is the BUSINESS's
 * page: no product name, logo or link anywhere (CR-2026-09-29-BRAND-A). An unknown,
 * edited and expired link are one screen (§19: no oracle for which links existed).
 */
export function PublicPayPageContent({ token }: Readonly<{ token: string }>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [data, setData] = useState<PublicPayLink | null>(null);
  const [failure, setFailure] = useState<PublicPayFailure | null>(null);
  const request = useRef<{ abort: () => void } | null>(null);

  const load = useCallback(() => {
    request.current?.abort();
    const pending = dispatch(fetchPublicPayLink(token));
    request.current = pending;
    void pending.then((result) => {
      if (fetchPublicPayLink.fulfilled.match(result)) setData(result.payload);
      else if (!result.meta.aborted) setFailure(result.payload ?? 'failed');
    });
  }, [dispatch, token]);

  useEffect(() => {
    load();
    return () => request.current?.abort();
  }, [load]);

  useEffect(() => {
    if (data) document.title = data.businessName;
  }, [data]);

  if (failure) {
    return (
      <UbStack className="mx-auto w-full max-w-md">
        <UbEmptyState
          variant={failure === 'unavailable' ? 'firstUse' : 'error'}
          title={t(`publicPay.${failure === 'rate_limited' ? 'rateLimited' : failure}.title`)}
          description={t(
            `publicPay.${failure === 'rate_limited' ? 'rateLimited' : failure}.description`
          )}
          action={
            failure === 'unavailable' ? undefined : (
              <UbButton
                variant="secondary"
                onClick={() => {
                  setFailure(null);
                  load();
                }}
              >
                {t('publicPay.retry')}
              </UbButton>
            )
          }
        />
      </UbStack>
    );
  }
  if (!data) {
    return (
      <UbStack className="mx-auto w-full max-w-md">
        <UbSkeleton variant="card" />
      </UbStack>
    );
  }
  const amount = formatInr(data.amount);
  return (
    <UbStack className="mx-auto w-full max-w-md" data-testid="public-pay-page">
      <UbCard padded>
        <UbStack gap={4} align="center">
          <UbStack gap={1} align="center">
            <UbText variant="body-sm" tone="secondary">
              {t('publicPay.to', { name: data.businessName })}
            </UbText>
            <UbText as="h1" variant="metric-lg" className="ds-num">
              {amount}
            </UbText>
            {data.reference && (
              <UbText variant="caption" tone="tertiary">
                {t('publicPay.reference', { reference: data.reference })}
              </UbText>
            )}
          </UbStack>
          <UbActionLink
            href={data.upiUrl}
            variant="primary"
            size="lg"
            className="w-full"
            data-testid="public-pay-upi"
          >
            {t('publicPay.button', { amount })}
          </UbActionLink>
          <UbText variant="caption" tone="tertiary" align="center">
            {t('publicPay.hint')}
          </UbText>
          <UbStack gap={2} align="center">
            <UbText variant="body-sm-medium">{t('publicPay.scan')}</UbText>
            <UbStack className="rounded-card bg-white p-3">
              <UbQrCode modules={data.qrModules} size="220px" label={t('publicPay.scan')} />
            </UbStack>
            <UbText variant="caption" tone="tertiary" className="break-all font-mono">
              {data.vpa}
            </UbText>
          </UbStack>
        </UbStack>
      </UbCard>
    </UbStack>
  );
}
