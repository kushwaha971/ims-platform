'use client';

import { useCallback, useId, useMemo, type RefObject } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';

import {
  UbButton,
  UbDialog,
  UbField,
  UbFieldError,
  UbForm,
  UbMoneyInput,
  UbStack,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatAmount, isNegativeAmount } from 'src/utils/money';

import { useDepositSchemas } from '../validation/depositSchemas';
import { applyTotal, initialApplyRows, toReturn } from '../view-model/depositDisplay';

import type { ApplyDepositFormValues, Deposit, DepositCharge } from '../types/deposit.types';

// Loaded with dynamic(), so its own words come with its own chunk rather than
// with the screen that opens it (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/deposits';
import 'src/i18n/catalogues/payments';
import 'src/i18n/catalogues/validation';

/**
 * A4b (FRD 00 PLT-X02 §2 flow 3, §8; T-PLT-X02-11) — "Adjust from deposit".
 *
 * One act on screen: the charges the VERTICAL allowed (its own fines, the
 * invoices of its module — the core never chooses them), each with its due,
 * pre-filled oldest first from what is held; the total capped at the held
 * figure; and the footer says what that leaves to return ("Adjusting ₹120 ·
 * ₹380 still held"). Save hands the rows to the caller, which dispatches ONE
 * thunk — the server writes the two linked adjustment payments.
 *
 * Deposit figures are neutral in tone (PLT-X01 §8): the money is the member's.
 */
export function ApplyDepositDialog({
  deposit,
  charges,
  busy,
  errors,
  onClose,
  onConfirm,
  returnFocusRef,
}: Readonly<{
  deposit: Deposit;
  charges: readonly DepositCharge[];
  busy: boolean;
  errors: readonly string[];
  onClose: () => void;
  onConfirm: (values: ApplyDepositFormValues) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const { applySchemaFor } = useDepositSchemas();
  const formId = useId();
  const held = deposit.heldAmount;
  const schema = useMemo(() => applySchemaFor(held), [applySchemaFor, held]);
  const defaultValues = useMemo(
    () => ({ rows: initialApplyRows(held, charges), reason: '' }),
    [held, charges]
  );
  const form = useForm<ApplyDepositFormValues>({
    resolver: yupResolver(schema),
    mode: 'onTouched',
    defaultValues,
  });

  const rows = useWatch({ control: form.control, name: 'rows' }) ?? [];
  const left = toReturn(held, rows);
  const listError =
    form.formState.errors.rows?.message ?? form.formState.errors.rows?.root?.message;
  const handleSubmit = useCallback(
    (values: ApplyDepositFormValues) => onConfirm(values),
    [onConfirm]
  );

  return (
    <UbDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('payments.deposit.apply.title', { purpose: deposit.purpose })}
      description={t('payments.deposit.apply.desc', { amount: formatAmount(held) })}
      closeLabel={t('common.action.close')}
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
            disabled={charges.length === 0}
            data-testid="deposit-apply-confirm"
          >
            {t('payments.deposit.apply.confirm')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={handleSubmit} formErrors={errors}>
        {charges.length === 0 ? (
          <UbText variant="body-sm" tone="tertiary" data-testid="deposit-apply-none">
            {t('payments.deposit.apply.noCharges')}
          </UbText>
        ) : (
          <UbStack gap={3} data-testid="deposit-apply-rows">
            <UbStack
              as="ul"
              gap={0}
              className="divide-y divide-border-hairline rounded-card border border-border-hairline"
            >
              {charges.map((charge, index) => (
                <UbStack
                  as="li"
                  key={charge.documentId}
                  direction="row"
                  justify="between"
                  align="center"
                  className="gap-3 px-3 py-2"
                >
                  <UbStack gap={0} className="min-w-0">
                    <UbText variant="body-sm" className="ds-mono truncate">
                      {charge.number}
                    </UbText>
                    <UbText variant="caption" tone="tertiary">
                      {t('payments.deposit.apply.due', { amount: formatAmount(charge.due) })}
                    </UbText>
                  </UbStack>
                  <UbField
                    name={`rows.${index}.amount`}
                    label={t('payments.alloc.rowLabel', { number: charge.number })}
                    labelHidden
                    placeholder="0.00"
                    className="w-32 shrink-0"
                  >
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
                </UbStack>
              ))}
            </UbStack>
            {listError && <UbFieldError id="deposit-apply-error">{listError}</UbFieldError>}
            <UbText variant="caption" tone="secondary" data-testid="deposit-apply-footer">
              {t('payments.deposit.apply.footer', {
                applying: formatAmount(applyTotal(rows)),
                left: formatAmount(isNegativeAmount(left) ? '0.00' : left),
              })}
            </UbText>
            <UbField
              name="reason"
              label={t('payments.deposit.reason')}
              placeholder={t('payments.deposit.apply.reason.placeholder')}
              required
            >
              {(field) => <UbTextInput {...field} maxLength={160} autoComplete="off" />}
            </UbField>
          </UbStack>
        )}
      </UbForm>
    </UbDialog>
  );
}
