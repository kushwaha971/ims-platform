'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';

import {
  UbButton,
  UbField,
  UbForm,
  UbRadioGroup,
  UbStatusBanner,
  UbTextInput,
} from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectLocale } from 'src/redux/slice/localeSlice';

import { GST_TYPES, type GstType } from '../constants/businessTypes';
import { stateName } from '../constants/gstStates';
import { useOnboardingSchemas } from '../validation/onboardingSchemas';
import {
  gstinStateMismatch,
  panFromGstin,
  panMismatchesGstin,
} from '../view-model/onboardingDisplay';

import { OnboardingStepActions } from './OnboardingStepActions';
import { OnboardingStepCard } from './OnboardingStepCard';

import type { UseOnboardingResult } from '../hooks/useOnboarding';
import type { GstStepFormValues } from '../validation/onboardingSchemas';

/**
 * PLT-03 FR-3 — step 2: GST status, and the three fields that only exist when
 * the answer is "registered".
 *
 * Three FRD behaviours live in this file and nowhere else:
 *  - the GSTIN/PAN/state DERIVATIONS, taken from the view-model;
 *  - the state MISMATCH offer, which is a warning with an action and never a
 *    block (a merchant may legitimately operate from another state);
 *  - the PAN mismatch, which is a hint under the field for the same reason.
 *
 * §10's "required when `gst_type ≠ unregistered`" is in the schema, not here.
 */
export function OnboardingGstStep({
  onboarding,
}: Readonly<{ onboarding: UseOnboardingResult }>): React.JSX.Element {
  const { t } = useTranslation();
  const locale = useAppSelector(selectLocale);
  const schemas = useOnboardingSchemas();

  const form = useForm<GstStepFormValues>({
    resolver: yupResolver(schemas.gstStepSchema),
    mode: 'onTouched',
    defaultValues: {
      gstType: onboarding.draft.gstType,
      gstin: onboarding.draft.gstin,
      legalName: onboarding.draft.legalName,
      pan: onboarding.draft.pan,
    },
  });

  const { control, setError, setValue } = form;
  // `useWatch` rather than `form.watch()` — see LoginPageContent.
  const gstType = useWatch({ control, name: 'gstType' });
  const gstin = useWatch({ control, name: 'gstin' });
  const pan = useWatch({ control, name: 'pan' });
  const registered = gstType !== 'unregistered';

  const gstOptions = useMemo(
    () =>
      GST_TYPES.map((value) => ({
        value,
        label: t(`onboarding.gst.${value}`),
        hint: t(`onboarding.gst.${value}.hint`),
      })),
    [t]
  );

  /**
   * FR-3 — "PAN auto-filled from GSTIN chars 3–12, editable". Filled only while
   * the field is empty, so a merchant who corrected it never sees their
   * correction overwritten by the next keystroke in the GSTIN box.
   */
  useEffect(() => {
    const derived = panFromGstin(gstin);
    if (derived && !pan) setValue('pan', derived);
  }, [gstin, pan, setValue]);

  const mismatch = gstinStateMismatch(gstin, onboarding.draft.stateCode);
  const panMismatch = panMismatchesGstin(pan, gstin);

  const submit = useCallback(
    (values: GstStepFormValues) => onboarding.submitGstStep(values, setError),
    [onboarding, setError]
  );

  const adoptState = useCallback(() => {
    if (mismatch.gstinStateCode) onboarding.adoptGstinState(mismatch.gstinStateCode);
  }, [mismatch.gstinStateCode, onboarding]);

  return (
    <OnboardingStepCard
      title={t('onboarding.step2.title')}
      description={t('onboarding.step2.body')}
    >
      <UbForm form={form} onSubmit={submit} formErrors={onboarding.formErrors}>
        <UbField name="gstType" label={t('onboarding.gst.label')} required>
          {(field) => (
            <UbRadioGroup
              name="gstType"
              value={(field.value as GstType) ?? 'unregistered'}
              onChange={field.onChange}
              options={gstOptions}
              ariaLabel={t('onboarding.gst.label')}
              invalid={field.invalid}
              describedBy={field['aria-describedby']}
            />
          )}
        </UbField>

        {registered && (
          <>
            <UbField
              name="gstin"
              label={t('onboarding.gstin.label')}
              placeholder={t('onboarding.gstin.placeholder')}
              hint={t('onboarding.gstin.hint')}
              required
            >
              {(field) => <UbTextInput {...field} uppercase maxLength={15} autoComplete="off" />}
            </UbField>

            {/* FR-3 — a warning with an offer, never a block. */}
            {mismatch.mismatched && mismatch.gstinStateCode && (
              <UbStatusBanner
                tone="warning"
                title={t('onboarding.gstin.stateMismatch', {
                  state: stateName(mismatch.gstinStateCode, locale),
                })}
                action={
                  <UbButton variant="secondary" size="sm" onClick={adoptState}>
                    {t('onboarding.gstin.useState')}
                  </UbButton>
                }
              />
            )}

            <UbField
              name="legalName"
              label={t('onboarding.legalName.label')}
              placeholder={t('onboarding.legalName.placeholder')}
              optionalLabel={t('common.field.optional')}
            >
              {(field) => <UbTextInput {...field} />}
            </UbField>

            <UbField
              name="pan"
              label={t('onboarding.pan.label')}
              placeholder={t('onboarding.pan.placeholder')}
              optionalLabel={t('common.field.optional')}
              hint={panMismatch ? t('onboarding.pan.mismatch') : undefined}
            >
              {(field) => <UbTextInput {...field} uppercase maxLength={10} />}
            </UbField>
          </>
        )}

        <OnboardingStepActions
          onBack={() => onboarding.goToStep(1)}
          onSkip={() => void onboarding.skipGstStep()}
          continueLabel={t('common.action.continue')}
          busyLabel={t('onboarding.saving')}
          backLabel={t('common.action.back')}
          skipLabel={t('onboarding.skip')}
          busy={onboarding.isSubmitting}
          disabled={!onboarding.canSubmit}
        />
      </UbForm>
    </OnboardingStepCard>
  );
}
