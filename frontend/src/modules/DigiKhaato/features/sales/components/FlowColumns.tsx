import { UbAmount, UbStack, UbStatusBadge, UbText } from 'src/design-system';
import type { UbDataGridColumn } from 'src/design-system/UbDataGrid';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';

import { STATUS_TONE } from '../view-model/invoiceDisplay';

import type { InvoiceListRow } from '../types/sales.types';
import type { FlowKind } from '../types/salesFlows.types';

/**
 * SAL-01 FR-10 / SAL-04 §14 — the estimates and credit notes lists: SAL-08's
 * columns, with the one that differs. An estimate's second figure is how long
 * the quote holds ("Valid until"); a credit note's is the credit still open
 * to use, which is `amount_due` on the wire (SAL-04 FR-8).
 */
export const createFlowColumns = ({
  t,
  kind,
  isCards,
}: {
  readonly t: TranslateFn;
  readonly kind: FlowKind;
  readonly isCards: boolean;
}): readonly UbDataGridColumn<InvoiceListRow>[] => [
  {
    id: 'party',
    header: t('sales.column.party'),
    priority: 1,
    cardSlot: 'title',
    widthShare: 26,
    cell: (row) => {
      const name = row.party?.name ?? row.walkInName ?? t('sales.walkIn.label');
      const number = row.number ?? t('sales.status.draft');
      if (isCards) return `${name} · ${number}`;
      return (
        <UbStack gap={0} className="min-w-0">
          <UbText as="span" variant="body-sm" className="line-clamp-2">
            {name}
          </UbText>
          <UbText as="span" variant="caption" tone="tertiary" className="ds-num">
            {number}
          </UbText>
        </UbStack>
      );
    },
  },
  {
    id: 'date',
    header: t('sales.column.date'),
    priority: 1,
    cardSlot: 'meta',
    widthShare: 12,
    cell: (row) => formatBusinessDate(row.documentDate),
  },
  {
    id: 'status',
    header: t('sales.column.status'),
    priority: 1,
    cardSlot: 'meta',
    widthShare: 14,
    cell: (row) =>
      isCards ? (
        t(`sales.status.${row.status}`)
      ) : (
        <UbStatusBadge tone={STATUS_TONE[row.status]} label={t(`sales.status.${row.status}`)} />
      ),
  },
  kind === 'estimate'
    ? {
        id: 'validUntil',
        header: t('sales.estimate.validUntil'),
        priority: 2,
        cardSlot: 'none',
        widthShare: 14,
        cell: (row) => (row.validUntil ? formatBusinessDate(row.validUntil) : '—'),
      }
    : {
        id: 'open',
        header: t('sales.creditNote.openCredit'),
        priority: 2,
        cardSlot: 'none',
        align: 'end',
        widthShare: 16,
        cell: (row) => (
          <UbAmount value={row.status === 'void' ? '0.00' : row.amountDue} size="sm" />
        ),
      },
  {
    id: 'total',
    header: t('sales.column.total'),
    priority: 1,
    align: 'end',
    cardSlot: 'trailing',
    widthShare: 16,
    cell: (row) => (
      <UbAmount
        value={row.grandTotal}
        size="sm"
        className={row.status === 'void' ? 'line-through opacity-60' : undefined}
      />
    ),
  },
];
