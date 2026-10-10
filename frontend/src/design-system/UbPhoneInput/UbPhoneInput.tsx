'use client';

import {
  forwardRef,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
} from 'react';

import { IntlContext } from 'react-intl';

import { MLInput } from 'src/design-system/primitives';
import { deferredModule, useDeferredModule } from 'src/design-system/primitives/deferredModule';
import { cn } from 'src/utils/cn';
import { DEFAULT_PHONE_COUNTRY, IN_DIAL_CODE } from 'src/utils/phone';
import {
  countryOfE164,
  nationalDigitLimit,
  phoneCountry,
  type PhoneCountry,
} from 'src/utils/phoneCountries';

/**
 * PLT-01 FR-1 / PLT-03 — the mobile control: a country picker that starts on
 * India (`+91`) and the national digits. Every mobile field uses it and
 * nothing else.
 *
 * India keeps every rule below. Another country (owner, 9 Oct 2026: "keep
 * that default of India but also allow to select other countries") is picked
 * from ml-uikit's searchable list (`UbCombobox`) behind the `+91 ⌄` button —
 * search by name or by code — and its digits are kept as typed, up to fourteen with the code (the server's
 * column is `varchar(15)`, plus included).
 * A pasted or autofilled `+44 7911 123456` switches the picker by itself.
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
export { IN_DIAL_CODE };
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
  /** The country an empty field starts on. India unless a caller knows better. */
  readonly defaultCountry?: string;
  /**
   * Show the default country's code as a fixed label, with no picker. Sign-in
   * uses it: the sign-in code is sent to Indian numbers only, so
   * offering 243 countries there would offer 242 that cannot sign in.
   */
  readonly lockCountry?: boolean;
}

/** `useLayoutEffect` in the browser, a no-op warning-free `useEffect` on the server. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Italy, San Marino and the Vatican keep the leading 0 inside E.164. */
const KEEPS_LEADING_ZERO = new Set(['IT', 'SM', 'VA']);

/** National digits for a country other than India, as typed or pasted. */
const cleanOther = (value: string, country: PhoneCountry): string => {
  const digits = value.replace(/\D/g, '');
  return KEEPS_LEADING_ZERO.has(country.iso) ? digits : digits.replace(/^0+/, '');
};

/** A value that names its own country: `+44 …` or `0044 …`, with digits after. */
const MIN_SWITCH_DIGITS = 4;
const internationalCountry = (raw: string): PhoneCountry | null => {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith('+')
    ? trimmed
    : trimmed.startsWith('00')
      ? `+${trimmed.slice(2)}`
      : null;
  if (!plus) return null;
  const country = countryOfE164(plus);
  if (!country) return null;
  const national = plus.replace(/\D/g, '').slice(country.dial.length);
  return national.length >= MIN_SWITCH_DIGITS ? country : null;
};

/** The national digits a value holds for `country`. */
const nationalOf = (value: string | null | undefined, country: PhoneCountry): string => {
  if (country.iso === DEFAULT_PHONE_COUNTRY) return toNationalDigits(value);
  const digits = (value ?? '').replace(/\D/g, '');
  return (value ?? '').trim().startsWith('+') ? digits.slice(country.dial.length) : digits;
};

/** National digits → E.164 for `country`; '' for an empty field. */
const e164Of = (national: string, country: PhoneCountry): string => {
  if (country.iso === DEFAULT_PHONE_COUNTRY) return toE164(national.slice(0, IN_MOBILE_DIGITS));
  const capped = national.slice(0, nationalDigitLimit(country));
  return capped.length === 0 ? '' : `+${country.dial}${capped}`;
};

/** A whole international number read into the country it names. */
const readInternational = (raw: string, country: PhoneCountry): string =>
  country.iso === DEFAULT_PHONE_COUNTRY
    ? toE164(toNationalDigits(raw))
    : e164Of(raw.replace(/\D/g, '').replace(/^00/, '').slice(country.dial.length), country);

/**
 * The searchable country list is fetched after first paint, and only where it
 * is shown. Imported statically it put ml-uikit's popover and the command list
 * on /login — 23 KB on the most-visited cold page in the product, where
 * `lockCountry` never shows it (the bundle gate, 9 Oct 2026). Until it lands
 * the code is drawn as the fixed label, which is also what `lockCountry` draws.
 */
const pickerModule = deferredModule(() => import('./UbPhoneCountryPicker'));

/** For tests and stories that want the list there on the first render. */
export const preloadCountryPicker = (): Promise<unknown> => pickerModule.load();

const UbPhoneInputInner = forwardRef<HTMLInputElement, UbPhoneInputProps>(
  function UbPhoneInputInner(
    {
      value,
      onChange,
      onPaste,
      invalid,
      className,
      disabled,
      defaultCountry = DEFAULT_PHONE_COUNTRY,
      lockCountry = false,
      ...rest
    },
    ref
  ) {
    // The context, not `useIntl()`: a control rendered outside a provider (a
    // story, a bare test) falls back to English instead of throwing.
    const intl = useContext(IntlContext);
    const locale = intl?.locale ?? 'en';
    const message = (id: string, fallback: string): string => {
      const found = intl?.messages?.[id];
      return typeof found === 'string' ? found : fallback;
    };
    const countryLabel = message('common.phone.country', 'Country code');

    const [chosen, setChosen] = useState<string>(defaultCountry);
    const trimmed = (value ?? '').trim();
    // A `+…` value says its own country; a bare legacy value is Indian; an
    // empty field is on whatever the merchant last picked.
    const country = lockCountry
      ? phoneCountry(defaultCountry)
      : trimmed.startsWith('+')
        ? (countryOfE164(trimmed, chosen) ?? phoneCountry(DEFAULT_PHONE_COUNTRY))
        : trimmed
          ? phoneCountry(DEFAULT_PHONE_COUNTRY)
          : phoneCountry(chosen);
    const isIndia = country.iso === DEFAULT_PHONE_COUNTRY;
    const national = nationalOf(value, country);

    // A value set from outside (a party loaded for editing) moves the picker,
    // so clearing that number leaves the field on its country.
    useEffect(() => {
      if (trimmed) setChosen(country.iso);
    }, [trimmed, country.iso]);

    const picker = useDeferredModule(pickerModule, !lockCountry);

    // The digits start where the code label ends, MEASURED: `+1` and `+971`
    // differ by three characters, and the label's font is not the input's, so
    // a `ch` estimate let `+44` touch the digits on a laptop. Until the first
    // measurement the estimate stands, which is also what the server renders.
    const labelRef = useRef<HTMLDivElement>(null);
    const [labelWidth, setLabelWidth] = useState<number | null>(null);
    // OBSERVED, not measured once: the label changes width after the first
    // paint — the code changes, the web font lands, and the country list
    // arrives after first paint and swaps the plain "+91" for "+91 ⌄", which is
    // wider. Measured once, that last one left the button 14 px over the first
    // digits (phonecountry sweep, 9 Oct 2026).
    useIsomorphicLayoutEffect(() => {
      const label = labelRef.current;
      if (!label) return undefined;
      setLabelWidth(label.offsetWidth);
      if (typeof ResizeObserver === 'undefined') return undefined;
      const observer = new ResizeObserver(() => setLabelWidth(label.offsetWidth));
      observer.observe(label);
      return () => observer.disconnect();
    }, []);

    /** `+44 …` arriving whole in a field on another country: follow it. */
    const followInternational = useCallback(
      (raw: string): boolean => {
        const named = internationalCountry(raw);
        if (lockCountry) return false;
        if (!named || named.iso === country.iso || named.dial === country.dial) return false;
        setChosen(named.iso);
        onChange(readInternational(raw, named));
        return true;
      },
      [country, lockCountry, onChange]
    );

    const handleChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const raw = event.target.value;
        if (followInternational(raw)) return;
        if (isIndia) {
          // The dial code is recognised BEFORE the ten-digit cap, so the
          // eleventh key of a typed `+91…` is read, not refused (see above).
          const cleaned = rereadTypedOverflow(cleanNational(raw), national);
          // A full field refuses an eleventh digit, as `maxLength` used to —
          // otherwise a stray keystroke mid-number silently shifts every digit
          // after it. React restores the controlled value on its own.
          if (cleaned.length > IN_MOBILE_DIGITS && national.length === IN_MOBILE_DIGITS) return;
          onChange(toE164(cleaned.slice(0, IN_MOBILE_DIGITS)));
          return;
        }
        const own = raw.trim().startsWith('+') ? readInternational(raw, country) : null;
        if (own !== null) {
          onChange(own);
          return;
        }
        const cleaned = cleanOther(raw, country);
        const limit = nationalDigitLimit(country);
        if (cleaned.length > limit && national.length === limit) return;
        onChange(e164Of(cleaned, country));
      },
      [country, followInternational, isIndia, national, onChange]
    );

    // A pasted whole number (`+91 98456 78901`) is the number, not something
    // to splice into the digits already in the field at the caret. Anything
    // shorter falls through to the browser, and `handleChange` cleans it.
    const handlePaste = useCallback(
      (event: React.ClipboardEvent<HTMLInputElement>) => {
        onPaste?.(event);
        if (event.defaultPrevented) return;
        const text = event.clipboardData.getData('text');
        if (internationalCountry(text) && followInternational(text)) {
          event.preventDefault();
          return;
        }
        if (isIndia) {
          const pasted = toNationalDigits(text);
          if (pasted.length !== IN_MOBILE_DIGITS) return;
          event.preventDefault();
          onChange(toE164(pasted));
          return;
        }
        if (!internationalCountry(text)) return;
        event.preventDefault();
        onChange(readInternational(text, country));
      },
      [country, followInternational, isIndia, onChange, onPaste]
    );

    // The number field, for focus after a country is picked; the caller's
    // ref (React Hook Form's, usually) gets the same element.
    const inputRef = useRef<HTMLInputElement | null>(null);
    const setInputRef = useCallback(
      (element: HTMLInputElement | null) => {
        inputRef.current = element;
        if (typeof ref === 'function') ref(element);
        else if (ref) ref.current = element;
      },
      [ref]
    );

    // Picking a code is half of entering the number, so the menu hands focus
    // to the number (and a phone's keypad comes back) rather than to the code
    // button. A menu dismissed without a pick returns to the button as usual.
    const picked = useRef(false);
    const handleCountry = useCallback(
      (iso: string) => {
        const next = phoneCountry(iso);
        setChosen(next.iso);
        // The digits already typed stay; only the code in front of them moves.
        if (national) onChange(e164Of(national, next));
        picked.current = true;
      },
      [national, onChange]
    );

    const handleCloseFocus = useCallback((event: Event) => {
      if (!picked.current) return;
      picked.current = false;
      event.preventDefault();
      inputRef.current?.focus();
    }, []);

    const dial = `+${country.dial}`;

    return (
      <div className={cn('relative flex w-full items-center', className)}>
        {/* The code is ml-uikit's searchable list (`UbCombobox`: MLPopover +
            MLCommand), not a native `<select>`: 243 countries want a search
            box, and a typed "uae" or "971" finds one faster than a wheel. The
            closed trigger shows only the code, the open list names countries. */}
        <div ref={labelRef} className="absolute inset-y-1 left-1 z-[1] flex items-center">
          {lockCountry || !picker ? (
            // Fixed, not a control: there is nothing to choose (or the list is
            // still on its way), so a screen reader hears the number field.
            <span aria-hidden className="ds-body px-2 text-text-secondary">
              {dial}
            </span>
          ) : (
            <picker.UbPhoneCountryPicker
              value={country.iso}
              onChange={handleCountry}
              locale={locale}
              label={countryLabel}
              searchPlaceholder={message('common.phone.search', 'Search country or code')}
              emptyLabel={message('common.phone.empty', 'No country matches')}
              disabled={disabled}
              dial={dial}
              onCloseAutoFocus={handleCloseFocus}
            />
          )}
        </div>
        <MLInput
          ref={setInputRef}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={national}
          onChange={handleChange}
          onPaste={handlePaste}
          invalid={invalid}
          disabled={disabled}
          className="tracking-[0.02em]"
          // The code button's measured width, its 4 px inset, and a 12 px gap.
          style={{
            paddingLeft:
              labelWidth === null ? `calc(${dial.length}ch + 3rem)` : `${labelWidth + 16}px`,
          }}
          {...rest}
        />
      </div>
    );
  }
);

UbPhoneInputInner.displayName = 'UbPhoneInput';
export const UbPhoneInput = memo(UbPhoneInputInner);
