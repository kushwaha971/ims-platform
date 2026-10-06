'use client';

import { memo, useCallback, useState } from 'react';

import { CalendarDays, ChevronDown } from 'lucide-react';

import { deferredModule, useDeferredModule } from 'src/design-system/primitives/deferredModule';
import { cn } from 'src/utils/cn';

import { useMediaQuery } from '../motion/useMediaQuery';

import { FilterAnchor } from './FilterAnchor';
import { formatDateFace } from './filterDisplay';
import { FILTER_BUTTON_CLASS, SHEET_QUERY, filterButtonTone } from './UbFilterSelect';

/**
 * The period, as one dropdown: presets in a list, "Custom range" at the foot
 * with its two dates and an Apply — the shape Shopify's and Zoho's analytics
 * use, and the owner's choice over a row of ten chips (6 Oct 2026).
 *
 * The button says the period in words ("This financial year"), or the two
 * dates when it is custom. A popover at a desk, a bottom sheet on a phone.
 */
export interface UbPeriodPreset<P extends string> {
  readonly value: P;
  readonly label: string;
}

export interface UbPeriodSelectProps<P extends string> {
  readonly presets: readonly UbPeriodPreset<P>[];
  readonly value: P;
  /** The preset that means "use from/to". */
  readonly customValue: P;
  readonly from: string | null;
  readonly to: string | null;
  /** A preset, or the custom preset with both dates. */
  readonly onChange: (value: P, from: string | null, to: string | null) => void;
  readonly max?: string;
  readonly labels: {
    readonly period: string;
    readonly from: string;
    readonly to: string;
    readonly apply: string;
    readonly close: string;
  };
  readonly locale?: string;
  readonly className?: string;
}

const panels = deferredModule(() => import('./filterPanels'));

function UbPeriodSelectBase<P extends string>({
  presets,
  value,
  customValue,
  from,
  to,
  onChange,
  max,
  labels,
  locale,
  className,
}: Readonly<UbPeriodSelectProps<P>>) {
  const [open, setOpen] = useState(false);
  const sheet = useMediaQuery(SHEET_QUERY);
  // Desktop and phone both need the panel (it holds the calendars).
  const loaded = useDeferredModule(panels, open);
  const close = useCallback(() => setOpen(false), []);
  const isCustom = value === customValue;
  const face = (iso: string) => formatDateFace(iso, locale);
  const current =
    isCustom && from && to
      ? `${face(from)} – ${face(to)}`
      : (presets.find((preset) => preset.value === value)?.label ?? '');

  const panel = loaded ? (
    <loaded.PeriodPanel
      presets={presets}
      value={value}
      customValue={customValue}
      from={from}
      to={to}
      max={max}
      large={sheet}
      labels={labels}
      onPreset={(next) => {
        setOpen(false);
        onChange(next as P, null, null);
      }}
      onCustom={(nextFrom, nextTo) => {
        setOpen(false);
        onChange(customValue, nextFrom, nextTo);
      }}
    />
  ) : null;

  const button = (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`${labels.period}: ${current}`}
      onClick={() => setOpen((was) => !was)}
      className={cn(FILTER_BUTTON_CLASS, filterButtonTone(false), className)}
      data-testid="period-select"
    >
      <CalendarDays aria-hidden className="h-4 w-4 shrink-0 opacity-70" />
      <span className="truncate">{current}</span>
      <ChevronDown aria-hidden className="h-4 w-4 shrink-0 opacity-70" />
    </button>
  );

  if (sheet) {
    return (
      <>
        {button}
        {loaded && (
          <loaded.SheetDialog
            open={open}
            onOpenChange={setOpen}
            title={labels.period}
            closeLabel={labels.close}
          >
            {panel}
          </loaded.SheetDialog>
        )}
      </>
    );
  }
  return (
    <FilterAnchor
      open={open && !!panel}
      onClose={close}
      trigger={button}
      label={labels.period}
      className="w-72"
    >
      {panel}
    </FilterAnchor>
  );
}

UbPeriodSelectBase.displayName = 'UbPeriodSelect';
export const UbPeriodSelect = memo(UbPeriodSelectBase) as typeof UbPeriodSelectBase;
