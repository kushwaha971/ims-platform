'use client';

import type { ReactNode } from 'react';

import { cn } from 'src/utils/cn';

import { UbPeriodSelect } from '../UbFilters/UbPeriodSelect';

/**
 * Part 23 §23.3 — a screen's period, and whatever else scopes the screen.
 *
 * ── Now a dropdown, not a row of chips (owner, 6 Oct 2026) ────────────────
 * This used to render every preset as a chip on a scrolling track with the
 * custom dates beside it, which on a 360 px phone was two rows before the
 * first result. The owner approved the dropdown pattern: the period is ONE
 * button ("📅 This financial year ▾") opening the presets with "Custom range"
 * and its two dates at the foot (`UbPeriodSelect`). The API is unchanged, so
 * every list and report that scoped itself by this component moved at once.
 *
 * `children` and `end` follow the button on the same row: further dropdowns
 * (`UbFilterSelect`) and a Filters drawer (`UbFilterSheet`), never chip rows.
 *
 * ── Bounds ─────────────────────────────────────────────────────────────────
 * `from` can never be after `to` and neither can pass `max` (usually today),
 * and a custom range is applied only with both dates — a range the picker
 * cannot produce is one the server never has to refuse.
 *
 * Presets are resolved to dates by the CALLER; this component only says which
 * one is chosen. A preset reports through `onPresetChange`; the custom range
 * through `onRangeChange`, whose callers already treat it as "custom".
 */
export interface UbDateRangePreset<P extends string> {
  readonly value: P;
  readonly label: string;
}

export interface UbDateRangePickerLabels {
  /** Names the control — "Period". */
  readonly presets: string;
  readonly from: string;
  readonly to: string;
  /** The custom range's button. */
  readonly apply: string;
  /** The phone sheet's close button. */
  readonly close: string;
}

export interface UbDateRangePickerProps<P extends string> {
  readonly presets: readonly UbDateRangePreset<P>[];
  readonly preset: P;
  readonly onPresetChange: (preset: P) => void;
  /** The preset that means "use from/to". */
  readonly customPreset: P;
  /** ISO `YYYY-MM-DD`, or null for an open end. */
  readonly from: string | null;
  readonly to: string | null;
  /** Called with the whole custom range at once. */
  readonly onRangeChange: (from: string | null, to: string | null) => void;
  /** The latest date either field may take — usually today. */
  readonly max?: string;
  readonly labels: UbDateRangePickerLabels;
  /** Kept for callers that named their fields; the dropdown needs no name. */
  readonly name?: string;
  readonly locale?: string;
  /** More of the screen's scope after the period: dropdowns, a Filters button. */
  readonly end?: ReactNode;
  readonly children?: ReactNode;
  readonly className?: string;
}

export function UbDateRangePicker<P extends string>({
  presets,
  preset,
  onPresetChange,
  customPreset,
  from,
  to,
  onRangeChange,
  max,
  labels,
  locale,
  end,
  children,
  className,
}: Readonly<UbDateRangePickerProps<P>>): React.JSX.Element {
  return (
    <div
      className={cn('ub-toolbar-row flex flex-wrap items-center gap-2', className)}
      data-testid="scope-bar"
    >
      <UbPeriodSelect<P>
        presets={presets}
        value={preset}
        customValue={customPreset}
        from={from}
        to={to}
        max={max}
        locale={locale}
        onChange={(value, nextFrom, nextTo) => {
          if (value === customPreset) onRangeChange(nextFrom, nextTo);
          else onPresetChange(value);
        }}
        labels={{
          period: labels.presets,
          from: labels.from,
          to: labels.to,
          apply: labels.apply,
          close: labels.close,
        }}
      />
      {children}
      {end}
    </div>
  );
}

UbDateRangePicker.displayName = 'UbDateRangePicker';
