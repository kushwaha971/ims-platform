import { UbAmount, UbStack, UbStatusBadge, UbText } from 'src/design-system';
import type { UbDataGridColumn } from 'src/design-system/UbDataGrid';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';

import type { PaymentRow } from '../types/payment.types';

/**
 * PAY-01 FR-10 — Date · Number · Party · Mode · Amount · Allocated · Status,
 * scored against one question: "who paid, how much, and did it settle a bill?"
 *
 * | Column    | Priority | Card     | Why |
 * |---|---|---|---|
 * | Party     | 1 | title    | Who — "Walk-in customer" for a counter sale. |
 * | Amount    | 1 | trailing | Received green, paid out red (you got / you gave), always with a word. |
 * | Date      | 1 | meta     | dd/mm/yyyy in rows (owner's rule). |
 * | Number    | 2 | meta     | `ds-mono`, struck through when void (PAY-05 FR-8). |
 * | Mode      | 2 | none     | The primary mode, "+1" when split (PAY-02 FR-7). |
 * | Allocated | 3 | none     | What went against bills; the rest is advance. |
 * | Status    | 2 | none     | Only Void earns a badge. |
 */
export const createPaymentColumns = ({
  t,
}: {
  readonly t: TranslateFn;
}): readonly UbDataGridColumn<PaymentRow>[] => [
  {
    id: 'date',
    header: t('payments.column.date'),
    priority: 1,
    cardSlot: 'meta',
    widthShare: 11,
    cell: (row) => formatBusinessDate(row.paymentDate),
  },
  {
    id: 'number',
    header: t('payments.column.number'),
    priority: 2,
    cardSlot: 'meta',
    widthShare: 15,
    cell: (row) => (
      <UbText
        as="span"
        variant="body-sm"
        className={row.status === 'void' ? 'ds-mono line-through opacity-60' : 'ds-mono'}
      >
        {row.number}
      </UbText>
    ),
  },
  {
    id: 'party',
    header: t('payments.column.party'),
    priority: 1,
    cardSlot: 'title',
    widthShare: 22,
    cell: (row) => row.party?.name ?? t('payments.walkIn'),
  },
  {
    id: 'mode',
    header: t('payments.column.mode'),
    priority: 2,
    cardSlot: 'none',
    widthShare: 12,
    cell: (row) =>
      row.modesCount > 1
        ? t('payments.mode.plusMore', {
            mode: t(`ledger.mode.${row.primaryMode}`),
            count: row.modesCount - 1,
          })
        : t(`ledger.mode.${row.primaryMode}`),
  },
  {
    id: 'allocated',
    header: t('payments.column.allocated'),
    priority: 3,
    cardSlot: 'none',
    align: 'end',
    widthShare: 12,
    cell: (row) => <UbAmount value={row.allocatedAmount} size="sm" />,
  },
  {
    id: 'status',
    header: t('payments.column.status'),
    priority: 2,
    cardSlot: 'none',
    widthShare: 10,
    cell: (row) =>
      row.status === 'void' ? (
        <UbStatusBadge tone="neutral" label={t('payments.status.void')} />
      ) : null,
  },
  {
    id: 'amount',
    header: t('payments.column.amount'),
    priority: 1,
    align: 'end',
    cardSlot: 'trailing',
    widthShare: 16,
    cell: (row) => (
      <UbStack gap={0} align="end" className={row.status === 'void' ? 'opacity-60' : undefined}>
        <UbAmount
          value={row.amount}
          size="sm"
          tone={row.direction === 'in' ? 'payable' : 'receivable'}
          label={t(`payments.direction.${row.direction}`)}
          className={row.status === 'void' ? 'line-through' : undefined}
        />
      </UbStack>
    ),
  },
];
