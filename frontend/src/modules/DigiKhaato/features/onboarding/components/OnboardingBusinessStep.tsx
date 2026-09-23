'use client';

import { useCallback, useMemo } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';

import { UbCombobox, UbDivider, UbField, UbForm, UbStack, UbTextInput } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectLocale } from 'src/redux/slice/localeSlice';

import { GST_STATES } from '../constants/gstStates';
import { useOnboardingSchemas } from '../validation/onboardingSchemas';

import { BusinessTypeGrid } from './BusinessTypeGrid';
import { OnboardingStepActions } from './OnboardingStepActions';
import { OnboardingStepCard } from './OnboardingStepCard';

import type { BusinessType } from '../constants/businessTypes';
import type { UseOnboardingResult } from '../hooks/useOnboarding';
import type { BusinessStepFormValues } from '../validation/onboardingSchemas';

/**
 * PLT-03 FR-2 — step 1: business name, owner name (BR-7, only when blank), the
 * nine-tile type grid and the state.
 *
 * This is the step that CREATES the tenant, which is why it is the only one
 * without a Skip: a wizard cannot patch a business that does not exist yet.
 *
 * CR-2026-09-19-D — this is also where the name that used to be asked on the
 * sign-up screen now lands. BR-7 always said step 1 would ask again when
 * `platform_user.full_name` is blank; removing it from sign-up simply makes
 * this the only place it is asked. It is the one optional field among three
 * required ones here, so it is the one that is marked — which is the whole
 * argument for marking the minority rather than starring the majority.
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
    <OnboardingStepCard
      title={t('onboarding.step1.title')}
      description={t('onboarding.step1.body')}
    >
      <UbForm form={form} onSubmit={submit} formErrors={onboarding.formErrors}>
        {/* ── CR-2026-09-19-F: the two real inputs are their own group ───────
            Nine tiles in a 3×3 grid against two lone fields above them is a
            step that looks like a tile picker with some typing attached. The
            fields that name the business — what it is called, who runs it, and
            the state its bills are taxed in — are one group on their own
            surface, and the tiles are a labelled SECTION beneath, with a
            divider between the two. The state moved up into the group: it is a
            select, not a tile, and it was the field stranded under the grid. */}
        <UbStack gap={4} className="rounded-card border border-border-subtle p-4 sm:p-5">
          <UbField
            name="name"
            label={t('onboarding.name.label')}
            placeholder={t('onboarding.name.placeholder')}
            required
          >
            {/* `autoComplete="off"`, not `"organization"`.
                That token means "the company this person belongs to", so Chrome
                offered its saved address-book entries — and because the field is
                also autofocused, the list opened on page load with no gesture,
                covering the form underneath. Reported as autofill overlapping
                the screen.
                It was also simply the wrong token: the merchant is NAMING a new
                business here, not recalling an existing employer, so every
                suggestion Chrome had was guaranteed to be wrong. The autofocus
                stays — first field of a wizard is where the cursor belongs. */}
            {(field) => <UbTextInput {...field} autoComplete="off" autoFocus />}
          </UbField>

          {/* BR-7 — asked here only when `platform_user.full_name` is still
              blank, which is the case for a sign-up that left the optional name
              field empty (CR-2026-09-19-A) or an invited member who never
              filled it. */}
          {onboarding.needsOwnerName && (
            <UbField
              name="ownerName"
              label={t('onboarding.ownerName.label')}
              placeholder={t('onboarding.ownerName.placeholder')}
              optionalLabel={t('common.field.optional')}
            >
              {(field) => <UbTextInput {...field} autoComplete="name" />}
            </UbField>
          )}

          <UbField
            name="stateCode"
            label={t('onboarding.state.label')}
            placeholder={t('onboarding.state.placeholder')}
            hint={t('onboarding.state.hint')}
            required
          >
            {(field) => (
              <UbCombobox
                {...field}
                options={stateOptions}
                placeholder={t('onboarding.state.placeholder')}
                searchPlaceholder={t('onboarding.state.search')}
                emptyLabel={t('onboarding.state.empty')}
              />
            )}
          </UbField>
        </UbStack>

        <UbDivider decorative />

        <UbField
          name="businessType"
          label={t('onboarding.type.label')}
          placeholder={t('onboarding.type.placeholder')}
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
    </OnboardingStepCard>
  );
}
