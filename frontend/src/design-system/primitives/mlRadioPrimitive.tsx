'use client';

/* Split out of `mlFormPrimitives.tsx`, and the reason is 11.5 KB.
 *
 * These two are the only primitives built on a Radix package. While they lived
 * in the same module as `MLInput`, ANY file importing a text field pulled
 * `@radix-ui/react-checkbox` and `@radix-ui/react-radio-group` with it —
 * module-level imports are not tree-shakeable within a module, only between
 * them. Measured: every auth route gained 11.5 KB, including
 * `/forgot-password`, which renders one email field and has never had a
 * checkbox on it.
 *
 * The barrel re-exports both, so no caller changes.
 */

import { type ReactNode } from 'react';

import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';

import { cn } from 'src/utils/cn';

export interface MLRadioOption<T extends string> {
  readonly value: T;
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly disabled?: boolean;
}

export interface MLRadioGroupProps<T extends string> {
  readonly name: string;
  readonly value: T | null;
  readonly onValueChange: (value: T) => void;
  readonly options: readonly MLRadioOption<T>[];
  /**
   * `card` is a bordered, tintable row per option; `plain` is a bare circle
   * beside its label.
   *
   * BrandHub has BOTH — `MLRadioGroupItem` is a 16px circle on a `grid gap-2`
   * root, and the card is `MLFieldLabel`'s `has-[>[data-slot=field]]` variant
   * with `has-data-[state=checked]:bg-primary/5`. This kit only had the card, so
   * a two-option yes/no question rendered as two large tinted boxes, which is a
   * lot of furniture for a binary. The card earns its space when each option
   * carries a hint (the GST-type branch is the case it was built for); `plain`
   * is the default because most radio groups are not that.
   */
  readonly variant?: 'plain' | 'card';
  readonly ariaLabel?: string;
  readonly ariaDescribedBy?: string;
  readonly invalid?: boolean;
  readonly className?: string;
}

export function MLRadioGroup<T extends string>({
  name,
  value,
  onValueChange,
  options,
  variant = 'plain',
  ariaLabel,
  ariaDescribedBy,
  invalid,
  className,
}: Readonly<MLRadioGroupProps<T>>): React.JSX.Element {
  const card = variant === 'card';

  return (
    <RadioGroupPrimitive.Root
      name={name}
      value={value ?? undefined}
      onValueChange={(next) => onValueChange(next as T)}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-invalid={invalid || undefined}
      className={cn('flex flex-col gap-2', className)}
    >
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            'flex min-h-11 cursor-pointer items-start gap-3',
            'transition-colors duration-fast ease-standard',
            card && 'rounded-control border px-3 py-2.5',
            card &&
              (value === option.value
                ? 'border-accent bg-accent-quiet'
                : 'border-border-subtle hover:bg-surface-hover'),
            option.disabled && 'cursor-not-allowed opacity-60'
          )}
        >
          {/* The circle is drawn, not native, for the reason `MLCheckbox` gives
              next door: a platform radio's dot, ring and checked fill are the
              browser's to draw, so it never matches the kit around it. */}
          <RadioGroupPrimitive.Item
            value={option.value}
            disabled={option.disabled}
            className={cn(
              'ub-hit relative mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-pill border',
              'border-border-subtle bg-surface-card text-accent',
              'transition-colors duration-fast ease-standard',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-border-strong',
              'data-[state=checked]:border-accent'
            )}
          >
            <RadioGroupPrimitive.Indicator className="h-2.5 w-2.5 rounded-pill bg-current" />
          </RadioGroupPrimitive.Item>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="ds-body-sm-medium text-text-primary">{option.label}</span>
            {option.hint && (
              // On the selected card's accent tint the tertiary grey is 4.46:1
              // — under 4.5 (axe, Sprint 12). Text on a tint is secondary.
              <span
                className={cn(
                  'ds-caption',
                  card && value === option.value ? 'text-text-secondary' : 'text-text-tertiary'
                )}
              >
                {option.hint}
              </span>
            )}
          </span>
        </label>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
