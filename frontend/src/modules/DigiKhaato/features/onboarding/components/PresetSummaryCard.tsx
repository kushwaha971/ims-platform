'use client';

import { memo } from 'react';

import { UbBox, UbCard, UbGrid, UbStack, UbStatusBadge, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import type { ModuleCode } from 'src/types/domain.types';

import { BUSINESS_TYPE_CONFIG, type BusinessType } from '../constants/businessTypes';
import { presetSummary } from '../view-model/onboardingDisplay';

/**
 * PLT-03 FR-5 / §7 — step 4's summary: what the preset is about to turn on,
 * shown BEFORE the button is pressed.
 *
 * FR-8 and canon §0.2 are the reason the copy ends with "These are starting
 * defaults, not rules": a business type sets defaults, it never hard-wires
 * behaviour, and a merchant who believes otherwise will pick the wrong tile out
 * of fear rather than the right one. It used to say "You can change all of this
 * in Settings", and Settings is not built (UAT D8).
 *
 * EC-6's "Stock: not available in your plan" row is withdrawn with the Stock
 * row itself: stock is not built, so the card makes no claim about it either
 * way (UAT D8). The module list is `readyModules` — what exists today.
 */
export interface PresetSummaryCardProps {
  readonly businessType: BusinessType;
  /** The tenant's effective modules once the server intersected plan+partner. */
  readonly effectiveModules: readonly ModuleCode[] | null;
  readonly className?: string;
}

function PresetSummaryCardBase({
  businessType,
  effectiveModules,
  className,
}: Readonly<PresetSummaryCardProps>) {
  const { t } = useTranslation();
  const summary = presetSummary(businessType, effectiveModules);
  const config = BUSINESS_TYPE_CONFIG[businessType];

  return (
    <UbCard
      title={t('onboarding.summary.title')}
      description={t('onboarding.summary.body')}
      className={className}
    >
      {/* A definition list, not a table: these are label/value pairs, and a
          two-column `dl` collapses to one column below `sm` for free. */}
      <UbGrid as="dl" columns={{ base: 1, sm: 2 }} gap={3}>
        <UbStack gap={0.5}>
          <UbText as="dt" variant="label" tone="tertiary">
            {t('onboarding.summary.type')}
          </UbText>
          <UbText as="dd" variant="body-sm">
            {t(config.labelId)}
          </UbText>
        </UbStack>

        {/* No Stock row. It read "Stock: On" (or EC-6's "not available in
            your plan") for a module that is a "Soon" row in the sidebar —
            a promise about an unbuilt feature (UAT D8). It comes back with
            the Items screen. */}

        <UbStack gap={0.5}>
          <UbText as="dt" variant="label" tone="tertiary">
            {t('onboarding.summary.dueDays')}
          </UbText>
          <UbText as="dd" variant="body-sm">
            {t('onboarding.summary.dueDays.value', { days: summary.defaultDueDays })}
          </UbText>
        </UbStack>

        <UbStack gap={0.5}>
          <UbText as="dt" variant="label" tone="tertiary">
            {t('onboarding.summary.units')}
          </UbText>
          {/* UQC codes are statutory identifiers, not copy: they are the same
              string in both locales and are rendered `ds-mono`, LTR. */}
          <UbText as="dd" variant="mono" dir="ltr">
            {summary.favouriteUnits.join(', ')}
          </UbText>
        </UbStack>

        <UbStack gap={0.5} className="sm:col-span-2">
          <UbText as="dt" variant="label" tone="tertiary">
            {t('onboarding.summary.modules')}
          </UbText>
          <UbBox as="dd" className="flex flex-wrap gap-1.5">
            {summary.readyModules.map((module) => (
              <UbStatusBadge key={module} tone="neutral" label={t(`nav.module.${module}`)} />
            ))}
          </UbBox>
        </UbStack>

        {summary.extraExpenseCategoryIds.length > 0 && (
          <UbStack gap={0.5} className="sm:col-span-2">
            <UbText as="dt" variant="label" tone="tertiary">
              {t('onboarding.summary.expenses')}
            </UbText>
            <UbText as="dd" variant="body-sm">
              {summary.extraExpenseCategoryIds.map((id) => t(id)).join(', ')}
            </UbText>
          </UbStack>
        )}
      </UbGrid>

      <UbText variant="caption" tone="tertiary" className="mt-4">
        {t('onboarding.summary.changeable')}
      </UbText>
    </UbCard>
  );
}

PresetSummaryCardBase.displayName = 'PresetSummaryCard';
export const PresetSummaryCard = memo(PresetSummaryCardBase);
