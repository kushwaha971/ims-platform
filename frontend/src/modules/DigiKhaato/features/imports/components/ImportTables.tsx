'use client';

import { useCallback, useMemo, useState } from 'react';

import {
  UbDataGrid,
  type UbDataGridEmptyStates,
  type UbDataGridLabels,
} from 'src/design-system/UbDataGrid';
import type { TranslateFn } from 'src/hooks/useTranslation';

import { createErrorColumns, createPreviewColumns } from './ImportColumns';

import type { ImportPreviewColumn } from '../constants/importKinds';
import type { ImportPreviewRow, ImportRowProblem } from '../types/import.types';

const ERROR_PAGE_SIZE = 25;

const gridLabels = (t: TranslateFn): UbDataGridLabels => ({
  loading: t('imports.loading'),
  pageOf: t('common.grid.pageOf', { page: '{page}', pages: '{pages}' }),
  previousPage: t('common.grid.previousPage'),
  nextPage: t('common.grid.nextPage'),
  pageSize: t('common.grid.pageSize'),
  goToPage: t('common.grid.goToPage', { page: '{page}' }),
  ofTotal: t('common.grid.ofTotal', { total: '{total}' }),
  selectedCount: t('common.grid.selectedCount', { count: 0 }),
  selectAll: t('imports.grid.selectAll'),
  selectRow: t('imports.grid.selectRow', { name: '{name}' }),
  showing: t('common.grid.showing'),
  columns: t('common.grid.columns'),
  showAllColumns: t('common.grid.showAllColumns'),
  sortBy: t('common.grid.sortBy', { column: '{column}' }),
  sortedAscending: t('common.grid.sortedAscending'),
  sortedDescending: t('common.grid.sortedDescending'),
  openRow: t('imports.grid.openRow', { name: '{name}' }),
});

const noEmptyStates = (t: TranslateFn): UbDataGridEmptyStates => ({
  firstUse: { title: t('imports.preview.empty') },
  filtered: { title: t('imports.preview.empty') },
  error: { title: t('imports.error.load') },
});

/**
 * AC-3 — the first 20 rows as the importer UNDERSTOOD them, with the product's
 * own formatting, so a column shifted by one is visible at a glance. Row
 * numbers are the spreadsheet's, so "row 12" here is row 12 in Excel.
 */
export function ImportPreviewTable({
  t,
  rows,
  columns,
}: Readonly<{
  t: TranslateFn;
  rows: readonly ImportPreviewRow[];
  columns: readonly ImportPreviewColumn[];
}>): React.JSX.Element {
  const gridColumns = useMemo(
    () =>
      createPreviewColumns({
        t,
        columns,
        yesNo: { yes: t('imports.value.yes'), no: t('imports.value.no') },
      }),
    [t, columns]
  );
  const labels = useMemo(() => gridLabels(t), [t]);
  const empty = useMemo(() => noEmptyStates(t), [t]);
  const rowId = useCallback((row: ImportPreviewRow) => String(row.row), []);
  const rowName = useCallback(
    (row: ImportPreviewRow) => t('imports.col.rowNumber', { row: row.row }),
    [t]
  );
  return (
    <UbDataGrid
      rows={rows}
      columns={gridColumns}
      rowId={rowId}
      rowName={rowName}
      state={rows.length ? 'rows' : 'empty'}
      labels={labels}
      emptyStates={empty}
      caption={t('imports.preview.caption')}
      page={{ page: 1, pageSize: Math.max(rows.length, 1), total: rows.length, totalPages: 1 }}
      onPageChange={() => undefined}
      columnMenu={false}
    />
  );
}

/**
 * IMP-01 §9 — every problem: Row · Column · Value · Problem, paged here over
 * the (at most 500) the server keeps. On a phone each problem is a card with
 * the row number in its title.
 */
export function ImportErrorTable({
  t,
  errors,
}: Readonly<{ t: TranslateFn; errors: readonly ImportRowProblem[] }>): React.JSX.Element {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(errors.length / ERROR_PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const visible = useMemo(
    () => errors.slice((current - 1) * ERROR_PAGE_SIZE, current * ERROR_PAGE_SIZE),
    [errors, current]
  );
  const gridColumns = useMemo(() => createErrorColumns(t), [t]);
  const labels = useMemo(() => gridLabels(t), [t]);
  const empty = useMemo(() => noEmptyStates(t), [t]);
  const rowId = useCallback(
    (problem: ImportRowProblem) =>
      `${problem.row}:${problem.column}:${problem.code}:${problem.message}`,
    []
  );
  const rowName = useCallback(
    (problem: ImportRowProblem) => t('imports.col.rowNumber', { row: problem.row }),
    [t]
  );
  return (
    <UbDataGrid
      rows={visible}
      columns={gridColumns}
      rowId={rowId}
      rowName={rowName}
      state={errors.length ? 'rows' : 'empty'}
      labels={labels}
      emptyStates={empty}
      caption={t('imports.errors.caption')}
      page={{ page: current, pageSize: ERROR_PAGE_SIZE, total: errors.length, totalPages }}
      onPageChange={setPage}
      columnMenu={false}
    />
  );
}
