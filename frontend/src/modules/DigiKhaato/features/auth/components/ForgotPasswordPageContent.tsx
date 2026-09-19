'use client';

import { useCallback } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';

import {
  UbButton,
  UbField,
  UbForm,
  UbLink,
  UbStack,
  UbStatusBanner,
  UbTextInput,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';

import { usePasswordFlow } from '../hooks/usePasswordFlow';
import { useAuthSchemas } from '../validation/authSchemas';

import { AuthPanel } from './AuthPanel';
import { AuthScreenHeading } from './AuthScreenHeading';

import type { PasswordResetRequestFormValues } from '../validation/authSchemas';

/**
 * PLT-02 FR-4 — ask for a reset link.
 *
 * **FR-4 / BR-2, and the copy that keeps it honest.** The response is identical
 * for an address nobody has, so this screen never says "no such account" — and,
 * just as important, never says "check your inbox" either. At MVP the mail
 * backend is Django's console backend: the link is written to the SERVER LOG and
 * no message leaves the machine. Promising an email that will not arrive is how
 * a user sits refreshing a mailbox for ten minutes and then files a bug.
 *
 * So the confirmation says exactly what happened — "if that address is
 * registered, a reset link has been created" — and says where to find it. It is
 * one sentence that is true whether or not the account exists, which is what
 * makes it safe to show to everybody.
 *
 * §9 states: Initial · Loading · Completed (the panel) · Error (banner; a
 * malformed address is anchored on the field) · Disabled (offline, throttled).
 */
export function ForgotPasswordPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const schemas = useAuthSchemas();
  const password = usePasswordFlow();

  const form = useForm<PasswordResetRequestFormValues>({
    resolver: yupResolver(schemas.passwordResetRequestSchema),
    mode: 'onTouched',
    defaultValues: { email: '' },
  });

  const submit = useCallback(
    (values: PasswordResetRequestFormValues) => password.submitResetRequest(values, form.setError),
    [password, form]
  );

  return (
    <UbStack gap={6} className="w-full">
      {/* Once the request is in, the banner below IS the answer. Repeating the
          body copy here would put the same sentence on screen twice and give a
          screen reader two things to read for one event. */}
      <AuthScreenHeading
        title={t('auth.password.forgot.title')}
        description={password.resetRequested ? undefined : t('auth.password.forgot.body')}
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

          {password.throttledSeconds > 0 && (
            <UbStatusBanner
              tone="warning"
              title={t('auth.login.throttled', {
                minutes: Math.ceil(password.throttledSeconds / 60),
              })}
              description={t('auth.throttled.body')}
            />
          )}

          {password.error &&
            password.error.code !== 'validation_error' &&
            password.error.code !== 'login_throttled' &&
            password.error.code !== 'rate_limited' && (
              <UbStatusBanner
                tone="error"
                title={password.error.message}
                description={password.error.requestId ?? undefined}
              />
            )}

          {password.resetRequested ? (
            <UbStack gap={4}>
              {/* Deliberately NOT a success toast and NOT "we sent an email": the
                  only thing that is certainly true is that the request went
                  through. `role="status"` so a screen reader hears the change. */}
              <UbStatusBanner
                tone="info"
                title={t('auth.password.reset.sent')}
                description={t('auth.password.reset.sentWhere')}
              />
              <UbButton variant="ghost" onClick={password.startOverRequest}>
                {t('auth.password.reset.tryAnother')}
              </UbButton>
            </UbStack>
          ) : (
            <UbForm form={form} onSubmit={submit} formErrors={password.formErrors}>
              <UbField name="email" label={t('auth.email.label')} required>
                {(field) => (
                  <UbTextInput
                    {...field}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    disabled={!password.canSubmit}
                  />
                )}
              </UbField>

              <UbButton
                type="submit"
                size="lg"
                fullWidth
                busy={password.isSubmitting}
                busyLabel={t('auth.password.reset.sending')}
                disabled={!password.canSubmit}
              >
                {t('auth.password.reset.request')}
              </UbButton>
            </UbForm>
          )}
        </UbStack>
      </AuthPanel>

      <UbStack direction="row" justify="center">
        <UbLink href={ROUTES.LOGIN} className="min-h-11 content-center">
          {t('auth.backToLogin')}
        </UbLink>
      </UbStack>
    </UbStack>
  );
}
