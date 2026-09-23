'use client';

import { memo, type ReactNode } from 'react';

import { cn } from 'src/utils/cn';

/**
 * A label ↔ value row — BrandHub `OrderInfoRow` (order summary, conditions).
 *
 *  - `default`  12/16: grey label, ink value.
 *  - `positive` 12/16 medium, both green — BrandHub's "discount" line.
 *  - `total`    14/20: medium grey label, semibold ink value.
 *
 * The value never wraps; the label takes what is left and wraps if it must.
 */
export type UbInfoRowVariant = 'default' | 'positive' | 'total';

export interface UbInfoRowProps {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly variant?: UbInfoRowVariant;
  readonly className?: string;
}

const ROW: Record<UbInfoRowVariant, string> = {
  default: 'ds-body-s-regular',
  positive: 'ds-body-s-medium',
  total: 'ds-body-base-regular',
};
const LABEL: Record<UbInfoRowVariant, string> = {
  default: 'text-text-tertiary',
  positive: 'text-success',
  total: 'ds-body-base-medium text-text-tertiary',
};
const VALUE: Record<UbInfoRowVariant, string> = {
  default: 'text-text-primary',
  positive: 'text-success',
  total: 'ds-body-base-semibold text-text-primary',
};

function UbInfoRowBase({ label, value, variant = 'default', className }: Readonly<UbInfoRowProps>) {
  return (
    <div className={cn('flex w-full items-center gap-6', ROW[variant], className)}>
      <span className={cn('min-w-0 flex-1', LABEL[variant])}>{label}</span>
      <span className={cn('shrink-0 whitespace-nowrap', VALUE[variant])}>{value}</span>
    </div>
  );
}

UbInfoRowBase.displayName = 'UbInfoRow';
export const UbInfoRow = memo(UbInfoRowBase);
