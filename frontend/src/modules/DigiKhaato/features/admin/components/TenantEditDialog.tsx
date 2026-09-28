'use client';

import { useCallback, useId, useMemo } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';

import {
  UbButton,
  UbDialog,
  UbField,
  UbForm,
  UbGrid,
  UbSelect,
  UbTextArea,
  UbTextInput,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { REASON_MAX, useAdminSchemas, type TenantEditFormValues } from '../validation/adminSchemas';
import { toTenantPatch } from '../view-model/adminDisplay';

import type { AdminPlan, AdminTenantDetail, AdminTenantPatch } from '../types/admin.types';

// Loaded with dynamic(), so its own words come with its own chunk rather than
// with the screen that opens it (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/validation';

/**
 * PLT-14 FR-3 — plan, suspension and the two limit overrides DEC-001 left
 * enforceable (`max_users`, `storage_mb`), with a reason. Only what CHANGED is
 * sent, so the audit trail records one row per real change.
 */
export function TenantEditDialog({
  open,
  tenant,
  plans,
  busy,
  onSave,
  onClose,
}: Readonly<{
  open: boolean;
  tenant: AdminTenantDetail;
  plans: readonly AdminPlan[];
  busy: boolean;
  onSave: (patch: AdminTenantPatch) => Promise<boolean>;
  onClose: () => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const formId = useId();
  const { tenantEditSchema } = useAdminSchemas();
  const editableStatus = tenant.status === 'active' || tenant.status === 'suspended';
  const defaults = useMemo<TenantEditFormValues>(
    () => ({
      planId: tenant.plan.id,
      status: tenant.status === 'suspended' ? 'suspended' : 'active',
      maxUsers: tenant.overrides.maxUsers === null ? '' : String(tenant.overrides.maxUsers),
      storageMb: tenant.overrides.storageMb === null ? '' : String(tenant.overrides.storageMb),
      reason: '',
    }),
    [tenant]
  );
  const form = useForm<TenantEditFormValues>({
    resolver: yupResolver(tenantEditSchema),
    mode: 'onTouched',
    defaultValues: defaults,
  });

  const planOptions = useMemo(
    () =>
      plans
        .filter((plan) => plan.isActive || plan.id === tenant.plan.id)
        .map((plan) => ({ value: plan.id, label: `${plan.name} (${plan.code})` })),
    [plans, tenant.plan.id]
  );
  const statusOptions = useMemo(
    () => [
      { value: 'active', label: t('admin.status.active') },
      { value: 'suspended', label: t('admin.status.suspended') },
    ],
    [t]
  );

  const submit = useCallback(
    async (values: TenantEditFormValues) => {
      const patch = toTenantPatch(values, defaults);
      if (await onSave(patch)) onClose();
    },
    [defaults, onSave, onClose]
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
      title={t('admin.edit.title', { name: tenant.name })}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton type="submit" form={formId} busy={busy} busyLabel={t('admin.working')}>
            {t('admin.edit.save')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={submit}>
        <UbGrid columns={{ base: 1, sm: 2 }} gap={4}>
          <UbField name="planId" label={t('admin.edit.plan')} placeholder={t('admin.edit.plan')}>
            {(field) => <UbSelect {...field} options={planOptions} />}
          </UbField>
          <UbField
            name="status"
            label={t('admin.edit.status')}
            placeholder={t('admin.edit.status')}
            hint={editableStatus ? undefined : t('admin.edit.statusLocked')}
          >
            {(field) => <UbSelect {...field} options={statusOptions} disabled={!editableStatus} />}
          </UbField>
          <UbField
            name="maxUsers"
            label={t('admin.edit.maxUsers')}
            placeholder={t('admin.edit.limit.placeholder', {
              limit: tenant.maxUsers.limit ?? '∞',
            })}
          >
            {(field) => <UbTextInput {...field} inputMode="numeric" autoComplete="off" />}
          </UbField>
          <UbField
            name="storageMb"
            label={t('admin.edit.storageMb')}
            placeholder={t('admin.edit.limit.placeholder', {
              limit: tenant.storageMb.limit ?? '∞',
            })}
          >
            {(field) => <UbTextInput {...field} inputMode="numeric" autoComplete="off" />}
          </UbField>
        </UbGrid>
        <UbField
          name="reason"
          label={t('admin.reason.label')}
          placeholder={t('admin.reason.placeholder')}
          required
        >
          {(field) => <UbTextArea {...field} rows={2} maxLength={REASON_MAX} />}
        </UbField>
      </UbForm>
    </UbDialog>
  );
}
