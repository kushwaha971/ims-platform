'use client';

import { memo, useMemo, useState } from 'react';

import { cn } from 'src/utils/cn';
import { formatInr } from 'src/utils/money';

import { ChartBarRow, type ChartBarRowModel } from '../ChartBarRow';
import { CHART_AGING_RAMP } from '../chartPalette';
import { barLength, niceAxisMax, toPlotValue } from '../chartScale';
import { useChartWidth } from '../useChartWidth';

import type { UbAgingBucket } from '../chartTypes';

/**
 * **Receivables aging — horizontal bars on a sequential single hue, darker as
 * the money ages.**
 *
 * Why this form, and not the one everybody reaches for:
 *
 *  - The reader's job is *compare magnitude across ordered buckets*, and the
 *    data-viz form heuristic sends that job to bars on a sequential ramp. The
 *    order is in the colour as well as the position, so "the old money is the
 *    dark one" is read before any number is.
 *  - **Explicitly not a pie.** Four wedges cannot be compared by eye (a pie is
 *    for part-to-whole at a glance, never for comparing close values), and a
 *    pie throws the ORDER away — which is the only thing an aging report is
 *    about. Pies, donuts and gauges are banned product-wide;
 *    `chartForms.test.ts` fails if one ever appears in this folder.
 *  - **Horizontal**, because the bucket names are translated ("31–60 days" /
 *    "३१–६० दिन") and column labels would rotate or truncate.
 *
 * Both ramps were validated with the data-viz skill's `validate_palette.js
 * --ordinal`: light 300→700 on `#FFFFFF`, dark 500→200 on `#1C232C`, all four
 * checks PASS in each mode. The palest step sits at 2.53:1 (light) / 2.39:1
 * (dark) against its surface — under the 3:1 mark floor, which the spec allows
 * only with a relief channel. There are two here: every bar is directly
 * labelled with its amount, and the card's table view carries every figure.
 */
export interface UbAgingBarsProps {
  /** Youngest bucket first. The array order IS the age order. */
  readonly buckets: readonly UbAgingBucket[];
  /** Id of the element naming this chart — `UbChartCard` supplies it. */
  readonly labelledBy: string;
  /** Id of the element describing it. */
  readonly describedBy: string;
  readonly className?: string;
}

function UbAgingBarsBase({
  buckets,
  labelledBy,
  describedBy,
  className,
}: Readonly<UbAgingBarsProps>) {
  const [container, width] = useChartWidth();
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const rows = useMemo<readonly ChartBarRowModel[]>(() => {
    const values = buckets.map((bucket) => toPlotValue(bucket.amount));
    const total = values.reduce((sum, value) => sum + value, 0);
    // One axis for every bucket — the whole point of the comparison.
    const axisMax = niceAxisMax(Math.max(...values, 0));

    return buckets.map((bucket, index) => {
      const value = values[index] ?? 0;
      // The ramp has four steps because the report has four buckets; a fifth
      // bucket would need a validated fifth step, not a generated one.
      const step = CHART_AGING_RAMP[Math.min(index, CHART_AGING_RAMP.length - 1)];
      const formatted = formatInr(bucket.amount);
      const share = total > 0 ? Math.round((value / total) * 100) : 0;
      return {
        key: bucket.key,
        label: bucket.label,
        value: formatted,
        detail: `${share}%`,
        ariaLabel: `${bucket.label}, ${formatted}`,
        fillClass: step?.fill ?? '',
        keyClass: step?.key ?? '',
        length: barLength(value, axisMax, width),
      };
    });
  }, [buckets, width]);

  return (
    <div
      ref={container}
      role="group"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={cn('w-full', className)}
    >
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <ChartBarRow
            key={row.key}
            row={row}
            width={width}
            active={activeKey === row.key}
            onActivate={setActiveKey}
          />
        ))}
      </ul>
    </div>
  );
}

UbAgingBarsBase.displayName = 'UbAgingBars';
export const UbAgingBars = memo(UbAgingBarsBase);
