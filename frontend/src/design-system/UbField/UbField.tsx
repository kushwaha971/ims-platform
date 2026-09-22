'use client';

import { type ReactNode } from 'react';

import {
  Controller,
  useFormContext,
  type ControllerRenderProps,
  type FieldValues,
} from 'react-hook-form';

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
 * ── CR-2026-09-19-D: the asterisk is gone ───────────────────────────────────
 * `required` used to paint a red `*` after the label. Three things were wrong
 * with it and only the first is cosmetic:
 *
 *   1. It is the convention of a 2006 enterprise form, and it is the reason a
 *      sign-up screen reads as paperwork.
 *   2. It marks the MAJORITY. On every form in this product all but one or two
 *      fields are required, so the asterisks decorate almost every row and
 *      carry no information; the exception is what the reader needs told.
 *   3. It was decorative (`aria-hidden`) and the comment beside it claimed
 *      `aria-required` on the control did the announcing — which nothing set.
 *      A screen reader was told nothing at all.
 *
 * So `required` now does the accessible half properly — it puts `aria-required`
 * on the control, through the render props — and marks nothing visually.
 * `optionalLabel` marks the minority instead: a quiet word beside the label, in
 * the caller's language. The design system does not call `t()` (§19.1.2), which
 * is why the word arrives as a prop rather than a boolean.
 *
 * It is NOT memoised: it takes a render function child, which is a new
 * reference on every parent render, so `memo` would buy nothing and cost a
 * comparison.
 */
export interface UbFieldRenderProps extends ControllerRenderProps<FieldValues, string> {
  readonly id: string;
  readonly 'aria-invalid': boolean;
  readonly 'aria-required': boolean | undefined;
  readonly 'aria-describedby': string | undefined;
  readonly invalid: boolean;
}

export interface UbFieldProps {
  /** The RHF path. Also the control's `id`, so `<label htmlFor>` matches. */
  readonly name: string;
  readonly label: string;
  readonly hint?: string;
  /** Sets `aria-required` on the control. It draws nothing. */
  readonly required?: boolean;
  /**
   * The word for "optional", already translated — `t('common.field.optional')`.
   * Present, it is set beside the label; absent, the field is simply not marked.
   */
  readonly optionalLabel?: string;
  /** Hides the label visually; it stays in the accessible name. */
  readonly labelHidden?: boolean;
  /**
   * The control renders its OWN `<label>` — `UbSwitch` and `UbCheckbox` both
   * do, because their label is part of their layout rather than above them.
   *
   * Without this, wrapping one of those in a field produced TWO `<label for>`
   * elements pointing at one control, and an accessible name that read
   * "I sell to them I sell to them". `labelHidden` does not help: a
   * visually-hidden label is still in the name.
   *
   * `label` is still required, and is still used — for the error message's
   * association and for anything that needs to say which field failed.
   */
  readonly controlOwnsLabel?: boolean;
  readonly children: (field: UbFieldRenderProps) => ReactNode;
  readonly className?: string;
}

export function UbField({
  name,
  label,
  hint,
  required,
  optionalLabel,
  labelHidden,
  controlOwnsLabel,
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
      {!controlOwnsLabel && (
        <label
          htmlFor={name}
          className={cn(
            'ds-label flex items-baseline gap-2 text-text-secondary',
            labelHidden && 'sr-only'
          )}
        >
          {label}
          {/* The exception, not the rule. It is real text inside the `<label>`,
              so it is part of the control's accessible name — "Mobile number,
              optional" — rather than a glyph nothing reads out. */}
          {optionalLabel && (
            <span className="ds-caption font-normal text-text-muted">{optionalLabel}</span>
          )}
        </label>
      )}
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          // Controller's render must return an element, and `children` returns
          // ReactNode; the fragment is what reconciles the two.
          <>
            {children({
              ...field,
              id: name,
              'aria-invalid': Boolean(error),
              'aria-required': required ? true : undefined,
              'aria-describedby': describedBy,
              invalid: Boolean(error),
            })}
          </>
        )}
      />
      {/* One row for the message, whichever message it is.
       *
       * The hint is REPLACED by the error rather than stacked beneath it, which
       * was already right — two lines of guidance about one field is one too
       * many. What was missing is that a field with no hint had no row at all,
       * so the first failed submit grew every such field by a line and pushed
       * everything below it down the page. On the wizard that moved the Continue
       * button under the cursor mid-click.
       *
       * `min-h-5` reserves exactly one line of `ds-caption`, so the row exists
       * before there is anything in it and nothing moves when there is. A field
       * that never shows a message pays 20px of deliberate space; a form that
       * jumps on validation costs more than that. */}
      <div className="min-h-5">
        {hint && !error && <UbInputHint id={`${name}-hint`}>{hint}</UbInputHint>}
        {error && <UbFieldError id={`${name}-error`}>{error}</UbFieldError>}
      </div>
    </div>
  );
}

UbField.displayName = 'UbField';
