import { UbAmount, UbStack, UbStatusBadge, UbText } from 'src/design-system';
import type { UbDataGridColumn } from 'src/design-system/UbDataGrid';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';

import { PURCHASE_STATUS_TONE, daysLate } from '../view-model/purchaseBillDisplay';

import type { PurchaseBillListRow } from '../types/purchase.types';

/**
 * PUR-03 FR-5 / FR-7 — the bills list, scored against "what do I owe, to whom, on which bill?"
 *
 * | Column   | Priority | Card     | Why |
 * |---|---|---|---|
 * | Supplier | 1 | title    | With our number beneath (and "Draft" for a draft, BR-3). |
 * | Total    | 1 | trailing | The bill. |
 * | Date     | 1 | meta     | dd/mm/yyyy (owner's rule). |
 * | Status   | 1 | meta     | Draft / Recorded / Part paid / Paid / Overdue / Void. |
 * | Inv. no. | 2 | none     | The supplier's own number — what the paper says. |
 * | Due      | 2 | none     | Still to pay; "3 days late" in the error tone. |
 */
export const createPurchaseBillColumns = ({
  t,
  today,
  isCards,
}: {
  readonly t: TranslateFn;
  readonly today: string;
  readonly isCards: boolean;
}): readonly UbDataGridColumn<PurchaseBillListRow>[] => [
  {
    id: 'supplier',
    header: t('purchases.column.supplier'),
    priority: 1,
    cardSlot: 'title',
    widthShare: 26,
    cell: (row) => {
      const name = row.party?.name ?? '—';
      const number = row.number ?? t('purchases.status.draft');
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
    header: t('purchases.column.date'),
    priority: 1,
    cardSlot: 'meta',
    widthShare: 11,
    cell: (row) => formatBusinessDate(row.documentDate),
  },
  {
    id: 'invoice',
    header: t('purchases.column.supplierInvoice'),
    priority: 2,
    cardSlot: 'none',
    widthShare: 13,
    cell: (row) => row.supplierInvoiceNumber ?? '—',
  },
  {
    id: 'status',
    header: t('purchases.column.status'),
    priority: 1,
    cardSlot: 'meta',
    widthShare: 13,
    cell: (row) => {
      const status = row.isOverdue ? 'overdue' : row.status;
      return isCards ? (
        t(`purchases.status.${status}`)
      ) : (
        <UbStatusBadge
          tone={PURCHASE_STATUS_TONE[status]}
          label={t(`purchases.status.${status}`)}
        />
      );
    },
  },
  {
    id: 'due',
    header: t('purchases.column.due'),
    priority: 2,
    cardSlot: 'none',
    align: 'end',
    widthShare: 15,
    cell: (row) => {
      if (row.status === 'draft' || row.status === 'void') return '—';
      const days = daysLate(row.dueOn, today);
      return (
        <UbStack gap={0} className="items-end">
          <UbAmount value={row.amountDue} size="sm" />
          {row.amountDue !== '0.00' && row.dueOn && (
            <UbText as="span" variant="caption" tone={days > 0 ? 'error' : 'tertiary'}>
              {days > 0
                ? t('purchases.list.daysLate', { days })
                : t('purchases.list.dueOn', { date: formatBusinessDate(row.dueOn) })}
            </UbText>
          )}
        </UbStack>
      );
    },
  },
  {
    id: 'total',
    header: t('purchases.column.total'),
    priority: 1,
    align: 'end',
    cardSlot: 'trailing',
    widthShare: 14,
    cell: (row) => (
      <UbAmount
        value={row.grandTotal}
        size="sm"
        className={row.status === 'void' ? 'line-through opacity-60' : undefined}
      />
    ),
  },
];
