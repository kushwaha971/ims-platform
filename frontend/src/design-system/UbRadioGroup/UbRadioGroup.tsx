'use client';

import { MLRadioGroup, type MLRadioOption } from 'src/design-system/primitives';

/**
 * Part 23 §23.3 — a small closed choice, shown in full. PLT-03's GST-type
 * branch is the Sprint 1 caller, and it is a radio group rather than a select
 * precisely because the three options are the branch: hiding them behind a
 * dropdown hides the decision the step exists to ask.
 *
 * Each option may carry a one-line hint, which is what lets "Composition
 * scheme" explain itself without a help icon (FRD EC-2).
 */
export interface UbRadioGroupProps<T extends string> {
  readonly name: string;
  readonly value: T | null;
  readonly onChange: (value: T) => void;
  readonly options: readonly MLRadioOption<T>[];
  readonly ariaLabel?: string;
  readonly invalid?: boolean;
  readonly describedBy?: string;
  readonly className?: string;
}

export function UbRadioGroup<T extends string>({
  name,
  value,
  onChange,
  options,
  ariaLabel,
  invalid,
  describedBy,
  className,
}: Readonly<UbRadioGroupProps<T>>): React.JSX.Element {
  return (
    <MLRadioGroup
      name={name}
      value={value}
      onValueChange={onChange}
      options={options}
      ariaLabel={ariaLabel}
      ariaDescribedBy={describedBy}
      invalid={invalid}
      className={className}
    />
  );
}

UbRadioGroup.displayName = 'UbRadioGroup';
