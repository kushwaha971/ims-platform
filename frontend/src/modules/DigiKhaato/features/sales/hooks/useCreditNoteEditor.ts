'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { useRouter } from 'next/navigation';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch, type Resolver, type UseFormReturn } from 'react-hook-form';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useIdempotencyKey } from 'src/hooks/useIdempotencyKey';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { ROUTES } from 'src/routes';
import { todayInTenantTz } from 'src/utils/dates';

import {
  creditNoteEditorReset,
  selectCreditNoteEditor,
  type CreditNoteEditorState,
} from '../redux/creditNoteEditorSlice';
import { fetchCreditSource, issueCreditNote } from '../redux/salesFlowThunk';
import { useSalesFlowSchemas, type CreditNoteFormValues } from '../validation/salesFlowSchemas';
import {
  creditNotePreview,
  creditNoteWireBody,
  emptyCreditNoteForm,
  returnCaps,
  settlementSplit,
} from '../view-model/creditNoteForm';

import type { EngineResult } from '../view-model/taxEngine';

/**
 * SAL-04 — the return editor's orchestration: load the invoice, seed a row per
 * invoice line at quantity 0, preview at the invoice's snapshot rates, and
 * issue in one request with a key that survives a retry (EC-8). The form's
 * resolver is built from the invoice's caps, so "Only 2 NOS can be returned"
 * is said under the row before the tap; the server says it again on locked
 * rows, which is the check that holds against a second device.
 */
export interface UseCreditNoteEditorResult {
  readonly state: CreditNoteEditorState;
  readonly form: UseFormReturn<CreditNoteFormValues>;
  readonly values: CreditNoteFormValues;
  readonly preview: EngineResult | null;
  readonly split: { readonly applied: string; readonly left: string } | null;
  readonly today: string;
  readonly canWrite: boolean;
  readonly issue: () => Promise<void>;
}

export const useCreditNoteEditor = (againstId: string | null): UseCreditNoteEditorResult => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const state = useAppSelector(selectCreditNoteEditor);
  const timezone = useAppSelector(selectTenantTimezone);
  const { can, hasModule } = usePermissions();
  const { creditNoteSchemaFor } = useSalesFlowSchemas();
  const idempotency = useIdempotencyKey();
  const today = useMemo(() => todayInTenantTz(timezone ?? undefined), [timezone]);
  const canWrite = hasModule('sales') && can('sales.credit_note.write');
  const source = state.source?.id === againstId ? state.source : null;

  useEffect(() => {
    dispatch(creditNoteEditorReset());
    if (!againstId) return undefined;
    const promise = dispatch(fetchCreditSource(againstId));
    return () => promise.abort();
  }, [dispatch, againstId]);

  const resolver = useMemo(
    () =>
      source
        ? (yupResolver(creditNoteSchemaFor(returnCaps(source))) as Resolver<CreditNoteFormValues>)
        : undefined,
    [source, creditNoteSchemaFor]
  );
  const form = useForm<CreditNoteFormValues>({ resolver, mode: 'onTouched' });
  const values = useWatch({ control: form.control }) as CreditNoteFormValues;
  const { reset } = form;
  useEffect(() => {
    if (source) reset(emptyCreditNoteForm(source, today));
  }, [source, today, reset]);

  const preview = useMemo(
    () => (source && values?.lines ? creditNotePreview(source, values) : null),
    [source, values]
  );
  const split = useMemo(
    () => (source && preview ? settlementSplit(source, preview.grandTotal) : null),
    [source, preview]
  );

  const issue = useCallback(async () => {
    if (!source || !preview || !split) return;
    const valid = await form.trigger();
    if (!valid) return;
    const body = creditNoteWireBody(source, form.getValues(), split.left);
    const result = await dispatch(issueCreditNote({ body, idempotencyKey: idempotency.key }));
    if (issueCreditNote.fulfilled.match(result)) {
      idempotency.rotate();
      router.push(`${ROUTES.SALES_CREDIT_NOTES}/${result.payload.document.id}`);
      return;
    }
    if (result.payload?.code !== 'network_error' && result.payload?.code !== 'timeout') {
      idempotency.rotate();
    }
  }, [source, preview, split, form, dispatch, idempotency, router]);

  return { state, form, values, preview, split, today, canWrite, issue };
};
