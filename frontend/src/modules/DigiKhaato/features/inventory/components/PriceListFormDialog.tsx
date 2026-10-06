'use client';

import { useCallback, useId, useMemo, useState } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import * as Yup from 'yup';

import { UbButton, UbDialog, UbField, UbForm, UbTextInput } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { useValidationSchemas } from 'src/hooks/useValidationSchemas';
import type { ApiErrorShape } from 'src/types/api.types';
import { applyServerErrors } from 'src/utils/applyServerErrors';

import {
  createPriceList,
  updatePriceList,
  type PriceList,
  type PriceListInput,
} from '../api/priceListService';

import 'src/i18n/catalogues/priceLists';
import 'src/i18n/catalogues/validation';

const PERCENT = /^-?\d{1,4}(\.\d{1,2})?$/;

/**
 * Shop gap §1.6 — create or edit a price list: a name and one rule, a
 * percentage on every item's selling price. Exact per-item rates are pinned on
 * the list's own page.
 */
export function PriceListFormDialog({
  editing,
  onClose,
  onSaved,
}: Readonly<{
  editing: PriceList | null;
  onClose: () => void;
  onSaved: (saved: PriceList) => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const v = useValidationSchemas();
  const formId = useId();
  const [errors, setErrors] = useState<readonly string[]>([]);
  const schema = useMemo<Yup.ObjectSchema<PriceListInput>>(
    () =>
      Yup.object({
        name: v.requiredText(60, 'priceLists.form.name.required').defined(),
        adjustPercent: Yup.string()
          .defined()
          .default('')
          .test('pct', t('priceLists.form.percent.format'), (value) => {
            if (!value) return true;
            if (!PERCENT.test(value)) return false;
            const n = Number(value);
            return n >= -100 && n <= 1000;
          }),
      }),
    [v, t]
  );
  const form = useForm<PriceListInput>({
    resolver: yupResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      name: editing?.name ?? '',
      adjustPercent: editing ? String(Number(editing.adjustPercent)) : '',
    },
  });
  const submit = useCallback(
    async (values: PriceListInput) => {
      try {
        const input = { name: values.name.trim(), adjustPercent: values.adjustPercent };
        const saved = editing
          ? await updatePriceList(editing.id, input)
          : await createPriceList(input);
        onSaved(saved);
      } catch (thrown) {
        setErrors(
          applyServerErrors(thrown as ApiErrorShape, form.setError, ['name', 'adjustPercent'], t)
        );
      }
    },
    [editing, onSaved, form.setError, t]
  );
  const title = editing ? t('priceLists.edit') : t('priceLists.new');
  return (
    <UbDialog
      open
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={title}
      closeLabel={t('common.action.close')}
    >
      <UbForm id={formId} form={form} onSubmit={submit} formErrors={errors}>
        <UbField
          name="name"
          label={t('priceLists.form.name')}
          placeholder={t('priceLists.form.name.placeholder')}
          required
        >
          {(field) => <UbTextInput {...field} autoFocus autoComplete="off" maxLength={60} />}
        </UbField>
        <UbField
          name="adjustPercent"
          label={t('priceLists.form.percent')}
          placeholder="-5"
          hint={t('priceLists.form.percent.hint')}
        >
          {(field) => (
            <UbTextInput {...field} inputMode="decimal" autoComplete="off" adornment="%" />
          )}
        </UbField>
        <UbButton
          type="submit"
          form={formId}
          busy={form.formState.isSubmitting}
          busyLabel={t('priceLists.saving')}
        >
          {editing ? t('priceLists.save') : t('priceLists.create')}
        </UbButton>
      </UbForm>
    </UbDialog>
  );
}
