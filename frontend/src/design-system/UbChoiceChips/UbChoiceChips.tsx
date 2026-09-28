'use client';

import { useCallback, useRef, type KeyboardEvent, type ReactNode } from 'react';

import { cn } from 'src/utils/cn';

/**
 * A single choice, as a row of chips — "Received via: Cash · PhonePe · …".
 *
 * `UbFilterChip` is a filter TOGGLE: `aria-pressed`, many on at once, and off
 * is a meaningful state. This is a RADIO GROUP that looks like chips: exactly
 * one checked, arrow keys move and select (WAI-ARIA radio pattern, roving
 * tabindex), and tapping the checked chip leaves it checked. LED-01's drawer
 * had a note that this component would land with payment mode's second
 * caller; the correction drawer is that caller, and the UPI-app choice made a
 * select of six words a select of fourteen, which settled it.
 *
 * Wraps rather than scrolls: in a drawer every choice should be visible
 * without a sideways gesture, and nine chips at 32 px wrap to three lines on
 * a 360 px phone — less than an open select covers.
 */
export interface UbChoiceChipOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly icon?: ReactNode;
}

export interface UbChoiceChipsProps<T extends string> {
  readonly value: T | '' | null | undefined;
  readonly onChange: (value: T) => void;
  readonly options: readonly UbChoiceChipOption<T>[];
  /** The group's accessible name, translated by the caller. */
  readonly ariaLabel: string;
  readonly id?: string;
  readonly invalid?: boolean;
  readonly describedBy?: string;
  readonly disabled?: boolean;
  readonly onBlur?: () => void;
  readonly className?: string;
}

export function UbChoiceChips<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  id,
  invalid = false,
  describedBy,
  disabled,
  onBlur,
  className,
}: Readonly<UbChoiceChipsProps<T>>): React.JSX.Element {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const checkedIndex = options.findIndex((option) => option.value === value);
  /* Roving tabindex: the checked chip is the one in the tab order, or the
     first when nothing is checked yet — so Tab reaches the group once. */
  const tabStop = checkedIndex >= 0 ? checkedIndex : 0;

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const last = options.length - 1;
      const from = checkedIndex >= 0 ? checkedIndex : 0;
      let next = from;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
        next = from === last ? 0 : from + 1;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
        next = from === 0 ? last : from - 1;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = last;
      else return;
      event.preventDefault();
      const option = options[next];
      if (!option) return;
      onChange(option.value);
      refs.current[next]?.focus();
    },
    [options, checkedIndex, onChange]
  );

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        // Blur of the GROUP, not of each chip, so `onTouched` fires once.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onBlur?.();
      }}
      // 12 px between chips on a phone, across and between wrapped rows, so their
      // 44 px hit areas (`.ub-hit`) meet rather than overlap (R-A-3, Sprint 12).
      className={cn('flex flex-wrap gap-2 max-sm:gap-3', className)}
    >
      {options.map((option, index) => {
        const checked = index === checkedIndex;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={index === tabStop ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'ub-hit ds-body-s-medium inline-flex h-8 items-center gap-1.5 rounded-pill border px-3',
              'outline-none transition-colors duration-fast ease-standard focus-visible:shadow-focus',
              'disabled:cursor-not-allowed disabled:opacity-60',
              checked
                ? 'border-accent bg-accent-quiet text-text-accent'
                : invalid
                  ? 'border-formError text-text-secondary hover:bg-surface-hover'
                  : 'border-border-subtle text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

UbChoiceChips.displayName = 'UbChoiceChips';
