'use client';

import { memo, useCallback, useId, useState, type ReactNode } from 'react';

import { MLCard, MLCardContent, MLCardHeader } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

import { UbChartTable } from '../UbChartTable';

import type { UbChartA11yIds, UbChartTableColumn, UbChartTableRow } from '../chartTypes';

/**
 * The frame every chart ships inside: a title, a one-line description, the
 * chart, and — behind a two-state switch — the same numbers as a table.
 *
 * The table view is not an extra. It is the accessibility answer (a chart is a
 * picture; the table is the WCAG-clean equivalent) AND the export (the numbers
 * are selectable and copyable), which is why no chart in this folder is
 * rendered outside this card.
 *
 * The card owns the heading and the description because it owns their ids: the
 * chart is a render prop that receives them and points `aria-labelledby` /
 * `aria-describedby` at them, so the accessible name of the graphic and the
 * text a sighted reader sees are the same string, once.
 */
export interface UbChartCardTable {
  readonly caption: string;
  readonly columns: readonly UbChartTableColumn[];
  readonly rows: readonly UbChartTableRow[];
}

export interface UbChartCardProps {
  readonly title: string;
  /** One line. It is also the chart's accessible description. */
  readonly description: string;
  readonly table: UbChartCardTable;
  /** Translated switch labels — a `Ub*` never reaches for `react-intl`. */
  readonly viewLabels: { readonly chart: string; readonly table: string };
  readonly children: (a11y: UbChartA11yIds) => ReactNode;
  readonly className?: string;
}

const TOGGLE_BASE =
  'inline-flex min-h-[44px] items-center rounded-control px-3 ds-label transition-colors duration-fast ease-standard motion-reduce:transition-none focus-visible:outline-none focus-visible:shadow-focus';

function UbChartCardBase({
  title,
  description,
  table,
  viewLabels,
  children,
  className,
}: Readonly<UbChartCardProps>) {
  const base = useId();
  const titleId = `${base}-title`;
  const descriptionId = `${base}-description`;
  const panelId = `${base}-panel`;
  const [view, setView] = useState<'chart' | 'table'>('chart');

  const showChart = useCallback(() => setView('chart'), []);
  const showTable = useCallback(() => setView('table'), []);

  return (
    <MLCard className={cn('flex flex-col', className)}>
      <MLCardHeader className="flex-row items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id={titleId} className="ds-h3 text-text-primary">
            {title}
          </h3>
          <p id={descriptionId} className="ds-caption text-text-tertiary">
            {description}
          </p>
        </div>
        {/* Two buttons rather than a tablist: this is one panel shown two ways,
            and `aria-pressed` says exactly that without claiming tab semantics. */}
        <div className="flex shrink-0 items-center gap-1 rounded-control bg-surface-sunken p-1">
          <button
            type="button"
            aria-pressed={view === 'chart'}
            aria-controls={panelId}
            onClick={showChart}
            className={cn(
              TOGGLE_BASE,
              view === 'chart'
                ? 'bg-surface-card text-text-primary shadow-1'
                : 'text-text-tertiary hover:text-text-primary'
            )}
          >
            {viewLabels.chart}
          </button>
          <button
            type="button"
            aria-pressed={view === 'table'}
            aria-controls={panelId}
            onClick={showTable}
            className={cn(
              TOGGLE_BASE,
              view === 'table'
                ? 'bg-surface-card text-text-primary shadow-1'
                : 'text-text-tertiary hover:text-text-primary'
            )}
          >
            {viewLabels.table}
          </button>
        </div>
      </MLCardHeader>
      <MLCardContent id={panelId} className="pt-0">
        {view === 'chart' ? (
          children({ labelledBy: titleId, describedBy: descriptionId })
        ) : (
          <UbChartTable caption={table.caption} columns={table.columns} rows={table.rows} />
        )}
      </MLCardContent>
    </MLCard>
  );
}

UbChartCardBase.displayName = 'UbChartCard';
export const UbChartCard = memo(UbChartCardBase);
