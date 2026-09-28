import { UbStack, UbStatusBadge, UbText } from 'src/design-system';
import type { UbDataGridColumn } from 'src/design-system/UbDataGrid';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';

import { isCreditRow, isVoidRow } from '../view-model/registerDisplay';

import { ReportAmount } from './ReportAmount';

import type { RegisterBook, RegisterLevel, RegisterRow } from '../types/taxReports.types';

/**
 * RPT-03 FR-2/FR-3 and RPT-04 FR-2/FR-3 on screen, scored against the
 * accountant's question — "what was sold, to whom, taxed how" — with the full
 * tax column set at `lg` (the grid's one sanctioned horizontal scroll, an
 * accountant's report) and three facts on a phone card.
 *
 * | Column | Priority | Card | Why |
 * |---|---|---|---|
 * | Number + party | 1 | title | The row's identity; CN / Void / RCM badges under it. |
 * | Date | 1 | meta | dd/mm/yyyy (owner's rule). |
 * | Taxable | 1 | meta | The figure every return starts from. |
 * | CGST · SGST · IGST · Cess | 2–3 | none | The GST breakup. |
 * | Round-off | 4 | none | Only in the invoice value, never in taxable (RPT-07 BR-6). |
 * | Total | 1 | trailing | Signed: a credit note is negative (BR-1). |
 */

interface Args {
  readonly t: TranslateFn;
  readonly book: RegisterBook;
  readonly level: RegisterLevel;
  readonly isCards: boolean;
}

const money = (
  id: string,
  header: string,
  pick: (row: RegisterRow) => string,
  priority: 1 | 2 | 3 | 4 | 5,
  cardSlot: 'meta' | 'none' | 'trailing' = 'none'
): UbDataGridColumn<RegisterRow> => ({
  id,
  header,
  priority,
  align: 'end',
  cardSlot,
  widthShare: 10,
  cell: (row) => <ReportAmount value={pick(row)} />,
});

const identity = ({ t, book, isCards }: Args): UbDataGridColumn<RegisterRow> => ({
  id: 'number',
  header: t('reports.register.column.document'),
  priority: 1,
  cardSlot: 'title',
  widthShare: 24,
  cell: (row) => {
    const party = row.partyName || '—';
    if (isCards) {
      // A card's title is text, so the CN / Void badge leads it as a word (§8).
      const flag = isVoidRow(row)
        ? t('reports.register.badge.void')
        : isCreditRow(row)
          ? t('reports.register.badge.creditNote')
          : null;
      return [flag, row.number, party].filter(Boolean).join(' · ');
    }
    const badges: { key: string; label: string; tone: 'error' | 'neutral' | 'warning' | 'info' }[] =
      [];
    if (isVoidRow(row))
      badges.push({ key: 'void', label: t('reports.register.badge.void'), tone: 'neutral' });
    else if (isCreditRow(row))
      badges.push({ key: 'cn', label: t('reports.register.badge.creditNote'), tone: 'error' });
    if (row.reverseCharge)
      badges.push({ key: 'rcm', label: t('reports.register.badge.rcm'), tone: 'warning' });
    if (book === 'purchase' && row.status !== 'void')
      badges.push({
        key: 'itc',
        label: t(row.itcEligible ? 'reports.register.badge.itc' : 'reports.register.badge.noItc'),
        tone: row.itcEligible ? 'info' : 'neutral',
      });
    const caption =
      book === 'purchase'
        ? [
            row.supplierInvoiceNumber,
            row.supplierInvoiceDate && formatBusinessDate(row.supplierInvoiceDate),
          ]
            .filter(Boolean)
            .join(' · ')
        : row.partyGstin;
    return (
      <UbStack gap={0.5} className="min-w-0">
        <UbText as="span" variant="body-sm" className="ds-num">
          {row.number}
        </UbText>
        <UbText as="span" variant="body-sm" className="line-clamp-2">
          {party}
        </UbText>
        {caption && (
          <UbText as="span" variant="caption" tone="tertiary" className="ds-num">
            {caption}
          </UbText>
        )}
        {badges.length > 0 && (
          <UbStack direction="row" gap={1} className="flex-wrap">
            {badges.map((badge) => (
              <UbStatusBadge key={badge.key} tone={badge.tone} label={badge.label} />
            ))}
          </UbStack>
        )}
      </UbStack>
    );
  },
});

const date = (t: TranslateFn): UbDataGridColumn<RegisterRow> => ({
  id: 'date',
  header: t('reports.register.column.date'),
  priority: 1,
  cardSlot: 'meta',
  widthShare: 10,
  cell: (row) => formatBusinessDate(row.date),
});

export const createRegisterColumns = (args: Args): readonly UbDataGridColumn<RegisterRow>[] => {
  const { t, level } = args;
  const heads = [
    money('cgst', t('reports.register.column.cgst'), (r) => r.cgst, 2),
    money('sgst', t('reports.register.column.sgst'), (r) => r.sgst, 2),
    money('igst', t('reports.register.column.igst'), (r) => r.igst, 2),
    money('cess', t('reports.register.column.cess'), (r) => r.cess, 3),
  ];
  if (level === 'line') {
    return [
      identity(args),
      date(t),
      {
        id: 'item',
        header: t('reports.register.column.item'),
        priority: 1,
        cardSlot: 'meta',
        widthShare: 20,
        cell: (row) =>
          [row.itemName, row.hsnSac && `${t('reports.register.column.hsn')} ${row.hsnSac}`]
            .filter(Boolean)
            .join(' · '),
      },
      {
        id: 'qty',
        header: t('reports.register.column.qty'),
        priority: 2,
        cardSlot: 'none',
        align: 'end',
        widthShare: 9,
        cell: (row) => `${row.qty} ${row.unit}`,
      },
      {
        id: 'rate',
        header: t('reports.register.column.rate'),
        priority: 2,
        cardSlot: 'none',
        align: 'end',
        widthShare: 7,
        cell: (row) => `${Number(row.taxRate)}%`,
      },
      ...(args.book === 'purchase'
        ? [
            {
              id: 'unitCost',
              header: t('reports.register.column.unitCost'),
              priority: 3 as const,
              cardSlot: 'none' as const,
              align: 'end' as const,
              widthShare: 10,
              // Absent for a member without reports.financial.read — the server's call.
              cell: (row: RegisterRow) =>
                row.unitCost === null ? '—' : <ReportAmount value={row.unitCost} />,
            },
          ]
        : []),
      money('taxable', t('reports.register.column.taxable'), (r) => r.taxableValue, 1, 'none'),
      ...heads,
      money('total', t('reports.register.column.lineTotal'), (r) => r.grandTotal, 1, 'trailing'),
    ];
  }
  return [
    identity(args),
    date(t),
    money('taxable', t('reports.register.column.taxable'), (r) => r.taxableTotal, 1, 'meta'),
    ...heads,
    money('roundOff', t('reports.register.column.roundOff'), (r) => r.roundOff, 4),
    money('total', t('reports.register.column.total'), (r) => r.grandTotal, 1, 'trailing'),
    money('due', t('reports.register.column.due'), (r) => r.amountDue, 3),
  ];
};
