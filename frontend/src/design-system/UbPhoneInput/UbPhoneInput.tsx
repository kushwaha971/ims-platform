'use client';

import { forwardRef, memo, useCallback, type InputHTMLAttributes } from 'react';

import { MLInput } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

/**
 * PLT-01 FR-1 / PLT-03 — the Indian mobile control: a fixed `+91` prefix and
 * ten digits. Every auth and profile screen uses it and nothing else.
 *
 * THE CONTRACT that makes it worth existing: the user types ten digits, and the
 * component's `value` and `onChange` speak **E.164** (`+919876543210`). The
 * boundary between "what a merchant types" and "what `mobileValidation()` and
 * the API expect" is here, in one file, rather than in nine forms.
 *
 * Behaviour the shop floor actually produces, absorbed rather than rejected:
 *  - a pasted `+91 98765 43210`, `098765-43210` or `919876543210` all land as
 *    the same ten digits;
 *  - anything that is not a digit is dropped as it is typed;
 *  - more than ten digits is truncated, so a double paste does not silently
 *    submit an eleven-digit number.
 *
 * `inputMode="tel"` and `autoComplete="tel-national"` put the numeric keypad up
 * and let the platform offer the user's own number.
 */
export const IN_DIAL_CODE = '+91';
export const IN_MOBILE_DIGITS = 10;

/** `+919876543210` → `9876543210`; anything unparseable → the digits it had. */
export const toNationalDigits = (value: string | null | undefined): string => {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  // A pasted number may carry the country code, a trunk 0, or both.
  const withoutCountry =
    digits.startsWith('91') && digits.length > IN_MOBILE_DIGITS ? digits.slice(2) : digits;
  const withoutTrunk =
    withoutCountry.startsWith('0') && withoutCountry.length > IN_MOBILE_DIGITS
      ? withoutCountry.slice(1)
      : withoutCountry;
  return withoutTrunk.slice(0, IN_MOBILE_DIGITS);
};

/** Ten digits → E.164. Fewer than ten stays partial so validation can speak. */
export const toE164 = (national: string): string =>
  national.length === 0 ? '' : `${IN_DIAL_CODE}${national}`;

export interface UbPhoneInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> {
  /** E.164, or empty. Never a national-format string. */
  readonly value: string | null | undefined;
  /** Receives E.164, or '' while the field is empty. */
  readonly onChange: (value: string) => void;
  readonly invalid?: boolean;
  readonly className?: string;
}

const UbPhoneInputInner = forwardRef<HTMLInputElement, UbPhoneInputProps>(
  function UbPhoneInputInner({ value, onChange, invalid, className, ...rest }, ref) {
    const national = toNationalDigits(value);

    const handleChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        onChange(toE164(toNationalDigits(event.target.value)));
      },
      [onChange]
    );

    return (
      <div className={cn('relative flex w-full items-center', className)}>
        {/* The prefix is not an input: it cannot be edited, and a screen reader
            gets it from the control's own `aria-describedby` chain instead of
            hearing "plus nine one" as a separate unlabelled field. */}
        <span
          aria-hidden
          className="ds-body pointer-events-none absolute left-3 text-text-secondary"
        >
          {IN_DIAL_CODE}
        </span>
        <MLInput
          ref={ref}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={IN_MOBILE_DIGITS}
          value={national}
          onChange={handleChange}
          invalid={invalid}
          className="pl-12 tracking-[0.02em]"
          {...rest}
        />
      </div>
    );
  }
);

UbPhoneInputInner.displayName = 'UbPhoneInput';
export const UbPhoneInput = memo(UbPhoneInputInner);
