'use client';

import { useCallback, useEffect, useId, useMemo } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';

import {
  UbButton,
  UbDateInput,
  UbDrawer,
  UbField,
  UbForm,
  UbMoneyInput,
  UbStatusBanner,
  UbSwitch,
  UbTextInput,
} from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { PAYMENT_MODES, UPI_APPS } from 'src/types/domain.types';
import { todayInTenantTz } from 'src/utils/dates';

import { PaymentMethodField } from '../../ledger/components/PaymentMethodField';
import { useExpenseSchemas } from '../validation/expenseSchemas';

import { ExpenseCategoryField } from './ExpenseCategoryField';
import { ExpensePartyField } from './ExpensePartyField';

import type { UseExpenseFormResult } from '../hooks/useExpenseForm';
import type { ExpenseFormValues } from '../types/expense.types';

/**
 * EXP-01 FR-2 — "₹500 tea and snacks, cash, today" in three taps.
 *
 * Amount first and focused, then category, date (today), and how it was paid
 * (the mode this device used last). Everything else is optional and below.
 * "Paid now" is on by default; turning it off is "I still owe this", which
 * asks who to and by when, hides "Paid by" (money that has not moved has no
 * "how"), and posts a credit on that party's khata when saved.
 *
 * Lazily loaded (`dynamic()` by its openers): it carries React Hook Form's
 * resolver, the Yup schema and nine controls, and a merchant opening the list
 * to READ it should not download them (CLAUDE.md, the party drawer's +39.8 KB).
 *
 * ── Not here, deliberately ────────────────────────────────────────────────
 * The receipt photo (FR-7) needs `POST /attachments`, which does not exist on
 * this branch; a photo tile that cannot store a photo teaches the merchant the
 * product is broken. The GST section (FR-5) is not in this wave either.
 */
const DAY_MS = 86_400_000;

export function ExpenseFormDrawer({
  form: expenseForm,
}: Readonly<{ form: UseExpenseFormResult }>): React.JSX.Element {
  const { t } = useTranslation();
  const { expenseSchema } = useExpenseSchemas();
  const formId = useId();
  const timezone = useAppSelector(selectTenantTimezone);
  const {
    open,
    isSaving,
    canWrite,
    draft,
    formErrors,
    categories,
    creatingCategory,
    close,
    submit,
    addCategory,
  } = expenseForm;

  const today = useMemo(() => todayInTenantTz(timezone ?? undefined), [timezone]);
  const yesterday = useMemo(
    () => new Date(Date.parse(`${today}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10),
    [today]
  );

  /* A failed save's draft wins over the defaults (FR-13): reopening brings
     back what was typed rather than an empty form. */
  const defaults = useMemo<ExpenseFormValues>(
    () =>
      draft ?? {
        amount: '',
        categoryId: '',
        expenseDate: today,
        paid: true,
        mode: lastMode() || 'cash',
        upiApp: lastUpiApp(),
        reference: '',
        partyId: '',
        partyName: '',
        dueOn: '',
        note: '',
      },
    [draft, today]
  );

  const form = useForm<ExpenseFormValues>({
    resolver: yupResolver(expenseSchema),
    mode: 'onTouched',
    defaultValues: defaults,
  });
  const { reset, setError, setValue, formState } = form;

  useEffect(() => {
    if (open) reset(defaults);
  }, [open, reset, defaults]);

  const paid = useWatch({ control: form.control, name: 'paid' });
  const mode = useWatch({ control: form.control, name: 'mode' });
  const upiApp = useWatch({ control: form.control, name: 'upiApp' });
  const partyName = useWatch({ control: form.control, name: 'partyName' });

  const save = useCallback(
    async (values: ExpenseFormValues, keepOpen: boolean) => {
      if (values.paid && values.mode) rememberMode(values.mode, values.upiApp);
      const saved = await submit(values, setError, { keepOpen });
      if (saved && keepOpen) {
        /* FR-2 "Save & add another" — keeps category, date and mode, clears
           the amount and the note, and lands back on the amount. */
        reset({ ...values, amount: '', note: '', reference: '' });
        form.setFocus('amount');
      }
    },
    [submit, setError, reset, form]
  );

  const handleSubmit = useCallback((values: ExpenseFormValues) => save(values, false), [save]);
  const handleSaveAndAdd = useCallback(() => {
    void form.handleSubmit((values) => save(values, true))();
  }, [form, save]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) close();
    },
    [close]
  );

  return (
    <UbDrawer
      open={open}
      onOpenChange={handleOpenChange}
      title={t('expenses.add')}
      closeLabel={t('common.action.close')}
      // A stray tap on the backdrop must not take a half-typed expense with it.
      dismissOnBackdrop={!formState.isDirty}
      footer={
        <>
          <UbButton variant="secondary" onClick={handleSaveAndAdd} disabled={!canWrite || isSaving}>
            {t('expenses.saveAndAdd')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            busy={isSaving}
            busyLabel={t('expenses.saving')}
            disabled={!canWrite}
          >
            {t('expenses.save')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={handleSubmit} formErrors={formErrors}>
        {!canWrite && <UbStatusBanner tone="info" title={t('expenses.readOnly')} />}

        <UbField
          name="amount"
          label={t('expenses.amount')}
          placeholder={t('expenses.amount.placeholder')}
          required
        >
          {(field) => <UbMoneyInput {...field} autoFocus inputMode="decimal" />}
        </UbField>

        <UbField
          name="categoryId"
          label={t('expenses.category')}
          placeholder={t('expenses.category.placeholder')}
          required
        >
          {(field) => (
            <ExpenseCategoryField
              field={field}
              categories={categories}
              canCreate={canWrite}
              creating={creatingCategory}
              onCreate={addCategory}
              t={t}
            />
          )}
        </UbField>

        <UbField
          name="expenseDate"
          label={t('expenses.date')}
          placeholder={t('ledger.entry.date.placeholder')}
          required
        >
          {(field) => (
            <UbDateInput
              {...field}
              max={today}
              quickChoicesLabel={t('ledger.entry.date.quick')}
              quickChoices={[
                { label: t('ledger.entry.date.today'), date: today },
                { label: t('ledger.entry.date.yesterday'), date: yesterday },
              ]}
            />
          )}
        </UbField>

        <UbSwitch
          checked={paid}
          onCheckedChange={(next) => setValue('paid', next, { shouldDirty: true })}
          label={t('expenses.paidNow')}
          description={t('expenses.paidNowHint')}
        />

        {paid && (
          <UbField name="mode" label={t('expenses.mode')} required>
            {(field) => (
              <PaymentMethodField
                id={field.id}
                t={t}
                ariaLabel={t('expenses.mode')}
                mode={field.value as ExpenseFormValues['mode']}
                app={upiApp}
                invalid={field.invalid}
                describedBy={field['aria-describedby']}
                onBlur={field.onBlur}
                onChange={(nextMode, app) => {
                  field.onChange(nextMode);
                  setValue('upiApp', app, { shouldDirty: true });
                }}
              />
            )}
          </UbField>
        )}

        {paid && mode && mode !== 'cash' && (
          <UbField
            name="reference"
            label={t('expenses.reference')}
            placeholder={t('expenses.reference.placeholder')}
            optionalLabel={t('common.field.optional')}
          >
            {(field) => <UbTextInput {...field} autoComplete="off" maxLength={64} />}
          </UbField>
        )}

        <UbField
          name="partyId"
          label={paid ? t('expenses.paidTo') : t('expenses.owedTo')}
          placeholder={t('expenses.paidTo.placeholder')}
          hint={paid ? t('expenses.paidToHint') : t('expenses.owedToHint')}
          required={!paid}
          optionalLabel={paid ? t('common.field.optional') : undefined}
        >
          {(field) => (
            <ExpensePartyField
              field={field}
              partyName={partyName}
              t={t}
              onPick={(id, name) => {
                field.onChange(id);
                setValue('partyName', name, { shouldDirty: true });
              }}
            />
          )}
        </UbField>

        {!paid && (
          <UbField
            name="dueOn"
            label={t('expenses.dueOn')}
            placeholder={t('ledger.entry.date.placeholder')}
            required
          >
            {(field) => <UbDateInput {...field} />}
          </UbField>
        )}

        <UbField
          name="note"
          label={t('expenses.note')}
          placeholder={t('expenses.note.placeholder')}
          optionalLabel={t('common.field.optional')}
        >
          {(field) => <UbTextInput {...field} autoComplete="off" maxLength={255} />}
        </UbField>
      </UbForm>
    </UbDrawer>
  );
}

/**
 * FR-14 — the mode this device used last, so the common path is zero taps.
 * `localStorage`, wrapped: it throws in a private window, and a drawer that
 * fails to open because a preference could not be read is a poor trade.
 * Its own keys, not the ledger's: money in and money out are usually by
 * different modes at the same counter (customers pay by UPI, tea is cash).
 */
const LAST_MODE_KEY = 'ub.expense.lastMode';
const LAST_APP_KEY = 'ub.expense.lastUpiApp';

const lastMode = (): ExpenseFormValues['mode'] => {
  try {
    const stored = window.localStorage.getItem(LAST_MODE_KEY);
    return PAYMENT_MODES.includes(stored as never) ? (stored as ExpenseFormValues['mode']) : '';
  } catch {
    return '';
  }
};

const lastUpiApp = (): ExpenseFormValues['upiApp'] => {
  try {
    const stored = window.localStorage.getItem(LAST_APP_KEY);
    return UPI_APPS.includes(stored as never) ? (stored as ExpenseFormValues['upiApp']) : '';
  } catch {
    return '';
  }
};

const rememberMode = (mode: string, app: string): void => {
  try {
    window.localStorage.setItem(LAST_MODE_KEY, mode);
    if (mode === 'upi' && app) window.localStorage.setItem(LAST_APP_KEY, app);
    else window.localStorage.removeItem(LAST_APP_KEY);
  } catch {
    /* A preference that cannot be stored is not worth a failed save. */
  }
};
