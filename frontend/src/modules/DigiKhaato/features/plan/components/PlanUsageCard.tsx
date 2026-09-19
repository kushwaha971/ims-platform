'use client';

import { Users } from 'lucide-react';

import {
  UbButton,
  UbCard,
  UbEmptyState,
  UbProgress,
  UbSkeleton,
  UbStack,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { usePlanLimits } from '../hooks/usePlanLimits';
import { isUnlimited, nounIdFor } from '../view-model/planDisplay';

/**
 * PLT-15 FR-7 — Settings → Plan: what this business's plan allows.
 *
 * **DEC-001 is why this card is short.** The FRD's §7 describes a `UbStatCard`
 * per limit with a progress bar each; at MVP there is exactly ONE limit with a
 * number behind it — the member count — because the ledger is never capped and
 * `max_parties` and `max_invoices_per_month` are removed from enforcement on
 * every MVP plan. Rendering a "0 of unlimited parties" meter would be
 * a truthful-looking lie about what this product charges for.
 *
 * So: the modules the plan includes, the member count, and one sentence saying
 * the ledger is never limited. Anything else the server sends as `null` is
 * shown as "Unlimited" rather than as a bar that can never fill.
 *
 * R-C-9 — the card renders its loading, empty, populated and error states.
 */
export function PlanUsageCard(): React.JSX.Element {
  const { t } = useTranslation();
  const plan = usePlanLimits({ fetchOnMount: true });

  if (plan.status === 'loading') {
    return <UbSkeleton variant="card" label={t('plan.card.loading')} />;
  }

  if (plan.status === 'failed') {
    return (
      <UbEmptyState
        variant="error"
        title={t('plan.card.error')}
        description={plan.error?.message}
        requestId={plan.error?.requestId ?? null}
        action={
          <UbButton variant="secondary" onClick={plan.refetch}>
            {t('common.action.retry')}
          </UbButton>
        }
      />
    );
  }

  // An MVP deployment with no plans seeded sends no `plan_limits` at all. That
  // is not an error and not an empty list to apologise for: it is a business
  // with no limits, and saying so is the honest rendering.
  if (plan.limits.length === 0) {
    return (
      <UbCard title={t('plan.card.title')} description={plan.planCode ?? undefined}>
        <UbText variant="body-sm">{t('plan.card.noLimits')}</UbText>
        <UbText variant="caption" tone="tertiary" className="mt-2">
          {t('plan.ledgerNote')}
        </UbText>
      </UbCard>
    );
  }

  return (
    <UbCard
      title={t('plan.card.title')}
      description={plan.planCode ?? undefined}
      action={
        plan.isNearMemberLimit || plan.isAtMemberLimit ? (
          <UbStatusBadge
            tone={plan.isAtMemberLimit ? 'error' : 'warning'}
            label={t(plan.isAtMemberLimit ? 'plan.card.atLimit' : 'plan.card.nearLimit')}
          />
        ) : undefined
      }
    >
      <UbStack as="ul" gap={4}>
        {plan.limits.map((limit) => {
          const noun = t(nounIdFor(limit.key));
          const unlimited = isUnlimited(limit);
          // DEC-001 — only the member count is metered. Everything else the
          // server happens to send is stated, not drawn as a gauge.
          const metered = plan.metered.some((entry) => entry.key === limit.key);

          return (
            <UbStack as="li" key={limit.key} gap={1.5}>
              <UbStack direction="row" align="baseline" justify="between" gap={3}>
                <UbText as="span" variant="body-sm-medium" className="flex items-center gap-2">
                  {limit.key === 'max_users' && (
                    <Users aria-hidden className="h-4 w-4 text-text-tertiary" />
                  )}
                  {noun}
                </UbText>
                {/* §23.2.6 — numerals stay Latin in Hindi, so the figure carries
                    its own direction rather than inheriting the sentence's. */}
                <UbText as="span" variant="body-sm" tone="secondary" dir="ltr" className="ds-num">
                  {unlimited
                    ? t('plan.card.unlimited')
                    : t('plan.near.body', { used: limit.used, limit: limit.limit ?? 0, noun })}
                </UbText>
              </UbStack>
              {metered && !unlimited && (
                <UbProgress used={limit.used} limit={limit.limit} ariaLabel={noun} />
              )}
            </UbStack>
          );
        })}
      </UbStack>

      <UbText variant="caption" tone="tertiary" className="mt-4">
        {t('plan.ledgerNote')}
      </UbText>
    </UbCard>
  );
}
