'use client';

import { useCallback } from 'react';

import { useRouter } from 'next/navigation';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';

import { UbButton, UbField, UbForm, UbStack, UbStatusBanner, UbTextInput } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { onboardingStepPath } from 'src/routes';

import { usePasswordFlow } from '../hooks/usePasswordFlow';
import { useAuthSchemas } from '../validation/authSchemas';

import { AuthPanel } from './AuthPanel';
import { AuthScreenHeading } from './AuthScreenHeading';
import { PasswordStrengthHint } from './PasswordStrengthHint';

import type { PasswordSetFormValues } from '../validation/authSchemas';

/**
 * PLT-02 FR-3 — "Set your password", for an account that reached a session
 * without one.
 *
 * **CR-2026-09-19-A narrowed what reaches this screen.** Sign-up now sets a
 * password by definition, so the route no longer sits between an OTP verify and
 * the wizard. What is left is the invitation path (PLT-05), where a member
 * accepts an invite and has no password yet, and `postAuthDestination()`'s
 * `setPassword` branch, which is what routes them here.
 *
 * Skip is allowed (FR-3): forcing a password on a merchant standing at a counter
 * is how completion drops, and the account still has its invitation-issued
 * session. The skip goes straight on to the wizard; the user stays logged in
 * either way (FR-9).
 *
 * §9 states: Initial · Partial (the strength hint updates live) · Processing ·
 * Completed (snackbar, then onward) · Failed (server rules, anchored on the
 * field) · Disabled (offline).
 */
export function SetPasswordPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const schemas = useAuthSchemas();
  const password = usePasswordFlow();

  const form = useForm<PasswordSetFormValues>({
    resolver: yupResolver(schemas.passwordSetSchema),
    mode: 'onTouched',
    // CR-2026-09-19-D — no confirmation field: the control has a reveal toggle.
    defaultValues: { name: '', password: '' },
  });

  const typed = useWatch({ control: form.control, name: 'password' });

  const submit = useCallback(
    async (values: PasswordSetFormValues) => {
      await password.submitSetPassword(values, form.setError);
      // The wizard is the next step whether a password was set or skipped; a
      // failed submit leaves `error` set and the form on screen.
      if (!password.error) router.replace(onboardingStepPath(1));
    },
    [password, form, router]
  );

  const skip = useCallback(() => {
    router.replace(onboardingStepPath(1));
  }, [router]);

  return (
    <UbStack gap={6} className="w-full">
      <AuthScreenHeading
        title={t('auth.password.set.title')}
        description={t('auth.password.set.body')}
      />

      <AuthPanel>
        <UbStack gap={4}>
          {password.isOffline && (
            <UbStatusBanner
              tone="offline"
              title={t('common.network.offline')}
              description={t('auth.offline.body')}
            />
          )}

          {/* CR-2026-09-19-E — no error banner: the snackbar is the channel. */}

          <UbForm form={form} onSubmit={submit} formErrors={password.formErrors}>
            {/* PLT-03 BR-7 — the name is asked here and again on step 1 if blank,
                which is exactly what makes it the one OPTIONAL field on the screen.
                CR-2026-09-19-D: marked as such, rather than leaving the other two
                marked required with an asterisk and this one bare. */}
            <UbField
              name="name"
              label={t('auth.name.label')}
              placeholder={t('auth.name.placeholder')}
              optionalLabel={t('common.field.optional')}
            >
              {(field) => <UbTextInput {...field} autoComplete="name" />}
            </UbField>

            <UbField
              name="password"
              label={t('auth.password.label')}
              placeholder={t('auth.password.placeholder')}
              hint={t('auth.password.rule')}
              required
            >
              {(field) => (
                <UbTextInput
                  {...field}
                  type="password"
                  autoComplete="new-password"
                  revealLabel={t('auth.password.show')}
                  hideLabel={t('auth.password.hide')}
                />
              )}
            </UbField>

            <PasswordStrengthHint password={typeof typed === 'string' ? typed : ''} />

            <UbButton
              type="submit"
              size="lg"
              fullWidth
              busy={password.isSubmitting}
              busyLabel={t('auth.password.saving')}
              disabled={!password.canSubmit}
            >
              {t('auth.password.save')}
            </UbButton>

            <UbButton variant="ghost" onClick={skip} disabled={password.isSubmitting}>
              {t('auth.password.skip')}
            </UbButton>
          </UbForm>
        </UbStack>
      </AuthPanel>
    </UbStack>
  );
}
