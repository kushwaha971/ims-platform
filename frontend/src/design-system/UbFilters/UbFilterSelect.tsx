'use client';

import { memo, useCallback, useState } from 'react';

import { Check, ChevronDown } from 'lucide-react';

import { deferredModule, useDeferredModule } from 'src/design-system/primitives/deferredModule';
import { cn } from 'src/utils/cn';

import { useMediaQuery } from '../motion/useMediaQuery';

import { FilterAnchor } from './FilterAnchor';

import type { UbFilterOption, UbFilterSingleSpec } from './filterTypes';

/**
 * A filter as a DROPDOWN: one compact button that shows its current value
 * ("Status: Unpaid ▾"), opening a list of choices.
 *
 * Owner-approved pattern (6 Oct 2026): chip rows for every option took two or
 * three rows of a phone before the first result. One choice from many is a
 * dropdown; at a desk it opens a popover under the button, on a phone a bottom
 * sheet, because a thumb reaches the bottom of the screen and a 36 px popover
 * row is a missed tap. The desktop list is `FilterAnchor` (no positioning
 * engine) and the phone sheet loads on first open, so the button is all a
 * screen pays for on first paint. A disabled choice keeps its hint ("too many bars for
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

export const SHEET_QUERY = '(max-width: 639px)';

const panels = deferredModule(() => import('./filterPanels'));

export const FILTER_BUTTON_CLASS = cn(
  // Owner, 12 Oct 2026: smaller on a phone so a toolbar fits one row; `ub-hit`
  // keeps the touch target at 44 px whatever the drawn height.
  'ub-hit ds-body-s-regular inline-flex h-9 max-w-full shrink-0 items-center gap-1.5 rounded-control border px-2.5 sm:h-10 sm:gap-2 sm:px-3',
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
  /* On a phone the button says one thing: the filter's name while it is not
     set ("Cash or bank"), its value once it is ("Cash"), so a toolbar fits one
     row. The accessible name keeps both, as on a computer. */
  const text = !showLabel
    ? current
    : sheet
      ? value === '' && spec.anyLabel
        ? spec.label
        : current
      : `${spec.label}: ${current}`;
  const pick = (next: string) => {
    setOpen(false);
    if (next !== value) onChange(next);
  };

  const loaded = useDeferredModule(panels, open && sheet);
  const close = useCallback(() => setOpen(false), []);

  const button = (
    <button
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={`${spec.label}: ${current}`}
      onClick={() => setOpen((was) => !was)}
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
        {loaded && (
          <loaded.SheetDialog
            open={open}
            onOpenChange={setOpen}
            title={spec.label}
            closeLabel={closeLabel}
          >
            <OptionList options={options} value={value} onPick={pick} large />
          </loaded.SheetDialog>
        )}
      </>
    );
  }
  return (
    <FilterAnchor open={open} onClose={close} trigger={button} label={spec.label} className="w-64">
      <OptionList options={options} value={value} onPick={pick} large={false} />
    </FilterAnchor>
  );
}

UbFilterSelectBase.displayName = 'UbFilterSelect';
export const UbFilterSelect = memo(UbFilterSelectBase);
