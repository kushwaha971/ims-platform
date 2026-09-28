'use client';

import {
  UbActionLink,
  UbInfoRow,
  UbLink,
  UbStack,
  UbStatusBanner,
  UbText,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import { flowDetailHref } from '../view-model/flowDisplay';

import type { SalesDocument } from '../types/sales.types';
import type { SalesCreditUse, SalesDocRef } from '../types/salesFlows.types';

const refLabel = (ref: SalesDocRef): string =>
  `${ref.number ?? '—'} · ${formatBusinessDate(ref.documentDate)}`;

/**
 * What this document is tied to, on screen (never on paper — the page wraps it
 * in `ub-print-hide`): SAL-05 §7's void banner with its reason; SAL-01's
 * "Converted to INV/…" and "From estimate EST/…"; SAL-04's returns section on
 * the invoice (TSK-SAL-04-09), and on a note its invoice, its open credit,
 * where the credit went and the refund. Every reference is a link.
 */
export function DocumentLinksPanel({
  doc,
}: Readonly<{ doc: SalesDocument }>): React.JSX.Element | null {
  const { t } = useTranslation();
  const { links } = doc;
  const uses = (rows: readonly SalesCreditUse[], labelId: string) =>
    rows.length > 0 && (
      <UbStack gap={1}>
        <UbText variant="caption" tone="tertiary">
          {t(labelId)}
        </UbText>
        {rows.map((row) => (
          <UbInfoRow
            key={row.id}
            label={<UbLink href={flowDetailHref(row.kind, row.id)}>{refLabel(row)}</UbLink>}
            value={formatInr(row.amount)}
          />
        ))}
      </UbStack>
    );

  const blocks = [
    doc.status === 'void' && (
      <UbStatusBanner
        key="void"
        tone="error"
        title={t('sales.void.banner', {
          date: formatBusinessDate(doc.voidedAt?.slice(0, 10) ?? null),
        })}
        description={t('sales.void.bannerReason', { reason: doc.voidReason ?? '' })}
      />
    ),
    doc.kind === 'estimate' && links.convertedTo && (
      <UbStatusBanner
        key="converted"
        tone={links.convertedTo.status === 'void' ? 'warning' : 'info'}
        title={t(
          links.convertedTo.status === 'void'
            ? 'sales.estimate.convertedVoid'
            : 'sales.estimate.convertedTo',
          { number: links.convertedTo.number ?? t('sales.status.draft') }
        )}
        action={
          <UbActionLink
            href={flowDetailHref('invoice', links.convertedTo.id)}
            variant="secondary"
            size="sm"
          >
            {t('sales.estimate.openInvoice')}
          </UbActionLink>
        }
      />
    ),
    doc.kind === 'estimate' && doc.validUntil && doc.status !== 'converted' && (
      <UbText key="valid" variant="body-sm" tone="tertiary">
        {t('sales.estimate.validLine', { date: formatBusinessDate(doc.validUntil) })}
      </UbText>
    ),
    links.convertedFrom && (
      <UbText key="from" variant="body-sm">
        {t('sales.estimate.fromEstimate')}{' '}
        <UbLink href={flowDetailHref('estimate', links.convertedFrom.id)}>
          {refLabel(links.convertedFrom)}
        </UbLink>
      </UbText>
    ),
    links.against && (
      <UbText key="against" variant="body-sm">
        {t('sales.creditNote.against')}{' '}
        <UbLink href={flowDetailHref('invoice', links.against.id)}>
          {refLabel(links.against)}
        </UbLink>
      </UbText>
    ),
    doc.kind === 'credit_note' && links.openCredit !== null && (
      <UbInfoRow
        key="open"
        label={t('sales.creditNote.openCredit')}
        value={formatInr(links.openCredit)}
        variant="total"
      />
    ),
    links.refund && (
      <UbInfoRow
        key="refund"
        label={t('sales.creditNote.refunded', {
          modes: links.refund.modeBreakup.map((row) => t(`ledger.mode.${row.mode}`)).join(', '),
        })}
        value={formatInr(doc.amountPaid)}
      />
    ),
    uses(links.applications, 'sales.creditNote.appliedTo'),
    links.creditNotes.length > 0 && (
      <UbStack key="returns" gap={1}>
        <UbText variant="caption" tone="tertiary">
          {t('sales.creditNote.returnsSection')}
        </UbText>
        {links.creditNotes.map((row) => (
          <UbInfoRow
            key={row.id}
            label={<UbLink href={flowDetailHref(row.kind, row.id)}>{refLabel(row)}</UbLink>}
            value={`${formatInr(row.grandTotal)} · ${t(`sales.status.${row.status}`)}`}
          />
        ))}
      </UbStack>
    ),
    uses(links.creditApplications, 'sales.creditNote.creditUsed'),
  ].filter(Boolean);

  if (!blocks.length) return null;
  return (
    <UbStack gap={3} data-testid="document-links">
      {blocks}
    </UbStack>
  );
}
