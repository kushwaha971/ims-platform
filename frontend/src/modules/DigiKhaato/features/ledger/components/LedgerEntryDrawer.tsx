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
  UbRadioGroup,
  UbStatusBanner,
  UbTextInput,
} from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { PAYMENT_MODES, UPI_APPS } from 'src/types/domain.types';
import { todayInTenantTz } from 'src/utils/dates';
import { formatAmount } from 'src/utils/money';

import { useLedgerSchemas } from '../validation/ledgerSchemas';

import { PaymentMethodField } from './PaymentMethodField';

import type { UseLedgerEntryFormResult } from '../hooks/useLedgerEntryForm';
import type { LedgerDirection, LedgerEntryFormValues } from '../types/ledger.types';

/**
 * LED-01 — the drawer a merchant records a sale or a payment in.
 *
 * The most frequent screen in the product, and the reason its shape matters
 * more than most: the target is eight seconds from tapping the party to the
 * entry being saved, on a mid-range Android phone at a counter. So the amount
 * is focused on open, the date defaults to today, the payment mode remembers
 * what was used last, and everything else is optional and out of the way.
 *
 * ── Why the direction is inside the drawer and not only on the buttons ─────
 * FR-4. A merchant taps "You gave", starts typing, and realises it was the
 * other way round. Without a switch here that costs a close, a reopen and
 * retyping the amount — at the counter, with somebody waiting. The switch keeps
 * every typed value, which is also why `reference` survives a switch to `debit`
 * even though it is not sent (EC-9).
 */
const DAY_MS = 86_400_000;

export function LedgerEntryDrawer({
  form: entryForm,
  partyName,
}: Readonly<{ form: UseLedgerEntryFormResult; partyName: string }>): React.JSX.Element {
  const { t } = useTranslation();
  const { ledgerEntrySchema } = useLedgerSchemas();
  const formId = useId();
  const timezone = useAppSelector(selectTenantTimezone);

  const {
    open,
    direction,
    isSaving,
    canWrite,
    canOverride,
    formErrors,
    blockedBy,
    draft,
    close,
    dismissBlock,
    submit,
  } = entryForm;

  /* "Today" comes from the TENANT's timezone, never the device clock (EC-8).
     An entry made at 11.50 p.m. IST on a phone set to UTC would otherwise
     default to yesterday's date and land in yesterday's day group — and the
     merchant would have no reason to look for it there. */
  const today = useMemo(() => todayInTenantTz(timezone ?? undefined), [timezone]);
  const yesterday = useMemo(
    () => new Date(Date.parse(`${today}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10),
    [today]
  );

  /* The draft wins over the defaults, and that is FR-12's whole behaviour: a
     save that failed on a bad connection left what the merchant typed in the
     slice, and reopening the drawer has to bring it back rather than hand them
     an empty form and the job of remembering the amount. */
  const defaults = useMemo<LedgerEntryFormValues>(
    () =>
      draft ?? {
        direction,
        amount: '',
        entryDate: today,
        note: '',
        paymentMode: lastPaymentMode(),
        upiApp: lastUpiApp(),
        reference: '',
      },
    [draft, direction, today]
  );

  const form = useForm<LedgerEntryFormValues>({
    resolver: yupResolver(ledgerEntrySchema),
    mode: 'onTouched',
    defaultValues: defaults,
  });
  const { reset, setError, formState, setValue } = form;

  // Reset on OPEN, never on close: closing races the drawer's own animation and
  // would blank the fields while they are still on screen.
  useEffect(() => {
    if (open) reset(defaults);
  }, [open, reset, defaults]);

  /* `useWatch`, never `form.watch()`. `watch()` returns a function the React
     Compiler cannot memoise safely, so it skips memoising the WHOLE component
     and only warns — on the one screen in the product where a re-render per
     keystroke is felt. */
  const watchedDirection = useWatch({ control: form.control, name: 'direction' });
  const watchedMode = useWatch({ control: form.control, name: 'paymentMode' });
  const isCredit = watchedDirection === 'credit';

  const directionOptions = useMemo(
    () => [
      { value: 'debit' as const, label: t('ledger.entry.gave') },
      { value: 'credit' as const, label: t('ledger.entry.got') },
    ],
    [t]
  );

  const watchedApp = useWatch({ control: form.control, name: 'upiApp' });

  /* A credit arriving with no mode gets the one this device used last — which
     for almost every shop is the same mode every time, and is the difference
     between two taps and one. Written on the SWITCH rather than in the
     defaults, because a merchant who opened "You gave" and switched has not
     been offered the choice yet. */
  useEffect(() => {
    if (isCredit && !watchedMode) setValue('paymentMode', lastPaymentMode() || 'cash');
  }, [isCredit, watchedMode, setValue]);

  const handleSubmit = useCallback(
    async (values: LedgerEntryFormValues) => {
      if (values.direction === 'credit' && values.paymentMode) {
        rememberPaymentMode(values.paymentMode, values.upiApp);
      }
      await submit(values, setError);
    },
    [submit, setError]
  );

  /* "Save anyway" resubmits the SAME values with the override flag, and with
     the same idempotency key — the hook rotates the key only after a success
     or a validation error, so the override is a second attempt at one intent
     rather than a second entry. */
  const handleOverride = useCallback(() => {
    void submit(form.getValues(), setError, { override: true });
  }, [submit, form, setError]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) close();
    },
    [close]
  );

  const title = t(isCredit ? 'ledger.entry.title.got' : 'ledger.entry.title.gave', {
    name: partyName,
  });

  return (
    <UbDrawer
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      closeLabel={t('common.action.close')}
      // A stray tap on the backdrop must not take a half-typed entry with it.
      dismissOnBackdrop={!formState.isDirty}
      footer={
        <>
          <UbButton variant="secondary" onClick={close} disabled={isSaving}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            busy={isSaving}
            busyLabel={t('ledger.entry.saving')}
            disabled={!canWrite}
          >
            {t('ledger.entry.save')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={handleSubmit} formErrors={formErrors}>
        {!canWrite && <UbStatusBanner tone="info" title={t('ledger.entry.readOnly')} />}

        {/* FR-7 / Alternate D. The refusal, in place, with the figures — and
            the offer that follows from WHO is looking at it. An owner is shown
            the override; staff are shown what to do instead, because a button
            they cannot use is a support call. */}
        {blockedBy && (
          <UbStatusBanner
            tone="error"
            title={t('ledger.limit.title')}
            description={
              canOverride
                ? t('ledger.limit.body', {
                    limit: formatAmount(blockedBy.limit),
                    balanceAfter: formatAmount(blockedBy.balanceAfter),
                  })
                : `${t('ledger.limit.body', {
                    limit: formatAmount(blockedBy.limit),
                    balanceAfter: formatAmount(blockedBy.balanceAfter),
                  })} — ${t('ledger.limit.askOwner')}`
            }
            action={
              canOverride ? (
                <UbButton variant="secondary" size="sm" onClick={handleOverride} busy={isSaving}>
                  {t('ledger.limit.saveAnyway')}
                </UbButton>
              ) : (
                <UbButton variant="ghost" size="sm" onClick={dismissBlock}>
                  {t('common.action.dismiss')}
                </UbButton>
              )
            }
          />
        )}

        <UbField name="direction" label={t('ledger.entry.direction')} labelHidden required>
          {(field) => (
            <UbRadioGroup<LedgerDirection>
              {...field}
              variant="card"
              options={directionOptions}
              ariaLabel={t('ledger.entry.direction')}
            />
          )}
        </UbField>

        <UbField
          name="amount"
          label={t('ledger.entry.amount')}
          placeholder={t('ledger.entry.amount.placeholder')}
          required
        >
          {(field) => <UbMoneyInput {...field} autoFocus inputMode="decimal" />}
        </UbField>

        <UbField
          name="entryDate"
          label={t('ledger.entry.date')}
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

        {/* Shown only for a credit. The field keeps its value when the merchant
            switches to "You gave" and back — the server drops it silently for a
            debit (EC-9) and the service does not send it. */}
        {/* FRD §7's row of chips — `UbChoiceChips` now that the pattern has
            its second caller (the correction drawer), flattened so PhonePe,
            Google Pay and Paytm are one tap each rather than "UPI" and then a
            second question. `lastPaymentMode` still pre-selects what this
            device used last, app included, so the common path is zero taps. */}
        {isCredit && (
          <UbField name="paymentMode" label={t('ledger.entry.mode')} required>
            {(field) => (
              <PaymentMethodField
                id={field.id}
                t={t}
                mode={field.value as LedgerEntryFormValues['paymentMode']}
                app={watchedApp}
                invalid={field.invalid}
                describedBy={field['aria-describedby']}
                onBlur={field.onBlur}
                onChange={(mode, app) => {
                  field.onChange(mode);
                  setValue('upiApp', app, { shouldDirty: true });
                }}
              />
            )}
          </UbField>
        )}

        {isCredit && (
          <UbField
            name="reference"
            label={t('ledger.entry.reference')}
            placeholder={t('ledger.entry.reference.placeholder')}
            hint={t('ledger.entry.reference.hint')}
            optionalLabel={t('common.field.optional')}
          >
            {(field) => <UbTextInput {...field} autoComplete="off" />}
          </UbField>
        )}

        <UbField
          name="note"
          label={t('ledger.entry.note')}
          placeholder={t('ledger.entry.note.placeholder')}
          hint={t('ledger.entry.note.hint')}
          optionalLabel={t('common.field.optional')}
        >
          {(field) => <UbTextInput {...field} autoComplete="off" />}
        </UbField>
      </UbForm>
    </UbDrawer>
  );
}

/**
 * The payment mode this device used last (FR-2).
 *
 * `localStorage` and not the store, deliberately: it is a convenience for one
 * person on one phone, it must survive a reload, and it must never travel to
 * another device or another user of the same account. Wrapped because the read
 * throws in a private window and returns nothing after cleared site data, and a
 * counter screen that fails to open because a preference could not be read
 * would be a poor trade for saving one tap.
 */
const LAST_MODE_KEY = 'ub.lastPaymentMode';

const lastPaymentMode = (): LedgerEntryFormValues['paymentMode'] => {
  try {
    const stored = window.localStorage.getItem(LAST_MODE_KEY);
    return PAYMENT_MODES.includes(stored as never) ? (stored as never) : '';
  } catch {
    return '';
  }
};

const LAST_APP_KEY = 'ub.lastUpiApp';

const lastUpiApp = (): LedgerEntryFormValues['upiApp'] => {
  try {
    const stored = window.localStorage.getItem(LAST_APP_KEY);
    return UPI_APPS.includes(stored as never) ? (stored as never) : '';
  } catch {
    return '';
  }
};

const rememberPaymentMode = (mode: string, app: string): void => {
  try {
    window.localStorage.setItem(LAST_MODE_KEY, mode);
    // Cleared for a non-UPI mode, so a shop that switches to cash does not
    // get last month's PhonePe back the next time somebody pays by UPI.
    if (mode === 'upi' && app) window.localStorage.setItem(LAST_APP_KEY, app);
    else window.localStorage.removeItem(LAST_APP_KEY);
  } catch {
    /* A preference that cannot be stored is not worth a failed save. */
  }
};
