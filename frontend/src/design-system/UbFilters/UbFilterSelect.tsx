'use client';

import { memo, useState } from 'react';

import { Check, ChevronDown } from 'lucide-react';

import { cn } from 'src/utils/cn';

import { useMediaQuery } from '../motion/useMediaQuery';
import { UbDialog } from '../UbDialog';
import { UbPopover } from '../UbPopover';

import type { UbFilterOption, UbFilterSingleSpec } from './filterTypes';

/**
 * A filter as a DROPDOWN: one compact button that shows its current value
 * ("Status: Unpaid ▾"), opening a list of choices.
 *
 * Owner-approved pattern (6 Oct 2026): chip rows for every option took two or
 * three rows of a phone before the first result. One choice from many is a
 * dropdown; at a desk it opens a popover under the button, on a phone a bottom
 * sheet, because a thumb reaches the bottom of the screen and a 36 px popover
 * row is a missed tap. A disabled choice keeps its hint ("too many bars for
 * this period") so the merchant learns why rather than seeing it vanish.
 */
export interface UbFilterSelectProps {
  readonly spec: UbFilterSingleSpec;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Prefix the value with the filter's name ("Status: Unpaid"). Default true. */
  readonly showLabel?: boolean;
  /** The sheet's close button, on a phone. */
  readonly closeLabel: string;
  readonly className?: string;
}

const SHEET_QUERY = '(max-width: 639px)';

export const FILTER_BUTTON_CLASS = cn(
  'ub-hit ds-body-s-regular inline-flex h-9 max-w-full shrink-0 items-center gap-2 rounded-control border px-3',
  'transition-colors duration-fast ease-standard motion-reduce:transition-none',
  'outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-60'
);

export const filterButtonTone = (applied: boolean): string =>
  applied
    ? 'border-transparent bg-accent-quiet text-text-accent'
    : 'border-border bg-surface-card text-text-primary hover:bg-surface-hover';

function OptionList({
  options,
  value,
  onPick,
  large,
}: Readonly<{
  options: readonly UbFilterOption[];
  value: string;
  onPick: (value: string) => void;
  large: boolean;
}>) {
  return (
    <ul role="listbox" className="flex flex-col p-1">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <li key={option.value || '__any'} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={selected}
              disabled={option.disabled}
              onClick={() => onPick(option.value)}
              className={cn(
                'flex w-full items-center gap-3 rounded-control px-3 text-left outline-none',
                'focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50',
                large ? 'ds-body min-h-12' : 'ds-body-s-regular min-h-9',
                selected
                  ? 'bg-accent-quiet text-text-accent'
                  : 'text-text-primary hover:bg-surface-hover'
              )}
            >
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.hint && (
                <span className="ds-caption shrink-0 text-text-tertiary">{option.hint}</span>
              )}
              {selected && <Check aria-hidden className="h-4 w-4 shrink-0" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function UbFilterSelectBase({
  spec,
  value,
  onChange,
  showLabel = true,
  closeLabel,
  className,
}: Readonly<UbFilterSelectProps>) {
  const [open, setOpen] = useState(false);
  const sheet = useMediaQuery(SHEET_QUERY);
  const options: readonly UbFilterOption[] = spec.anyLabel
    ? [{ value: '', label: spec.anyLabel }, ...spec.options]
    : spec.options;
  const current = options.find((option) => option.value === value)?.label ?? spec.anyLabel ?? '';
  const text = showLabel ? `${spec.label}: ${current}` : current;
  const pick = (next: string) => {
    setOpen(false);
    if (next !== value) onChange(next);
  };

  const button = (
    <button
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={`${spec.label}: ${current}`}
      onClick={sheet ? () => setOpen(true) : undefined}
      className={cn(
        FILTER_BUTTON_CLASS,
        filterButtonTone(value !== '' && !!spec.anyLabel),
        className
      )}
    >
      <span className="truncate">{text}</span>
      <ChevronDown aria-hidden className="h-4 w-4 shrink-0 opacity-70" />
    </button>
  );

  if (sheet) {
    return (
      <>
        {button}
        <UbDialog open={open} onOpenChange={setOpen} title={spec.label} closeLabel={closeLabel}>
          <OptionList options={options} value={value} onPick={pick} large />
        </UbDialog>
      </>
    );
  }
  return (
    <UbPopover
      trigger={button}
      open={open}
      onOpenChange={setOpen}
      label={spec.label}
      className="w-64"
    >
      <OptionList options={options} value={value} onPick={pick} large={false} />
    </UbPopover>
  );
}

UbFilterSelectBase.displayName = 'UbFilterSelect';
export const UbFilterSelect = memo(UbFilterSelectBase);
