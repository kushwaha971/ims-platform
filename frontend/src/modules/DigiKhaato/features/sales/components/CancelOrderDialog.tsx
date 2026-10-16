'use client';

import { useCallback, useState } from 'react';

import { ReasonConfirmDialog } from 'src/components/records/ReasonConfirmDialog';
import { UbText } from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';

import { moveEstimate } from '../redux/salesFlowThunk';

import type { SalesDocument } from '../types/sales.types';
import 'src/i18n/catalogues/sales';

/**
 * Shop item 3 — "Cancel order SO/26-27/0004?" with the customer's reason (three
 * characters at least, the void's own rule and schema). A cancelled order keeps
 * its number and is never billed; nothing else moves, because an order never
 * moved anything.
 *
 * Shop item 4 — the same dialog voids a delivery challan (`move="void"`): the
 * goods came back, so the stock the challan took out is put back.
 *
 * The dialog is `ReasonConfirmDialog` (WP-03 D-04c); this file says what is
 * cancelled and what the snackbar says.
 */
export function CancelOrderDialog({
  doc,
  onClose,
  move = 'cancel',
}: Readonly<{
  doc: SalesDocument;
  onClose: () => void;
  move?: 'cancel' | 'void';
}>): React.JSX.Element {
  const ns = move === 'void' ? 'sales.challan.void' : 'sales.order.cancel';
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    async (reason: string) => {
      setBusy(true);
      const result = await dispatch(moveEstimate({ id: doc.id, move, note: reason }));
      setBusy(false);
      if (!moveEstimate.fulfilled.match(result)) return;
      dispatch(
        showSnackbar({
          severity: 'success',
          id: `${ns}.done`,
          params: { number: doc.number ?? '' },
        })
      );
      onClose();
    },
    [dispatch, doc.id, doc.number, onClose, move, ns]
  );

  return (
    <ReasonConfirmDialog
      title={t(`${ns}.title`, { number: doc.number ?? '' })}
      keepLabel={t(`${ns}.keep`)}
      confirmLabel={t(`${ns}.action`)}
      workingLabel={t(`${ns}.working`)}
      reasonLabel={t(`${ns}.reason`)}
      reasonPlaceholder={t(`${ns}.reasonPlaceholder`)}
      requiredMessageId="sales.void.reasonRequired"
      busy={busy}
      onConfirm={submit}
      onClose={onClose}
      confirmTestId="order-cancel-confirm"
    >
      <UbText variant="body-sm">{t(`${ns}.body`)}</UbText>
    </ReasonConfirmDialog>
  );
}
