'use client';

import { UbAmount } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

/**
 * A register or GST figure, with its SIGN.
 *
 * `UbAmount` paints a magnitude and leaves the sign to a label, because on a
 * khata "−₹500" is not a concept a shopkeeper has. On a tax register it is the
 * whole point (RPT-03 BR-1: a credit note is negative so the column nets), so
 * a negative figure takes the minus slot and the error tone §8 asks for, and
 * its accessible name says "less" — the sign is never colour alone.
 */
export function ReportAmount({
  value,
  size = 'sm',
}: Readonly<{ value: string | null; size?: 'sm' | 'md' | 'lg' }>): React.JSX.Element {
  const { t } = useTranslation();
  if (value && value.trim().startsWith('-')) {
    return (
      <UbAmount
        value={value}
        size={size}
        tone="receivable"
        sign="minus"
        label={t('reports.amount.less')}
        labelHidden
      />
    );
  }
  return <UbAmount value={value} size={size} />;
}
