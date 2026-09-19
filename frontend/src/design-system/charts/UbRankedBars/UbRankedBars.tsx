'use client';

import { memo, useMemo, useState } from 'react';

import { cn } from 'src/utils/cn';
import { formatInr } from 'src/utils/money';

import { ChartBarRow, type ChartBarRowModel } from '../ChartBarRow';
import {
  CHART_EMPHASIS_FILL,
  CHART_EMPHASIS_KEY,
  CHART_RECESSIVE_FILL,
  CHART_RECESSIVE_KEY,
} from '../chartPalette';
import { barLength, niceAxisMax, toPlotValue } from '../chartScale';
import { useChartWidth } from '../useChartWidth';

import type { UbRankedParty } from '../chartTypes';

/**
 * **Who owes most — ranked horizontal bars, emphasis on the first.**
 *
 *  - **Emphasis, not categorical.** The story is "this one party is the
 *    problem", so the top bar wears `--accent` and the rest wear the
 *    de-emphasis grey `--viz-8`. Five hues for five parties would spend the
 *    identity channel re-encoding what the bar length already says, and would
 *    bury the one row that matters. Colour follows the RANK's meaning here, not
 *    the entity — and because the set is re-ranked as a whole on every fetch,
 *    no reader ever learns "Rajesh Traders is blue" and is then misled.
 *  - **Horizontal**, because party names are long and would truncate as column
 *    labels. Here the name gets a full row and a real ellipsis with its full
 *    value in the `title`, the accessible name and the table view.
 *  - **Capped at five.** A bar per party is a list, not a chart; past the cap
 *    the chart says "and N more" and the table view carries the tail.
 *
 * `--viz-8` is 3.08:1 on the light card and 5.15:1 on the dark one, and it is
 * 22.9 ΔE (protan, light) / 16.9 ΔE (protan, dark) from the accent, so the
 * emphasis survives colour-vision deficiency as well as it survives greyscale.
 */
export const UB_RANKED_BARS_CAP = 5;

export interface UbRankedBarsProps {
  /** Highest first. Anything past `UB_RANKED_BARS_CAP` is not drawn. */
  readonly parties: readonly UbRankedParty[];
  readonly labelledBy: string;
  readonly describedBy: string;
  /**
   * Translated "and 12 more", shown when the list is longer than the cap. The
   * ICU plural lives in the caller's message — a `Ub*` never calls `t()`.
   */
  readonly moreLabel?: string;
  readonly className?: string;
}

function UbRankedBarsBase({
  parties,
  labelledBy,
  describedBy,
  moreLabel,
  className,
}: Readonly<UbRankedBarsProps>) {
  const [container, width] = useChartWidth();
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const rows = useMemo<readonly ChartBarRowModel[]>(() => {
    const shown = parties.slice(0, UB_RANKED_BARS_CAP);
    const values = shown.map((party) => toPlotValue(party.amount));
    const axisMax = niceAxisMax(Math.max(...values, 0));

    return shown.map((party, index) => {
      const value = values[index] ?? 0;
      const formatted = formatInr(party.amount);
      return {
        key: party.id,
        label: party.name,
        value: formatted,
        ariaLabel: `${party.name}, ${formatted}`,
        fillClass: index === 0 ? CHART_EMPHASIS_FILL : CHART_RECESSIVE_FILL,
        keyClass: index === 0 ? CHART_EMPHASIS_KEY : CHART_RECESSIVE_KEY,
        length: barLength(value, axisMax, width),
      };
    });
  }, [parties, width]);

  const hasMore = parties.length > UB_RANKED_BARS_CAP && Boolean(moreLabel);

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
      {hasMore && <p className="ds-caption px-2 pt-2 text-text-tertiary">{moreLabel}</p>}
    </div>
  );
}

UbRankedBarsBase.displayName = 'UbRankedBars';
export const UbRankedBars = memo(UbRankedBarsBase);
