'use client';

import { forwardRef, memo, useCallback, useState, type InputHTMLAttributes } from 'react';

import { MLInput } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

/**
 * An amount. Part 23 §23.2.6, and the component Sprint 1 deferred because no
 * Sprint 1 screen took money.
 *
 * ── The value is a STRING, always ───────────────────────────────────────────
 * R-TS-7 and canon rule 3. `0.1 + 0.2` is not `0.3` in a double, and a ledger
 * that is wrong by a paisa a thousand times is a ledger a merchant stops
 * trusting. Nothing in this component ever converts to `number` — not to
 * validate, not to format, not to compare. What the user types is text, what
 * leaves is text, and `decimal.js-light` does the arithmetic elsewhere.
 *
 * ── Grouped on blur, raw while focused ──────────────────────────────────────
 * Indian grouping is 2,2,3 — ₹12,34,567.89, not ₹1,234,567.89 — and a merchant
 * reading a figure wants to see it that way. But formatting WHILE someone types
 * fights them: the caret jumps every time a separator is inserted, and
 * backspacing over a comma does nothing visible. So the field shows the raw
 * value while it has focus — including a value that ARRIVES while it has
 * focus, like the amount owed prefilled into an autofocused drawer — and
 * groups it when focus leaves.
 *
 * The swap to raw text happens IN the focus handler, on the DOM, before
 * anything else can select (QA S-D2). Done by a re-render instead, it landed
 * after the selection a tab-in, select-all-then-type, paste-over or
 * Playwright's `fill` had just made, collapsed it to the end, and "500" was
 * appended: "1392.00500". A selection covering the whole grouped text is
 * carried over to the whole raw text; React then renders the same string and
 * leaves the selection alone. Every edit is parsed from what was shown (commas
 * and ₹ dropped) and truncated to the caller's decimal places.
 *
 * ── What it accepts ─────────────────────────────────────────────────────────
 * Digits, one decimal point, and nothing else. A `-` is not rejected with an
 * error message; it simply cannot be typed, because a negative amount is never
 * what a merchant means. Direction is a separate control, always — "they owe
 * me" and "I owe them" are two buttons, not a minus sign a shopkeeper has to
 * decode.
 */
export interface UbMoneyInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange'
> {
  /** A decimal string, e.g. `"2300.00"`, or null/empty for no amount. */
  readonly value: string | null | undefined;
  /** Receives a plain decimal string — never grouped, never a number. */
  readonly onChange: (value: string) => void;
  readonly invalid?: boolean;
  /** Defaults to `₹`. A partner in another currency passes its own. */
  readonly currencySymbol?: string;
  readonly decimalPlaces?: number;
  readonly className?: string;
}

/** Digits and at most one point. Everything else never reaches the value. */
export const sanitiseAmount = (raw: string): string => {
  const kept = raw.replace(/[^\d.]/g, '');
  const [whole = '', ...rest] = kept.split('.');
  return rest.length > 0 ? `${whole}.${rest.join('').replace(/\./g, '')}` : whole;
};

/**
 * At most `decimalPlaces` after the point, by truncation (QA S-D2: a third
 * decimal was accepted, so the form held "1392.005" while the confirm label
 * read ₹1,392.00). `"12.345"` → `"12.34"`; with no places the point goes.
 */
export const capDecimals = (value: string, decimalPlaces: number): string => {
  const point = value.indexOf('.');
  if (point < 0) return value;
  if (decimalPlaces <= 0) return value.slice(0, point);
  return value.slice(0, point + 1 + decimalPlaces);
};

/**
 * `"2300."` → `"2300.00"`, `"2300.567"` → `"2300.56"`. By string surgery, not
 * `parseFloat().toFixed()`.
 *
 * The obvious one-liner is `Number.parseFloat(v).toFixed(2)`, and it is wrong
 * here for the same reason the whole component keeps money as text: it routes
 * the value through a double. It is accurate for a shopkeeper's ₹2,300 and it
 * is not accurate for every value this product will eventually hold, and a
 * component that is right "for realistic inputs" is a component that is wrong
 * in the month somebody enters an unrealistic one.
 *
 * Truncates rather than rounds: this runs while a merchant is still typing,
 * and a field that silently rounds 2300.567 up to 2300.57 has changed a number
 * they did not finish entering.
 */
export const padDecimals = (value: string, decimalPlaces: number): string => {
  if (!value) return '';
  const [whole = '', fraction = ''] = value.split('.');
  const safeWhole = whole || '0';
  if (decimalPlaces <= 0) return safeWhole;
  return `${safeWhole}.${fraction.padEnd(decimalPlaces, '0').slice(0, decimalPlaces)}`;
};

/**
 * `"1234567.5"` → `"12,34,567.50"`. Grouping by hand rather than through
 * `Intl.NumberFormat`, because `Intl` takes a `number` and this value is a
 * string precisely so that it never becomes one.
 */
export const groupIndian = (value: string, decimalPlaces: number): string => {
  if (!value) return '';
  const [whole = '0', fraction = ''] = value.split('.');
  const padded = fraction.padEnd(decimalPlaces, '0').slice(0, decimalPlaces);
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return decimalPlaces > 0 ? `${grouped}.${padded}` : grouped;
};

const UbMoneyInputInner = forwardRef<HTMLInputElement, UbMoneyInputProps>(
  function UbMoneyInputInner(
    {
      value,
      onChange,
      invalid,
      currencySymbol = '₹',
      decimalPlaces = 2,
      className,
      onFocus,
      onBlur,
      ...rest
    },
    ref
  ) {
    const [focused, setFocused] = useState(false);

    const handleChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) =>
        onChange(capDecimals(sanitiseAmount(event.target.value), decimalPlaces)),
      [onChange, decimalPlaces]
    );

    const shown = focused || !value ? (value ?? '') : groupIndian(value, decimalPlaces);

    return (
      <div className={cn('relative flex w-full items-center', className)}>
        <span
          aria-hidden
          className="ds-body pointer-events-none absolute left-3 text-text-tertiary"
        >
          {currencySymbol}
        </span>
        <MLInput
          ref={ref}
          // `inputMode="decimal"` rather than `type="number"`: a number input
          // gives a phone the right keypad but also spinners, scroll-wheel
          // increments and a browser-localised decimal separator, none of
          // which belong on an amount.
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={shown}
          onChange={handleChange}
          invalid={invalid}
          onFocus={(event) => {
            const input = event.currentTarget;
            const raw = value ?? '';
            if (input.value !== raw) {
              const all =
                input.value.length > 0 &&
                input.selectionStart === 0 &&
                input.selectionEnd === input.value.length;
              input.value = raw;
              if (all) input.setSelectionRange(0, raw.length);
            }
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            // Committed to the caller's precision on the way out, so the form
            // holds "2300.00" rather than "2300." or "2300".
            if (value) onChange(padDecimals(value, decimalPlaces));
            onBlur?.(event);
          }}
          className={cn('ds-num pl-7 text-right', invalid && 'border-formError')}
          {...rest}
        />
      </div>
    );
  }
);

UbMoneyInputInner.displayName = 'UbMoneyInput';
export const UbMoneyInput = memo(UbMoneyInputInner);
