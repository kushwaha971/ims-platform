'use client';

import { useCallback, useId } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';

import {
  UbButton,
  UbDialog,
  UbField,
  UbForm,
  UbStack,
  UbStatusBanner,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import type { ApiErrorShape } from 'src/types/api.types';
import { formatInr } from 'src/utils/money';

import { usePurchaseBillSchemas } from '../validation/purchaseBillSchemas';
import { shortLines, supplierName, voidConsequences } from '../view-model/purchaseBillDisplay';

import type { PurchaseBill } from '../types/purchase.types';

/**
 * PUR-04 FR-3 / §7 — "Void PB/26-27/0007?", with the consequences listed
 * BEFORE the reason is typed (AC-2): the stock each line takes back out, the
 * khata effect in the supplier's terms, and any payment that becomes an
 * advance. The confirm is outlined, never filled red (§8, Koper rule).
 *
 * A refusal is shown here, where the merchant is looking: goods already sold
 * read "Rice would go to −8 NOS" (AC-4), and the fix is named.
 *
 * Deliberately absent: FR-4's "Average cost unchanged". CR-2026-09-24-INV-A
 * made the void remove the value the bill blended in, so it does change.
 */
export function PurchaseBillVoidDialog({
  bill,
  busy,
  error,
  onClose,
  onConfirm,
}: Readonly<{
  bill: PurchaseBill;
  busy: boolean;
  error: ApiErrorShape | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const { voidReasonSchema } = usePurchaseBillSchemas();
  const formId = useId();
  const rhf = useForm<{ reason: string }>({
    resolver: yupResolver(voidReasonSchema),
    mode: 'onTouched',
    defaultValues: { reason: '' },
  });
  const consequences = voidConsequences(bill);
  const short = error?.code === 'insufficient_stock' ? shortLines(error.details) : [];

  const handleSubmit = useCallback(
    (values: { reason: string }) => onConfirm(values.reason.trim()),
    [onConfirm]
  );

  return (
    <UbDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('purchases.void.title', { number: bill.number ?? '' })}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            variant="destructive"
            busy={busy}
            busyLabel={t('purchases.void.working')}
            data-testid="purchase-void-confirm"
          >
            {t('purchases.void.confirm')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={rhf} onSubmit={handleSubmit}>
        <UbStack gap={1} data-testid="purchase-void-consequences">
          <UbText variant="caption" tone="tertiary">
            {t('purchases.void.consequencesTitle')}
          </UbText>
          {consequences.stock.length > 0 && (
            <UbText variant="body-sm">
              {t('purchases.void.stock', {
                items: consequences.stock
                  .map((line) => `${line.qty} ${line.unit} ${line.name}`)
                  .join(', '),
              })}
            </UbText>
          )}
          {consequences.khata && (
            <UbText variant="body-sm">
              {t('purchases.void.khata', {
                amount: formatInr(consequences.khata),
                name: supplierName(bill),
              })}
            </UbText>
          )}
          {consequences.advance && (
            <UbText variant="body-sm">
              {t('purchases.void.advance', { amount: formatInr(consequences.advance) })}
            </UbText>
          )}
        </UbStack>
        {short.length > 0 && (
          <UbStatusBanner
            tone="error"
            title={t('purchases.void.shortTitle')}
            description={`${short
              .map((line) =>
                t('purchases.void.shortLine', { name: line.name, qty: line.after, unit: line.unit })
              )
              .join(' · ')} ${t('purchases.void.shortFix')}`}
          />
        )}
        {error && error.code !== 'insufficient_stock' && (
          <UbStatusBanner tone="error" title={error.message} />
        )}
        <UbField
          name="reason"
          label={t('purchases.void.reason')}
          placeholder={t('purchases.void.reasonPlaceholder')}
          required
        >
          {(field) => <UbTextInput {...field} maxLength={160} autoComplete="off" />}
        </UbField>
      </UbForm>
    </UbDialog>
  );
}
