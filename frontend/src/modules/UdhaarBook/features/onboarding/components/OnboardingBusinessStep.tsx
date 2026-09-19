'use client';

import { useCallback, useMemo } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';

import { UbCard, UbField, UbForm, UbSelect, UbTextInput } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectLocale } from 'src/redux/slice/localeSlice';

import { GST_STATES } from '../constants/gstStates';
import { useOnboardingSchemas } from '../validation/onboardingSchemas';

import { BusinessTypeGrid } from './BusinessTypeGrid';
import { OnboardingStepActions } from './OnboardingStepActions';

import type { BusinessType } from '../constants/businessTypes';
import type { UseOnboardingResult } from '../hooks/useOnboarding';
import type { BusinessStepFormValues } from '../validation/onboardingSchemas';

/**
 * PLT-03 FR-2 — step 1: business name, owner name (BR-7, only when blank), the
 * nine-tile type grid and the state.
 *
 * This is the step that CREATES the tenant, which is why it is the only one
 * without a Skip: a wizard cannot patch a business that does not exist yet.
 */
export function OnboardingBusinessStep({
  onboarding,
}: Readonly<{ onboarding: UseOnboardingResult }>): React.JSX.Element {
  const { t } = useTranslation();
  const locale = useAppSelector(selectLocale);
  const schemas = useOnboardingSchemas();

  const form = useForm<BusinessStepFormValues>({
    resolver: yupResolver(schemas.businessStepSchema),
    mode: 'onTouched',
    defaultValues: {
      name: onboarding.draft.name,
      businessType: onboarding.draft.businessType ?? '',
      stateCode: onboarding.draft.stateCode ?? '',
      ownerName: onboarding.draft.ownerName,
    },
  });

  const stateOptions = useMemo(
    () => GST_STATES.map((state) => ({ value: state.code, label: state[locale] })),
    [locale]
  );

  const { setError } = form;
  const submit = useCallback(
    (values: BusinessStepFormValues) => onboarding.submitBusinessStep(values, setError),
    [onboarding, setError]
  );

  return (
    <UbCard title={t('onboarding.step1.title')} description={t('onboarding.step1.body')}>
      <UbForm form={form} onSubmit={submit} formErrors={onboarding.formErrors}>
        <UbField name="name" label={t('onboarding.name.label')} required>
          {(field) => <UbTextInput {...field} autoComplete="organization" autoFocus />}
        </UbField>

        {/* BR-7 — asked here only when `platform_user.full_name` is still blank,
            which is the case for a sign-up that left the optional name field
            empty (CR-2026-09-19-A) or an invited member who never filled it. */}
        {onboarding.needsOwnerName && (
          <UbField name="ownerName" label={t('onboarding.ownerName.label')}>
            {(field) => <UbTextInput {...field} autoComplete="name" />}
          </UbField>
        )}

        <UbField
          name="businessType"
          label={t('onboarding.type.label')}
          hint={t('onboarding.type.hint')}
          required
        >
          {(field) => (
            <BusinessTypeGrid
              value={(field.value as BusinessType | '') || ''}
              onChange={field.onChange}
              invalid={field.invalid}
              describedBy={field['aria-describedby']}
              ariaLabel={t('onboarding.type.label')}
            />
          )}
        </UbField>

        <UbField
          name="stateCode"
          label={t('onboarding.state.label')}
          hint={t('onboarding.state.hint')}
          required
        >
          {(field) => (
            <UbSelect
              {...field}
              options={stateOptions}
              placeholder={t('onboarding.state.placeholder')}
            />
          )}
        </UbField>

        <OnboardingStepActions
          onBack={null}
          continueLabel={t('common.action.continue')}
          busyLabel={t('onboarding.creating')}
          backLabel={t('common.action.back')}
          skipLabel={t('onboarding.skip')}
          busy={onboarding.isSubmitting}
          disabled={!onboarding.canSubmit}
        />
      </UbForm>
    </UbCard>
  );
}
