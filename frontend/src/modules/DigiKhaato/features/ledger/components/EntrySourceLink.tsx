'use client';

import { UbLink, UbStack, UbStatusBadge, UbText } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';

import { isSourceVoid, sourceLabelId, sourceRoute } from '../view-model/sourceDisplay';

import type { LedgerEntrySource } from '../types/ledger.types';

/**
 * LED-10 §7 — a document line's kind and number, the number a link back to the
 * document (US-LED-10-3: the accountant clicks a row and lands on the bill).
 * The number is `ds-mono`; "Document not found" when the resolver found none,
 * "Void" when the document has since been voided (§9).
 */
export function EntrySourceLink({
  source,
  t,
}: Readonly<{ source: LedgerEntrySource; t: TranslateFn }>): React.JSX.Element | null {
  const labelId = sourceLabelId(source);
  if (!labelId) return null;
  const href = sourceRoute(source);
  return (
    <UbStack direction="row" align="center" className="min-w-0 gap-1" data-testid="entry-source">
      <UbStatusBadge label={t(labelId)} tone="info" />
      {source.number && href ? (
        <UbLink href={href} variant="caption" className="ds-mono truncate">
          {source.number}
        </UbLink>
      ) : (
        <UbText as="span" variant="caption" tone="tertiary">
          {t('ledger.source.missing')}
        </UbText>
      )}
      {isSourceVoid(source) && <UbStatusBadge label={t('ledger.source.void')} tone="neutral" />}
    </UbStack>
  );
}
