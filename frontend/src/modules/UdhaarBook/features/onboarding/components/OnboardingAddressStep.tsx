'use client';

import { useCallback } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';

import { UbCard, UbField, UbForm, UbGrid, UbPhoneInput, UbTextInput } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { useOnboardingSchemas } from '../validation/onboardingSchemas';

import { OnboardingStepActions } from './OnboardingStepActions';

import type { UseOnboardingResult } from '../hooks/useOnboarding';
import type { AddressStepFormValues } from '../validation/onboardingSchemas';

/**
 * PLT-03 FR-4 — step 3: the shop's address and contact.
 *
 * EVERY field here is optional (FR-10: "Skip for now … leaves `address={}` and
 * `phone` = user mobile"). That is deliberate and it is the reason the wizard
 * finishes in under 90 seconds: the address is needed on a tax invoice, not on
 * a khata, and PLT-07 is where a merchant fills it in when they first print
 * something.
 *
 * The four short fields are a two-column grid from `sm` and a single column
 * below it — a 320 px screen never renders two inputs side by side.
 */
export function OnboardingAddressStep({
  onboarding,
}: Readonly<{ onboarding: UseOnboardingResult }>): React.JSX.Element {
  const { t } = useTranslation();
  const schemas = useOnboardingSchemas();

  const form = useForm<AddressStepFormValues>({
    resolver: yupResolver(schemas.addressStepSchema),
    mode: 'onTouched',
    defaultValues: {
      line1: onboarding.draft.address.line1,
      line2: onboarding.draft.address.line2,
      city: onboarding.draft.address.city,
      district: onboarding.draft.address.district,
      pincode: onboarding.draft.address.pincode,
      phone: onboarding.draft.phone,
      email: onboarding.draft.email,
    },
  });

  const { setError } = form;
  const submit = useCallback(
    (values: AddressStepFormValues) => onboarding.submitAddressStep(values, setError),
    [onboarding, setError]
  );

  return (
    <UbCard title={t('onboarding.step3.title')} description={t('onboarding.step3.body')}>
      <UbForm form={form} onSubmit={submit} formErrors={onboarding.formErrors}>
        <UbField name="line1" label={t('onboarding.address.line1')}>
          {(field) => <UbTextInput {...field} autoComplete="address-line1" />}
        </UbField>

        <UbField name="line2" label={t('onboarding.address.line2')}>
          {(field) => <UbTextInput {...field} autoComplete="address-line2" />}
        </UbField>

        <UbGrid columns={{ base: 1, sm: 2 }} gap={4}>
          <UbField name="city" label={t('onboarding.address.city')}>
            {(field) => <UbTextInput {...field} autoComplete="address-level2" />}
          </UbField>

          <UbField name="district" label={t('onboarding.address.district')}>
            {(field) => <UbTextInput {...field} />}
          </UbField>

          <UbField name="pincode" label={t('onboarding.address.pincode')}>
            {(field) => (
              <UbTextInput {...field} inputMode="numeric" maxLength={6} autoComplete="postal-code" />
            )}
          </UbField>

          {/* BR-6 — defaults to the owner's mobile, which the server fills when
              this is left empty. */}
          <UbField
            name="phone"
            label={t('onboarding.phone.label')}
            hint={t('onboarding.phone.hint')}
          >
            {(field) => <UbPhoneInput {...field} />}
          </UbField>
        </UbGrid>

        <UbField name="email" label={t('onboarding.email.label')}>
          {(field) => <UbTextInput {...field} type="email" autoComplete="email" />}
        </UbField>

        <OnboardingStepActions
          onBack={() => onboarding.goToStep(2)}
          onSkip={() => void onboarding.skipAddressStep()}
          continueLabel={t('common.action.continue')}
          busyLabel={t('onboarding.saving')}
          backLabel={t('common.action.back')}
          skipLabel={t('onboarding.skip')}
          busy={onboarding.isSubmitting}
          disabled={!onboarding.canSubmit}
        />
      </UbForm>
    </UbCard>
  );
}
