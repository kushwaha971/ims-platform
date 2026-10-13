'use client';

import { useEffect, useMemo, useState } from 'react';

import { UbDataGrid, UbFilterChip, UbSectionHeading, UbStack, UbText } from 'src/design-system';
import type { UbDataGridColumn } from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import type { TranslateFn } from 'src/hooks/useTranslation';

import { fetchImportRows } from '../redux/importThunk';

import { createPreviewColumns } from './ImportColumns';
import { gridLabels, noEmptyStates } from './ImportTables';

import type { ImportPreviewColumn } from '../constants/importKinds';
import type { ImportPreviewRow, ImportReviewRow } from '../types/import.types';

const PAGE_SIZE = 25;

/** What is wrong with a row, in the owner's words — or that it is already in the book. */
const issuesColumn = (t: TranslateFn): UbDataGridColumn<ImportPreviewRow> => ({
  id: 'issues',
  header: t('imports.rows.issues'),
  priority: 2,
  cardSlot: 'none',
  widthShare: 24,
  cell: (row) => {
    const review = row as ImportReviewRow;
    const issues = review.errors ?? [];
    if (issues.length === 0 && !review.duplicate) return '';
    return (
      <UbText as="span" variant="body-sm" tone={issues.length ? 'warning' : 'secondary'}>
        {issues.length
          ? issues.map((i) => `${i.column}: ${i.message}`).join(' · ')
          : t('imports.rows.duplicate')}
      </UbText>
    );
  },
});

/**
 * QA B34 — every row before importing, a page at a time. The review used to show
 * the first 20 only, so a defaulted direction on row 21 was never seen before it
 * was saved. "Only rows with problems" narrows to what will not import and to
 * the duplicates the owner is choosing about; each row says what is wrong with it.
 */
export function ImportRowsReview({
  t,
  jobId,
  total,
  columns,
}: Readonly<{
  t: TranslateFn;
  jobId: string;
  total: number;
  columns: readonly ImportPreviewColumn[];
}>): React.JSX.Element {
  const dispatch = useAppDispatch();
  const [page, setPage] = useState(1);
  const [problems, setProblems] = useState(false);
  const [rows, setRows] = useState<readonly ImportReviewRow[] | null>(null);
  const [count, setCount] = useState(total);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const promise = dispatch(fetchImportRows({ id: jobId, page, pageSize: PAGE_SIZE, problems }));
    void promise.then((result) => {
      if (fetchImportRows.fulfilled.match(result)) {
        setRows(result.payload.rows);
        setCount(result.payload.total);
        setFailed(false);
      } else if (!result.meta.aborted) setFailed(true);
    });
    return () => promise.abort();
  }, [dispatch, jobId, page, problems]);

  const gridColumns = useMemo<readonly UbDataGridColumn<ImportPreviewRow>[]>(
    () => [
      ...createPreviewColumns({
        t,
        columns,
        yesNo: { yes: t('imports.value.yes'), no: t('imports.value.no') },
      }),
      issuesColumn(t),
    ],
    [t, columns]
  );
  const labels = useMemo(() => gridLabels(t), [t]);
  const empty = useMemo(() => noEmptyStates(t), [t]);
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <UbStack gap={2} data-testid="import-rows-review">
      <UbSectionHeading title={t('imports.rows.title')} meta={t('imports.rows.meta', { count })} />
      <UbFilterChip
        label={t('imports.rows.onlyProblems')}
        pressed={problems}
        onToggle={(next) => {
          setProblems(next);
          setPage(1);
        }}
      />
      {failed ? (
        <UbText variant="body-sm" tone="warning">
          {t('imports.rows.error')}
        </UbText>
      ) : (
        <UbDataGrid
          rows={rows ?? []}
          columns={gridColumns}
          rowId={(row) => String(row.row)}
          rowName={(row) => t('imports.col.rowNumber', { row: row.row })}
          state={rows === null ? 'loading' : rows.length ? 'rows' : 'empty'}
          labels={labels}
          emptyStates={empty}
          caption={t('imports.rows.title')}
          page={{ page, pageSize: PAGE_SIZE, total: count, totalPages }}
          onPageChange={setPage}
          columnMenu={false}
        />
      )}
    </UbStack>
  );
}
