'use client';

import { useCallback, useId, useState } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';

import {
  UbButton,
  UbDialog,
  UbField,
  UbForm,
  UbStack,
  UbText,
  UbTextArea,
} from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';

import { movePurchaseOrder } from '../redux/purchaseBillThunk';
import { usePurchaseBillSchemas } from '../validation/purchaseBillSchemas';

import type { PurchaseBill } from '../types/purchase.types';
import 'src/i18n/catalogues/validation';

/**
 * Shop item 3 — "Cancel order PO/26-27/0004?" with the reason (three characters at
 * least, the void's own schema). A cancelled order keeps its number and is never
 * billed; nothing else moves, because an order never moved anything.
 */
export function PurchaseOrderCancelDialog({
  order,
  onClose,
}: Readonly<{ order: PurchaseBill; onClose: () => void }>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { voidReasonSchema } = usePurchaseBillSchemas();
  const formId = useId();
  const [busy, setBusy] = useState(false);
  const rhf = useForm<{ reason: string }>({
    resolver: yupResolver(voidReasonSchema),
    mode: 'onTouched',
    defaultValues: { reason: '' },
  });
  const reason = useWatch({ control: rhf.control, name: 'reason' }) ?? '';

  const submit = useCallback(
    async (values: { reason: string }) => {
      setBusy(true);
      const result = await dispatch(
        movePurchaseOrder({ id: order.id, verb: 'cancel', reason: values.reason.trim() })
      );
      setBusy(false);
      if (!movePurchaseOrder.fulfilled.match(result)) return;
      dispatch(
        showSnackbar({
          severity: 'success',
          id: 'purchases.order.cancel.done',
          params: { number: order.number ?? '' },
        })
      );
      onClose();
    },
    [dispatch, order.id, order.number, onClose]
  );

  return (
    <UbDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('purchases.order.cancel.title', { number: order.number ?? '' })}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={busy}>
            {t('purchases.order.cancel.keep')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            variant="destructive"
            busy={busy}
            busyLabel={t('purchases.order.cancel.working')}
            disabled={reason.trim().length < 3}
            data-testid="purchase-order-cancel-confirm"
          >
            {t('purchases.order.cancel.action')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={rhf} onSubmit={submit}>
        <UbStack gap={3}>
          <UbText variant="body-sm">{t('purchases.order.cancel.body')}</UbText>
          <UbField
            name="reason"
            label={t('purchases.order.cancel.reason')}
            placeholder={t('purchases.order.cancel.reasonPlaceholder')}
            required
          >
            {(field) => <UbTextArea {...field} maxLength={160} rows={2} />}
          </UbField>
        </UbStack>
      </UbForm>
    </UbDialog>
  );
}
