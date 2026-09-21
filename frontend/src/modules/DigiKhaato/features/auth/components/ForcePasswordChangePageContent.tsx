'use client';

import { useCallback } from 'react';

import { useRouter } from 'next/navigation';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';

import { UbButton, UbField, UbForm, UbStack, UbStatusBanner, UbTextInput } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useNowMs } from 'src/hooks/useNowMs';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectSessionUser } from 'src/redux/slice/sessionSlice';
import { ROUTES } from 'src/routes';

import { usePasswordFlow } from '../hooks/usePasswordFlow';
import { useAuthSchemas } from '../validation/authSchemas';

import { AuthPanel } from './AuthPanel';
import { AuthScreenHeading } from './AuthScreenHeading';
import { PasswordStrengthHint } from './PasswordStrengthHint';

import type { ForcePasswordChangeFormValues } from '../validation/authSchemas';

/**
 * DEC-012 — the first screen a member created by an owner ever sees.
 *
 * They arrived with a password somebody else generated and sent them over
 * WhatsApp. The server refuses every other route until they replace it
 * (`common/authentication.py`), so this screen is not a suggestion and there is
 * deliberately **no Skip**: `SetPasswordPageContent` next door has one, because
 * there the account already works and forcing a password on a merchant standing
 * at a counter is how completion drops. Here the account does not work, and a
 * Skip would return them to the guard that sent them here.
 *
 * ── Why it asks for the temporary password again ────────────────────────────
 * They typed it sixty seconds ago, so this is friction. It is the same friction
 * every password change in the product carries, and for the same reason: a
 * session that has been picked up by somebody else — an unlocked phone on a
 * shop counter, which is the normal condition of a shop counter — must not be
 * enough on its own to take the account over. One extra paste from the message
 * they already have open is a fair price for that.
 */
export function ForcePasswordChangePageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const schemas = useAuthSchemas();
  const password = usePasswordFlow();
  const user = useAppSelector(selectSessionUser);
  /** Read outside render: `Date.now()` in the body is a re-render that changes
   *  its own answer, which `react-hooks/purity` is right to refuse. */
  const nowMs = useNowMs();

  const form = useForm<ForcePasswordChangeFormValues>({
    resolver: yupResolver(schemas.forcePasswordChangeSchema),
    mode: 'onTouched',
    defaultValues: { currentPassword: '', password: '' },
  });

  const typed = useWatch({ control: form.control, name: 'password' });

  const submit = useCallback(
    async (values: ForcePasswordChangeFormValues) => {
      const ok = await password.submitForcedChange(values, form.setError);
      // Only on a confirmed success, and only after the hook has re-read the
      // session — otherwise `RequireSession` reads the stale flag and returns
      // them here, which looks to the merchant like the save did nothing.
      if (ok) router.replace(ROUTES.DASHBOARD);
    },
    [password, form, router]
  );

  /**
   * The window ran out. Not a form: nothing they can type here will work, and
   * the only way forward is the owner creating a new password. A change screen
   * that accepts input and then refuses it would send them to try harder at
   * something that cannot succeed.
   */
  const expired = Boolean(
    user?.passwordExpiresAt && Date.parse(user.passwordExpiresAt) <= nowMs
  );

  if (expired) {
    return (
      <UbStack gap={6} className="w-full">
        <AuthScreenHeading
          title={t('team.mustChange.expired.title')}
          description={t('team.mustChange.expired.body')}
        />
        <AuthPanel>
          <UbButton variant="secondary" onClick={() => router.replace(ROUTES.LOGIN)} fullWidth>
            {t('auth.logout.action')}
          </UbButton>
        </AuthPanel>
      </UbStack>
    );
  }

  return (
    <UbStack gap={6} className="w-full">
      <AuthScreenHeading
        title={t('team.mustChange.title')}
        description={t('team.mustChange.body')}
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

          <UbForm form={form} onSubmit={submit} formErrors={password.formErrors}>
            <UbField
              name="currentPassword"
              label={t('team.credentials.password.label')}
              required
            >
              {(field) => (
                <UbTextInput
                  {...field}
                  type="password"
                  autoComplete="current-password"
                  revealLabel={t('auth.password.show')}
                  hideLabel={t('auth.password.hide')}
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
              {t('team.mustChange.submit')}
            </UbButton>
          </UbForm>
        </UbStack>
      </AuthPanel>
    </UbStack>
  );
}
