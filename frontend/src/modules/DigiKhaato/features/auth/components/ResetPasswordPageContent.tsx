'use client';

import { useCallback } from 'react';

import { useSearchParams } from 'next/navigation';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';

import {
  formatRequestReference,
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
import { usePasswordFlow } from '../hooks/usePasswordFlow';
import { useAuthSchemas } from '../validation/authSchemas';

import { AuthPanel } from './AuthPanel';
import { AuthScreenHeading } from './AuthScreenHeading';
import { PasswordStrengthHint } from './PasswordStrengthHint';

import type { PasswordResetConfirmFormValues } from '../validation/authSchemas';

/**
 * PLT-02 FR-5 — the second half of the reset, reached by the link the server
 * creates.
 *
 * It is a route of its own rather than a second panel on `/forgot-password`
 * because the token arrives in a URL, in a different browser session from the
 * one that asked for it as often as not. CR-2026-09-19-A: the token replaces the
 * six-digit code the old flow held in the slice, and a token in the query string
 * is the only piece of state this screen has.
 *
 * The token is NEVER echoed on screen and never logged — it is a credential for
 * the length of one request. A missing one is not an error state, it is somebody
 * who opened the page directly, and the honest thing is to send them back to ask
 * for a link.
 *
 * FR-5: the confirm revokes every other session, and the snackbar says so,
 * because a user whose other devices silently logged out will file a bug.
 */
export function ResetPasswordPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const schemas = useAuthSchemas();
  const password = usePasswordFlow();
  const searchParams = useSearchParams();
  // A session created here routes itself: FR-5 logs the user straight in.
  useAuthRedirect();

  const token = searchParams.get('token') ?? '';

  const form = useForm<PasswordResetConfirmFormValues>({
    resolver: yupResolver(schemas.passwordResetConfirmSchema),
    mode: 'onTouched',
    // CR-2026-09-19-D — no confirmation field: the control has a reveal toggle.
    defaultValues: { password: '' },
  });

  const typed = useWatch({ control: form.control, name: 'password' });

  const submit = useCallback(
    (values: PasswordResetConfirmFormValues) =>
      password.submitResetConfirm(token, values, form.setError),
    [password, form, token]
  );

  if (!token) {
    return (
      <UbStack gap={6} className="w-full">
        <AuthScreenHeading
          title={t('auth.password.reset.noToken.title')}
          description={t('auth.password.reset.noToken.body')}
          variant="h3"
        />
        <UbStack direction="row" justify="center">
          <UbLink href={ROUTES.FORGOT_PASSWORD} className="min-h-11 content-center">
            {t('auth.password.reset.request')}
          </UbLink>
        </UbStack>
      </UbStack>
    );
  }

  return (
    <UbStack gap={6} className="w-full">
      <AuthScreenHeading
        title={t('auth.password.reset.title')}
        description={t('auth.password.reset.body')}
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

          {/* CR-2026-09-19-E, DOCUMENTED EXCEPTION (CASE 4 in src/utils/apiError.ts)
              — this one banner stays,
              and only for `invalid_token`. A spent, expired or forged link
              makes this screen a dead end: the form below it can never succeed,
              so a toast would fade and leave the merchant typing a new password
              into a form that is already finished. Same reasoning as a list
              that could not load at all. `invalid_token` is in
              `LOCALLY_PRESENTED` (src/utils/apiError.ts), so it does not also
              toast. Every OTHER failure on this screen goes to the snackbar. */}
          {password.error?.code === 'invalid_token' && (
            <UbStatusBanner
              tone="error"
              title={password.error.message}
              description={
                password.error.requestId
                  ? formatRequestReference(t('common.error.reference'), password.error.requestId)
                  : undefined
              }
            />
          )}

          <UbForm form={form} onSubmit={submit} formErrors={password.formErrors}>
            <UbField
              name="password"
              label={t('auth.password.new.label')}
              placeholder={t('auth.password.new.placeholder')}
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
                  disabled={!password.canSubmit}
                />
              )}
            </UbField>

            <PasswordStrengthHint password={typeof typed === 'string' ? typed : ''} />

            {/* FR-5, stated before the act rather than discovered after it. */}
            <UbText variant="caption" tone="tertiary">
              {t('auth.password.reset.notice')}
            </UbText>

            <UbButton
              type="submit"
              size="lg"
              fullWidth
              busy={password.isSubmitting}
              busyLabel={t('auth.password.saving')}
              disabled={!password.canSubmit}
            >
              {t('auth.password.reset.submit')}
            </UbButton>
          </UbForm>
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
