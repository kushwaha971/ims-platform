import { UbStack, UbText } from 'src/design-system';
import type { UbDataGridColumn } from 'src/design-system/UbDataGrid';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';
import { formatQuantity } from 'src/utils/quantity';

import { ReportAmount } from './ReportAmount';

import type { ProfitGroup, ProfitRow } from '../types/profitReport.types';

/**
 * Shop item 1 on screen, scored against the owner's question — "what made me
 * money, and what lost it":
 *
 * | Column | Priority | Card | Why |
 * |---|---|---|---|
 * | Name + what it covers | 1 | title | The row's identity: qty and bills, or the bill's date and customer. |
 * | Sales | 1 | meta | Taxable value: GST is the government's. |
 * | Cost | 2 | none | The cost frozen on each line when it was billed. |
 * | Margin | 2 | meta | Profit over the sales whose cost is known. |
 * | Profit | 1 | trailing | Signed; a loss takes the minus and the error tone. |
 *
 * A row with lines nobody knows the cost of says so under its name, because
 * its profit leaves them out rather than counting them as pure profit.
 */

interface Args {
  readonly t: TranslateFn;
  readonly group: ProfitGroup;
  readonly isCards: boolean;
}

/** The catch-all row's name: walk-in sales, lines with no item, items with no category. */
export const profitRowName = (t: TranslateFn, group: ProfitGroup, row: ProfitRow): string =>
  row.name ?? t(`reports.profit.unnamed.${group}`);

const caption = (t: TranslateFn, group: ProfitGroup, row: ProfitRow): string => {
  const bills = t('reports.profit.bills', { count: row.bills });
  if (group === 'item' && row.qty) {
    return [formatQuantity(row.qty, row.unit ?? undefined), bills].join(' · ');
  }
  if (group === 'bill') {
    return [
      formatBusinessDate(row.date),
      row.party?.name ?? t('reports.profit.unnamed.party'),
    ].join(' · ');
  }
  return bills;
};

const money = (
  id: string,
  header: string,
  pick: (row: ProfitRow) => string | null,
  priority: 1 | 2,
  cardSlot: 'meta' | 'none' | 'trailing',
  sortable: boolean
): UbDataGridColumn<ProfitRow> => ({
  id,
  header,
  priority,
  align: 'end',
  cardSlot,
  widthShare: 12,
  ...(sortable ? { sortField: id } : {}),
  cell: (row) => <ReportAmount value={pick(row)} />,
});

export const createProfitColumns = ({
  t,
  group,
  isCards,
}: Args): readonly UbDataGridColumn<ProfitRow>[] => [
  {
    id: 'name',
    header: t(`reports.profit.column.${group}`),
    priority: 1,
    cardSlot: 'title',
    widthShare: 30,
    sortField: 'name',
    cell: (row) => {
      const name = profitRowName(t, group, row);
      const missing =
        row.uncostedLines > 0
          ? t('reports.profit.uncostedRow', { count: row.uncostedLines })
          : null;
      // A card's title is text, and the missing cost is the one caveat a phone must still show.
      if (isCards) return [name, missing].filter(Boolean).join(' · ');
      return (
        <UbStack gap={0.5} className="min-w-0">
          <UbText as="span" variant="body-sm" className="line-clamp-2">
            {name}
          </UbText>
          <UbText as="span" variant="caption" tone="tertiary" className="ds-num">
            {caption(t, group, row)}
          </UbText>
          {missing && (
            <UbText as="span" variant="caption" tone="warning">
              {missing}
            </UbText>
          )}
        </UbStack>
      );
    },
  },
  money('sale_value', t('reports.profit.column.sales'), (row) => row.saleValue, 1, 'meta', true),
  money('cost', t('reports.profit.column.cost'), (row) => row.cost, 2, 'none', false),
  {
    id: 'margin',
    header: t('reports.profit.column.margin'),
    priority: 2,
    align: 'end',
    cardSlot: 'meta',
    widthShare: 9,
    sortField: 'margin',
    // The amounts' size and figures, so the row reads as one line of numbers.
    cell: (row) => (
      <UbText as="span" variant="body-sm" className="ds-num">
        {row.marginPct === null ? '—' : t('reports.profit.percent', { value: row.marginPct })}
      </UbText>
    ),
  },
  money('profit', t('reports.profit.column.profit'), (row) => row.profit, 1, 'trailing', true),
];
