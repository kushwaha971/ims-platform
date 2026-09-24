'use client';

import { forwardRef, memo, useCallback, type InputHTMLAttributes } from 'react';

import { MLInput } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

/**
 * Part 17 §17.6.0 "Quantity input rules" — a quantity with the unit as addon.
 *
 * `decimals` is `unit.allow_decimal ? 3 : 0`: a whole-number unit (NOS, BOX)
 * refuses the decimal point AT THE KEYBOARD, so "1.5 pieces" cannot be typed
 * rather than being typed and then refused by the server's `qty_must_be_whole`.
 * `signed` admits one leading minus, for the adjustment editor's "Adjust by".
 *
 * The value is the sanitised string the merchant typed — never a number, for
 * the reason money is never a number here (canon rule 3).
 */
export interface UbQuantityInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange'
> {
  readonly value: string | null | undefined;
  readonly onChange: (value: string) => void;
  readonly decimals?: number;
  readonly signed?: boolean;
  /** The unit code shown at the right edge (`KGS`). */
  readonly unit?: string;
  readonly invalid?: boolean;
  readonly className?: string;
}

/** Keep digits, one point (if decimals allow) within `decimals` places, one leading minus. */
export const sanitiseQuantity = (raw: string, decimals: number, signed: boolean): string => {
  const negative = signed && raw.trim().startsWith('-');
  const kept = raw.replace(decimals > 0 ? /[^\d.]/g : /[^\d]/g, '');
  const [whole = '', ...rest] = kept.split('.');
  const fraction = rest.join('').slice(0, decimals);
  const body = rest.length > 0 && decimals > 0 ? `${whole}.${fraction}` : whole;
  return negative ? `-${body}` : body;
};

const UbQuantityInputInner = forwardRef<HTMLInputElement, UbQuantityInputProps>(
  function UbQuantityInputInner(
    { value, onChange, decimals = 3, signed = false, unit, invalid, className, ...rest },
    ref
  ) {
    const handleChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) =>
        onChange(sanitiseQuantity(event.target.value, decimals, signed)),
      [onChange, decimals, signed]
    );

    return (
      <div className={cn('relative flex w-full items-center', className)}>
        <MLInput
          ref={ref}
          type="text"
          inputMode={signed ? 'text' : decimals > 0 ? 'decimal' : 'numeric'}
          autoComplete="off"
          value={value ?? ''}
          onChange={handleChange}
          invalid={invalid}
          className={cn('ds-num text-right', unit && 'pr-14', invalid && 'border-formError')}
          {...rest}
        />
        {unit && (
          <span
            aria-hidden
            className="ds-body-s-regular pointer-events-none absolute right-3 text-text-tertiary"
          >
            {unit}
          </span>
        )}
      </div>
    );
  }
);

UbQuantityInputInner.displayName = 'UbQuantityInput';
export const UbQuantityInput = memo(UbQuantityInputInner);
