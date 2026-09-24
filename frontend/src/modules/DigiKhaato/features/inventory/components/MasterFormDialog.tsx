'use client';

import { useCallback, useId, useMemo, useState } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';

import {
  UbButton,
  UbDialog,
  UbField,
  UbForm,
  UbInputHint,
  UbSelect,
  UbSwitch,
  UbTextInput,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import type { ApiErrorShape } from 'src/types/api.types';
import { applyServerErrors } from 'src/utils/applyServerErrors';

import { useInventoryMasters } from '../hooks/useInventoryMasters';
import {
  useInventorySchemas,
  type CategoryFormValues,
  type UnitFormValues,
} from '../validation/inventorySchemas';

/**
 * INV-04 — "Add category" and "Add unit" (create-only at MVP: FR-6). One
 * dialog, two small forms. A unit code outside the GST list is allowed with a
 * warning (FR-3): it prints as typed on invoices.
 */
function CategoryForm({ onDone }: Readonly<{ onDone: () => void }>): React.JSX.Element {
  const { t } = useTranslation();
  const formId = useId();
  const masters = useInventoryMasters();
  const { categorySchema } = useInventorySchemas(masters.units);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const form = useForm<CategoryFormValues>({
    resolver: yupResolver(categorySchema),
    mode: 'onTouched',
    defaultValues: { name: '', parentId: '' },
  });
  const parents = useMemo(
    () => [
      { value: 'none', label: t('inventory.masters.category.topLevel') },
      ...masters.categories.map((row) => ({ value: row.id, label: row.name })),
    ],
    [masters.categories, t]
  );
  const submit = useCallback(
    async (values: CategoryFormValues) => {
      try {
        await masters.addCategory(values.name.trim(), values.parentId || null);
        onDone();
      } catch (thrown) {
        setErrors(applyServerErrors(thrown as ApiErrorShape, form.setError, ['name', 'parentId']));
      }
    },
    [masters, onDone, form.setError]
  );
  return (
    <UbForm id={formId} form={form} onSubmit={submit} formErrors={errors}>
      <UbField
        name="name"
        label={t('inventory.masters.category.name')}
        placeholder={t('inventory.masters.category.placeholder')}
        required
      >
        {(field) => <UbTextInput {...field} autoFocus autoComplete="off" maxLength={60} />}
      </UbField>
      <UbField name="parentId" label={t('inventory.masters.category.parent')}>
        {(field) => (
          <UbSelect
            {...field}
            value={(field.value as string) || 'none'}
            onChange={(next) => field.onChange(next === 'none' ? '' : next)}
            options={parents}
          />
        )}
      </UbField>
      <UbButton
        type="submit"
        form={formId}
        busy={form.formState.isSubmitting}
        busyLabel={t('items.form.saving')}
      >
        {t('inventory.masters.category.add')}
      </UbButton>
    </UbForm>
  );
}

function UnitForm({ onDone }: Readonly<{ onDone: () => void }>): React.JSX.Element {
  const { t } = useTranslation();
  const formId = useId();
  const masters = useInventoryMasters();
  const { unitSchema } = useInventorySchemas(masters.units);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const form = useForm<UnitFormValues>({
    resolver: yupResolver(unitSchema),
    mode: 'onTouched',
    defaultValues: { code: '', name: '', allowDecimal: false },
  });
  const submit = useCallback(
    async (values: UnitFormValues) => {
      try {
        await masters.addUnit({
          code: values.code.toUpperCase(),
          name: values.name.trim(),
          allowDecimal: values.allowDecimal,
        });
        onDone();
      } catch (thrown) {
        setErrors(
          applyServerErrors(thrown as ApiErrorShape, form.setError, [
            'code',
            'name',
            'allowDecimal',
          ])
        );
      }
    },
    [masters, onDone, form.setError]
  );
  return (
    <UbForm id={formId} form={form} onSubmit={submit} formErrors={errors}>
      <UbField
        name="code"
        label={t('inventory.masters.unit.code')}
        placeholder={t('inventory.masters.unit.code.placeholder')}
        hint={t('inventory.masters.unit.code.hint')}
        required
      >
        {(field) => <UbTextInput {...field} uppercase autoFocus autoComplete="off" maxLength={8} />}
      </UbField>
      <UbField
        name="name"
        label={t('inventory.masters.unit.name')}
        placeholder={t('inventory.masters.unit.name.placeholder')}
        required
      >
        {(field) => <UbTextInput {...field} autoComplete="off" maxLength={40} />}
      </UbField>
      <UbField name="allowDecimal" label={t('inventory.masters.unit.decimals')} controlOwnsLabel>
        {(field) => (
          <UbSwitch
            id={field.id}
            checked={Boolean(field.value)}
            onCheckedChange={field.onChange}
            label={t('inventory.masters.unit.decimals')}
          />
        )}
      </UbField>
      <UbInputHint>{t('inventory.masters.unit.decimals.hint')}</UbInputHint>
      <UbButton
        type="submit"
        form={formId}
        busy={form.formState.isSubmitting}
        busyLabel={t('items.form.saving')}
      >
        {t('inventory.masters.unit.add')}
      </UbButton>
    </UbForm>
  );
}

export function MasterFormDialog({
  kind,
  onClose,
}: Readonly<{ kind: 'category' | 'unit' | null; onClose: () => void }>): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <UbDialog
      open={kind !== null}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={
        kind === 'unit' ? t('inventory.masters.unit.add') : t('inventory.masters.category.add')
      }
      closeLabel={t('common.action.close')}
    >
      {kind === 'unit' ? <UnitForm onDone={onClose} /> : <CategoryForm onDone={onClose} />}
    </UbDialog>
  );
}
