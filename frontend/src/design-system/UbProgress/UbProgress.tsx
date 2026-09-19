'use client';

import { memo } from 'react';

import { MLProgress } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.3 — a usage meter. PLT-15 §7's plan card is the only Sprint 1
 * caller, and DEC-001 makes the only metered thing the member count.
 *
 * The tone is DERIVED from the percentage rather than passed in, so two callers
 * cannot disagree about what "near the limit" means: ≥ 100 % is the
 * `--form-error` family (a system limit, not a ledger debit), ≥ 80 % is amber,
 * below that is the accent.
 */
export interface UbProgressProps {
  readonly used: number;
  /** `null` is unlimited: the bar renders empty and says so through `label`. */
  readonly limit: number | null;
  /** Accessible name — "team members used", translated by the caller. */
  readonly ariaLabel: string;
  readonly className?: string;
}

export const progressTone = (percent: number): 'accent' | 'warning' | 'error' =>
  percent >= 100 ? 'error' : percent >= 80 ? 'warning' : 'accent';

export const usagePercent = (used: number, limit: number | null): number =>
  limit === null || limit <= 0 ? 0 : Math.min(100, (used / limit) * 100);

function UbProgressBase({ used, limit, ariaLabel, className }: Readonly<UbProgressProps>) {
  const percent = usagePercent(used, limit);
  return (
    <MLProgress
      value={percent}
      tone={progressTone(percent)}
      ariaLabel={ariaLabel}
      className={cn(className)}
    />
  );
}

UbProgressBase.displayName = 'UbProgress';
export const UbProgress = memo(UbProgressBase);
