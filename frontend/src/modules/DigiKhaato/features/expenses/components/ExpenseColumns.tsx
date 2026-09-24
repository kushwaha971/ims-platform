import { UbAmount, UbStack, UbStatusBadge, UbTag, UbText, isUbTagColor } from 'src/design-system';
import type { UbDataGridColumn } from 'src/design-system/UbDataGrid';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';

import { categoryLabel, expenseTitle, modeLabelId } from '../view-model/expenseDisplay';

import type { Expense } from '../types/expense.types';

/**
 * EXP-01 FR-9 — the list's column model, scored against one question: "what
 * did the money go on, and how much?"
 *
 * | Column   | Priority | Card     | Why |
 * |---|---|---|---|
 * | Expense  | 1 | title    | The note if there is one, else the category — the merchant's own words first. |
 * | Amount   | 1 | trailing | How much. Plain ink: an expense is not an error (never red). |
 * | Date     | 1 | meta     | dd/mm/yyyy in rows (owner's rule). |
 * | Category | 2 | none     | The chip, with its EXP-02 colour AND its name (never colour alone). |
 * | Paid to  | 2 | none     | |
 * | Paid by  | 3 | meta     | "PhonePe", not "UPI", when the app is known. |
 * | Status   | 2 | none     | Unpaid / Void — the two states worth a badge. |
 */
export const createExpenseColumns = ({
  t,
  isCards,
}: {
  readonly t: TranslateFn;
  readonly isCards: boolean;
}): readonly UbDataGridColumn<Expense>[] => {
  const archived = t('expenses.category.archivedSuffix');
  return [
    {
      id: 'date',
      header: t('expenses.column.date'),
      priority: 1,
      cardSlot: 'meta',
      widthShare: 11,
      cell: (row) => formatBusinessDate(row.expenseDate),
    },
    {
      id: 'expense',
      header: t('expenses.column.expense'),
      priority: 1,
      cardSlot: 'title',
      widthShare: 22,
      cell: (row) =>
        isCards ? (
          `${expenseTitle(row)}${row.status === 'void' ? ` · ${t('expenses.void.badge')}` : ''}`
        ) : (
          /* On a table the category has its own column, so a row with no note
             leads with its NUMBER rather than printing the category twice —
             "Electricity" beside an "Electricity" chip, which the first sweep
             showed on every row a merchant had not annotated. */
          <UbStack gap={0} className="min-w-0">
            <UbText as="span" variant="body-sm" className="line-clamp-2">
              {row.note.trim() || row.number}
            </UbText>
            {row.note.trim() && (
              <UbText as="span" variant="caption" tone="tertiary" className="ds-num">
                {row.number}
              </UbText>
            )}
          </UbStack>
        ),
    },
    {
      id: 'category',
      header: t('expenses.category'),
      priority: 2,
      cardSlot: 'none',
      widthShare: 16,
      cell: (row) => (
        <UbTag
          name={categoryLabel(row.category, archived)}
          color={isUbTagColor(row.category.color) ? row.category.color : null}
        />
      ),
    },
    {
      id: 'party',
      header: t('expenses.column.party'),
      priority: 2,
      cardSlot: 'none',
      widthShare: 16,
      cell: (row) => row.party?.name ?? '—',
    },
    {
      id: 'mode',
      header: t('expenses.mode'),
      priority: 3,
      cardSlot: 'meta',
      widthShare: 11,
      cell: (row) => {
        const id = modeLabelId(row.mode, row.upiApp);
        // An unpaid expense has no "how" yet. The table has a Status column
        // that already says Unpaid; a card has no status slot, so there the
        // meta line says it instead of leaving a gap.
        if (id) return t(id);
        return isCards ? t('expenses.status.unpaid') : '—';
      },
    },
    {
      id: 'status',
      header: t('expenses.column.status'),
      priority: 2,
      cardSlot: 'none',
      widthShare: 12,
      cell: (row) =>
        row.status === 'void' ? (
          <UbStatusBadge tone="neutral" label={t('expenses.void.badge')} />
        ) : row.paid ? null : (
          <UbStatusBadge tone="warning" label={t('expenses.status.unpaid')} />
        ),
    },
    {
      id: 'amount',
      header: t('expenses.amount'),
      priority: 1,
      align: 'end',
      cardSlot: 'trailing',
      widthShare: 15,
      cell: (row) => (
        <UbAmount
          value={row.amount}
          size="sm"
          className={row.status === 'void' ? 'line-through opacity-60' : undefined}
        />
      ),
    },
  ];
};
