'use client';

import { useCallback, useEffect, useId, useMemo } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';

import {
  UbButton,
  UbDateInput,
  UbDialog,
  UbField,
  UbForm,
  UbSelect,
  UbTextInput,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import type { ModuleCode } from 'src/types/domain.types';

import {
  WHOLE_BUSINESS,
  useClosedDaySchemas,
  type ClosedDayFormValues,
} from '../validation/closedDaySchemas';
import { moduleOnly } from '../view-model/calendarDisplay';

import type { UseBusinessDaysResult } from '../hooks/useBusinessDays';

// Loaded with dynamic(): its words come with its own chunk.
import 'src/i18n/catalogues/calendar';
import 'src/i18n/catalogues/validation';

/**
 * A9b (PLT-X08 §2 flow 2) — "Add closure": a day or a run of up to 31 days, a
 * reason, and whether it closes the whole business or one feature. Days that
 * are already closed are skipped by the server and counted in the snackbar.
 */
export function ClosedDayDialog({
  calendar,
  todayIso,
}: Readonly<{ calendar: UseBusinessDaysResult; todayIso: string }>): React.JSX.Element {
  const { t } = useTranslation();
  const { closedDaySchema } = useClosedDaySchemas();
  const formId = useId();
  const defaults = useMemo<ClosedDayFormValues>(
    () => ({ from: todayIso, to: null, reason: '', module: WHOLE_BUSINESS }),
    [todayIso]
  );
  const form = useForm<ClosedDayFormValues>({
    resolver: yupResolver(closedDaySchema),
    mode: 'onTouched',
    defaultValues: defaults,
  });
  const { reset } = form;
  const { addOpen, closeAdd, submitAdd } = calendar;

  // Cleared when the dialog OPENS (clearing on close races the animation).
  useEffect(() => {
    if (addOpen) reset(defaults);
  }, [addOpen, reset, defaults]);

  const readers = useMemo(() => calendar.data?.readers ?? [], [calendar.data?.readers]);
  const appliesTo = useMemo(
    () => [
      { value: WHOLE_BUSINESS, label: t('calendar.dialog.appliesTo.all') },
      ...readers.map((module) => ({
        value: module,
        label: moduleOnly(t, module),
      })),
    ],
    [readers, t]
  );

  const submit = useCallback(
    (values: ClosedDayFormValues) =>
      void submitAdd({
        from: values.from,
        to: values.to || null,
        reason: values.reason.trim(),
        module: values.module === WHOLE_BUSINESS ? null : (values.module as ModuleCode),
      }),
    [submitAdd]
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
      title={t('calendar.dialog.title')}
      description={t('calendar.dialog.body')}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={closeAdd} disabled={calendar.adding}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            busy={calendar.adding}
            busyLabel={t('calendar.dialog.submitting')}
            disabled={!calendar.canWrite}
          >
            {t('calendar.dialog.submit')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={submit}>
        <UbField name="from" label={t('calendar.dialog.from')} required>
          {(field) => <UbDateInput {...field} value={field.value as string} />}
        </UbField>
        <UbField name="to" label={t('calendar.dialog.to')} hint={t('calendar.dialog.toHint')}>
          {(field) => <UbDateInput {...field} value={(field.value as string | null) ?? null} />}
        </UbField>
        <UbField
          name="reason"
          label={t('calendar.dialog.reason')}
          placeholder={t('calendar.dialog.reasonPlaceholder')}
          required
        >
          {(field) => <UbTextInput {...field} autoComplete="off" maxLength={60} />}
        </UbField>
        {readers.length > 0 && (
          <UbField name="module" label={t('calendar.dialog.appliesTo')}>
            {(field) => <UbSelect {...field} options={appliesTo} />}
          </UbField>
        )}
      </UbForm>
    </UbDialog>
  );
}
