'use client';

import { UbAmount } from 'src/design-system';

/**
 * A stock VALUE CHANGE — "−₹6,500.00" for stock written off, "+₹150.00" for
 * stock found. `UbAmount` shows a magnitude and leaves direction to its label,
 * which is right for a balance ("you will get") and wrong here: an adjustment's
 * value impact has no direction word, so the sign IS the meaning. Without this
 * the first look at INV-06 showed a ₹6,500 theft as "₹6,500.00" — the same
 * figure a ₹6,500 find would show.
 */
export function SignedAmount({
  value,
  label,
  size = 'md',
  className,
}: Readonly<{
  value: string;
  /** Spoken, not shown: the column header or row label already says it. */
  label: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}>): React.JSX.Element {
  return (
    <UbAmount
      value={value}
      tone="neutral"
      sign={value.trim().startsWith('-') ? 'minus' : 'plus'}
      label={label}
      labelHidden
      size={size}
      className={className}
    />
  );
}
