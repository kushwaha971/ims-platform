'use client';

import { memo, useCallback, useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';

import { cn } from 'src/utils/cn';

/**
 * **RETAINED FOR THE BACKLOGGED OTP FLOW — no screen uses this at MVP.**
 *
 * CR-2026-09-19-A made authentication email + password only and moved mobile
 * OTP, with the SMS provider it needs, to the backlog. This component and its
 * tests are kept rather than deleted, because the flow is postponed and not
 * abandoned: the behaviours below were each found on a shop counter, and
 * re-deriving them from scratch when the SMS provider lands would be paying
 * twice for the same knowledge. It stays exported from the barrel and stays in
 * the design-system gallery so it cannot silently rot.
 *
 * PLT-01 §7 — the six-cell code entry, and its §9 states.
 *
 * The behaviours are not decoration; each one is a failure mode observed on a
 * shop counter:
 *  - **Paste fills all six.** The code arrives by SMS and is copied whole. A
 *    paste that lands entirely in cell one and then silently truncates is the
 *    single most common reason an OTP screen gets abandoned.
 *  - **Auto-submit on the sixth digit** (PLT-01 §7 "OTP auto-submits when the
 *    sixth digit is entered"), so the user never hunts for a button with the
 *    keyboard up.
 *  - **Backspace on an empty cell moves back and clears** the previous one.
 *  - **`autoComplete="one-time-code"`** on the first cell, which is what lets
 *    iOS and Android offer the code from the notification.
 *  - **`readOnly` while verifying** (state "Processing": cells read-only) rather
 *    than `disabled`, so focus is not thrown away mid-request.
 *
 * The value is the whole code, so the FORM holds one string and the schema is
 * `/^\d{6}$/` — the cells are a rendering decision, not a data shape.
 */
export const OTP_LENGTH = 6;

export interface UbOtpInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Fired once, when the sixth digit lands. */
  readonly onComplete?: (value: string) => void;
  readonly invalid?: boolean;
  /** "Processing": cells stay focusable but reject input. */
  readonly readOnly?: boolean;
  readonly disabled?: boolean;
  readonly autoFocus?: boolean;
  /** The accessible name of the group; each cell is numbered from it. */
  readonly label: string;
  readonly cellLabel: (index: number, total: number) => string;
  readonly id?: string;
  readonly describedBy?: string;
  readonly className?: string;
}

const onlyDigits = (value: string): string => value.replace(/\D/g, '');

function UbOtpInputBase({
  value,
  onChange,
  onComplete,
  invalid,
  readOnly,
  disabled,
  autoFocus,
  label,
  cellLabel,
  id,
  describedBy,
  className,
}: Readonly<UbOtpInputProps>) {
  const cells = useRef<(HTMLInputElement | null)[]>([]);
  // `onComplete` must fire once per completed code, not on every re-render that
  // happens to carry six digits (a parent repaint while verifying, say).
  const completedFor = useRef<string | null>(null);

  const digits = onlyDigits(value).slice(0, OTP_LENGTH);

  useEffect(() => {
    if (digits.length === OTP_LENGTH && completedFor.current !== digits) {
      completedFor.current = digits;
      onComplete?.(digits);
    }
    if (digits.length < OTP_LENGTH) completedFor.current = null;
  }, [digits, onComplete]);

  const focusCell = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(OTP_LENGTH - 1, index));
    cells.current[clamped]?.focus();
    cells.current[clamped]?.select();
  }, []);

  const commit = useCallback(
    (next: string, focusIndex: number) => {
      onChange(next.slice(0, OTP_LENGTH));
      focusCell(focusIndex);
    },
    [onChange, focusCell]
  );

  const handleChange = useCallback(
    (index: number, raw: string) => {
      if (readOnly) return;
      const typed = onlyDigits(raw);
      if (typed.length === 0) {
        // The cell was cleared, or a character the mask rejects was typed.
        commit(`${digits.slice(0, index)}${digits.slice(index + 1)}`, index);
        return;
      }
      // Typing over a filled cell replaces it; a multi-character insert (some
      // Android keyboards deliver a paste this way) spills into the cells after.
      const combined = `${digits.slice(0, index)}${typed}${digits.slice(index + typed.length)}`;
      commit(combined.slice(0, OTP_LENGTH), index + typed.length);
    },
    [digits, readOnly, commit]
  );

  const handleKeyDown = useCallback(
    (index: number, event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Backspace') {
        if (readOnly) return;
        event.preventDefault();
        if (digits[index]) {
          commit(`${digits.slice(0, index)}${digits.slice(index + 1)}`, index);
        } else {
          commit(`${digits.slice(0, index - 1)}${digits.slice(index)}`, index - 1);
        }
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        focusCell(index - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        focusCell(index + 1);
      }
    },
    [digits, readOnly, commit, focusCell]
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLInputElement>) => {
      if (readOnly) return;
      const pasted = onlyDigits(event.clipboardData.getData('text'));
      if (!pasted) return;
      event.preventDefault();
      const next = pasted.slice(0, OTP_LENGTH);
      commit(next, next.length);
    },
    [readOnly, commit]
  );

  return (
    <div
      role="group"
      aria-label={label}
      aria-describedby={describedBy}
      id={id}
      className={cn('flex items-center gap-2', className)}
    >
      {Array.from({ length: OTP_LENGTH }, (_, index) => (
        <input
          key={index}
          ref={(node) => {
            cells.current[index] = node;
          }}
          type="text"
          inputMode="numeric"
          // Only the first cell carries it; six one-time-code fields make the
          // platform offer the code six times.
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          autoFocus={autoFocus && index === 0}
          maxLength={1}
          readOnly={readOnly}
          disabled={disabled}
          aria-label={cellLabel(index + 1, OTP_LENGTH)}
          aria-invalid={invalid || undefined}
          value={digits[index] ?? ''}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          onFocus={(event) => event.target.select()}
          className={cn(
            'ds-num h-12 w-11 rounded-control border bg-surface-card text-center text-[20px]',
            'text-text-primary transition-colors duration-fast ease-standard',
            'disabled:cursor-not-allowed disabled:opacity-60 read-only:bg-surface-sunken',
            invalid ? 'border-formError' : 'border-border-strong focus:border-border-focus'
          )}
        />
      ))}
    </div>
  );
}

UbOtpInputBase.displayName = 'UbOtpInput';
export const UbOtpInput = memo(UbOtpInputBase);
