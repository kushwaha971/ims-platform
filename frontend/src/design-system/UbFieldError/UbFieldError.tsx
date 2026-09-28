'use client';

import { memo, type ReactNode } from 'react';

import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.2.4 — the validation red family, and the ONLY component that
 * paints it. `--form-error` is not `--error`: `--error` is the ledger debit
 * colour and a form message wearing it would say "you owe money", not "this
 * field is wrong".
 *
 * §23.5: an error is an outlined block with a SENTENCE. A red border with no
 * text is not an error state, which is why this component takes children rather
 * than a boolean.
 */
export interface UbFieldErrorProps {
  /** Wired by `UbField` into the control's `aria-describedby`. */
  readonly id?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

function UbFieldErrorBase({ id, children, className }: Readonly<UbFieldErrorProps>) {
  return (
    <p
      id={id}
      // R-A-6 — a validation failure is announced, not merely coloured. It is
      // `polite`, not `alert`: RHF revalidates on every keystroke after the
      // first submit, and an assertive region would interrupt on each one.
      role="status"
      aria-live="polite"
      className={cn('ds-chip text-formError', className)}
    >
      {children}
    </p>
  );
}

UbFieldErrorBase.displayName = 'UbFieldError';
export const UbFieldError = memo(UbFieldErrorBase);
