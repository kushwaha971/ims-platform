'use client';

import { useId } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';

import {
  UbButton,
  UbDateInput,
  UbDrawer,
  UbField,
  UbForm,
  UbLink,
  UbText,
  UbTextArea,
  UbTextInput,
} from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { ROUTES } from 'src/routes';
import type { ApiErrorShape } from 'src/types/api.types';
import { applyServerErrors } from 'src/utils/applyServerErrors';

import { useMemberSchemas } from '../validation/memberSchemas';

import type { MemberEditBody } from '../api/libraryMemberService';
import type { ActOutcome } from '../hooks/useMemberDetail';
import type { MemberDetail, MemberEditFormValues } from '../types/member.types';

// Loaded with dynamic(), so its words come with its own chunk.
import 'src/i18n/catalogues/library';
// useMemberSchemas builds the admission schema too, whose payment lines speak payments.*.
import 'src/i18n/catalogues/payments';
import 'src/i18n/catalogues/validation';

const EDIT_FIELDS = ['memberNumber', 'groupLabel', 'validUntil', 'notes'] as const;
/** Server field paths → the drawer's own names. */
const SERVER_FIELD: Readonly<Record<string, (typeof EDIT_FIELDS)[number]>> = {
  member_number: 'memberNumber',
  group_label: 'groupLabel',
  valid_until: 'validUntil',
  notes: 'notes',
};

const valuesOf = (member: MemberDetail): MemberEditFormValues => ({
  memberNumber: member.memberNumber,
  groupLabel: member.groupLabel,
  validUntil: member.validUntil ?? '',
  notes: member.notes,
});

/**
 * Only what the owner changed, trimmed, so the request IS the edit: an untouched
 * field is neither re-validated nor re-written, and an empty diff sends nothing.
 * A cleared end date goes as `null` — "no end date" — never as `''`.
 */
export const changedFields = (
  member: MemberDetail,
  values: MemberEditFormValues
): MemberEditBody => {
  const before = valuesOf(member);
  return {
    ...(values.memberNumber.trim() !== before.memberNumber
      ? { memberNumber: values.memberNumber.trim() }
      : {}),
    ...(values.groupLabel.trim() !== before.groupLabel
      ? { groupLabel: values.groupLabel.trim() }
      : {}),
    ...(values.validUntil !== before.validUntil ? { validUntil: values.validUntil || null } : {}),
    ...(values.notes.trim() !== before.notes ? { notes: values.notes.trim() } : {}),
  };
};

/**
 * Owner, 12 Oct 2026 — "edit … like a SaaS application", for the owner or an
 * admin only (the page hides the action; the server refuses it regardless).
 *
 * The student's record and nothing else. Name and mobile belong to the linked
 * party — one person can be a library student, a shop customer and a guardian
 * at once — so they are edited on the customer page, which the link here opens.
 * The guardian is not here either: the khata's relations section already adds,
 * changes and unlinks one, and a second editor would be a second set of rules.
 * Seat and shift stay with the seat dialog, which the desk uses.
 */
export function MemberEditDrawer({
  member,
  busy,
  onClose,
  onSubmit,
}: Readonly<{
  member: MemberDetail;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: MemberEditBody) => Promise<ActOutcome>;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const formId = useId();
  const { editSchema } = useMemberSchemas();
  const form = useForm<MemberEditFormValues>({
    resolver: yupResolver(editSchema),
    mode: 'onTouched',
    defaultValues: valuesOf(member),
  });

  const save = async (values: MemberEditFormValues): Promise<void> => {
    const body = changedFields(member, values);
    // Nothing changed is not an error and not a request: the drawer just closes.
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    const outcome = await onSubmit(body);
    if (outcome.ok) {
      onClose();
      return;
    }
    showRefusal(outcome.error);
  };

  const showRefusal = (error: ApiErrorShape | null): void => {
    if (!error) return;
    if (error.code === 'validation_error') {
      const details = Object.fromEntries(
        Object.entries(error.details ?? {}).map(([path, messages]) => [
          SERVER_FIELD[path] ?? path,
          messages,
        ])
      );
      applyServerErrors({ ...error, details }, form.setError, EDIT_FIELDS);
      return;
    }
    if (error.code === 'library_member_number_taken') {
      form.setError('memberNumber', { message: error.message });
      return;
    }
    /* A stale version ("Somebody else changed this") or anything else is about
       the record, not a field: the global snackbar says it, as everywhere. The
       request was quiet only so a field's refusal is said once, on the field. */
    dispatch(
      showSnackbar({ severity: 'error', message: error.message, requestId: error.requestId })
    );
  };

  return (
    <UbDrawer
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('library.member.edit.title')}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            busy={busy}
            busyLabel={t('library.working')}
            data-testid="library-member-edit-save"
          >
            {t('library.member.edit.save')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={save}>
        <UbField name="memberNumber" label={t('library.enrol.number')} required>
          {(field) => <UbTextInput {...field} autoComplete="off" disabled={busy} />}
        </UbField>
        <UbField
          name="groupLabel"
          label={t('library.enrol.group')}
          placeholder={t('library.enrol.group.placeholder')}
          optionalLabel={t('common.field.optional')}
        >
          {(field) => <UbTextInput {...field} autoComplete="off" disabled={busy} />}
        </UbField>
        <UbField
          name="validUntil"
          label={t('library.member.validUntil')}
          hint={t('library.member.edit.validUntil.hint')}
          optionalLabel={t('common.field.optional')}
        >
          {(field) => (
            <UbDateInput
              id={field.id}
              name={field.name}
              value={(field.value as string) || null}
              onChange={(next) => field.onChange(next ?? '')}
              onBlur={field.onBlur}
              min={member.startsOn}
              invalid={field.invalid}
              disabled={busy}
            />
          )}
        </UbField>
        <UbField
          name="notes"
          label={t('library.member.edit.notes')}
          placeholder={t('library.member.edit.notes.placeholder')}
          optionalLabel={t('common.field.optional')}
        >
          {(field) => <UbTextArea {...field} rows={3} maxLength={2000} disabled={busy} />}
        </UbField>
        <UbText variant="caption" tone="tertiary">
          {t('library.member.edit.nameHint')}{' '}
          <UbLink href={`${ROUTES.PARTIES}/${member.party.id}`}>
            {t('library.member.edit.nameLink')}
          </UbLink>
        </UbText>
      </UbForm>
    </UbDrawer>
  );
}
