'use client';

import { useCallback, useMemo } from 'react';

import { UbBottomBar, UbButton, UbPageSkeleton, UbStack, UbStatusBanner } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectAppName } from 'src/redux/slice/whiteLabelSlice';

import { ONBOARDING_STEPS } from '../constants/businessTypes';
import { useEffectiveModules, useOnboarding } from '../hooks/useOnboarding';

import { OnboardingAddressStep } from './OnboardingAddressStep';
import { OnboardingBusinessStep } from './OnboardingBusinessStep';
import { OnboardingGstStep } from './OnboardingGstStep';
import { OnboardingShell } from './OnboardingShell';
import { PresetSummaryCard } from './PresetSummaryCard';

/**
 * PLT-03 — the wizard's frame: the page, the cross-step states, and one of four
 * step components.
 *
 * Part 19 §19.1.1 layer 5. The four steps are separate module-level components
 * rather than functions declared in here, because a component defined inside a
 * render is a new type on every render — React unmounts and remounts it, the
 * form loses its values mid-typing, and `react/no-unstable-nested-components`
 * fails it for exactly that reason.
 *
 * Every §9 state that is not a single step's business lives here: the offline
 * banner, and — on step 4 — "Processing" and "Failed".
 *
 * ── CR-2026-09-19-D ─────────────────────────────────────────────────────────
 *  · **The page had no `h1`.** Each step opens with an `h2`, so the wizard's
 *    outline started at level 2 and the first thing a screen reader found was
 *    "GST details". There is a real page heading now — the thing the four steps
 *    add up to — and the steps stay at level 2 beneath it.
 *  · **The brand and the language toggle were bolted onto the stepper rail.**
 *    Both are the page's job now.
 *
 * ── CR-2026-09-19-F ─────────────────────────────────────────────────────────
 * The page IS `OnboardingShell` now — layout A, the full-height rail — and this
 * component's own job shrank to what it should always have been: pick the step,
 * and own the states that are not any one step's. The `md`-width column with a
 * 248 px stepper floating beside it is gone, and with it the three defects it
 * produced (an orphaned step list, a dead half of the viewport, and a form
 * whose last field lived behind the sticky action bar). The reasoning for the
 * shape that replaced it is in `OnboardingShell`.
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
    <OnboardingShell
      steps={steps}
      current={onboarding.progressStep}
      completed={onboarding.completedStep}
      onStepSelect={onboarding.goToStep}
      title={t('onboarding.title')}
      description={t('onboarding.subtitle')}
    >
      <UbStack gap={4} className="w-full">
        {/* §9 "Disabled" — tenant creation is class C and is never queued. */}
        {onboarding.isOffline && (
          <UbStatusBanner
            tone="offline"
            title={t('common.network.offline')}
            description={t('onboarding.offline.body')}
          />
        )}

        {/* CR-2026-09-19-E — the §9 "Error" banner is gone. A failed step
            submit surfaces once, from the transport, through the snackbar,
            which carries the request id (R-E-4) exactly as this banner did.
            The wizard keeps its state and the step stays on screen, so the
            user retries with the step's own primary button rather than with a
            second Retry inside a banner. A `validation_error` is still
            anchored on the field that caused it. */}

        {/* NEW-1 — after a reload the saved business is read back first. Each
            step's form takes its values once, at mount, so drawing it on the
            empty draft is exactly how step 1 came back blank and invited a
            second business. */}
        {onboarding.isResuming && <UbPageSkeleton variant="form" count={3} />}

        {/* M2 — "Add a business" found an unfinished business that step 1
            will CONTINUE (the server resumes an abandoned attempt rather than
            create a second). Its values are already in the form below; this
            says whose they are, so nothing is renamed by surprise. */}
        {!onboarding.isResuming && onboarding.step <= 1 && onboarding.resumableBusiness && (
          <UbStatusBanner
            tone="info"
            title={t('onboarding.resumable.title', { name: onboarding.resumableBusiness.name })}
            description={t('onboarding.resumable.body')}
          />
        )}

        {!onboarding.isResuming && onboarding.step <= 1 && (
          <OnboardingBusinessStep onboarding={onboarding} />
        )}
        {!onboarding.isResuming && onboarding.step === 2 && (
          <OnboardingGstStep onboarding={onboarding} />
        )}
        {!onboarding.isResuming && onboarding.step === 3 && (
          <OnboardingAddressStep onboarding={onboarding} />
        )}
        {!onboarding.isResuming && onboarding.step >= 4 && (
          <UbStack gap={4}>
            <PresetSummaryCard
              businessType={onboarding.draft.businessType ?? 'other'}
              effectiveModules={effectiveModules.length > 0 ? effectiveModules : null}
            />
            {/* CR-2026-09-19-G — the review step's own action bar. Same
                `UbBottomBar` as `OnboardingStepActions`, for the same reason:
                it publishes its height so the toast never lands on Finish. */}
            <UbBottomBar className="flex flex-col-reverse gap-2 border-t border-border-hairline bg-canvas py-3 sm:flex-row sm:justify-end sm:bg-surface-card lg:bg-canvas">
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
            </UbBottomBar>
          </UbStack>
        )}
      </UbStack>
    </OnboardingShell>
  );
}
