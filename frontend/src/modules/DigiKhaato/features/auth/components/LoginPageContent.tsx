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

import { AuthPanel } from './AuthPanel';
import { AuthScreenHeading } from './AuthScreenHeading';

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
 * ── CR-2026-09-19-D, what changed on this screen ────────────────────────────
 *  · The language toggle is gone from the top. It is a globe dropdown in the
 *    page footer now — see `LanguagePicker` for why "first control on the
 *    screen" was the wrong reading of FR-8.
 *  · The heading is two parts: "Sign in", then the quieter "to open your
 *    DigiKhaato book". A mark sits above it, in `AuthShell`.
 *  · The hint under the address field — "The address you signed up with" — is
 *    gone. It said what the label said. The password rule stays, because a rule
 *    the user cannot guess is the one kind of hint worth the line.
 *  · The asterisk after each required label is gone; `aria-required` on the
 *    control replaced it (see `UbField`). Both fields here are required, so the
 *    asterisks marked everything and said nothing.
 *  · "Forgot password?" moved out of the middle of the form to the row under
 *    the submit, so the form is two fields, a tick and a button, in that order.
 *  · The legal line moved to the footer, where its links live.
 *
 * Part 19 §19.1.1 layer 5: it composes `Ub*`, owns no data logic, calls one
 * feature hook, and contains no axios, no Yup arithmetic, no formatting and no
 * permission logic. R-C-9: it renders ALL of its §9 documented states — Initial,
 * Loading, Error (field-level and banner), Disabled (offline and throttled),
 * Partial, Processing and Completed (the redirect).
 *
 * ── Why login did NOT get the Zoho/Notion "one field, then Next" split ──────
 * Both references ask for an identifier, then reveal the password on a second
 * step, because both have several ways to authenticate and the first answer
 * decides which one you get. This product has exactly one, so the split would
 * buy no branch and cost two real things: a second round trip before a merchant
 * on a patchy connection can type their password, and a password manager's
 * ability to fill both fields in one pass. Progressive disclosure is for forms
 * with something to disclose — which is the sign-up screen, where it removed
 * three fields.
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
    <UbStack gap={6} className="w-full">
      <AuthScreenHeading
        title={t('auth.signIn')}
        description={t('auth.signInPrompt', { appName })}
      />

      <AuthPanel>
        <UbStack gap={4}>
          {/* §9 "Disabled" — auth needs the network. Say so, and disable the
              submit rather than hiding it: a class-B write is never hidden
              (§19.10.4). */}
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

          {/* CR-2026-09-19-E — there was a §9 "Error" banner here, repeating
              whatever the server said with its request id. It is gone: an API
              failure now surfaces once, from the transport, through the single
              snackbar channel (§19.12.2). This screen contains no error-toast
              code and no error-rendering code at all; the two banners above are
              NETWORK and THROTTLE states, not failure reports, and the wrong
              password lands under the password field (see `useLogin`). */}

          <UbForm
            form={form}
            onSubmit={(values) => login.submitPasswordLogin(values, form.setError)}
            formErrors={login.formErrors}
          >
            <UbField
              name="email"
              label={t('auth.email.label')}
              placeholder={t('auth.email.placeholder')}
              required
            >
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
              placeholder={t('auth.password.placeholder')}
              required
            >
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
              size="md"
              fullWidth
              busy={login.isSubmitting}
              busyLabel={t('auth.password.loggingIn')}
              disabled={disabled}
            >
              {t('auth.password.login')}
            </UbButton>
          </UbForm>

          {/* "Forgot password?" is not offered: the reset email has no
              delivery provider yet (BACKLOG — email), so the link led to a
              flow whose message never arrives. The route stays for the day
              it does. */}
        </UbStack>
      </AuthPanel>

      {/* CR-2026-09-19-A — there is no longer an OTP verify that registers a
          user on the way past, so the way to an account has to be visible.
          Last, and outside the panel: a secondary route out of this screen,
          which is where all three references put it. */}
      <UbText variant="body-sm" tone="tertiary" align="center">
        {t('auth.signUp.prompt', { appName })}{' '}
        <UbLink href={ROUTES.SIGNUP} variant="inherit">
          {t('auth.signUp.link')}
        </UbLink>
      </UbText>
    </UbStack>
  );
}
