'use client';

import { APP_NAME } from 'src/constants';
import {
  UbButton,
  UbChoiceChips,
  UbEmptyState,
  UbSkeleton,
  UbStack,
  UbText,
} from 'src/design-system';
import { useLocaleSwitch } from 'src/hooks/useLocaleSwitch';
import { useTranslation } from 'src/hooks/useTranslation';
import type { Locale } from 'src/types/domain.types';

import { usePublicDocument } from '../../hooks/usePublicDocument';
import { InvoicePrintA4 } from '../print/InvoicePrintA4';

import { PublicDocumentSummary } from './PublicDocumentSummary';

import type { PublicDocumentFailure } from '../../types/publicDocument.types';

// The words this page renders arrive with its chunk (src/i18n/catalogueRegistry.ts):
// its own, the print sheet's, and the payment-mode labels. Imported HERE, in the
// client module, because a server page's imports never reach the browser.
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/publicDocument';
import 'src/i18n/catalogues/sales';

/** The three failure screens: title, description, and whether a retry can help. */
const FAILURE_COPY: Readonly<
  Record<PublicDocumentFailure, { title: string; description: string; retry: boolean }>
> = {
  unavailable: {
    title: 'publicDocument.unavailable.title',
    description: 'publicDocument.unavailable.description',
    retry: false,
  },
  rate_limited: {
    title: 'publicDocument.rateLimited.title',
    description: 'publicDocument.rateLimited.description',
    retry: true,
  },
  failed: {
    title: 'publicDocument.failed.title',
    description: 'publicDocument.failed.description',
    retry: true,
  },
};

/**
 * SAL-03 FR-5 / TSK-CHS-PRINT-08 — the page a customer opens from WhatsApp.
 *
 * No session, no app shell, no sidebar and no link into the product: the
 * shop's letterhead, the summary a phone shows first (`PublicDocumentSummary`),
 * then the SAME `InvoicePrintA4` the merchant prints, which is what
 * Print / Save as PDF puts on paper (everything else is `ub-print-hide`).
 *
 * An unknown, an expired and a revoked link are ONE screen with one sentence
 * (§19: the page is not an oracle for which tokens once existed).
 */
export function PublicDocumentPageContent({
  token,
}: Readonly<{ token: string }>): React.JSX.Element {
  const { t } = useTranslation();
  const { locale, options, setLocale } = useLocaleSwitch();
  const { status, data, failure, retry, print } = usePublicDocument(token);

  let body: React.ReactNode;
  if (data) {
    body = (
      <>
        <PublicDocumentSummary data={data} onPrint={print} t={t} />
        {/* A region that scrolls sideways on a phone must be reachable by
            keyboard and named (axe scrollable-region-focusable). */}
        <UbStack
          role="region"
          aria-label={t('sales.print.preview')}
          tabIndex={0}
          className="w-full min-w-0 overflow-x-auto rounded-card border border-border-hairline bg-white print:overflow-visible print:rounded-none print:border-0"
          data-testid="public-document"
        >
          <InvoicePrintA4
            doc={data.document}
            upi={data.upi}
            branding={data.branding}
            locale={locale}
            t={t}
          />
        </UbStack>
      </>
    );
  } else if (status === 'failed' && failure) {
    const copy = FAILURE_COPY[failure];
    body = (
      <UbStack data-testid={`public-${failure}`}>
        <UbEmptyState
          variant={failure === 'failed' ? 'error' : 'firstUse'}
          title={t(copy.title)}
          description={t(copy.description)}
          action={
            copy.retry ? (
              <UbButton variant="outlineNeutral" onClick={retry} data-testid="public-retry">
                {t('publicDocument.retry')}
              </UbButton>
            ) : undefined
          }
        />
      </UbStack>
    );
  } else {
    body = <UbSkeleton variant="card" count={2} label={t('publicDocument.loading')} />;
  }

  return (
    <UbStack gap={4} className="mx-auto w-full min-w-0 max-w-3xl" data-testid="public-page">
      <UbStack direction="row" justify="end" className="ub-print-hide">
        <UbChoiceChips<Locale>
          value={locale}
          onChange={setLocale}
          options={options}
          ariaLabel={t('publicDocument.language')}
        />
      </UbStack>
      {body}
      <UbText
        variant="caption"
        tone="tertiary"
        align="center"
        className="ub-print-hide"
        data-testid="public-powered-by"
      >
        {t('publicDocument.poweredBy', { app: APP_NAME })}
      </UbText>
    </UbStack>
  );
}
