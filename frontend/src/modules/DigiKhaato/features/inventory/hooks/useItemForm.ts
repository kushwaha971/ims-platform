'use client';

import { useCallback, useMemo, useState } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useIdempotencyKey } from 'src/hooks/useIdempotencyKey';
import { usePermissions } from 'src/hooks/usePermissions';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape } from 'src/types/api.types';
import { applyServerErrors } from 'src/utils/applyServerErrors';

import { ITEM_FORM_FIELDS, SERVER_FIELD_TO_ITEM_FORM } from '../constants/inventoryConstants';
import {
  itemCreateOpened,
  itemEditOpened,
  itemFormClosed,
  selectItemFormEditing,
  selectItemFormOpenFor,
  selectItemFormPrefillBarcode,
  selectItemFormPrefillName,
  selectItemFormStatus,
} from '../redux/itemFormSlice';
import { saveItem } from '../redux/itemThunk';

import type { Item, ItemFormValues } from '../types/item.types';
import type { UseFormSetError } from 'react-hook-form';

/**
 * The item form's behaviour, shared by the list and the item page. The drawer
 * draws; this decides — open/close, the idempotency key, the submit and what a
 * refusal means for each field.
 */
export interface UseItemFormResult {
  readonly open: boolean;
  readonly isEdit: boolean;
  readonly editing: Item | null;
  readonly prefillBarcode: string;
  readonly prefillName: string;
  readonly isSaving: boolean;
  readonly canWrite: boolean;
  readonly canAdjust: boolean;
  readonly formErrors: readonly string[];
  readonly staleVersion: boolean;
  readonly openCreate: (prefill?: { barcode?: string; name?: string }) => void;
  readonly openEdit: (item: Item) => void;
  readonly close: () => void;
  readonly submit: (
    values: ItemFormValues,
    setError: UseFormSetError<ItemFormValues>
  ) => Promise<Item | null>;
}

/** Nested server details (`opening_stock.qty`) re-keyed to the flat form fields. */
const rekey = (details: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  Object.entries(details).forEach(([key, value]) => {
    if (key === 'field_codes') return;
    if (key === 'opening_stock' && value && typeof value === 'object' && !Array.isArray(value)) {
      Object.entries(value as Record<string, unknown>).forEach(([inner, message]) => {
        out[SERVER_FIELD_TO_ITEM_FORM[`opening_stock.${inner}`] ?? inner] = message;
      });
      return;
    }
    out[SERVER_FIELD_TO_ITEM_FORM[key] ?? key] = value;
  });
  return out;
};

export function useItemForm(): UseItemFormResult {
  const dispatch = useAppDispatch();
  const { can } = usePermissions();
  const openFor = useAppSelector(selectItemFormOpenFor);
  const editing = useAppSelector(selectItemFormEditing);
  const status = useAppSelector(selectItemFormStatus);
  const prefillBarcode = useAppSelector(selectItemFormPrefillBarcode);
  const prefillName = useAppSelector(selectItemFormPrefillName);
  const { key, rotate } = useIdempotencyKey();
  const [formErrors, setFormErrors] = useState<readonly string[]>([]);
  const [staleVersion, setStaleVersion] = useState(false);

  const reset = () => {
    setFormErrors([]);
    setStaleVersion(false);
  };

  const openCreate = useCallback(
    (prefill?: { barcode?: string; name?: string }) => {
      reset();
      dispatch(itemCreateOpened(prefill));
    },
    [dispatch]
  );
  const openEdit = useCallback(
    (item: Item) => {
      reset();
      dispatch(itemEditOpened(item));
    },
    [dispatch]
  );
  const close = useCallback(() => {
    reset();
    dispatch(itemFormClosed());
  }, [dispatch]);

  const submit = useCallback(
    async (values: ItemFormValues, setError: UseFormSetError<ItemFormValues>) => {
      reset();
      const turningOn = Boolean(editing && !editing.trackStock && values.trackStock);
      try {
        const saved = await dispatch(
          saveItem({
            values,
            item: editing,
            idempotencyKey: key,
            withOpening: !editing || turningOn,
          })
        ).unwrap();
        rotate();
        dispatch(
          showSnackbar({
            severity: 'success',
            id: 'items.form.saved',
            params: { sku: saved.item.sku },
          })
        );
        const warning = saved.warnings[0];
        if (warning) dispatch(showSnackbar({ severity: 'warning', message: warning.message }));
        return saved.item;
      } catch (thrown) {
        const error = thrown as ApiErrorShape;
        const details = (error.details ?? {}) as Record<string, unknown>;
        if (
          error.code === 'validation_error' ||
          error.code === 'duplicate_sku' ||
          error.code === 'barcode_exists'
        ) {
          rotate();
          const fieldOnly = Object.fromEntries(
            Object.entries(rekey(details)).filter(([k]) => !['item_id', 'item_name'].includes(k))
          );
          const unanchored = applyServerErrors({ ...error, details: fieldOnly }, setError, [
            ...ITEM_FORM_FIELDS,
          ]);
          setFormErrors(unanchored);
          return null;
        }
        if (error.code === 'stale_version') {
          setStaleVersion(true);
          return null;
        }
        /* 409s with a single sentence (stock_nonzero, unit_locked,
           opening_stock_required, item_type_locked) are said in the form. */
        if (error.status === 409 || error.status === 403) setFormErrors([error.message]);
        return null;
      }
    },
    [dispatch, editing, key, rotate]
  );

  return useMemo(
    () => ({
      open: openFor !== null,
      isEdit: openFor !== null && openFor !== 'new',
      editing,
      prefillBarcode,
      prefillName,
      isSaving: status === 'loading',
      canWrite: can('inventory.item.write'),
      canAdjust: can('inventory.stock.adjust'),
      formErrors,
      staleVersion,
      openCreate,
      openEdit,
      close,
      submit,
    }),
    [
      openFor,
      editing,
      prefillBarcode,
      prefillName,
      status,
      can,
      formErrors,
      staleVersion,
      openCreate,
      openEdit,
      close,
      submit,
    ]
  );
}
