'use client';

import { type ReactNode } from 'react';

import { Controller, useFormContext, type ControllerRenderProps, type FieldValues } from 'react-hook-form';

import { UbFieldError } from 'src/design-system/UbFieldError';
import { UbInputHint } from 'src/design-system/UbInputHint';
import { getFieldError } from 'src/utils/applyServerErrors';
import { cn } from 'src/utils/cn';

/**
 * Part 19 §19.5.4 — the field anatomy every input uses: a `ds-label` label, the
 * control, an optional hint, and the error message in `--form-error`.
 *
 * Two things make it worth existing. First, it reads the error out of RHF
 * context BY NAME, so no caller ever writes `errors.x?.message` and no caller
 * ever forgets `aria-describedby`. Second, the label tier is `ds-label`
 * (12.5px, sentence case, locale-aware — Part 23 §23.2.2) and not the 11 px
 * uppercase tier, which no Hindi string can render: Devanagari has no case, and
 * `text-transform: uppercase` on it is a no-op that leaves matras clipped.
 *
 * It is NOT memoised: it takes a render function child, which is a new
 * reference on every parent render, so `memo` would buy nothing and cost a
 * comparison.
 */
export interface UbFieldRenderProps extends ControllerRenderProps<FieldValues, string> {
  readonly id: string;
  readonly 'aria-invalid': boolean;
  readonly 'aria-describedby': string | undefined;
  readonly invalid: boolean;
}

export interface UbFieldProps {
  /** The RHF path. Also the control's `id`, so `<label htmlFor>` matches. */
  readonly name: string;
  readonly label: string;
  readonly hint?: string;
  readonly required?: boolean;
  /** Hides the label visually; it stays in the accessible name. */
  readonly labelHidden?: boolean;
  readonly children: (field: UbFieldRenderProps) => ReactNode;
  readonly className?: string;
}

export function UbField({
  name,
  label,
  hint,
  required,
  labelHidden,
  children,
  className,
}: Readonly<UbFieldProps>): React.JSX.Element {
  const { control, formState } = useFormContext();
  const error = getFieldError(formState.errors, name);
  const describedBy =
    [hint && !error ? `${name}-hint` : null, error ? `${name}-error` : null]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div className={cn('flex w-full flex-col gap-1.5', className)}>
      <label htmlFor={name} className={cn('ds-label text-text-tertiary', labelHidden && 'sr-only')}>
        {label}
        {/* The asterisk is decorative: `aria-required` on the control is what a
            screen reader announces, and a bare "*" read aloud says nothing. */}
        {required && (
          <span aria-hidden className="ml-0.5 text-formError">
            *
          </span>
        )}
      </label>
      <Controller
        control={control}
        name={name}
        render={({ field }) =>
          // Controller's render must return an element, and `children` returns
          // ReactNode; the fragment is what reconciles the two.
          (
            <>
              {children({
                ...field,
                id: name,
                'aria-invalid': Boolean(error),
                'aria-describedby': describedBy,
                invalid: Boolean(error),
              })}
            </>
          )
        }
      />
      {hint && !error && <UbInputHint id={`${name}-hint`}>{hint}</UbInputHint>}
      {error && <UbFieldError id={`${name}-error`}>{error}</UbFieldError>}
    </div>
  );
}

UbField.displayName = 'UbField';
