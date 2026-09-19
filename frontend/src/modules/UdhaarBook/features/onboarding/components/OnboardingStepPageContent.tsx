'use client';

import { useCallback, useMemo } from 'react';

import { UbButton, UbStack, UbStatusBanner, UbStepper, UbText } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectAppName } from 'src/redux/slice/whiteLabelSlice';

import { LanguageToggle } from '../../auth/components/LanguageToggle';
import { ONBOARDING_STEPS, ONBOARDING_STEP_COUNT } from '../constants/businessTypes';
import { useEffectiveModules, useOnboarding } from '../hooks/useOnboarding';

import { OnboardingAddressStep } from './OnboardingAddressStep';
import { OnboardingBusinessStep } from './OnboardingBusinessStep';
import { OnboardingGstStep } from './OnboardingGstStep';
import { PresetSummaryCard } from './PresetSummaryCard';

/**
 * PLT-03 — the wizard's frame: the stepper, the cross-step states, and one of
 * four step components.
 *
 * Part 19 §19.1.1 layer 5. The four steps are separate module-level components
 * rather than functions declared in here, because a component defined inside a
 * render is a new type on every render — React unmounts and remounts it, the
 * form loses its values mid-typing, and `react/no-unstable-nested-components`
 * fails it for exactly that reason.
 *
 * Every §9 state that is not a single step's business lives here: the offline
 * banner, the non-validation error banner with its request id, and — on step 4
 * — "Processing" and "Failed". Layout §7: one column below `md` with a sticky
 * action bar; the stepper becomes a 248 px left rail above it.
 */
export function OnboardingStepPageContent({
  step: routeStep,
}: Readonly<{ step: number }>): React.JSX.Element {
  const { t } = useTranslation();
  const appName = useAppSelector(selectAppName);
  const onboarding = useOnboarding(routeStep);
  const effectiveModules = useEffectiveModules();

  const steps = useMemo(
    () => ONBOARDING_STEPS.map((entry) => ({ key: entry.key, label: t(entry.labelId) })),
    [t]
  );

  const backToAddress = useCallback(() => onboarding.goToStep(3), [onboarding]);
  const finish = useCallback(() => void onboarding.finish(), [onboarding]);

  return (
    <UbStack
      gap={6}
      className="mx-auto w-full max-w-content px-4 py-6 md:flex-row md:gap-10 md:px-page"
    >
      <UbStack gap={4} className="md:w-[248px] md:shrink-0">
        <UbStack direction="row" align="center" justify="between" gap={3}>
          <UbText as="span" variant="h4">
            {appName}
          </UbText>
          <LanguageToggle />
        </UbStack>
        <UbStepper
          steps={steps}
          current={onboarding.step}
          completed={onboarding.completedStep}
          onStepSelect={onboarding.goToStep}
          progressLabel={t('onboarding.progress', {
            current: onboarding.step,
            total: ONBOARDING_STEP_COUNT,
          })}
        />
      </UbStack>

      <UbStack gap={4} className="min-w-0 flex-1 md:max-w-[560px]">
        {/* §9 "Disabled" — tenant creation is class C and is never queued. */}
        {onboarding.isOffline && (
          <UbStatusBanner
            tone="offline"
            title={t('common.network.offline')}
            description={t('onboarding.offline.body')}
          />
        )}

        {/* §9 "Error" / "Failed" — everything the fields cannot carry, with the
            request id, which on a failed preset application is the only thing
            that connects the merchant's screen to a backend log line (R-E-4). */}
        {onboarding.error && onboarding.error.code !== 'validation_error' && (
          <UbStatusBanner
            tone="error"
            title={onboarding.error.message}
            description={onboarding.error.requestId ?? undefined}
            action={
              onboarding.step === ONBOARDING_STEP_COUNT ? (
                <UbButton variant="secondary" size="sm" onClick={finish}>
                  {t('common.action.retry')}
                </UbButton>
              ) : undefined
            }
          />
        )}

        {onboarding.step <= 1 && <OnboardingBusinessStep onboarding={onboarding} />}
        {onboarding.step === 2 && <OnboardingGstStep onboarding={onboarding} />}
        {onboarding.step === 3 && <OnboardingAddressStep onboarding={onboarding} />}
        {onboarding.step >= 4 && (
          <UbStack gap={4}>
            <PresetSummaryCard
              businessType={onboarding.draft.businessType ?? 'other'}
              effectiveModules={effectiveModules.length > 0 ? effectiveModules : null}
            />
            <UbStack
              direction="column-reverse"
              gap={2}
              className="sticky bottom-0 border-t border-border-hairline bg-surface-card py-3 sm:flex-row sm:justify-end"
            >
              <UbButton
                variant="ghost"
                size="lg"
                onClick={backToAddress}
                disabled={onboarding.isSubmitting}
              >
                {t('common.action.back')}
              </UbButton>
              <UbButton
                size="lg"
                fullWidth
                className="sm:w-auto"
                onClick={finish}
                busy={onboarding.isSubmitting}
                // §9 "Processing" — say what is happening; the preset write is
                // ~150 ms of server work and an unlabelled spinner reads as a hang.
                busyLabel={t('onboarding.settingUp')}
                disabled={!onboarding.canSubmit}
              >
                {t('onboarding.finish', { appName })}
              </UbButton>
            </UbStack>
          </UbStack>
        )}
      </UbStack>
    </UbStack>
  );
}
