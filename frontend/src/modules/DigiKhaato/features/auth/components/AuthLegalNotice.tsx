'use client';

import { memo } from 'react';

import { UbLink, UbStack, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';

/**
 * CR-2026-09-19-D — "By continuing you accept the terms", with the terms.
 *
 * The line it replaces read *"For business use by adults. By continuing you
 * accept the terms."* and "the terms" was four words of plain text. A product
 * that asks for agreement to a document it does not show is asking for nothing,
 * and in several markets it is asking for nothing enforceably.
 *
 * The sentence is assembled from five keys rather than one, because Hindi puts
 * its verb last: English is *"By continuing you accept our Terms of Service and
 * Privacy Policy."*, Hindi is *"आगे बढ़ने पर आप हमारी सेवा की शर्तें और
 * प्राइवेसी नीति स्वीकार करते हैं।"* — the accepting comes after the documents.
 * `auth.legal.suffix` is empty-but-for-a-full-stop in English and carries that
 * verb in Hindi, which is why the pieces are ordered prefix · terms · and ·
 * privacy · suffix and not concatenated in code.
 *
 * The links are real `UbLink`s to real routes (`/legal/terms`,
 * `/legal/privacy`), reachable with no session because this line is read before
 * an account exists.
 */
function AuthLegalNoticeBase({ className }: Readonly<{ className?: string }>) {
  const { t } = useTranslation();

  return (
    <UbStack gap={1} align="center" className={className}>
      <UbText variant="caption" tone="muted" align="center">
        {t('auth.legal.prefix')}{' '}
        <UbLink href={ROUTES.LEGAL_TERMS} variant="inherit" tone="accent">
          {t('auth.legal.terms')}
        </UbLink>{' '}
        {t('auth.legal.and')}{' '}
        <UbLink href={ROUTES.LEGAL_PRIVACY} variant="inherit" tone="accent">
          {t('auth.legal.privacy')}
        </UbLink>
        {t('auth.legal.suffix')}
      </UbText>
      {/* BR-7 — the service is for adult business use, still said before an
          account exists rather than in a settings page nobody opens. */}
      <UbText variant="caption" tone="muted" align="center">
        {t('auth.adultUse')}
      </UbText>
    </UbStack>
  );
}

AuthLegalNoticeBase.displayName = 'AuthLegalNotice';
export const AuthLegalNotice = memo(AuthLegalNoticeBase);
