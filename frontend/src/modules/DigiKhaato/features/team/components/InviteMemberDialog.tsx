'use client';

import { useCallback, useEffect, useId, useMemo } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';

import { UbButton, UbDialog, UbField, UbForm, UbSelect, UbTextInput } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { DEFAULT_INVITE_ROLE, INVITABLE_ROLES } from '../constants/teamDefaults';
import { useInvitationSchemas } from '../validation/invitationSchemas';

import type { UseInvitationsResult } from '../hooks/useInvitations';
import type { InviteFormValues } from '../validation/invitationSchemas';

// Loaded with dynamic(), so its own words come with its own chunk rather than
// with the screen that opens it (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/team';
import 'src/i18n/catalogues/validation';

/**
 * The invite form, in a `UbDialog` — a 480 px card on a desktop and a bottom
 * sheet on a phone, which is what `UbDialog` is for and why this is not a page.
 *
 * Two fields and no more. An invitation is an address and a role; anything else
 * the person is (their name, their mobile) is theirs to fill in when they
 * accept, and asking the merchant for it is asking them to type someone else's
 * details from memory.
 *
 * The form is a `UbForm` with an `id`, and the submit lives in the dialog's
 * FOOTER via `form={formId}`. Every dialog in the product puts its actions in
 * the same place (`UbDialog`'s footer slot); a submit button inside the body
 * would put this one somewhere else and break that for one screen.
 */
export function InviteMemberDialog({
  invitations,
}: Readonly<{ invitations: UseInvitationsResult }>): React.JSX.Element {
  const { t } = useTranslation();
  const { inviteSchema } = useInvitationSchemas();
  const formId = useId();

  const form = useForm<InviteFormValues>({
    resolver: yupResolver(inviteSchema),
    mode: 'onTouched',
    defaultValues: { email: '', role: DEFAULT_INVITE_ROLE },
  });

  const { reset, setError } = form;
  const { inviteOpen, closeInvite, submitInvite } = invitations;

  /**
   * The form is cleared when the dialog OPENS, not when it closes.
   *
   * Clearing on close races the closing animation and blanks the fields while
   * they are still on screen; it also throws away what the merchant typed if
   * the dialog is dismissed by a stray backdrop tap. Clearing on open means a
   * second invite starts empty, which is the only case that matters.
   */
  useEffect(() => {
    if (inviteOpen) reset({ email: '', role: DEFAULT_INVITE_ROLE });
  }, [inviteOpen, reset]);

  const submit = useCallback(
    (values: InviteFormValues) => submitInvite(values, setError),
    [submitInvite, setError]
  );

  const roleOptions = useMemo(
    () => INVITABLE_ROLES.map((role) => ({ value: role, label: t(`tenant.role.${role}`) })),
    [t]
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) closeInvite();
    },
    [closeInvite]
  );

  return (
    <UbDialog
      open={inviteOpen}
      onOpenChange={handleOpenChange}
      title={t('team.invite.dialog.title')}
      description={t('team.invite.dialog.body')}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={closeInvite} disabled={invitations.isInviting}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            busy={invitations.isInviting}
            busyLabel={t('team.invite.submitting')}
            // §19.10.4 — a class-C write is DISABLED, not hidden, with no
            // signal: it is coming back, and hiding it would read as the
            // product taking the feature away.
            disabled={!invitations.canWrite}
          >
            {t('team.invite.submit')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={submit} formErrors={invitations.inviteFormErrors}>
        <UbField
          name="email"
          label={t('team.invite.email.label')}
          placeholder={t('team.invite.email.placeholder')}
          hint={t('team.invite.email.hint')}
          required
        >
          {(field) => <UbTextInput {...field} type="email" autoComplete="email" />}
        </UbField>

        <UbField
          name="role"
          label={t('team.invite.role.label')}
          placeholder={t('team.invite.role.placeholder')}
          required
        >
          {(field) => (
            <UbSelect
              {...field}
              options={roleOptions}
              placeholder={t('team.invite.role.placeholder')}
            />
          )}
        </UbField>
      </UbForm>
    </UbDialog>
  );
}
