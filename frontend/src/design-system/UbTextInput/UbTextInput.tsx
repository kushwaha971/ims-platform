'use client';

import {
  forwardRef,
  memo,
  useCallback,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';

import { Eye, EyeOff } from 'lucide-react';

import { MLIconButton, MLInput } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.3 — the general text control. It adds two things to `MLInput`
 * that every screen would otherwise re-implement:
 *
 *  - a PASSWORD reveal toggle (PLT-02 FR-8), which flips `type` and keeps the
 *    caret, with its own accessible name in both states; and
 *  - `uppercase`, which forces the visible text AND the committed value to
 *    upper case for GSTIN and PAN (PLT-03 §5), because a lowercase GSTIN fails
 *    a checksum the user cannot see.
 *
 * It never formats money or quantities — `UbMoneyInput` and `UbQuantityInput`
 * own those and are not in wave 1.
 */
export interface UbTextInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange'
> {
  readonly value: string | null | undefined;
  readonly onChange: (value: string) => void;
  readonly type?: 'text' | 'password' | 'email' | 'tel' | 'url';
  readonly invalid?: boolean;
  /** Uppercases what the user types — GSTIN, PAN. */
  readonly uppercase?: boolean;
  /** Accessible name for the reveal control; required when `type="password"`. */
  readonly revealLabel?: string;
  readonly hideLabel?: string;
  /** A trailing adornment: a unit, a counter. Ignored for passwords. */
  readonly adornment?: ReactNode;
  readonly className?: string;
}

const UbTextInputInner = forwardRef<HTMLInputElement, UbTextInputProps>(function UbTextInputInner(
  {
    value,
    onChange,
    type = 'text',
    invalid,
    uppercase,
    revealLabel,
    hideLabel,
    adornment,
    className,
    ...rest
  },
  ref
) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;
      onChange(uppercase ? next.toUpperCase() : next);
    },
    [onChange, uppercase]
  );

  const toggle = useCallback(() => setRevealed((current) => !current), []);

  return (
    <div className={cn('relative flex w-full items-center', className)}>
      <MLInput
        ref={ref}
        type={isPassword && revealed ? 'text' : type}
        value={value ?? ''}
        onChange={handleChange}
        invalid={invalid}
        className={cn(uppercase && 'uppercase', (isPassword || adornment) && 'pr-10')}
        {...rest}
      />
      {isPassword && (
        <MLIconButton
          aria-label={(revealed ? hideLabel : revealLabel) ?? ''}
          aria-pressed={revealed}
          onClick={toggle}
          // Not in the tab order: the toggle is a convenience, and a keyboard
          // user tabbing from the password field expects the submit button.
          tabIndex={-1}
          /* BrandHub's `BrandHubPasswordInput` toggle: `absolute inset-y-0
             right-3 my-auto size-4 p-0 text-muted-fg hover:bg-transparent
             hover:text-foreground`. This was a full `MLIconButton` pinned to
             `right-0`, so a 44px button sat flush against the field's edge and
             the glyph looked off-centre inside it. The glyph is the control
             here; the 44px target comes from the field's own height. */
          className="absolute inset-y-0 right-3 my-auto size-4 min-h-0 p-0 text-text-tertiary hover:bg-transparent hover:text-text-primary"
        >
          {revealed ? (
            <EyeOff aria-hidden className="h-4 w-4" />
          ) : (
            <Eye aria-hidden className="h-4 w-4" />
          )}
        </MLIconButton>
      )}
      {!isPassword && adornment && (
        <span className="ds-caption pointer-events-none absolute right-3 text-text-muted">
          {adornment}
        </span>
      )}
    </div>
  );
});

UbTextInputInner.displayName = 'UbTextInput';
export const UbTextInput = memo(UbTextInputInner);
