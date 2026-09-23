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
  /**
   * `plain` is a bare circle beside a label; `card` is a bordered row that
   * tints when chosen.
   *
   * A passthrough to the primitive, which has had both since Sprint 1. It is
   * exposed now because LED-01 is the second caller that wants the card: "You
   * gave" and "You got" are the entry drawer's first decision and the merchant
   * taps one of them with a thumb, so they need a target rather than a dot —
   * and the tint is what makes the drawer say which one it is about without a
   * coloured header (§23's rule that red and green are never the only signal
   * holds either way, because both rows carry their words).
   */
  readonly variant?: 'plain' | 'card';
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
  variant,
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
      variant={variant}
      ariaLabel={ariaLabel}
      ariaDescribedBy={describedBy}
      invalid={invalid}
      className={className}
    />
  );
}

UbRadioGroup.displayName = 'UbRadioGroup';
