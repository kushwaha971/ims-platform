'use client';

import { memo, useState } from 'react';

import { CalendarDays, Check, ChevronDown } from 'lucide-react';

import { cn } from 'src/utils/cn';

import { useMediaQuery } from '../motion/useMediaQuery';
import { UbButton } from '../UbButton';
import { UbDateInput, formatDateFace } from '../UbDateInput/UbDateInput';
import { UbDialog } from '../UbDialog';
import { UbPopover } from '../UbPopover';

import { FILTER_BUTTON_CLASS, filterButtonTone } from './UbFilterSelect';

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

const SHEET_QUERY = '(max-width: 639px)';

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
  const [draftFrom, setDraftFrom] = useState(from ?? '');
  const [draftTo, setDraftTo] = useState(to ?? '');
  const sheet = useMediaQuery(SHEET_QUERY);
  const isCustom = value === customValue;
  const face = (iso: string) => formatDateFace(iso, locale);
  const current =
    isCustom && from && to
      ? `${face(from)} – ${face(to)}`
      : (presets.find((preset) => preset.value === value)?.label ?? '');

  const openPanel = (next: boolean) => {
    if (next) {
      setDraftFrom(from ?? '');
      setDraftTo(to ?? '');
    }
    setOpen(next);
  };
  const choose = (next: P) => {
    setOpen(false);
    onChange(next, null, null);
  };

  const panel = (
    <div className="flex flex-col p-1">
      <ul role="listbox" aria-label={labels.period} className="flex flex-col">
        {presets
          .filter((preset) => preset.value !== customValue)
          .map((preset) => {
            const selected = preset.value === value;
            return (
              <li key={preset.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => choose(preset.value)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-control px-3 text-left outline-none focus-visible:shadow-focus',
                    sheet ? 'ds-body min-h-12' : 'ds-body-s-regular min-h-9',
                    selected
                      ? 'bg-accent-quiet text-text-accent'
                      : 'text-text-primary hover:bg-surface-hover'
                  )}
                >
                  <span className="flex-1">{preset.label}</span>
                  {selected && <Check aria-hidden className="h-4 w-4" />}
                </button>
              </li>
            );
          })}
      </ul>
      <div className="mt-1 flex flex-col gap-2 border-t border-border-hairline px-2 pb-2 pt-3">
        <span className="ds-label text-text-secondary">
          {presets.find((preset) => preset.value === customValue)?.label}
        </span>
        <div className="grid grid-cols-2 gap-2">
          <UbDateInput
            aria-label={labels.from}
            placeholder={labels.from}
            value={draftFrom}
            max={draftTo || max}
            onChange={(next) => setDraftFrom(next ?? '')}
          />
          <UbDateInput
            aria-label={labels.to}
            placeholder={labels.to}
            value={draftTo}
            min={draftFrom || undefined}
            max={max}
            onChange={(next) => setDraftTo(next ?? '')}
          />
        </div>
        <UbButton
          size="sm"
          disabled={!draftFrom || !draftTo}
          onClick={() => {
            setOpen(false);
            onChange(customValue, draftFrom, draftTo);
          }}
        >
          {labels.apply}
        </UbButton>
      </div>
    </div>
  );

  const button = (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`${labels.period}: ${current}`}
      onClick={sheet ? () => openPanel(true) : undefined}
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
        <UbDialog
          open={open}
          onOpenChange={setOpen}
          title={labels.period}
          closeLabel={labels.close}
        >
          {panel}
        </UbDialog>
      </>
    );
  }
  return (
    <UbPopover
      trigger={button}
      open={open}
      onOpenChange={openPanel}
      label={labels.period}
      align="end"
      className="w-72"
    >
      {panel}
    </UbPopover>
  );
}

UbPeriodSelectBase.displayName = 'UbPeriodSelect';
export const UbPeriodSelect = memo(UbPeriodSelectBase) as typeof UbPeriodSelectBase;
