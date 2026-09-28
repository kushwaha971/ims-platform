'use client';

import { useMemo, type ReactNode } from 'react';

import { UbPanel, UbPanelSection, UbStatusBadge, UbText } from 'src/design-system';
import {
  UbDataGrid,
  type UbDataGridColumn,
  type UbDataGridEmptyStates,
} from 'src/design-system/UbDataGrid';
import { useTranslation } from 'src/hooks/useTranslation';

import { useReportGridLabels } from '../hooks/useReportGridLabels';

/**
 * One RPT-07 section: a card whose badge names the return coordinate
 * ("GSTR-1 · 4A") and whose one-line hint says what the table is — §8's
 * "every table header states the return table; nothing is a naked number".
 */
export function GstSection({
  title,
  coordinate,
  hint,
  children,
  testId,
}: Readonly<{
  title: string;
  coordinate: string;
  hint?: string;
  children: ReactNode;
  testId?: string;
}>): React.JSX.Element {
  return (
    <UbPanel as="section">
      <UbPanelSection title={title} badge={<UbStatusBadge tone="info" label={coordinate} />}>
        {hint && (
          <UbText variant="caption" tone="tertiary" className="mb-2" data-testid={testId}>
            {hint}
          </UbText>
        )}
        {children}
      </UbPanelSection>
    </UbPanel>
  );
}

/**
 * A section's table: every row on one page (a GST section is tens of rows),
 * cards on a phone, the one grid form every list in the product uses.
 */
export function GstTable<TRow>({
  rows,
  columns,
  rowId,
  rowName,
  caption,
  onRowOpen,
}: Readonly<{
  rows: readonly TRow[];
  columns: readonly UbDataGridColumn<TRow>[];
  rowId: (row: TRow) => string;
  rowName: (row: TRow) => string;
  caption: string;
  onRowOpen?: (row: TRow) => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const labels = useReportGridLabels();
  const emptyStates = useMemo<UbDataGridEmptyStates>(
    () => ({
      firstUse: { title: t('reports.gst.section.empty') },
      filtered: { title: t('reports.gst.section.empty') },
      error: { title: t('reports.gst.error.title') },
    }),
    [t]
  );
  return (
    <UbDataGrid
      rows={rows}
      columns={columns}
      rowId={rowId}
      rowName={rowName}
      state={rows.length === 0 ? 'empty' : 'rows'}
      labels={labels}
      emptyStates={emptyStates}
      caption={caption}
      page={{ page: 1, pageSize: Math.max(rows.length, 1), total: rows.length, totalPages: 1 }}
      onPageChange={() => undefined}
      onRowOpen={onRowOpen}
      cardAvatar={false}
      allowHorizontalScroll
    />
  );
}
