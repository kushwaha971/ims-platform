'use client';

import { memo, useState } from 'react';

import { Check } from 'lucide-react';

import {
  UbActionLink,
  UbBox,
  UbChoiceChips,
  UbReveal,
  UbStack,
  UbStatusBadge,
  UbStatusBanner,
  UbText,
} from 'src/design-system';
import { useTranslation, type TranslateFn } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { cn } from 'src/utils/cn';

import {
  PRICING,
  priceFor,
  type BillingCycle,
  type Plan,
  type PlanLimit,
  type Pricing,
} from '../config/pricing';

import { LANDING_CONTAINER, LANDING_SECTION, LandingSectionHeading } from './LandingPrimitives';

const limitLine = (limit: PlanLimit, t: TranslateFn, n: (v: number) => string): string => {
  switch (limit.kind) {
    case 'logins':
      return t('landing.pricing.limit.logins', { count: limit.count });
    case 'devices':
      return limit.count === null
        ? t('landing.pricing.limit.devicesUnlimited')
        : t('landing.pricing.limit.devices', { count: limit.count });
    case 'invoices':
      return limit.count === null
        ? t('landing.pricing.limit.invoicesUnlimited')
        : t('landing.pricing.limit.invoices', { count: n(limit.count) });
    case 'items':
      return t('landing.pricing.limit.items', { count: n(limit.count) });
  }
};

function PlanCard({
  plan,
  cycle,
  t,
  n,
}: Readonly<{ plan: Plan; cycle: BillingCycle; t: TranslateFn; n: (v: number) => string }>) {
  const price = priceFor(plan, cycle);
  const per = cycle === 'yearly' ? t('landing.pricing.perYear') : t('landing.pricing.perMonth');
  return (
    <UbStack
      gap={6}
      data-testid={`landing-plan-${plan.id}`}
      className={cn(
        'relative h-full rounded-[24px] border bg-surface-card p-6 xl:p-7',
        'transition-[border-color,box-shadow] duration-base ease-standard',
        plan.highlight
          ? 'border-accent shadow-[0_24px_60px_-28px_var(--device-glow)] ring-1 ring-inset ring-accent'
          : 'border-border-hairline hover:border-accent-line'
      )}
    >
      <UbStack gap={2}>
        <UbStack direction="row" align="center" justify="between" gap={2} wrap>
          <UbText as="h3" variant="inherit" className="ds-body-xl-semibold">
            {t(`landing.pricing.${plan.id}.name`)}
          </UbText>
          {plan.highlight && <UbStatusBadge tone="info" label={t('landing.pricing.business.badge')} />}
        </UbStack>
        <UbText variant="inherit" tone="tertiary" className="min-h-[2.75em] ds-body-base-regular">
          {t(`landing.pricing.${plan.id}.tagline`)}
        </UbText>
      </UbStack>

      <UbStack direction="row" align="baseline" gap={1} className="min-h-[3.25rem]">
        <UbText
          as="span"
          variant="inherit"
          className="font-[family-name:var(--font-metric)] text-[2.5rem] font-semibold leading-none tracking-[-0.03em]"
          data-testid={`landing-price-${plan.id}`}
        >
          ₹{n(price)}
        </UbText>
        {plan.monthly > 0 && (
          <UbText as="span" variant="inherit" tone="tertiary" className="ds-body-base-regular">
            {per}
          </UbText>
        )}
      </UbStack>

      <UbStack as="ul" gap={2} className="border-y border-border-hairline py-4">
        {plan.limits.map((limit) => (
          <UbText as="li" key={limit.kind} variant="inherit" className="ds-body-base-medium">
            {limitLine(limit, t, n)}
          </UbText>
        ))}
      </UbStack>

      <UbStack gap={3} className="flex-1">
        <UbText variant="inherit" tone="tertiary" className="ds-body-s-medium">
          {t(plan.includesKey)}
        </UbText>
        <UbStack as="ul" gap={2.5}>
          {plan.featureKeys.map((featureKey) => (
            <UbStack as="li" key={featureKey} direction="row" gap={2.5} align="start">
              <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-text-accent" />
              <UbText variant="inherit" tone="secondary" className="ds-body-base-regular">
                {t(featureKey)}
              </UbText>
            </UbStack>
          ))}
        </UbStack>
      </UbStack>

      <UbActionLink
        href={ROUTES.SIGNUP}
        variant={plan.highlight ? 'primary' : 'outlineNeutral'}
        size="lg"
        className="ub-lift w-full rounded-[14px]"
      >
        {t('landing.nav.startFree')}
      </UbActionLink>
    </UbStack>
  );
}

/**
 * Pricing — the four proposed plans. Everything it shows comes from
 * `config/pricing.ts`; see that file for the rules the figures follow and why
 * the notice exists. `pricing` is a prop only so a test can render the
 * approved state.
 */
function PricingSectionBase({ pricing = PRICING }: Readonly<{ pricing?: Pricing }>) {
  const { t, n } = useTranslation();
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const options = [
    { value: 'monthly' as const, label: t('landing.pricing.monthly') },
    { value: 'yearly' as const, label: t('landing.pricing.yearly') },
  ];

  return (
    <UbBox
      as="section"
      id="pricing"
      aria-labelledby="landing-pricing-title"
      className={`${LANDING_SECTION} scroll-mt-24 bg-surface-subtle`}
    >
      <UbBox className={LANDING_CONTAINER}>
        <LandingSectionHeading
          id="landing-pricing-title"
          eyebrow={t('landing.pricing.eyebrow')}
          lead={t('landing.pricing.lead')}
          keyLine={t('landing.pricing.key')}
        />

        {pricing.status === 'proposed' && (
          <UbBox className="mx-auto mt-10 max-w-3xl" data-testid="landing-pricing-proposed">
            <UbStatusBanner
              tone="info"
              title={t('landing.pricing.proposed.title')}
              description={t('landing.pricing.proposed.body')}
            />
          </UbBox>
        )}

        <UbStack direction="row" align="center" justify="center" gap={3} wrap className="mt-10">
          <UbChoiceChips
            value={cycle}
            onChange={setCycle}
            options={options}
            ariaLabel={t('landing.pricing.cycle')}
          />
          <UbStatusBadge tone="success" label={t('landing.pricing.yearlySaving')} />
        </UbStack>

        <UbReveal
          as="ul"
          stagger
          className="mt-10 grid gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-4"
        >
          {pricing.plans.map((plan) => (
            <UbBox as="li" key={plan.id}>
              <PlanCard plan={plan} cycle={cycle} t={t} n={n} />
            </UbBox>
          ))}
        </UbReveal>

        <UbStack gap={1} align="center" className="mt-6 text-center">
          <UbText variant="body-sm" tone="tertiary" align="center">
            {t('landing.pricing.exGst')}
          </UbText>
          <UbText variant="body-sm" tone="tertiary" align="center" data-testid="landing-pricing-modules">
            {t('landing.pricing.modules')}
          </UbText>
        </UbStack>
      </UbBox>
    </UbBox>
  );
}

PricingSectionBase.displayName = 'PricingSection';
export const PricingSection = memo(PricingSectionBase);
