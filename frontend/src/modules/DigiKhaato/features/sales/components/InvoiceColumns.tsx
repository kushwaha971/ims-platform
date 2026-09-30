import { UbAmount, UbStack, UbStatusBadge, UbText } from 'src/design-system';
import type { UbDataGridColumn } from 'src/design-system/UbDataGrid';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';

import { STATUS_TONE, daysOverdue } from '../view-model/invoiceDisplay';
import { originWords } from '../view-model/originDisplay';

import { OriginBadge } from './OriginBadge';

import type { InvoiceListRow } from '../types/sales.types';

/**
 * SAL-08 FR-6 — the bills list, scored against "who owes me what, from which bill?"
 *
 * | Column | Priority | Card     | Why |
 * |---|---|---|---|
 * | Party  | 1 | title    | Walk-in in a muted tone (FR-7), with the number beneath. |
 * | Total  | 1 | trailing | The bill. |
 * | Date   | 1 | meta     | dd/mm/yyyy (owner's rule). |
 * | Status | 1 | meta     | Draft / Issued / Part paid / Paid / Overdue / Void. |
 * | Due    | 2 | none     | Amount still owed; "Overdue 3 d" in error tone (§8). |
 *
 * A5 (PLT-X05 §7) — a document another module issued says so under its number
 * ("From Gym · Membership M-0042"); on a card, after the date.
 */
export const createInvoiceColumns = ({
  t,
  today,
  isCards,
}: {
  readonly t: TranslateFn;
  readonly today: string;
  readonly isCards: boolean;
}): readonly UbDataGridColumn<InvoiceListRow>[] => [
  {
    id: 'party',
    header: t('sales.column.party'),
    priority: 1,
    cardSlot: 'title',
    widthShare: 26,
    cell: (row) => {
      const walkIn = !row.party;
      const name = row.party?.name ?? row.walkInName ?? t('sales.walkIn.label');
      const number = row.number ?? t('sales.status.draft');
      if (isCards) return `${name} · ${number}`;
      return (
        <UbStack gap={0} className="min-w-0">
          <UbText
            as="span"
            variant="body-sm"
            tone={walkIn ? 'tertiary' : undefined}
            className="line-clamp-2"
          >
            {walkIn && row.walkInName ? `${t('sales.walkIn.label')} · ${name}` : name}
          </UbText>
          <UbText as="span" variant="caption" tone="tertiary" className="ds-num">
            {number}
          </UbText>
          {row.origin && <OriginBadge origin={row.origin} />}
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
    cell: (row) => {
      const date = formatBusinessDate(row.documentDate);
      if (!isCards || !row.origin) return date;
      const words = originWords(row.origin);
      const from = t(words.id, {
        module: words.moduleId ? t(words.moduleId) : words.module,
        label: words.label ?? '',
      });
      return `${date} · ${from}`;
    },
  },
  {
    id: 'status',
    header: t('sales.column.status'),
    priority: 1,
    cardSlot: 'meta',
    widthShare: 14,
    cell: (row) => {
      const overdue = row.isOverdue ? 'overdue' : row.status;
      return isCards ? (
        t(`sales.status.${overdue}`)
      ) : (
        <UbStatusBadge tone={STATUS_TONE[overdue]} label={t(`sales.status.${overdue}`)} />
      );
    },
  },
  {
    id: 'due',
    header: t('sales.column.due'),
    priority: 2,
    cardSlot: 'none',
    align: 'end',
    widthShare: 16,
    cell: (row) => {
      const days = daysOverdue(row.dueOn, today);
      return (
        <UbStack gap={0} className="items-end">
          <UbAmount value={row.amountDue} size="sm" />
          {row.amountDue !== '0.00' && row.dueOn && (
            <UbText as="span" variant="caption" tone={days > 0 ? 'error' : 'tertiary'}>
              {days > 0
                ? t('sales.list.overdueDays', { days })
                : t('sales.list.dueOn', { date: formatBusinessDate(row.dueOn) })}
            </UbText>
          )}
        </UbStack>
      );
    },
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
