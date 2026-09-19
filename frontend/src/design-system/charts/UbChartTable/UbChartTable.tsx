'use client';

import { memo } from 'react';

import { cn } from 'src/utils/cn';

import type { UbChartTableColumn, UbChartTableRow } from '../chartTypes';

/**
 * The table behind every chart — the accessibility answer and the export, in
 * one (data-viz: "every chart has a table-view twin").
 *
 * It is a real `<table>` with a `<caption>`, because that is what a screen
 * reader navigates and what a copy-paste into a WhatsApp message produces.
 * `react/forbid-elements` points table markup at `UbDataGrid`; it is off inside
 * `src/design-system/**`, which is where the host elements legitimately live,
 * and a four-row static table is not a data grid — no sorting, no paging, no
 * column model.
 *
 * Numeric columns carry `ds-num` (tabular figures) so the rupee columns line up
 * digit for digit, which is the one place `tabular-nums` belongs.
 */
export interface UbChartTableProps {
  /** Names what the table lists; visible, because it names the chart's data. */
  readonly caption: string;
  readonly columns: readonly UbChartTableColumn[];
  readonly rows: readonly UbChartTableRow[];
  readonly className?: string;
}

function UbChartTableBase({ caption, columns, rows, className }: Readonly<UbChartTableProps>) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-left">
        <caption className="ds-caption pb-2 text-left text-text-tertiary">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'ds-label border-b border-border-hairline pb-2 pr-4 text-text-secondary last:pr-0',
                  column.numeric && 'text-right'
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              {row.cells.map((cell, index) => {
                const column = columns[index];
                return (
                  <td
                    key={column?.key ?? String(index)}
                    className={cn(
                      'border-b border-border-hairline py-2 pr-4 text-text-primary last:pr-0',
                      column?.numeric ? 'ds-num text-right' : 'ds-body-sm'
                    )}
                  >
                    {cell}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

UbChartTableBase.displayName = 'UbChartTable';
export const UbChartTable = memo(UbChartTableBase);
