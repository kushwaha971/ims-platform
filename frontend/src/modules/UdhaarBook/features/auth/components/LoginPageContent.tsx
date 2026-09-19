'use client';

import { useEffect } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';

import {
  UbButton,
  UbCheckbox,
  UbField,
  UbForm,
  UbLink,
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
import { useLogin } from '../hooks/useLogin';
import { useAuthSchemas } from '../validation/authSchemas';

import { AuthScreenHeading } from './AuthScreenHeading';
import { LanguageToggle } from './LanguageToggle';

import type { PasswordLoginFormValues } from '../validation/authSchemas';

/**
 * PLT-02 + CR-2026-09-19-A — the login screen. ONE form: email and password.
 *
 * The two tabs are gone with the OTP flow. So is the "Mobile or email"
 * identifier that had to guess which of the two a merchant meant: the identity
 * is an email, the field says so, and `autoComplete="email"` lets the browser's
 * own password manager fill both fields, which is the thing that actually gets
 * people in.
 *
 * Part 19 §19.1.1 layer 5: it composes `Ub*`, owns no data logic, calls one
 * feature hook, and contains no axios, no Yup arithmetic, no formatting and no
 * permission logic. R-C-9: it renders ALL of its §9 documented states — Initial,
 * Loading, Error (field-level and banner), Disabled (offline and throttled),
 * Partial, Processing and Completed (the redirect).
 *
 * Layout (PLT-01 §7): single column below 640 px with the primary action full
 * width and 44 px so it sits under the thumb; the 420 px card above that
 * breakpoint is the `(auth)` layout's job, not this component's.
 */
export function LoginPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const appName = useAppSelector(selectAppName);
  const schemas = useAuthSchemas();
  const login = useLogin();
  // Mounted here so a session created on this screen routes itself (FR-9).
  useAuthRedirect();

  const form = useForm<PasswordLoginFormValues>({
    resolver: yupResolver(schemas.passwordLoginSchema),
    mode: 'onTouched',
    defaultValues: { email: '', password: '', rememberEmail: true },
  });

  // PLT-01 §8 — the remembered address prefills the field once it is known.
  const { setValue } = form;
  const rememberedEmail = login.rememberedEmail;
  useEffect(() => {
    if (!rememberedEmail) return;
    setValue('email', rememberedEmail);
  }, [rememberedEmail, setValue]);

  const disabled = !login.canSubmit;
  // `useWatch` rather than `form.watch()`: the latter returns a function the
  // React Compiler cannot memoise safely, and a subscription hook is the API
  // RHF provides for reading one field during render.
  const remember = useWatch({ control: form.control, name: 'rememberEmail' });

  return (
    <UbStack gap={5} className="w-full">
      {/* FR-8 — the language picker is the FIRST control on the screen. */}
      <UbStack direction="row" justify="center">
        <LanguageToggle />
      </UbStack>

      <AuthScreenHeading
        centered
        title={t('auth.login.title', { appName })}
        description={t('auth.signInPrompt')}
      />

      {/* §9 "Disabled" — auth needs the network. Say so, and disable the submit
          rather than hiding it: a class-B write is never hidden (§19.10.4). */}
      {login.isOffline && (
        <UbStatusBanner
          tone="offline"
          title={t('common.network.offline')}
          description={t('auth.offline.body')}
        />
      )}

      {/* Alternate C — 429. The form is shut until the countdown ends. */}
      {login.isThrottled && (
        <UbStatusBanner
          tone="warning"
          title={t('auth.login.throttled', { minutes: Math.ceil(login.throttledSeconds / 60) })}
          description={t('auth.throttled.body')}
        />
      )}

      {/* §9 "Error" — anything the fields cannot carry, with the request id.
          A wrong password and a throttle both have a better home than a banner
          and are deliberately excluded here. */}
      {login.error &&
        login.error.code !== 'validation_error' &&
        login.error.code !== 'invalid_credentials' &&
        login.error.code !== 'login_throttled' &&
        login.error.code !== 'rate_limited' && (
          <UbStatusBanner
            tone="error"
            title={login.error.message}
            description={login.error.requestId ?? undefined}
          />
        )}

      <UbForm
        form={form}
        onSubmit={(values) => login.submitPasswordLogin(values, form.setError)}
        formErrors={login.formErrors}
      >
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

        <UbField name="password" label={t('auth.password.label')} required>
          {(field) => (
            <UbTextInput
              {...field}
              type="password"
              autoComplete="current-password"
              revealLabel={t('auth.password.show')}
              hideLabel={t('auth.password.hide')}
              disabled={disabled}
            />
          )}
        </UbField>

        {/* Not a `UbField`: it has no validation and no error line, and a
            second `<label>` over the same control would double its
            accessible name. */}
        <UbCheckbox
          checked={Boolean(remember)}
          onChange={(checked) => form.setValue('rememberEmail', checked)}
          label={t('auth.rememberEmail')}
        />

        <UbButton
          type="submit"
          size="lg"
          fullWidth
          busy={login.isSubmitting}
          busyLabel={t('auth.password.loggingIn')}
          disabled={disabled}
        >
          {t('auth.password.login')}
        </UbButton>

        <UbLink href={ROUTES.FORGOT_PASSWORD} className="self-center py-2">
          {t('auth.password.forgot')}
        </UbLink>
      </UbForm>

      {/* CR-2026-09-19-A — there is no longer an OTP verify that registers a
          user on the way past, so the way to an account has to be visible. */}
      <UbText variant="body-sm" tone="tertiary" align="center">
        {t('auth.signUp.prompt')}{' '}
        <UbLink href={ROUTES.SIGNUP} variant="inherit">
          {t('auth.signUp.link')}
        </UbLink>
      </UbText>

      {/* BR-7 — the service is for adult business use, stated before an account
          exists rather than in a settings page the user never opens. */}
      <UbText variant="caption" tone="muted" align="center">
        {t('auth.adultUseNotice')}
      </UbText>
    </UbStack>
  );
}
