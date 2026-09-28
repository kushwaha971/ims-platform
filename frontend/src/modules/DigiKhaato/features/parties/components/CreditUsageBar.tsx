'use client';

import { memo } from 'react';

import { UbBox, UbProgress, UbText } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';

import { creditCaption, creditTone } from '../view-model/creditDisplay';

import type { PartyCredit } from '../types/party.types';

/**
 * PTY-06 FR-10 — how much of their credit limit this party has used.
 *
 * ── Named `CreditUsageBar`, not `UbCreditBar` ──────────────────────────────
 * A `Ub*` knows about tone and spacing and nothing about this product's nouns.
 * This one knows what "exposure" means, that a party in credit is using none of
 * their limit, and that the direction belongs in the wording rather than in a
 * minus sign. The reusable half already exists — `UbProgress` draws the track —
 * and this composes it.
 *
 * ── Three things, and the bar is the least important of them ───────────────
 * A label above, the track, and a caption below. The CAPTION is what a merchant
 * acts on: "₹2,500 left of ₹50,000" is a decision they can make, and a bar at
 * 95 % is a feeling. The bar is there because a feeling read at a glance is
 * exactly what a list of forty parties needs, and the caption is there because
 * colour is never the only signal (R-A-2) — a reader who cannot tell amber from
 * red reads the same fact in the same place.
 *
 * ── The percentage comes from the server ───────────────────────────────────
 * It is computed with `Decimal` there and clamped to 999 for display (BR-11);
 * the rupees beside it are never clamped, because those are the facts. Nothing
 * in this component divides anything — dividing two floats parsed from decimal
 * strings is what canon rule 3 forbids.
 */
export interface CreditUsageBarProps {
  readonly t: TranslateFn;
  readonly credit: PartyCredit;
  /** `sm` on the khata page's header; `xs` in a grid cell. */
  readonly size?: 'sm' | 'xs';
  readonly className?: string;
}

function CreditUsageBarBase({ t, credit, size = 'sm', className }: Readonly<CreditUsageBarProps>) {
  const caption = creditCaption(credit);
  const tone = creditTone(credit.usagePct);
  const percent = credit.usagePct ?? 0;

  return (
    <UbBox className={className}>
      {size === 'sm' && (
        <UbText variant="label" tone="secondary">
          {t('parties.credit.used')}
        </UbText>
      )}
      <UbProgress
        percent={percent}
        tone={tone}
        /* The accessible name carries the whole sentence, not "Credit used".
           A screen reader announcing a progress bar reads its name and its
           value — "Credit used, 95 percent" is a number with no units and no
           way to tell whether 95 is good. The caption below is visual; this is
           the same fact for somebody who cannot see it. */
        ariaLabel={`${t('parties.credit.used')} — ${t(caption.id, caption.values)}`}
        className={size === 'xs' ? 'h-1' : undefined}
      />
      <UbText
        variant="caption"
        /* The caption carries the tone too, so the over-limit case reads as a
           problem in the text as well as in the track. `tertiary` below the
           threshold, because a party comfortably inside their limit is not
           news. */
        tone={tone === 'error' ? 'error' : tone === 'warning' ? 'warning' : 'tertiary'}
      >
        {t(caption.id, caption.values)}
      </UbText>
    </UbBox>
  );
}

CreditUsageBarBase.displayName = 'CreditUsageBar';
export const CreditUsageBar = memo(CreditUsageBarBase);
