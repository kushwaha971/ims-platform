'use client';

import { useCallback, useEffect, useId, useMemo, type RefObject } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';

import {
  UbButton,
  UbDateInput,
  UbDrawer,
  UbField,
  UbForm,
  UbInputHint,
  UbMoneyInput,
  UbRadioGroup,
  UbStatusBanner,
  isoFinancialYearStart,
} from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { todayInTenantTz } from 'src/utils/dates';
import { formatAmount, parseAmountInput } from 'src/utils/money';

import { useLedgerSchemas } from '../validation/ledgerSchemas';

import type { OpeningBalanceValues, UseOpeningBalanceResult } from '../hooks/useOpeningBalance';
import type { LedgerDirection } from '../types/ledger.types';

/**
 * LED-02 — the balance a merchant is carrying over from paper.
 *
 * The party form has this section too (PTY-01 FR-9), for a party being created.
 * This drawer is FR-3's other door: the party already exists, was created
 * without one, and the merchant is migrating their book gradually — which is
 * what actually happens, because nobody types forty customers' balances in one
 * sitting.
 *
 * ── Why the direction hint is under the toggle and not beside it ───────────
 * §8 asks for "You will get ₹2,300" in red or "You will give ₹2,300" in green
 * under the choice. It is the one place in this feature where the merchant can
 * check that they understood the question, and getting it wrong is silent: an
 * opening on the wrong side is a khata that says a customer owes money to a
 * shopkeeper who in fact owes it to them, and nothing later contradicts it.
 * So the hint restates the whole sentence with the amount in it, rather than
 * colouring the option.
 */
export function OpeningBalanceDrawer({
  opening,
  partyName,
  defaultDirection,
  returnFocusRef,
}: Readonly<{
  opening: UseOpeningBalanceResult;
  partyName: string;
  defaultDirection: LedgerDirection;
  /** Focus target on close when the opener is gone (QA D1) — the khata's ⋯. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const { openingBalanceSchema } = useLedgerSchemas();
  const formId = useId();
  const timezone = useAppSelector(selectTenantTimezone);

  const { open, isSaving, formErrors, close, submit } = opening;

  /* The TENANT's today, not the device's (LED-01 EC-8). The `as_of` picker
     allows anything back to 2000 and nothing after today. */
  const today = useMemo(() => todayInTenantTz(timezone ?? undefined), [timezone]);

  const defaults = useMemo<OpeningBalanceValues>(
    () => ({
      amount: '',
      direction: defaultDirection,
      /* UAT D6 (CR-LOG), changing FR-1's default from the financial-year
         start to TODAY. The year start is right for exactly one day a year;
         on every other day it asserts an age the merchant never gave, and
         aging counts an opening from its date (LED-09 BR-4, FIFO by
         `entry_date`) — so a balance typed in today sat in "90+ days" on day
         one while the Overdue chip was empty. Today claims nothing: the row is
         still labelled Opening, the hint under the field asks when the debt
         began, and the year start is one chip away for the merchant FR-1 was
         written for. Understating an age until the merchant says otherwise is
         the recoverable error; a false 90+ is a collection call nobody owed. */
      asOf: today,
    }),
    [defaultDirection, today]
  );

  const form = useForm<OpeningBalanceValues>({
    resolver: yupResolver(openingBalanceSchema),
    mode: 'onTouched',
    defaultValues: defaults,
  });
  const { reset, setError, formState } = form;

  useEffect(() => {
    if (open) reset(defaults);
  }, [open, reset, defaults]);

  /* `useWatch`, never `form.watch()` — the latter returns a function the React
     Compiler cannot memoise, so it skips memoising the whole component. */
  const amount = useWatch({ control: form.control, name: 'amount' });
  const direction = useWatch({ control: form.control, name: 'direction' });

  /* `parseAmountInput` BEFORE anything reads it: `UbMoneyInput` groups on blur,
     so the value here is "10,000.00" and a formatter handed that produces
     nonsense. The credit-limit hint learned this the expensive way — it worked
     for every figure under ₹1,000 and silently stopped above it. */
  const hint = useMemo(() => {
    const typed = parseAmountInput(amount ?? '');
    if (!typed.trim()) return undefined;
    return t(direction === 'credit' ? 'ledger.opening.hint.credit' : 'ledger.opening.hint.debit', {
      // `formatAmount`, not `formatInr`: the copy carries the ₹ because Hindi
      // puts the symbol elsewhere in the line.
      amount: formatAmount(typed),
    });
  }, [amount, direction, t]);

  const directionOptions = useMemo(
    () => [
      { value: 'debit' as const, label: t('ledger.opening.theyOwe') },
      { value: 'credit' as const, label: t('ledger.opening.iOwe') },
    ],
    [t]
  );

  const handleSubmit = useCallback(
    (values: OpeningBalanceValues) => submit(values, setError),
    [submit, setError]
  );
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
      title={t('ledger.opening.title')}
      description={partyName}
      closeLabel={t('common.action.close')}
      dismissOnBackdrop={!formState.isDirty}
      returnFocusRef={returnFocusRef}
      footer={
        <>
          <UbButton variant="secondary" onClick={close} disabled={isSaving}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            busy={isSaving}
            busyLabel={t('ledger.opening.saving')}
          >
            {t('ledger.opening.save')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={handleSubmit} formErrors={formErrors}>
        <UbStatusBanner tone="info" title={t('ledger.opening.subtitle')} />

        {/* "Amount", not "Opening balance" — the DRAWER is already titled that,
            and a field repeating its own dialog's title says nothing and makes
            the two ambiguous to anybody navigating by label, including a screen
            reader reading the form's controls in order. */}
        <UbField
          name="amount"
          label={t('ledger.entry.amount')}
          placeholder={t('ledger.entry.amount.placeholder')}
          required
        >
          {(field) => <UbMoneyInput {...field} autoFocus inputMode="decimal" />}
        </UbField>

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

        {/* The sentence the merchant checks their own understanding against.
            Outside `UbField` on purpose: it belongs to the PAIR of controls
            above it, not to either one, and hanging it off the amount would
            make it disappear the moment that field showed an error of its
            own — which is exactly when a merchant is re-reading the form. */}
        {hint && <UbInputHint>{hint}</UbInputHint>}

        <UbField
          name="asOf"
          label={t('ledger.opening.asOf')}
          placeholder={t('ledger.opening.asOf.placeholder')}
          hint={t('ledger.opening.asOf.hint', { direction })}
          required
        >
          {(field) => (
            <UbDateInput
              {...field}
              max={today}
              min="2000-01-01"
              quickChoicesLabel={t('ledger.entry.date.quick')}
              quickChoices={[
                { label: t('ledger.opening.fyStart'), date: isoFinancialYearStart() },
                { label: t('ledger.entry.date.today'), date: today },
              ]}
            />
          )}
        </UbField>
      </UbForm>
    </UbDrawer>
  );
}
