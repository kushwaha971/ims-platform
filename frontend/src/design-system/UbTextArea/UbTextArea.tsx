'use client';

import { forwardRef, memo, useCallback, type TextareaHTMLAttributes } from 'react';

import { MLTextarea } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

/**
 * Multi-line text — reminder templates, bill terms, a document footer
 * (PLT-06 §7 `MLTextarea`, WLB-01 §7).
 *
 * `value`/`onChange(string)` like `UbTextInput`, so it drops into a `UbField`
 * render prop the same way. `maxLength` is shown as a live counter under the
 * box when given, because a field with a hard limit (WLB-01: header 120,
 * footer 300) that says so only after the merchant has typed past it is a
 * field that throws their sentence away.
 */
export interface UbTextAreaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'onChange'
> {
  readonly value: string | null | undefined;
  readonly onChange: (value: string) => void;
  readonly invalid?: boolean;
  /** `{count} / {max}` counter template, already translated; omitted → no counter. */
  readonly counterLabel?: string;
  readonly className?: string;
}

const UbTextAreaInner = forwardRef<HTMLTextAreaElement, UbTextAreaProps>(function UbTextAreaInner(
  { value, onChange, invalid, counterLabel, maxLength, className, rows = 3, ...rest },
  ref
) {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value),
    [onChange]
  );
  const length = (value ?? '').length;
  return (
    <div className={cn('flex w-full flex-col gap-1', className)}>
      <MLTextarea
        ref={ref}
        value={value ?? ''}
        onChange={handleChange}
        invalid={invalid}
        maxLength={maxLength}
        rows={rows}
        className="min-h-[88px]"
        {...rest}
      />
      {counterLabel && maxLength ? (
        <span className="ds-caption self-end text-text-tertiary" aria-live="polite">
          {counterLabel.replace('{count}', String(length)).replace('{max}', String(maxLength))}
        </span>
      ) : null}
    </div>
  );
});

UbTextAreaInner.displayName = 'UbTextArea';
export const UbTextArea = memo(UbTextAreaInner);
