'use client';

import { useCallback, useEffect } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectNetworkImpaired } from 'src/redux/slice/networkSlice';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { formatInr } from 'src/utils/money';

import {
  purchaseVoidErrorCleared,
  selectPurchaseBillDetail,
  type PurchaseBillDetailState,
} from '../redux/purchaseBillDetailSlice';
import { fetchPurchaseBill, voidPurchaseBill } from '../redux/purchaseBillThunk';
import { releasedTotal } from '../view-model/purchaseToasts';

/**
 * PUR-01 FR-9 / PUR-04 — the detail page's data and its one act, the void.
 * The void's 409s (`insufficient_stock`, `document_already_void`) are shown IN
 * the dialog, where the merchant is looking; success is a toast naming the
 * number (§6: "PB/26-27/0007 voided").
 */
export interface UsePurchaseBillDetailResult extends PurchaseBillDetailState {
  readonly canRead: boolean;
  readonly canWrite: boolean;
  readonly canVoid: boolean;
  readonly voidBill: (reason: string) => Promise<boolean>;
  readonly clearVoidError: () => void;
}

export const usePurchaseBillDetail = (id: string): UsePurchaseBillDetailResult => {
  const dispatch = useAppDispatch();
  const detail = useAppSelector(selectPurchaseBillDetail);
  const isImpaired = useAppSelector(selectNetworkImpaired);
  const { can, hasModule } = usePermissions();
  const enabled = hasModule('purchases');
  const canRead = enabled && can('purchases.bill.read');

  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchPurchaseBill(id));
    return () => promise.abort();
  }, [dispatch, id, canRead]);

  useEffect(() => {
    if (!detail.stale || isImpaired || !canRead) return undefined;
    const promise = dispatch(fetchPurchaseBill(id));
    return () => promise.abort();
  }, [detail.stale, isImpaired, canRead, dispatch, id]);

  const voidBill = useCallback(
    async (reason: string): Promise<boolean> => {
      const result = await dispatch(voidPurchaseBill({ id, reason }));
      if (!voidPurchaseBill.fulfilled.match(result)) return false;
      /* PUR-02 BR-4 — money already paid on the bill is not lost: it stays with
         the supplier as an advance, and the toast says how much. */
      const advance = releasedTotal(result.payload);
      dispatch(
        showSnackbar({
          severity: 'success',
          id: advance ? 'purchases.void.doneAdvance' : 'purchases.void.done',
          params: {
            number: result.payload.bill.number ?? '',
            ...(advance ? { amount: formatInr(advance) } : {}),
          },
        })
      );
      return true;
    },
    [dispatch, id]
  );
  const clearVoidError = useCallback(() => dispatch(purchaseVoidErrorCleared()), [dispatch]);

  return {
    ...detail,
    canRead,
    canWrite: enabled && can('purchases.bill.write'),
    canVoid: enabled && can('purchases.bill.void'),
    voidBill,
    clearVoidError,
  };
};
