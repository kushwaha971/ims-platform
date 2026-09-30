'use client';

import { useCallback, useId, useMemo, type RefObject } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';

import {
  UbButton,
  UbChoiceChips,
  UbDrawer,
  UbField,
  UbForm,
  UbMoneyInput,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { PAYMENT_MODES, type PaymentMode } from 'src/types/domain.types';
import { formatAmount } from 'src/utils/money';

import { useDepositSchemas } from '../validation/depositSchemas';
import { receivable } from '../view-model/depositDisplay';

import type { Deposit, DepositMoneyFormValues } from '../types/deposit.types';

// Loaded with dynamic(), so its own words come with its own chunk rather than
// with the screen that opens it (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/deposits';
import 'src/i18n/catalogues/payments';
import 'src/i18n/catalogues/validation';

export type DepositMoneyKind = 'receive' | 'refund';

/**
 * A4b (FRD 00 PLT-X02 §2 flows 2 and 4) — "Take deposit" and "Return deposit":
 * one amount, one way the money moved, and for a return the reason. One drawer
 * for both, because they are the same form facing opposite ways; the cap is
 * what may still be received, or what is held.
 *
 * `adjustment` is never offered: taking or returning a deposit is real money
 * (R24), and the server refuses it anyway. Loaded with `dynamic()` from the
 * panel, because a khata is read far more often than a deposit moves.
 */
export function DepositMoneyDrawer({
  kind,
  deposit,
  busy,
  errors,
  onClose,
  onConfirm,
  returnFocusRef,
}: Readonly<{
  kind: DepositMoneyKind;
  deposit: Deposit;
  busy: boolean;
  errors: readonly string[];
  onClose: () => void;
  onConfirm: (values: DepositMoneyFormValues) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const { moneySchemaFor } = useDepositSchemas();
  const formId = useId();
  const cap = kind === 'receive' ? receivable(deposit) : deposit.heldAmount;
  const schema = useMemo(() => moneySchemaFor(kind, cap), [moneySchemaFor, kind, cap]);
  const form = useForm<DepositMoneyFormValues>({
    resolver: yupResolver(schema),
    mode: 'onTouched',
    defaultValues: { amount: cap, mode: '', upiApp: '', reference: '', reason: '' },
  });
  const mode = useWatch({ control: form.control, name: 'mode' });
  const modeOptions = useMemo(
    () => PAYMENT_MODES.map((value) => ({ value, label: t(`ledger.mode.${value}`) })),
    [t]
  );
  const handleSubmit = useCallback(
    (values: DepositMoneyFormValues) => onConfirm(values),
    [onConfirm]
  );

  const receive = kind === 'receive';
  return (
    <UbDrawer
      open
      onOpenChange={(next) => !next && onClose()}
      title={t(receive ? 'payments.deposit.receive.title' : 'payments.deposit.refund.title', {
        purpose: deposit.purpose,
      })}
      description={t(receive ? 'payments.deposit.receive.desc' : 'payments.deposit.refund.desc', {
        name: deposit.party.name,
        amount: formatAmount(cap),
      })}
      closeLabel={t('common.action.close')}
      dismissOnBackdrop={!form.formState.isDirty}
      returnFocusRef={returnFocusRef}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            busy={busy}
            busyLabel={t('payments.deposit.working')}
            data-testid={`deposit-${kind}-confirm`}
          >
            {t(receive ? 'payments.deposit.receive.confirm' : 'payments.deposit.refund.confirm')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={handleSubmit} formErrors={errors}>
        <UbField name="amount" label={t('payments.column.amount')} required>
          {(field) => (
            <UbMoneyInput
              {...field}
              value={field.value as string}
              onChange={field.onChange}
              inputMode="decimal"
              disabled={busy}
            />
          )}
        </UbField>
        <UbField name="mode" label={t('payments.deposit.mode')} required controlOwnsLabel>
          {(field) => (
            <UbChoiceChips<PaymentMode>
              id={field.id}
              ariaLabel={t('payments.deposit.mode')}
              value={field.value as PaymentMode | ''}
              onChange={(next) => field.onChange(next)}
              onBlur={field.onBlur}
              options={modeOptions}
              invalid={field.invalid}
              describedBy={field['aria-describedby']}
              disabled={busy}
            />
          )}
        </UbField>
        {mode && mode !== 'cash' && (
          <UbField name="reference" label={t('payments.reference.label')}>
            {(field) => <UbTextInput {...field} maxLength={64} autoComplete="off" />}
          </UbField>
        )}
        {!receive && (
          <UbField
            name="reason"
            label={t('payments.deposit.reason')}
            placeholder={t('payments.deposit.reason.placeholder')}
            required
          >
            {(field) => <UbTextInput {...field} maxLength={160} autoComplete="off" />}
          </UbField>
        )}
        <UbText variant="caption" tone="tertiary">
          {t(receive ? 'payments.deposit.receive.note' : 'payments.deposit.refund.note')}
        </UbText>
      </UbForm>
    </UbDrawer>
  );
}
