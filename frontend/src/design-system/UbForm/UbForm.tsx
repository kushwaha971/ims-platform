'use client';

import { memo, type ReactNode } from 'react';

import { FormProvider, type FieldValues, type UseFormReturn } from 'react-hook-form';

import { UbFieldError } from 'src/design-system/UbFieldError';
import { cn } from 'src/utils/cn';

/**
 * Part 19 §19.5.4 — the form element every screen's form is, verbatim in shape.
 *
 * `noValidate` is deliberate: the browser's own bubbles are unstyled, untranslated
 * and appear in the wrong place on a 360 px screen. Yup owns validation, RHF owns
 * the wiring, and `UbField` owns the message.
 *
 * `formErrors` carries what `applyServerErrors()` could not anchor to a field
 * (§19.5.6). Rendering them here rather than dropping them is what makes "no
 * failure is ever silent" true for forms as well as for requests.
 */
export interface UbFormProps<T extends FieldValues> {
  readonly form: UseFormReturn<T>;
  readonly onSubmit: (values: T) => void | Promise<void>;
  readonly children: ReactNode;
  /** Form-level messages the server returned against no known field. */
  readonly formErrors?: readonly string[];
  readonly className?: string;
  readonly id?: string;
}

function UbFormBase<T extends FieldValues>({
  form,
  onSubmit,
  children,
  formErrors,
  className,
  id,
}: Readonly<UbFormProps<T>>) {
  return (
    <FormProvider {...form}>
      <form
        id={id}
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        /* BrandHub: 24 px between fields = the 20 px reserved message row
           under each field + this 4 px. */
        className={cn('flex w-full flex-col gap-1', className)}
      >
        {formErrors && formErrors.length > 0 && (
          <div className="flex flex-col gap-1 rounded-md border border-formError bg-formError-dim p-3">
            {formErrors.map((message) => (
              <UbFieldError key={message}>{message}</UbFieldError>
            ))}
          </div>
        )}
        {children}
      </form>
    </FormProvider>
  );
}

UbFormBase.displayName = 'UbForm';
export const UbForm = memo(UbFormBase) as typeof UbFormBase;
