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

import { movePurchaseOrder, voidDebitNote } from '../redux/purchaseBillThunk';
import { usePurchaseBillSchemas } from '../validation/purchaseBillSchemas';

import type { PurchaseBill } from '../types/purchase.types';
import 'src/i18n/catalogues/validation';

/**
 * Shop item 3 — "Cancel order PO/26-27/0004?" with the reason (three characters at
 * least, the void's own schema). A cancelled order keeps its number and is never
 * billed; nothing else moves, because an order never moved anything.
 *
 * Shop P0 — the same question voids a debit note (`mode="voidNote"`): the goods come
 * back to the shelf and the bill owes again, so its copy says that instead.
 */
export function PurchaseOrderCancelDialog({
  order,
  onClose,
  mode = 'cancelOrder',
}: Readonly<{
  order: PurchaseBill;
  onClose: () => void;
  mode?: 'cancelOrder' | 'voidNote';
}>): React.JSX.Element {
  const { t } = useTranslation();
  const ns = mode === 'voidNote' ? 'purchases.debitNote.void' : 'purchases.order.cancel';
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
      const reason = values.reason.trim();
      const result =
        mode === 'voidNote'
          ? await dispatch(voidDebitNote({ id: order.id, reason }))
          : await dispatch(movePurchaseOrder({ id: order.id, verb: 'cancel', reason }));
      setBusy(false);
      if (result.meta.requestStatus !== 'fulfilled') return;
      dispatch(
        showSnackbar({
          severity: 'success',
          id: `${ns}.done`,
          params: { number: order.number ?? '' },
        })
      );
      onClose();
    },
    [dispatch, order.id, order.number, onClose, mode, ns]
  );

  return (
    <UbDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t(`${ns}.title`, { number: order.number ?? '' })}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={busy}>
            {t(`${ns}.keep`)}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            variant="destructive"
            busy={busy}
            busyLabel={t(`${ns}.working`)}
            disabled={reason.trim().length < 3}
            data-testid={
              mode === 'voidNote' ? 'debit-note-void-confirm' : 'purchase-order-cancel-confirm'
            }
          >
            {t(`${ns}.action`)}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={rhf} onSubmit={submit}>
        <UbStack gap={3}>
          <UbText variant="body-sm">{t(`${ns}.body`)}</UbText>
          <UbField
            name="reason"
            label={t(`${ns}.reason`)}
            placeholder={t(`${ns}.reasonPlaceholder`)}
            required
          >
            {(field) => <UbTextArea {...field} maxLength={160} rows={2} />}
          </UbField>
        </UbStack>
      </UbForm>
    </UbDialog>
  );
}
