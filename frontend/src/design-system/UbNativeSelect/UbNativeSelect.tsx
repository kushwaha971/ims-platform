'use client';

import { forwardRef, memo, useCallback, type SelectHTMLAttributes } from 'react';

import { MLNativeSelect } from 'src/design-system/primitives';
import type { UbSelectOption } from 'src/design-system/UbSelect/UbSelect';

/**
 * A single choice rendered as the platform's own picker.
 *
 * `UbSelect` is the Radix composite and is the right control for a form field:
 * a styled trigger, a positioned menu, a chevron the design chose. It also costs
 * about 20 KB gzipped, and the bundle gate caught that landing on
 * `/forgot-password` and `/set-password` — routes with no form fields at all.
 * The cause was the language and theme pickers in the auth footer, which every
 * auth route renders.
 *
 * Those two are exactly the case their own docstrings already argued for: a
 * closed list of two or three options, chosen rarely, where the platform picker
 * is smaller, needs no portal, is type-ahead searchable for free, costs no
 * JavaScript, and on a 2 GB Android phone is simply the better control. Paying
 * 20 KB to restyle a two-item list is the wrong trade.
 *
 * So the rule is: **a field inside a form uses `UbSelect`; a preference control
 * in chrome uses this.** Same options shape, same props, so moving one to the
 * other is a one-word change.
 */
export interface UbNativeSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange' | 'children'> {
  readonly value: string | null | undefined;
  readonly onChange: (value: string) => void;
  readonly options: readonly UbSelectOption[];
  readonly placeholder?: string;
  readonly invalid?: boolean;
  readonly className?: string;
}

const UbNativeSelectInner = forwardRef<HTMLSelectElement, UbNativeSelectProps>(
  function UbNativeSelectInner(
    { value, onChange, options, placeholder, invalid, className, ...rest },
    ref
  ) {
    const handleChange = useCallback(
      (event: React.ChangeEvent<HTMLSelectElement>) => onChange(event.target.value),
      [onChange]
    );

    return (
      <MLNativeSelect
        ref={ref}
        value={value ?? ''}
        onChange={handleChange}
        invalid={invalid}
        className={className}
        {...rest}
      >
        {/* Disabled and not re-selectable, so an untouched required field
            submits '' and the schema speaks — rather than submitting the first
            real option, because a native select always has a value. */}
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </MLNativeSelect>
    );
  }
);

UbNativeSelectInner.displayName = 'UbNativeSelect';
export const UbNativeSelect = memo(UbNativeSelectInner);
