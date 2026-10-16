'use client';

import { useCallback, useState } from 'react';

import { ReasonConfirmDialog } from 'src/components/records/ReasonConfirmDialog';
import { UbText } from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';

import { movePurchaseOrder, voidDebitNote } from '../redux/purchaseBillThunk';

import type { PurchaseBill } from '../types/purchase.types';

/**
 * Shop item 3 — "Cancel order PO/26-27/0004?" with the reason (three characters at
 * least, the void's own schema). A cancelled order keeps its number and is never
 * billed; nothing else moves, because an order never moved anything.
 *
 * Shop P0 — the same question voids a debit note (`mode="voidNote"`): the goods come
 * back to the shelf and the bill owes again, so its copy says that instead.
 *
 * The dialog is `ReasonConfirmDialog` (WP-03 D-04c).
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
  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    async (reason: string) => {
      setBusy(true);
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
    <ReasonConfirmDialog
      title={t(`${ns}.title`, { number: order.number ?? '' })}
      keepLabel={t(`${ns}.keep`)}
      confirmLabel={t(`${ns}.action`)}
      workingLabel={t(`${ns}.working`)}
      reasonLabel={t(`${ns}.reason`)}
      reasonPlaceholder={t(`${ns}.reasonPlaceholder`)}
      requiredMessageId="purchases.void.reasonRequired"
      busy={busy}
      onConfirm={submit}
      onClose={onClose}
      confirmTestId={
        mode === 'voidNote' ? 'debit-note-void-confirm' : 'purchase-order-cancel-confirm'
      }
    >
      <UbText variant="body-sm">{t(`${ns}.body`)}</UbText>
    </ReasonConfirmDialog>
  );
}
