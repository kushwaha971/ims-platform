'use client';

import { memo } from 'react';

import { UbBox, UbLink, UbLogo, UbStack, UbText } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectAppName } from 'src/redux/slice/whiteLabelSlice';
import { ROUTES } from 'src/routes';

/**
 * CR-2026-09-19-D — the documents behind "the terms".
 *
 * The sign-up screen said *"By continuing you accept the terms"* and "the
 * terms" was plain text. Two routes now exist and the sentence links to them.
 *
 * The body is honest about its own state rather than pretending to be a
 * contract: the copy says the documents are being prepared with counsel, states
 * the three commitments that are already true (adult business use, the data is
 * the merchant's, export and delete on demand), and says when the full text
 * arrives. A lorem-ipsum privacy policy would be worse than no page; a page
 * that says what is and is not settled is a page a reader can act on.
 *
 * It is one component for both routes because they are the same page with a
 * different title, and two copies would drift the moment either is edited.
 */
export interface LegalPageContentProps {
  /** The i18n key of this document's title. */
  readonly titleId: string;
}

function LegalPageContentBase({ titleId }: Readonly<LegalPageContentProps>) {
  const { t } = useTranslation();
  const appName = useAppSelector(selectAppName);

  return (
    <UbStack gap={8} className="mx-auto w-full max-w-[640px] py-2">
      <UbStack direction="row" justify="between" align="center" gap={4}>
        <UbLogo variant="full" size="md" wordmark={appName} label={appName} />
        <UbLink href={ROUTES.LOGIN} variant="body-sm" className="min-h-11 content-center">
          {t('legal.backToApp')}
        </UbLink>
      </UbStack>

      <UbBox as="article">
        <UbStack gap={4}>
          <UbText as="h1" variant="h1">
            {t(titleId)}
          </UbText>
          <UbText variant="body" tone="secondary">
            {t('legal.draft.body')}
          </UbText>
        </UbStack>
      </UbBox>

      <UbStack direction="row" gap={4} wrap>
        <UbLink href={ROUTES.LEGAL_TERMS} variant="body-sm">
          {t('auth.legal.terms')}
        </UbLink>
        <UbLink href={ROUTES.LEGAL_PRIVACY} variant="body-sm">
          {t('auth.legal.privacy')}
        </UbLink>
      </UbStack>
    </UbStack>
  );
}

LegalPageContentBase.displayName = 'LegalPageContent';
export const LegalPageContent = memo(LegalPageContentBase);
