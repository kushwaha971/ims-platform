'use client';

import { useCallback } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';

import {
  UbButton,
  UbField,
  UbForm,
  UbLink,
  UbPhoneInput,
  UbStack,
  UbStatusBanner,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectAppName } from 'src/redux/slice/whiteLabelSlice';
import { ROUTES } from 'src/routes';

import { useAuthRedirect } from '../hooks/useAuthRedirect';
import { useSignUp } from '../hooks/useSignUp';
import { useAuthSchemas } from '../validation/authSchemas';

import { AuthScreenHeading } from './AuthScreenHeading';
import { LanguageToggle } from './LanguageToggle';
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
  const appName = useAppSelector(selectAppName);
  const schemas = useAuthSchemas();
  const signUp = useSignUp();
  useAuthRedirect();

  const form = useForm<SignUpFormValues>({
    resolver: yupResolver(schemas.signUpSchema),
    mode: 'onTouched',
    defaultValues: { name: '', email: '', mobile: '', password: '', confirmPassword: '' },
  });

  const typed = useWatch({ control: form.control, name: 'password' });
  const disabled = !signUp.canSubmit;

  const submit = useCallback(
    (values: SignUpFormValues) => signUp.submitSignUp(values, form.setError),
    [signUp, form]
  );

  return (
    <UbStack gap={5} className="w-full">
      <UbStack direction="row" justify="center">
        <LanguageToggle />
      </UbStack>

      <AuthScreenHeading
        centered
        title={t('auth.signUp.title', { appName })}
        description={t('auth.signUp.body')}
      />

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
          title={t('auth.login.throttled', { minutes: Math.ceil(signUp.throttledSeconds / 60) })}
          description={t('auth.throttled.body')}
        />
      )}

      {/* A `validation_error` is already anchored on the field that caused it —
          "that address is already registered" belongs under the address. */}
      {signUp.error && signUp.error.code !== 'validation_error' && (
        <UbStatusBanner
          tone="error"
          title={signUp.error.message}
          description={signUp.error.requestId ?? undefined}
        />
      )}

      <UbForm form={form} onSubmit={submit} formErrors={signUp.formErrors}>
        {/* PLT-03 BR-7 — the name is asked here and again on step 1 if blank. */}
        <UbField name="name" label={t('auth.name.label')} hint={t('auth.name.hint')}>
          {(field) => <UbTextInput {...field} autoComplete="name" disabled={disabled} />}
        </UbField>

        <UbField name="email" label={t('auth.email.label')} hint={t('auth.email.hint')} required>
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

        {/* CR-2026-09-19-A — mobile stays in the product and stops being the
            identity. It is optional, it is marked optional, and the hint says
            what it is FOR, because a field with no stated purpose on a sign-up
            screen is a field people abandon the form over. */}
        <UbField name="mobile" label={t('auth.mobile.label')} hint={t('auth.mobile.hint')}>
          {(field) => <UbPhoneInput {...field} disabled={disabled} />}
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

        <UbField name="confirmPassword" label={t('auth.password.confirm.label')} required>
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

      <UbText variant="body-sm" tone="tertiary" align="center">
        {t('auth.signUp.haveAccount')}{' '}
        <UbLink href={ROUTES.LOGIN} variant="inherit">
          {t('auth.signIn')}
        </UbLink>
      </UbText>

      <UbText variant="caption" tone="muted" align="center">
        {t('auth.adultUseNotice')}
      </UbText>
    </UbStack>
  );
}
