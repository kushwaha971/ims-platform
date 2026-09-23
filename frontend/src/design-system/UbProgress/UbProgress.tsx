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
 *
 * ── `percent` and `tone`, and why the rule above survives them ─────────────
 * PTY-06's credit bar is the second caller and it cannot use `used`/`limit`:
 * those are NUMBERS, and a credit limit is money. Dividing two floats parsed
 * from decimal strings is exactly the arithmetic canon rule 3 forbids, and the
 * server already computes the percentage with `Decimal` — sending it a second
 * opinion computed in JavaScript is how the bar and the caption beside it come
 * to disagree by a point.
 *
 * Its thresholds differ too, and deliberately: a plan quota turns amber at 80 %
 * because the next member is the problem, while a credit limit turns amber at
 * 70 % because the merchant needs time to collect before the next bill. Two
 * meters measuring different things do not share a scale.
 *
 * So `percent` is an override for a caller that has already done the maths
 * properly, and `tone` for one whose bands are its own. Neither is a general
 * escape hatch: a caller passing `used`/`limit` and nothing else still gets the
 * derived tone, which is what keeps the plan card and anything like it honest.
 */
export interface UbProgressProps {
  readonly used?: number;
  /** `null` is unlimited: the bar renders empty and says so through `label`. */
  readonly limit?: number | null;
  /**
   * An already-computed percentage, for a caller whose numbers are money.
   * Overrides `used`/`limit`. Clamped to the track, so a bar at 340 % fills it
   * rather than overflowing — the figure itself belongs in the caption.
   */
  readonly percent?: number;
  /** The caller's own bands. Omit to derive from the percentage. */
  readonly tone?: 'accent' | 'warning' | 'error' | 'success';
  /** Accessible name — "team members used", translated by the caller. */
  readonly ariaLabel: string;
  readonly className?: string;
}

export const progressTone = (percent: number): 'accent' | 'warning' | 'error' =>
  percent >= 100 ? 'error' : percent >= 80 ? 'warning' : 'accent';

export const usagePercent = (used: number, limit: number | null): number =>
  limit === null || limit <= 0 ? 0 : Math.min(100, (used / limit) * 100);

function UbProgressBase({
  used,
  limit,
  percent: given,
  tone,
  ariaLabel,
  className,
}: Readonly<UbProgressProps>) {
  const percent =
    given !== undefined
      ? Math.max(0, Math.min(100, given))
      : usagePercent(used ?? 0, limit ?? null);
  return (
    <MLProgress
      value={percent}
      tone={tone ?? progressTone(percent)}
      ariaLabel={ariaLabel}
      className={cn(className)}
    />
  );
}

UbProgressBase.displayName = 'UbProgress';
export const UbProgress = memo(UbProgressBase);
