import { UbText } from 'src/design-system';
import type { UbColumnPriority, UbDataGridColumn } from 'src/design-system/UbDataGrid';
import type { TranslateFn } from 'src/hooks/useTranslation';

import { previewCell } from '../view-model/importDisplay';

import type { ImportPreviewColumn } from '../constants/importKinds';
import type { ImportPreviewRow, ImportRowProblem } from '../types/import.types';

/**
 * The two column models the review step draws — built at module level, as the
 * list screens build theirs (`createItemColumns`), so no cell is a component
 * defined during render.
 */

const priorityFor = (index: number): UbColumnPriority =>
  index === 0 ? 1 : index < 3 ? 2 : index < 5 ? 3 : 4;

const isNumeric = (format: ImportPreviewColumn['format']): boolean =>
  format === 'money' || format === 'qty';

/** AC-3's preview: the row number, then the kind's own columns in template order. */
export const createPreviewColumns = ({
  t,
  columns,
  yesNo,
}: {
  readonly t: TranslateFn;
  readonly columns: readonly ImportPreviewColumn[];
  readonly yesNo: { readonly yes: string; readonly no: string };
}): readonly UbDataGridColumn<ImportPreviewRow>[] => [
  {
    id: 'row',
    header: t('imports.col.row'),
    priority: 1,
    cardSlot: 'meta',
    widthShare: 6,
    cell: (row) => (
      <UbText as="span" variant="body-sm" className="ds-num">
        {row.valid ? String(row.row) : t('imports.preview.rowWithProblem', { row: row.row })}
      </UbText>
    ),
  },
  ...columns.map<UbDataGridColumn<ImportPreviewRow>>((column, index) => ({
    id: column.key,
    header: t(`imports.col.${column.key}`),
    priority: priorityFor(index),
    cardSlot:
      index === 0
        ? 'title'
        : index === 1
          ? 'meta'
          : column.format === 'money'
            ? 'trailing'
            : 'none',
    align: isNumeric(column.format) ? 'end' : 'start',
    widthShare: index === 0 ? 20 : column.format === 'mobile' ? 15 : 12,
    cell: (row) => {
      const text = previewCell(row[column.key] as never, column.format, {
        ...yesNo,
        choice: (value) => t(`imports.value.${column.key}.${value}`),
      });
      return isNumeric(column.format) ? (
        <UbText as="span" variant="body-sm" className="ds-num">
          {text}
        </UbText>
      ) : (
        text
      );
    },
  })),
];

/** §9's error table: Row · Column · Value · Problem. */
export const createErrorColumns = (
  t: TranslateFn
): readonly UbDataGridColumn<ImportRowProblem>[] => [
  {
    id: 'row',
    header: t('imports.col.row'),
    priority: 1,
    cardSlot: 'title',
    widthShare: 8,
    cell: (problem) => t('imports.col.rowNumber', { row: problem.row }),
  },
  {
    id: 'column',
    header: t('imports.col.column'),
    priority: 2,
    cardSlot: 'meta',
    widthShare: 14,
    cell: (problem) => (
      <UbText as="span" variant="body-sm" className="ds-mono">
        {problem.column || '—'}
      </UbText>
    ),
  },
  {
    id: 'value',
    header: t('imports.col.value'),
    priority: 3,
    cardSlot: 'none',
    widthShare: 18,
    cell: (problem) => (
      <UbText as="span" variant="body-sm" className="line-clamp-2 break-all">
        {problem.value || '—'}
      </UbText>
    ),
  },
  {
    id: 'problem',
    header: t('imports.col.problem'),
    priority: 1,
    cardSlot: 'meta',
    widthShare: 40,
    /* `block whitespace-normal`: on a phone this sits in the card's meta line,
       which truncates — and a problem cut to "Unit KILO not fo…" is a problem
       the merchant cannot fix. It wraps instead. */
    cell: (problem) => (
      <UbText as="span" variant="body-sm" className="line-clamp-3 block whitespace-normal">
        {problem.message}
      </UbText>
    ),
  },
];
