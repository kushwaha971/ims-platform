'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';

import { UbButton, UbDialog, UbField, UbForm, UbSelect, UbTextInput } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { useRoles } from '../hooks/useRoles';
import { useMemberSchemas } from '../validation/memberSchemas';
import { editableRoleCodes } from '../view-model/memberActions';
import { roleOptionLabel, roleText } from '../view-model/roleDisplay';

import type { UseMemberAdminResult } from '../hooks/useMemberAdmin';
import type { MemberRoleCode } from '../types/role.types';
import type { EditMemberFormValues } from '../validation/memberSchemas';

// Loaded with dynamic(), so its own words come with its own chunk rather than
// with the screen that opens it (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/team';
import 'src/i18n/catalogues/validation';

/**
 * Owner, 12 Oct 2026 — a manager corrects a member's name or changes their
 * role. The add-member dialog's shape, minus the mobile: that number is how
 * the person signs in, and it is theirs to change, not their employer's.
 *
 * The role list is the server's assignable roles with two removals the server
 * also makes — never `owner`, and `admin` only when the viewer IS the owner —
 * plus the member's current role, so a custom role the list does not offer
 * still shows what they are today rather than a blank select.
 */
export function EditMemberDialog({
  admin,
  canWrite,
}: Readonly<{ admin: UseMemberAdminResult; canWrite: boolean }>): React.JSX.Element | null {
  const { t } = useTranslation();
  const { editTarget, closeEdit, submitEdit, isEditing, viewer } = admin;
  const open = editTarget !== null;
  const roles = useRoles(open);
  const formId = useId();
  const [formErrors, setFormErrors] = useState<readonly string[]>([]);

  const currentRole = editTarget?.role ?? 'staff';
  const roleCodes = useMemo(
    () =>
      editableRoleCodes(
        roles.assignable.map((role) => role.code),
        viewer.role,
        currentRole
      ) as MemberRoleCode[],
    [roles.assignable, viewer.role, currentRole]
  );
  const { editMemberSchema } = useMemberSchemas(roleCodes);

  const roleOptions = useMemo(
    () =>
      roleCodes.map((code) => {
        const option = roles.assignable.find((role) => role.code === code);
        if (option) return { value: code, label: roleOptionLabel(t, option) };
        // The member's current role, which this viewer could not have granted
        // (or a custom role the list does not carry): named as the row names it.
        return {
          value: code,
          label: editTarget
            ? roleText(t, {
                code: editTarget.role,
                labelId: editTarget.roleLabelId,
                module: editTarget.roleModule,
                active: editTarget.roleActive,
              }).label
            : code,
        };
      }),
    [roleCodes, roles.assignable, t, editTarget]
  );

  const defaults = useMemo<EditMemberFormValues>(
    () => ({ fullName: editTarget?.fullName ?? '', role: currentRole }),
    [editTarget?.fullName, currentRole]
  );

  const form = useForm<EditMemberFormValues>({
    resolver: yupResolver(editMemberSchema),
    mode: 'onTouched',
    defaultValues: defaults,
  });
  const { reset, setError } = form;

  // Seeded when the dialog OPENS on a member (AddMemberDialog's reasoning).
  // The section mounts this only while there is a target, so the field
  // errors in `useState` start empty on every open without being cleared here.
  useEffect(() => {
    if (open) reset(defaults);
  }, [open, reset, defaults]);

  const submit = useCallback(
    async (values: EditMemberFormValues) => {
      setFormErrors(await submitEdit(values, setError));
    },
    [submitEdit, setError]
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) closeEdit();
    },
    [closeEdit]
  );

  if (!editTarget) return null;

  return (
    <UbDialog
      open
      onOpenChange={handleOpenChange}
      title={t('team.member.edit.title')}
      description={t('team.member.edit.body')}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={closeEdit} disabled={isEditing}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            busy={isEditing}
            busyLabel={t('team.member.edit.submitting')}
            disabled={!canWrite}
          >
            {t('team.member.edit.submit')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={submit} formErrors={formErrors}>
        <UbField
          name="fullName"
          label={t('team.member.name.label')}
          placeholder={t('team.member.name.placeholder')}
          required
        >
          {(field) => <UbTextInput {...field} autoComplete="off" />}
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
      </UbForm>
    </UbDialog>
  );
}
