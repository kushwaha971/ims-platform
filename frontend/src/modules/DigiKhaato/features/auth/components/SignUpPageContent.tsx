'use client';

import { useCallback } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';

import {
  UbButton,
  UbField,
  UbForm,
  UbLink,
  UbStack,
  UbStatusBanner,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';

import { useAuthRedirect } from '../hooks/useAuthRedirect';
import { useSignUp } from '../hooks/useSignUp';
import { useAuthSchemas } from '../validation/authSchemas';

import { AuthPanel } from './AuthPanel';
import { AuthScreenHeading } from './AuthScreenHeading';
import { PasswordStrengthHint } from './PasswordStrengthHint';

import type { SignUpFormValues } from '../validation/authSchemas';

/**
 * CR-2026-09-19-A FR-S1 — "Create your account".
 *
 * It exists because the OTP verify it replaces used to register a user as a side
 * effect of proving a phone number, and nothing does that now. Making sign-up
 * implicit again — "log in with an address nobody has and we will make you one"
 * — would mean a typo in an email address silently creating a second, empty
 * business, which is the worst failure this product can have.
 *
 * ── CR-2026-09-19-D: the form now matches the sentence above it ─────────────
 * The screen said *"An email address and a password. Nothing else to set up."*
 * and then asked for five fields: name, email, mobile, password, confirm
 * password. It is two fields now, and the sentence is true.
 *
 *  · **Name** moved to step 1 of the wizard, which already asks for it
 *    (`onboarding.ownerName.label`, PLT-03 BR-7) — one screen later, by which
 *    point the person has an account and is invested, and where it sits beside
 *    the business name it will be printed next to.
 *  · **Mobile** moved out. It is a profile field, not a credential
 *    (CR-2026-09-19-A), and the first thing the product does with it is send a
 *    reminder months later. Asking for it on the account-creation screen buys
 *    nothing and is the single most common reason a sign-up form is abandoned
 *    in this market. PLT-07's `/profile` is its home; until that screen ships
 *    the field is simply not collected, and `auth.mobile.*` is kept in both
 *    locales for it.
 *  · **Confirm password** is gone. It exists to catch a typo in a field you
 *    cannot see — and this field has a reveal toggle, has done since PLT-02
 *    FR-8. Keeping both is asking the user to type a password twice AND giving
 *    them a way to check it. Reset and set-password lost it for the same reason.
 *
 * What is left is progressive disclosure done where it pays: three fields fewer
 * on the screen that decides whether somebody becomes a user at all.
 *
 * On success the session cookies exist, so this screen does not navigate:
 * `useAuthRedirect` sees the result and sends a new account into PLT-03's
 * wizard, exactly as it did after an OTP verify.
 *
 * §9 states: Initial · Partial (the strength hint updates live) · Loading ·
 * Processing · Error (field-level for a taken address or a refused password,
 * banner for anything else) · Disabled (offline, throttled) · Completed (the
 * redirect).
 */
export function SignUpPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const schemas = useAuthSchemas();
  const signUp = useSignUp();
  useAuthRedirect();

  const form = useForm<SignUpFormValues>({
    resolver: yupResolver(schemas.signUpSchema),
    mode: 'onTouched',
    defaultValues: { email: '', password: '' },
  });

  const typed = useWatch({ control: form.control, name: 'password' });
  const disabled = !signUp.canSubmit;

  const submit = useCallback(
    (values: SignUpFormValues) => signUp.submitSignUp(values, form.setError),
    [signUp, form]
  );

  return (
    <UbStack gap={6} className="w-full">
      <AuthScreenHeading title={t('auth.signUp.heading')} description={t('auth.signUp.body')} />

      <AuthPanel>
        <UbStack gap={4}>
          {signUp.isOffline && (
            <UbStatusBanner
              tone="offline"
              title={t('common.network.offline')}
              description={t('auth.offline.body')}
            />
          )}

          {signUp.isThrottled && (
            <UbStatusBanner
              tone="warning"
              title={t('auth.login.throttled', {
                minutes: Math.ceil(signUp.throttledSeconds / 60),
              })}
              description={t('auth.throttled.body')}
            />
          )}

          {/* A `validation_error` is already anchored on the field that caused
              it — "that address is already registered" belongs under the
              address. */}
          {signUp.error && signUp.error.code !== 'validation_error' && (
            <UbStatusBanner
              tone="error"
              title={signUp.error.message}
              description={signUp.error.requestId ?? undefined}
            />
          )}

          <UbForm form={form} onSubmit={submit} formErrors={signUp.formErrors}>
            <UbField name="email" label={t('auth.email.label')} required>
              {(field) => (
                <UbTextInput
                  {...field}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={disabled}
                />
              )}
            </UbField>

            <UbField
              name="password"
              label={t('auth.password.label')}
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
                  disabled={disabled}
                />
              )}
            </UbField>

            <PasswordStrengthHint password={typeof typed === 'string' ? typed : ''} />

            <UbButton
              type="submit"
              size="lg"
              fullWidth
              busy={signUp.isSubmitting}
              busyLabel={t('auth.signUp.creating')}
              disabled={disabled}
            >
              {t('auth.signUp.submit')}
            </UbButton>
          </UbForm>
        </UbStack>
      </AuthPanel>

      <UbText variant="body-sm" tone="tertiary" align="center">
        {t('auth.signUp.haveAccount')}{' '}
        <UbLink href={ROUTES.LOGIN} variant="inherit">
          {t('auth.signIn')}
        </UbLink>
      </UbText>
    </UbStack>
  );
}
