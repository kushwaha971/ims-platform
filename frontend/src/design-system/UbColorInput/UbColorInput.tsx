'use client';

import { useCallback } from 'react';

import { cn } from 'src/utils/cn';

/**
 * The platform colour picker as a 40 px swatch button (WLB-01 §7 "native
 * colour input"). It only picks; the hex text field beside it is the
 * authority, because a merchant copying their colour from a signboard printer's
 * quote types `#0F766E`, and the native picker on Android cannot take a pasted
 * value at all.
 */
export interface UbColorInputProps {
  readonly value: string;
  readonly onChange: (hex: string) => void;
  readonly label: string;
  readonly disabled?: boolean;
  readonly className?: string;
}

export function UbColorInput({
  value,
  onChange,
  label,
  disabled = false,
  className,
}: Readonly<UbColorInputProps>): React.JSX.Element {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value.toUpperCase()),
    [onChange]
  );
  return (
    <input
      type="color"
      aria-label={label}
      value={/^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#000000'}
      onChange={handleChange}
      disabled={disabled}
      className={cn(
        'h-10 w-12 shrink-0 cursor-pointer rounded-control border border-border-subtle bg-surface-card p-1',
        'focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45',
        className
      )}
    />
  );
}
