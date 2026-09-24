'use client';

import { useCallback, useMemo, useState } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useIdempotencyKey } from 'src/hooks/useIdempotencyKey';
import { usePermissions } from 'src/hooks/usePermissions';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape } from 'src/types/api.types';
import { applyServerErrors } from 'src/utils/applyServerErrors';
import { readDetail } from 'src/utils/errorDetails';

import { toAdjustmentBody } from '../api/stockService';
import { ADJUSTMENT_FORM_FIELDS } from '../constants/inventoryConstants';
import {
  adjustmentClosed,
  adjustmentOpened,
  adjustmentViewClosed,
  adjustmentViewOpened,
  selectAdjustmentOpen,
  selectAdjustmentPrefill,
  selectAdjustmentStatus,
  selectAdjustmentViewingId,
} from '../redux/stockAdjustmentSlice';
import { postStockAdjustment } from '../redux/stockThunk';
import { signedQtyString } from '../view-model/adjustmentMath';

import type {
  AdjustmentFormLine,
  AdjustmentFormValues,
  InsufficientLine,
  ItemListRow,
  StockAdjustment,
} from '../types/item.types';
import type { UseFormSetError } from 'react-hook-form';

/**
 * INV-06 — the adjustment drawer's behaviour. Opened from the list row, the
 * item page and the low-stock list with the item(s) preselected; posts with a
 * key minted once per logical post (EC-8), and turns a 409
 * `insufficient_stock` into per-line messages drawn on EVERY short line.
 */
export interface UseStockAdjustmentResult {
  readonly open: boolean;
  readonly prefill: readonly AdjustmentFormLine[];
  readonly isPosting: boolean;
  readonly canAdjust: boolean;
  readonly shortLines: readonly InsufficientLine[];
  readonly negativeOff: boolean;
  readonly formErrors: readonly string[];
  /** The adjustment whose detail sheet is open, if any. */
  readonly viewingId: string | null;
  readonly openFor: (rows?: readonly AdjustableRow[]) => void;
  readonly close: () => void;
  readonly view: (id: string) => void;
  readonly closeView: () => void;
  readonly submit: (
    values: AdjustmentFormValues,
    setError: UseFormSetError<AdjustmentFormValues>
  ) => Promise<StockAdjustment | null>;
}

/** What an entry point must know about an item to preselect it. */
export type AdjustableRow = Pick<
  ItemListRow,
  'id' | 'name' | 'unit' | 'onHand' | 'avgCost' | 'trackStock'
>;

export const lineFromRow = (row: Omit<AdjustableRow, 'trackStock'>): AdjustmentFormLine => ({
  itemId: row.id,
  itemName: row.name,
  unitCode: row.unit.code,
  allowDecimal: row.unit.allowDecimal,
  onHand: row.onHand ?? '0.000',
  avgCost: row.avgCost ?? '0.0000',
  mode: 'by',
  qty: '',
  unitCost: row.avgCost && Number(row.avgCost) > 0 ? row.avgCost : '',
});

export const toShortLines = (details: Readonly<Record<string, unknown>>): InsufficientLine[] => {
  const raw = details.lines;
  if (!Array.isArray(raw)) return [];
  return raw.map((line: Record<string, unknown>) => ({
    index: Number(line.index),
    itemId: String(line.item_id ?? ''),
    itemName: String(line.item_name ?? ''),
    requested: String(line.requested ?? ''),
    available: String(line.available ?? ''),
    unitCode: String(line.unit_code ?? ''),
  }));
};

export function useStockAdjustment(): UseStockAdjustmentResult {
  const dispatch = useAppDispatch();
  const { can } = usePermissions();
  const open = useAppSelector(selectAdjustmentOpen);
  const prefill = useAppSelector(selectAdjustmentPrefill);
  const status = useAppSelector(selectAdjustmentStatus);
  const viewingId = useAppSelector(selectAdjustmentViewingId);
  const { key, rotate } = useIdempotencyKey();
  const [shortLines, setShortLines] = useState<readonly InsufficientLine[]>([]);
  const [negativeOff, setNegativeOff] = useState(false);
  const [formErrors, setFormErrors] = useState<readonly string[]>([]);

  const clearErrors = useCallback(() => {
    setShortLines([]);
    setNegativeOff(false);
    setFormErrors([]);
  }, []);

  const openFor = useCallback(
    (rows?: readonly AdjustableRow[]) => {
      clearErrors();
      dispatch(adjustmentOpened((rows ?? []).filter((row) => row.trackStock).map(lineFromRow)));
    },
    [dispatch, clearErrors]
  );
  const close = useCallback(() => {
    clearErrors();
    dispatch(adjustmentClosed());
  }, [dispatch, clearErrors]);
  const view = useCallback((id: string) => dispatch(adjustmentViewOpened(id)), [dispatch]);
  const closeView = useCallback(() => dispatch(adjustmentViewClosed()), [dispatch]);

  const submit = useCallback(
    async (values: AdjustmentFormValues, setError: UseFormSetError<AdjustmentFormValues>) => {
      clearErrors();
      const body = toAdjustmentBody(values, (index) => {
        const line = values.lines[index];
        return line ? signedQtyString(line) : '';
      });
      try {
        const posted = await dispatch(postStockAdjustment({ body, idempotencyKey: key })).unwrap();
        rotate();
        dispatch(
          showSnackbar({
            severity: 'success',
            id: 'stock.adjust.posted',
            params: { number: posted.number },
          })
        );
        return posted;
      } catch (thrown) {
        const error = thrown as ApiErrorShape;
        if (error.code === 'insufficient_stock') {
          /* Nothing was written and the server keeps no record of a refused
             key, so the corrected post goes out under a fresh one — the same
             key with a different body would be `idempotency_conflict`. */
          rotate();
          setShortLines(toShortLines(error.details));
          setNegativeOff(readDetail(error.details, 'allow_negative_stock') === false);
          return null;
        }
        if (error.code === 'validation_error') {
          rotate();
          setFormErrors(applyServerErrors(error, setError, [...ADJUSTMENT_FORM_FIELDS]));
          return null;
        }
        if (error.status === 409) setFormErrors([error.message]);
        return null;
      }
    },
    [dispatch, key, rotate, clearErrors]
  );

  return useMemo(
    () => ({
      open,
      prefill,
      isPosting: status === 'loading',
      canAdjust: can('inventory.stock.adjust'),
      shortLines,
      negativeOff,
      formErrors,
      viewingId,
      openFor,
      close,
      view,
      closeView,
      submit,
    }),
    [
      open,
      prefill,
      status,
      can,
      shortLines,
      negativeOff,
      formErrors,
      viewingId,
      openFor,
      close,
      view,
      closeView,
      submit,
    ]
  );
}
