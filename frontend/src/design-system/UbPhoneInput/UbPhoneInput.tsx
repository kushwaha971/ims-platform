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
 *    submit an eleven-digit number — AFTER cleaning, in `toNationalDigits`,
 *    not by `maxLength`: a native length cap cuts `+91 98765 43210` to
 *    `+91 98765 ` before this code ever sees it (H1);
 *  - a paste that reads as a whole number replaces the field rather than
 *    being spliced into whatever was already there.
 *
 * `inputMode="tel"` and `autoComplete="tel-national"` put the numeric keypad up
 * and let the platform offer the user's own number.
 */
export const IN_DIAL_CODE = '+91';
export const IN_MOBILE_DIGITS = 10;

const IN_COUNTRY_DIGITS = IN_DIAL_CODE.slice(1);
/** `0091…` — the international access prefix some phones store contacts with. */
const IN_INTERNATIONAL_PREFIX = `00${IN_COUNTRY_DIGITS}`;

/** Drops a trunk `0` when it is the extra digit in front of a full number. */
const withoutTrunkZero = (digits: string): string =>
  digits.startsWith('0') && digits.length > IN_MOBILE_DIGITS ? digits.slice(1) : digits;

/** `toNationalDigits` before its ten-digit cap, so a caller can see overflow. */
const cleanNational = (value: string | null | undefined): string => {
  if (!value) return '';
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  let national = digits;
  if (trimmed.startsWith('+')) {
    if (digits.startsWith(IN_COUNTRY_DIGITS)) national = digits.slice(IN_COUNTRY_DIGITS.length);
  } else if (
    digits.startsWith(IN_INTERNATIONAL_PREFIX) &&
    digits.length >= IN_INTERNATIONAL_PREFIX.length + IN_MOBILE_DIGITS
  ) {
    national = digits.slice(IN_INTERNATIONAL_PREFIX.length);
  } else if (
    digits.startsWith(IN_COUNTRY_DIGITS) &&
    digits.length >= IN_COUNTRY_DIGITS.length + IN_MOBILE_DIGITS
  ) {
    national = digits.slice(IN_COUNTRY_DIGITS.length);
  }
  return withoutTrunkZero(national);
};

/**
 * `+919876543210` → `9876543210`; anything unparseable → the digits it had.
 *
 * H1 — the country code is removed by STRUCTURE, never by counting digits.
 * The value this control receives back from the form is its own output, and
 * while the merchant is typing that output is partial: `+919`, `+91984`. The
 * old rule stripped `91` only when there were more than ten digits, so every
 * partial number came back with `91` still in front of it and the next
 * keystroke compounded it — typing 9845612345 displayed "9191919845".
 *
 * So there are two readings:
 *  - a value that starts with `+` is E.164 (or a pasted international number):
 *    a leading `+91` is the dial code whatever the length;
 *  - anything else is what a person typed, pasted or autofilled. `91` or
 *    `0091` is taken as a country code only when a full ten digits follow it,
 *    because a mobile number may itself begin with 91 (`9123456789`).
 * A trunk `0` in front of ten digits is dropped in both, and the result is
 * then capped at ten digits — cleaning first, so a spaced paste is never
 * truncated to a prefix and its separators before it is read.
 */
export const toNationalDigits = (value: string | null | undefined): string =>
  cleanNational(value).slice(0, IN_MOBILE_DIGITS);

/** An Indian mobile number's first digit — 6, 7, 8 or 9. */
const IN_MOBILE_LEAD = /^[6-9]/;

/**
 * Defect (QA, Medium) — `+919845678901` typed KEY BY KEY.
 *
 * The field shows national digits, so the `+` is gone after the first key and
 * the merchant is really typing `919845678901`. The first ten, `9198456789`,
 * are a valid national number and are shown as such; the eleventh used to be
 * refused as overflow before the `91` could be read as the dial code, and the
 * field ended as `9198456789`. Paste and autofill never met this: they arrive
 * whole, with all twelve digits, which `cleanNational` already recognises.
 *
 * So an overflowing keystroke is re-read: eleven digits that are `91` and the
 * start of a mobile number (a 6–9 digit, never a trunk or a stray) become the
 * nine national digits after the `91`, and the twelfth completes them. It is
 * only done when the digits were APPENDED — a digit typed into the middle of a
 * full number is still a stray, and still refused.
 */
const rereadTypedOverflow = (cleaned: string, previous: string): string => {
  const appended = cleaned.startsWith(previous);
  const rest = cleaned.slice(IN_COUNTRY_DIGITS.length);
  if (
    appended &&
    cleaned.length === IN_MOBILE_DIGITS + 1 &&
    cleaned.startsWith(IN_COUNTRY_DIGITS) &&
    IN_MOBILE_LEAD.test(rest)
  ) {
    return rest;
  }
  return cleaned;
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
  function UbPhoneInputInner({ value, onChange, onPaste, invalid, className, ...rest }, ref) {
    const national = toNationalDigits(value);

    const handleChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        // The dial code is recognised BEFORE the ten-digit cap, so the
        // eleventh key of a typed `+91…` is read, not refused (see above).
        const cleaned = rereadTypedOverflow(cleanNational(event.target.value), national);
        // A full field refuses an eleventh digit, as `maxLength` used to —
        // otherwise a stray keystroke mid-number silently shifts every digit
        // after it. React restores the controlled value on its own.
        if (cleaned.length > IN_MOBILE_DIGITS && national.length === IN_MOBILE_DIGITS) return;
        onChange(toE164(cleaned.slice(0, IN_MOBILE_DIGITS)));
      },
      [national, onChange]
    );

    // A pasted whole number (`+91 98456 78901`) is the number, not something
    // to splice into the digits already in the field at the caret. Anything
    // shorter falls through to the browser, and `handleChange` cleans it.
    const handlePaste = useCallback(
      (event: React.ClipboardEvent<HTMLInputElement>) => {
        onPaste?.(event);
        if (event.defaultPrevented) return;
        const pasted = toNationalDigits(event.clipboardData.getData('text'));
        if (pasted.length !== IN_MOBILE_DIGITS) return;
        event.preventDefault();
        onChange(toE164(pasted));
      },
      [onChange, onPaste]
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
          value={national}
          onChange={handleChange}
          onPaste={handlePaste}
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
