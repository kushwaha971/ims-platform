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
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { REASON_MAX, useAdminSchemas, type ReasonFormValues } from '../validation/adminSchemas';

// Loaded with dynamic(), so its own words come with its own chunk rather than
// with the screen that opens it (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/validation';

/**
 * PLT-14 FR-10 — the one question every console write asks: why. Used for
 * "Request access" (FR-6) and "Enter business" (FR-5); `dynamic()`-loaded by
 * the tenant card, so the resolver ships only when a reason is asked for.
 */
export function AdminReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  busy,
  onSubmit,
  onClose,
}: Readonly<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  onSubmit: (reason: string) => Promise<boolean | void>;
  onClose: () => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const formId = useId();
  const { reasonSchema } = useAdminSchemas();
  const form = useForm<ReasonFormValues>({
    resolver: yupResolver(reasonSchema),
    mode: 'onTouched',
    defaultValues: { reason: '' },
  });
  const { reset } = form;

  const submit = useCallback(
    async (values: ReasonFormValues) => {
      const done = await onSubmit(values.reason.trim());
      if (done !== false) reset();
    },
    [onSubmit, reset]
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
      title={title}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton type="submit" form={formId} busy={busy} busyLabel={t('admin.working')}>
            {confirmLabel}
          </UbButton>
        </>
      }
    >
      <UbStack gap={4}>
        <UbText variant="body-sm" tone="secondary">
          {description}
        </UbText>
        <UbForm id={formId} form={form} onSubmit={submit}>
          <UbField
            name="reason"
            label={t('admin.reason.label')}
            placeholder={t('admin.reason.placeholder')}
            required
          >
            {(field) => <UbTextArea {...field} rows={3} maxLength={REASON_MAX} />}
          </UbField>
        </UbForm>
      </UbStack>
    </UbDialog>
  );
}
