'use client';

import { forwardRef, memo, useCallback, type SelectHTMLAttributes } from 'react';

import { MLSelect } from 'src/design-system/primitives';

/**
 * Part 23 §23.3 — a single choice from a known, closed list. PLT-03's 38 GST
 * state codes are the Sprint 1 caller.
 *
 * `UbCombobox` (a searchable, typeahead list) is a wave-2 component and is
 * deliberately NOT faked here. A native select is the honest stand-in and, on
 * the 2 GB Android phones PLT-03 §5 targets, the better control: it renders as
 * the platform picker, it is type-ahead searchable for free, and it costs no
 * JavaScript.
 *
 * The placeholder option is `value=""`, disabled and not re-selectable, so an
 * untouched required field submits `''` and the schema speaks — rather than
 * submitting the first real option because a select always has a value.
 */
export interface UbSelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface UbSelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'value' | 'onChange' | 'children'
> {
  readonly value: string | null | undefined;
  readonly onChange: (value: string) => void;
  readonly options: readonly UbSelectOption[];
  readonly placeholder?: string;
  readonly invalid?: boolean;
  readonly className?: string;
}

const UbSelectInner = forwardRef<HTMLSelectElement, UbSelectProps>(function UbSelectInner(
  { value, onChange, options, placeholder, invalid, className, ...rest },
  ref
) {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => onChange(event.target.value),
    [onChange]
  );

  return (
    <MLSelect
      ref={ref}
      value={value ?? ''}
      onChange={handleChange}
      invalid={invalid}
      className={className}
      {...rest}
    >
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
    </MLSelect>
  );
});

UbSelectInner.displayName = 'UbSelect';
export const UbSelect = memo(UbSelectInner);
