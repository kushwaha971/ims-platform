import { UbLink, UbStack, UbStatusBadge, UbText } from 'src/design-system';
import type { UbDataGridColumn } from 'src/design-system/UbDataGrid';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { partyPath } from 'src/routes';
import { formatBusinessDate } from 'src/utils/dates';
import { formatAmount, formatInr } from 'src/utils/money';

import { baseType, rowPartyName, typeLabelId, typeTone } from '../view-model/dayBookDisplay';
import { sourceHref } from '../view-model/drillThrough';

import type { DayBookRow } from '../types/reports.types';

/**
 * RPT-02 §7's table — Time · Type · Number · Party · Description · In · Out ·
 * Mode · Cash · Bank · By — scored against the question the owner asks at
 * closing time: "does the drawer match, and if not, which line is wrong?"
 *
 * | Column      | Priority | Why |
 * |---|---|---|
 * | Type, In, Out | 1 | What happened and what it did to the drawer. |
 * | Party, Cash   | 1/2 | Who, and the running figure being tallied. |
 * | Number, Time, Description | 2–3 | Finding the line on paper. |
 * | Mode, Bank, By | 3–4 | The desk-sized details. |
 *
 * The balance columns exist only when the server sent them
 * (`balancesVisible`) — absent, never blank. A Date column joins when the
 * range is longer than a day.
 */
export interface DayBookColumnDeps {
  readonly t: TranslateFn;
  readonly balances: boolean;
  readonly multiDay: boolean;
}

/** The row's words: what a sale, a receipt or a khata line WAS. */
export const describeRow = (row: DayBookRow, t: TranslateFn): string => {
  const base = baseType(row);
  const parts: string[] = [];
  if (base === 'sale') {
    parts.push(
      row.amountDue && Number(row.amountDue) > 0
        ? t('reports.daybook.describe.saleCredit', { amount: formatInr(row.amount) })
        : t('reports.daybook.describe.salePaid', { amount: formatInr(row.amount) })
    );
  } else if (['credit_note', 'purchase', 'opening', 'write_off', 'reversal'].includes(base)) {
    parts.push(formatInr(row.amount));
  } else if (base === 'expense') {
    if (row.detail) parts.push(row.detail);
    if (row.paid === false) {
      parts.push(t('reports.daybook.describe.payable', { amount: formatInr(row.amount) }));
    }
  } else if ((base === 'manual_gave' || base === 'manual_got') && row.modes.length === 0) {
    parts.push(t('reports.daybook.describe.onKhata', { amount: formatInr(row.amount) }));
  } else if (base === 'stock_adjustment') {
    if (row.detail) parts.push(t(`reports.daybook.adjustment.${row.detail}`));
    if (row.lines) parts.push(t('reports.daybook.describe.items', { count: row.lines }));
  }
  if (row.note) parts.push(row.note);
  if (row.detail && ['reversal', 'write_off', 'opening'].includes(base)) parts.push(row.detail);
  if (row.recordedOn) {
    parts.push(t('reports.daybook.recordedOn', { date: formatBusinessDate(row.recordedOn) }));
  }
  return parts.join(' · ');
};

/** EC-1 — "UPI ₹700.00 + Cash ₹300.00". */
export const describeModes = (row: DayBookRow, t: TranslateFn): string =>
  row.modes
    .map((part) => `${t(`reports.daybook.mode.${part.mode}`)} ${formatInr(part.amount)}`)
    .join(' + ');

const money = (value: string | null | undefined, tone: 'success' | 'error', muted: boolean) =>
  value ? (
    <UbText
      as="span"
      variant="body-sm"
      tone={muted ? 'tertiary' : tone}
      className={muted ? 'ds-num line-through' : 'ds-num'}
    >
      {formatAmount(value)}
    </UbText>
  ) : (
    <UbText as="span" variant="body-sm" tone="tertiary">
      —
    </UbText>
  );

export const createDayBookColumns = ({
  t,
  balances,
  multiDay,
}: DayBookColumnDeps): readonly UbDataGridColumn<DayBookRow>[] => {
  const columns: UbDataGridColumn<DayBookRow>[] = [];
  if (multiDay) {
    columns.push({
      id: 'date',
      header: t('reports.daybook.column.date'),
      priority: 2,
      cardSlot: 'meta',
      widthShare: 9,
      cell: (row) => formatBusinessDate(row.date),
    });
  }
  columns.push(
    {
      id: 'time',
      header: t('reports.daybook.column.time'),
      priority: 3,
      cardSlot: 'meta',
      widthShare: 6,
      cell: (row) => row.time,
    },
    {
      id: 'type',
      header: t('reports.daybook.column.type'),
      priority: 1,
      cardSlot: 'title',
      widthShare: 12,
      cell: (row) => (
        <UbStack direction="row" align="center" className="flex-wrap gap-1">
          <UbStatusBadge tone={typeTone(row)} label={t(typeLabelId(row))} />
          {row.void && <UbStatusBadge tone="neutral" label={t('reports.daybook.void')} />}
        </UbStack>
      ),
    },
    {
      id: 'number',
      header: t('reports.daybook.column.number'),
      priority: 2,
      cardSlot: 'none',
      widthShare: 11,
      cell: (row) => {
        const href = sourceHref(row.source, row.number, row.type);
        const text = row.number ?? '—';
        return href && row.number ? (
          <UbLink href={href} variant="body-sm-medium">
            {text}
          </UbLink>
        ) : (
          text
        );
      },
    },
    {
      id: 'party',
      header: t('reports.daybook.column.party'),
      priority: 1,
      cardSlot: 'meta',
      widthShare: 14,
      cell: (row) => {
        const name = rowPartyName(row);
        if (!name) return '—';
        return row.party ? (
          <UbLink href={partyPath(row.party.id)} variant="body-sm">
            {name}
          </UbLink>
        ) : (
          name
        );
      },
    },
    {
      id: 'description',
      header: t('reports.daybook.column.description'),
      priority: 3,
      cardSlot: 'none',
      widthShare: 18,
      cell: (row) => (
        <UbText as="span" variant="body-sm" tone="secondary" className="line-clamp-2">
          {describeRow(row, t) || '—'}
        </UbText>
      ),
    },
    {
      id: 'in',
      header: t('reports.daybook.column.in'),
      priority: 1,
      align: 'end',
      cardSlot: 'trailing',
      widthShare: 9,
      cell: (row) => money(row.moneyIn, 'success', row.void),
    },
    {
      id: 'out',
      header: t('reports.daybook.column.out'),
      priority: 1,
      align: 'end',
      cardSlot: 'none',
      widthShare: 9,
      cell: (row) => money(row.moneyOut, 'error', row.void),
    },
    {
      id: 'mode',
      header: t('reports.daybook.column.mode'),
      priority: 4,
      cardSlot: 'none',
      widthShare: 12,
      cell: (row) => describeModes(row, t) || '—',
    }
  );
  if (balances) {
    columns.push(
      {
        id: 'cash',
        header: t('reports.daybook.column.cash'),
        priority: 2,
        align: 'end',
        cardSlot: 'none',
        widthShare: 9,
        cell: (row) => (
          <UbText as="span" variant="body-sm" className="ds-num">
            {formatAmount(row.cashAfter)}
          </UbText>
        ),
      },
      {
        id: 'bank',
        header: t('reports.daybook.column.bank'),
        priority: 3,
        align: 'end',
        cardSlot: 'none',
        widthShare: 9,
        cell: (row) => (
          <UbText as="span" variant="body-sm" className="ds-num">
            {formatAmount(row.bankAfter)}
          </UbText>
        ),
      }
    );
  }
  columns.push({
    id: 'by',
    header: t('reports.daybook.column.by'),
    priority: 4,
    cardSlot: 'none',
    widthShare: 9,
    cell: (row) => row.createdBy?.name || '—',
  });
  return columns;
};
