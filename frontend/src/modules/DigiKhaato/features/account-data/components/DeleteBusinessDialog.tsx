'use client';

import { useCallback, useId } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';

import {
  UbButton,
  UbDialog,
  UbField,
  UbForm,
  UbStack,
  UbText,
  UbTextArea,
  UbTextInput,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { applyServerErrors } from 'src/utils/applyServerErrors';

import {
  DELETE_REASON_MAX,
  useAccountDataSchemas,
  type DeleteBusinessFormValues,
} from '../validation/accountDataSchemas';

import type { UseAccountDataResult } from '../hooks/useAccountData';

const FIELDS: readonly string[] = ['password', 'confirmName', 'reason'];

/**
 * PLT-10 FRD §6/§7 — the deletion confirmation. `dynamic()`-loaded by the page:
 * the form, its resolver and the schema belong in the chunk that OPENS them.
 *
 * It states exactly what happens and when (TSK-PLT-10-05), requires the
 * business name typed back, and re-verifies with the owner's PASSWORD — not
 * an OTP, which DEC-010 removed. The export gate is enforced before this
 * dialog can open; the server enforces it again.
 */
export function DeleteBusinessDialog({
  data,
  open,
  onClose,
}: Readonly<{
  data: UseAccountDataResult;
  open: boolean;
  onClose: () => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const formId = useId();
  const businessName = data.deletion?.businessName ?? '';
  const coolOff = data.deletion?.coolOffDays ?? 30;
  const { deleteBusinessSchema } = useAccountDataSchemas(businessName);

  const form = useForm<DeleteBusinessFormValues>({
    resolver: yupResolver(deleteBusinessSchema),
    mode: 'onTouched',
    defaultValues: { password: '', confirmName: '', reason: '' },
  });
  const { setError, reset } = form;

  const submit = useCallback(
    async (values: DeleteBusinessFormValues) => {
      const refusal = await data.submitDeletion({
        password: values.password,
        confirmName: values.confirmName,
        reason: values.reason.trim(),
      });
      if (refusal === null) {
        reset();
        onClose();
        return;
      }
      applyServerErrors(refusal, setError, FIELDS, t);
    },
    [data, onClose, reset, setError, t]
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) onClose();
    },
    [onClose]
  );

  return (
    <UbDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={t('data.delete.dialog.title')}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            variant="destructive"
            busy={data.isDeleting}
            busyLabel={t('data.delete.dialog.submitting')}
            disabled={!data.canWrite}
          >
            {t('data.delete.dialog.submit')}
          </UbButton>
        </>
      }
    >
      <UbStack gap={4}>
        <UbStack as="ul" gap={2} className="list-disc pl-5">
          <UbText as="li" variant="body-sm">
            {t('data.delete.consequence.readOnly')}
          </UbText>
          <UbText as="li" variant="body-sm">
            {t('data.delete.consequence.coolOff', { days: coolOff })}
          </UbText>
          <UbText as="li" variant="body-sm">
            {t('data.delete.consequence.removed')}
          </UbText>
          <UbText as="li" variant="body-sm">
            {t('data.delete.consequence.gst')}
          </UbText>
        </UbStack>
        <UbForm id={formId} form={form} onSubmit={submit}>
          <UbField
            name="confirmName"
            label={t('data.delete.confirm.label', { name: businessName })}
            placeholder={businessName}
            required
          >
            {(field) => <UbTextInput {...field} autoComplete="off" maxLength={200} />}
          </UbField>
          <UbField
            name="password"
            label={t('data.delete.password.label')}
            placeholder={t('data.delete.password.placeholder')}
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
            name="reason"
            label={t('data.delete.reason.label')}
            placeholder={t('data.delete.reason.placeholder')}
          >
            {(field) => <UbTextArea {...field} rows={2} maxLength={DELETE_REASON_MAX} />}
          </UbField>
        </UbForm>
      </UbStack>
    </UbDialog>
  );
}
