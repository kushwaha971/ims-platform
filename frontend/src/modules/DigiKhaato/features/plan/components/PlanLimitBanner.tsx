'use client';

import { memo } from 'react';

import { UbStatusBanner } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { usePlanLimits } from '../hooks/usePlanLimits';
import { nounIdFor } from '../view-model/planDisplay';

/**
 * PLT-15 FR-7 — the pre-warning, so a limit is never a surprise at the moment
 * somebody is trying to do something.
 *
 * **DEC-001 decides where this may appear: the TEAM screen, and nowhere else.**
 * The FRD's §7 places banners at 80 % of `max_invoices_per_month` on the Sales
 * list and at 90 % of `max_parties` on the Party list; neither limit exists on
 * any MVP plan, so neither banner is built. Building them would put a
 * "you are running out" message on two screens that can never run out.
 *
 * It renders nothing at all when there is no limit, when the limit is unlimited
 * or when usage is below the threshold — a banner that is always present is
 * furniture, and furniture is not read.
 */
export function PlanLimitBannerBase({
  className,
}: Readonly<{ className?: string }>): React.JSX.Element | null {
  const { t } = useTranslation();
  const plan = usePlanLimits();
  const limit = plan.memberLimit;

  if (!limit || limit.limit === null) return null;
  if (!plan.isNearMemberLimit && !plan.isAtMemberLimit) return null;

  const noun = t(nounIdFor(limit.key));

  return (
    <UbStatusBanner
      // At the limit it is a system limit, not a ledger figure: warning, and
      // never the receivable red (§23.2.4).
      tone={plan.isAtMemberLimit ? 'error' : 'warning'}
      title={t('plan.near.body', { used: limit.used, limit: limit.limit, noun })}
      description={
        plan.isAtMemberLimit
          ? t('plan.near.atBody', { partner: plan.supportContact.name ?? t('plan.limit.provider') })
          : t('plan.near.nearBody')
      }
      className={className}
    />
  );
}

PlanLimitBannerBase.displayName = 'PlanLimitBanner';
export const PlanLimitBanner = memo(PlanLimitBannerBase);
