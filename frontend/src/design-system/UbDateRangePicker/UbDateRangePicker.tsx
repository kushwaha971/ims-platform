'use client';

import { useCallback, type ReactNode } from 'react';

import { UbDateInput } from 'src/design-system/UbDateInput';
import { UbFilterBar, UbFilterChip, UbFilterChipGroup } from 'src/design-system/UbFilterChip';

/**
 * Part 23 §23.3 — a period: a row of presets, and a from/to pair for the one
 * preset that means "let me choose".
 *
 * ── Why it is a filter bar, not a field ───────────────────────────────────
 * Every period in this product scopes a screen — the statement today, RPT-04
 * and the reports behind it next — and the owner's rule for a screen's scope
 * is that its date sits on the RIGHT (docs/DESIGN-SYSTEM.md §3). So this
 * renders a `UbFilterBar`: presets on the scrolling chip track, the two dates
 * in the `end` cluster, and whatever else the screen scopes by (`end`, e.g. the
 * statement's "Show corrections") after them. `children` adds further chip
 * groups to the track. A range INSIDE a form would be a different component,
 * and nothing asks for one.
 *
 * ── Why the dates only appear for the custom preset ───────────────────────
 * Two date boxes beside six chips are two ways of answering one question, and
 * on a 360 px phone they are also the two controls that push the chips off the
 * screen. With no `customPreset` the dates are always shown.
 *
 * ── A period is a single choice ───────────────────────────────────────────
 * `UbFilterChip.onToggle` reports the state the chip WILL be in; turning the
 * applied preset "off" means nothing for a period, so it is ignored and the
 * preset stays applied — which is what a merchant expects of a chip they just
 * tapped twice.
 *
 * ── Bounds ─────────────────────────────────────────────────────────────────
 * `from` can never be after `to` and neither can pass `max` (usually today):
 * `from`'s calendar stops at `to ?? max`, `to`'s starts at `from`. A range the
 * pickers cannot produce is a range the server never has to refuse.
 *
 * Presets are resolved to dates by the CALLER (the statement's financial-year
 * arithmetic lives in its view-model, where it is tested); this component only
 * says which one is chosen. Generic in the preset union so a caller's
 * `onPresetChange` receives its own type rather than a `string`.
 */
export interface UbDateRangePreset<P extends string> {
  readonly value: P;
  readonly label: string;
}

export interface UbDateRangePickerLabels {
  /** Names the chip group — "Period". */
  readonly presets: string;
  readonly from: string;
  readonly to: string;
}

export interface UbDateRangePickerProps<P extends string> {
  readonly presets: readonly UbDateRangePreset<P>[];
  readonly preset: P;
  readonly onPresetChange: (preset: P) => void;
  /** The preset that reveals the from/to fields. Omit to always show them. */
  readonly customPreset?: P;
  /** ISO `YYYY-MM-DD`, or null for an open end. */
  readonly from: string | null;
  readonly to: string | null;
  /** Called with the whole range; a cleared field arrives as `null`. */
  readonly onRangeChange: (from: string | null, to: string | null) => void;
  /** The latest date either field may take — usually today. */
  readonly max?: string;
  readonly labels: UbDateRangePickerLabels;
  /** Prefix for the fields' `name`s: `${name}-from`, `${name}-to`. */
  readonly name?: string;
  /** More of the screen's scope, after the dates in the right-hand cluster. */
  readonly end?: ReactNode;
  /** Further chip groups on the track, after the presets. */
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
  name = 'date-range',
  end,
  children,
  className,
}: Readonly<UbDateRangePickerProps<P>>): React.JSX.Element {
  const choose = useCallback(
    (value: P) => (next: boolean) => {
      if (next) onPresetChange(value);
    },
    [onPresetChange]
  );

  const showRange = customPreset === undefined || preset === customPreset;

  return (
    <UbFilterBar
      className={className}
      end={
        showRange || end ? (
          <>
            {showRange && (
              <div className="flex flex-row items-center gap-2">
                <UbDateInput
                  name={`${name}-from`}
                  aria-label={labels.from}
                  placeholder={labels.from}
                  value={from ?? ''}
                  max={to ?? max}
                  onChange={(value: string | null) => onRangeChange(value || null, to)}
                  className="w-36"
                />
                <UbDateInput
                  name={`${name}-to`}
                  aria-label={labels.to}
                  placeholder={labels.to}
                  value={to ?? ''}
                  min={from ?? undefined}
                  max={max}
                  onChange={(value: string | null) => onRangeChange(from, value || null)}
                  className="w-36"
                />
              </div>
            )}
            {end}
          </>
        ) : undefined
      }
    >
      <UbFilterChipGroup label={labels.presets}>
        {presets.map((option) => (
          <UbFilterChip
            key={option.value}
            label={option.label}
            pressed={preset === option.value}
            onToggle={choose(option.value)}
          />
        ))}
      </UbFilterChipGroup>
      {children}
    </UbFilterBar>
  );
}

UbDateRangePicker.displayName = 'UbDateRangePicker';
