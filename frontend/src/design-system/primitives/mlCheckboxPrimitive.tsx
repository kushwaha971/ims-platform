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

import { forwardRef, useId, type ReactNode } from 'react';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';

import { cn } from 'src/utils/cn';

export interface MLCheckboxProps {
  readonly label: ReactNode;
  readonly checked?: boolean;
  /** Partly selected — the select-all case the native control could only show
   *  as an OS-drawn dash. Wins over `checked` when set. */
  readonly indeterminate?: boolean;
  readonly onCheckedChange?: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly name?: string;
  readonly className?: string;
  readonly 'aria-label'?: string;
}

/**
 * A DRAWN checkbox, not the platform one.
 *
 * This was `<input type="checkbox" className="h-5 w-5 rounded-xs accent-accent">`,
 * and a native checkbox cannot be styled: the browser draws the tick, the corner
 * radius and the checked fill, so `rounded-xs` did nothing and the control
 * looked like Chrome on Chrome and like Safari on Safari — beside `UbSelect` and
 * `UbTextInput`, which look like this kit everywhere. It was most obvious in the
 * data grid's select-all column, where two OS checkboxes sat in a 48px header.
 *
 * BrandHub's is Radix with a drawn box and a lucide glyph, 16px on a hairline,
 * which is what this is. `@radix-ui/react-checkbox` is already a direct
 * dependency (ml-uikit lists it), so no package is added.
 *
 * **Indeterminate is a first-class state now**, which is the other thing the
 * native control could not express: a select-all that is partly selected was
 * setting the DOM `indeterminate` property and getting the OS dash. Radix takes
 * `checked="indeterminate"` and this draws a `Minus`.
 *
 * The `min-h-11` wrapper is the touch target and is a decided departure from
 * BrandHub — the BOX is 16px like theirs; the row you can tap is 44px.
 */
export const MLCheckbox = forwardRef<HTMLButtonElement, MLCheckboxProps>(function MLCheckbox(
  { label, className, id, checked, indeterminate, onCheckedChange, disabled, ...rest },
  ref
) {
  const generated = useId();
  const inputId = id ?? generated;
  const state = indeterminate ? 'indeterminate' : Boolean(checked);

  return (
    <div className={cn('flex min-h-11 items-center gap-2', className)}>
      <CheckboxPrimitive.Root
        ref={ref}
        id={inputId}
        checked={state}
        onCheckedChange={(next) => onCheckedChange?.(next === true)}
        disabled={disabled}
        className={cn(
          'group grid h-4 w-4 shrink-0 place-content-center rounded-xs border',
          'border-border-subtle bg-surface-card text-text-inverse',
          'transition-colors duration-fast ease-standard',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:border-border-subtle disabled:bg-surface-sunken',
          'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
          'data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent',
          'disabled:data-[state=checked]:border-border-strong disabled:data-[state=checked]:bg-border-strong',
          'disabled:data-[state=indeterminate]:border-border-strong disabled:data-[state=indeterminate]:bg-border-strong'
        )}
        {...rest}
      >
        <CheckboxPrimitive.Indicator className="grid place-content-center text-current">
          <Check aria-hidden className="hidden h-3.5 w-3.5 group-data-[state=checked]:block" />
          <Minus
            aria-hidden
            className="hidden h-3.5 w-3.5 group-data-[state=indeterminate]:block"
          />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <label htmlFor={inputId} className="ds-body-sm text-text-primary">
        {label}
      </label>
    </div>
  );
});
