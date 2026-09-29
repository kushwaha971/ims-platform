'use client';

import { useCallback, useEffect, useId, useMemo } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';

import {
  UbButton,
  UbDialog,
  UbField,
  UbForm,
  UbPhoneInput,
  UbSelect,
  UbTextInput,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { DEFAULT_INVITE_ROLE } from '../constants/teamDefaults';
import { useRoles } from '../hooks/useRoles';
import { useMemberSchemas } from '../validation/memberSchemas';
import { roleOptionLabel } from '../view-model/roleDisplay';

import type { UseMembersResult } from '../hooks/useMembers';
import type { AddMemberFormValues } from '../validation/memberSchemas';

// Loaded with dynamic(), so its own words come with its own chunk rather than
// with the screen that opens it (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/team';
import 'src/i18n/catalogues/validation';

/**
 * The add-member form (DEC-012).
 *
 * ── Why this asks for a name and the invite form does not ───────────────────
 * An invitation is addressed to a person who will fill in their own details
 * when they accept. Here the owner is creating the account outright, so nobody
 * else is going to supply the name — and a team list of bare email addresses is
 * unreadable the moment there are four of them, which is precisely when an
 * owner starts needing the list.
 *
 * `mobile` is optional and is a channel, never an identity (DEC-010). It is
 * here because the owner is about to WhatsApp this person their password and
 * may as well record the number while they are thinking about it.
 *
 * The submit lives in the dialog's FOOTER via `form={formId}`, like every other
 * dialog in the product.
 */
export function AddMemberDialog({
  members,
}: Readonly<{ members: UseMembersResult }>): React.JSX.Element {
  const { t } = useTranslation();
  // A13: roles from `GET /roles` (module roles of enabled modules included),
  // fetched when the dialog first opens.
  const roles = useRoles(members.addOpen);
  const roleCodes = useMemo(() => roles.assignable.map((role) => role.code), [roles.assignable]);
  const { addMemberSchema } = useMemberSchemas(roleCodes);
  const formId = useId();

  const defaults = useMemo(
    () => ({ fullName: '', email: '', role: DEFAULT_INVITE_ROLE, mobile: '' }),
    []
  );

  const form = useForm<AddMemberFormValues>({
    resolver: yupResolver(addMemberSchema),
    mode: 'onTouched',
    defaultValues: defaults,
  });

  const { reset, setError } = form;
  const { addOpen, closeAdd, submitAdd } = members;

  /**
   * Cleared when the dialog OPENS, not when it closes: clearing on close races
   * the closing animation and blanks the fields while they are still on screen,
   * and throws away what was typed if a stray backdrop tap dismissed it.
   */
  useEffect(() => {
    if (addOpen) reset(defaults);
  }, [addOpen, reset, defaults]);

  const submit = useCallback(
    (values: AddMemberFormValues) => submitAdd(values, setError),
    [submitAdd, setError]
  );

  const roleOptions = useMemo(
    () => roles.assignable.map((role) => ({ value: role.code, label: roleOptionLabel(t, role) })),
    [roles.assignable, t]
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) closeAdd();
    },
    [closeAdd]
  );

  return (
    <UbDialog
      open={addOpen}
      onOpenChange={handleOpenChange}
      title={t('team.member.add.title')}
      description={t('team.member.add.body')}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={closeAdd} disabled={members.isAdding}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            busy={members.isAdding}
            busyLabel={t('team.member.add.submitting')}
            disabled={!members.canWrite}
          >
            {t('team.member.add.submit')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={submit} formErrors={members.addFormErrors}>
        <UbField
          name="fullName"
          label={t('team.member.name.label')}
          placeholder={t('team.member.name.placeholder')}
          hint={t('team.member.name.hint')}
          required
        >
          {(field) => <UbTextInput {...field} autoComplete="off" />}
        </UbField>

        <UbField
          name="email"
          label={t('team.member.email.label')}
          placeholder={t('team.member.email.placeholder')}
          hint={t('team.member.email.hint')}
          required
        >
          {(field) => <UbTextInput {...field} type="email" autoComplete="off" />}
        </UbField>

        <UbField
          name="role"
          label={t('team.member.role.label')}
          placeholder={t('team.member.role.placeholder')}
          required
        >
          {(field) => (
            <UbSelect
              {...field}
              options={roleOptions}
              placeholder={t('team.member.role.placeholder')}
            />
          )}
        </UbField>

        {/* `UbPhoneInput`, as on the party form: the merchant types ten digits
            and the schema wants E.164, so a plain `type="tel"` box refused
            "9890011223" with a format error (UAT D4). */}
        <UbField
          name="mobile"
          label={t('team.member.mobile.label')}
          placeholder={t('team.member.mobile.placeholder')}
          hint={t('team.member.mobile.hint')}
        >
          {(field) => <UbPhoneInput {...field} autoComplete="off" />}
        </UbField>
      </UbForm>
    </UbDialog>
  );
}
