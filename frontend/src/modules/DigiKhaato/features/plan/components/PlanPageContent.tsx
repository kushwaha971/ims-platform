'use client';

import { UbPageHeader, UbPageShell, UbStack } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { PlanLimitBanner } from './PlanLimitBanner';
import { PlanUsageCard } from './PlanUsageCard';

/**
 * PLT-15 FR-7 — Settings → Plan.
 *
 * Part 19 §19.1.1 layer 5: the screen composes, the card owns its own states,
 * and nothing here reaches for a service. DEC-001 keeps it to two things — the
 * member count and the modules — and the one sentence that matters most to the
 * merchant reading it: the udhaar entries are never limited.
 */
export function PlanPageContent(): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <UbPageShell
      header={<UbPageHeader title={t('plan.card.title')} subtitle={t('plan.page.subtitle')} />}
    >
      <UbStack gap={4}>
        <PlanLimitBanner />
        <PlanUsageCard />
      </UbStack>
    </UbPageShell>
  );
}
