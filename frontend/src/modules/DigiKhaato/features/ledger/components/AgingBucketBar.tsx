'use client';

import { memo, useMemo } from 'react';

import { CHART_AGING_RAMP, UbBox } from 'src/design-system';
import { cn } from 'src/utils/cn';
import { formatInr } from 'src/utils/money';

import { AGING_BUCKETS } from '../types/aging.types';
import { bucketShares } from '../view-model/agingDisplay';

import type { AgingAmounts, AgingBucket } from '../types/aging.types';

/**
 * LED-09 §7 — one party's money, laid out by age, as a single stacked bar.
 *
 * ── Why the design system's aging ramp and not §5's four status colours ────
 * §5 names `--info`, `--warning`, `--warning-bright` and `--error`. The design
 * system already answered the same question for the same four buckets when it
 * built `UbAgingBars`: a single hue that DARKENS with age, validated for
 * ordinal contrast in both themes. Four status colours would say "fine,
 * careful, careful, bad" — which is a judgement the product does not get to
 * make about 31–60 days — and would disagree with the dashboard's aging chart
 * the day RPT-01 draws it. Recorded as a clarification against §5.
 *
 * ── Colour never carries it alone ────────────────────────────────────────
 * The bar is `role="img"` with every bucket and amount in its accessible name,
 * and on a table the four figures sit in their own columns beside it. The bar
 * is how the eye finds the row with the dark end; the numbers are how the
 * merchant knows what to say on the phone.
 */
export interface AgingBucketBarProps {
  readonly amounts: AgingAmounts;
  /** "0–30 days, ₹400.00; 90+ days, ₹100.00" — pre-translated labels. */
  readonly bucketLabel: (bucket: AgingBucket) => string;
  /** The sentence the whole bar is announced as; `{detail}` is substituted. */
  readonly ariaLabel: (detail: string) => string;
  readonly className?: string;
}

function AgingBucketBarBase({
  amounts,
  bucketLabel,
  ariaLabel,
  className,
}: Readonly<AgingBucketBarProps>) {
  const shares = useMemo(() => bucketShares(amounts), [amounts]);
  const detail = useMemo(
    () =>
      AGING_BUCKETS.map((bucket) => `${bucketLabel(bucket)}, ${formatInr(amounts[bucket])}`).join(
        '; '
      ),
    [amounts, bucketLabel]
  );

  return (
    <UbBox
      as="span"
      role="img"
      aria-label={ariaLabel(detail)}
      data-testid="aging-bucket-bar"
      className={cn(
        'flex h-2 w-full min-w-16 overflow-hidden rounded-pill bg-surface-sunken',
        className
      )}
    >
      {shares.map(({ bucket, share }, index) =>
        share > 0 ? (
          <UbBox
            as="span"
            key={bucket}
            data-bucket={bucket}
            data-share={share}
            className={cn('block h-full', CHART_AGING_RAMP[index]?.key)}
            style={{ width: `${share}%` }}
          />
        ) : null
      )}
    </UbBox>
  );
}

AgingBucketBarBase.displayName = 'AgingBucketBar';
export const AgingBucketBar = memo(AgingBucketBarBase);
