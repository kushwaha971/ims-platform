'use client';

import { useCallback, useEffect, useId } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';

import { UbButton, UbDialog, UbField, UbForm, UbTextInput } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { useSessionSchemas, type RenameDeviceFormValues } from '../validation/sessionSchemas';
import { deviceTitle } from '../view-model/deviceDisplay';

import type { UseDevicesResult } from '../hooks/useDevices';

/**
 * PLT-09 FR-7 — naming a device. `dynamic()`-loaded by the page: the form,
 * its resolver and the schema belong in the chunk that OPENS them, not in the
 * chunk that renders the list of devices.
 */
export function RenameDeviceDialog({
  devices,
}: Readonly<{ devices: UseDevicesResult }>): React.JSX.Element {
  const { t } = useTranslation();
  const { renameDeviceSchema } = useSessionSchemas();
  const formId = useId();
  const target = devices.renameTarget;

  const form = useForm<RenameDeviceFormValues>({
    resolver: yupResolver(renameDeviceSchema),
    mode: 'onTouched',
    defaultValues: { label: '' },
  });
  const { reset } = form;

  useEffect(() => {
    if (target) reset({ label: target.label ?? deviceTitle(target, t) });
  }, [target, reset, t]);

  const submit = useCallback(
    (values: RenameDeviceFormValues) => devices.submitRename(values.label.trim()),
    [devices]
  );
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) devices.closeRename();
    },
    [devices]
  );

  return (
    <UbDialog
      open={Boolean(target)}
      onOpenChange={handleOpenChange}
      title={t('sessions.rename.title')}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={devices.closeRename}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            busy={devices.isRenaming}
            busyLabel={t('sessions.rename.saving')}
            disabled={!devices.canWrite}
          >
            {t('sessions.rename.save')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={submit}>
        <UbField
          name="label"
          label={t('sessions.rename.label')}
          placeholder={t('sessions.rename.placeholder')}
          required
        >
          {(field) => <UbTextInput {...field} autoComplete="off" maxLength={120} />}
        </UbField>
      </UbForm>
    </UbDialog>
  );
}
