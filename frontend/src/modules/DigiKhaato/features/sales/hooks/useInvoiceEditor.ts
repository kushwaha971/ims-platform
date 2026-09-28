'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useIdempotencyKey } from 'src/hooks/useIdempotencyKey';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { todayInTenantTz } from 'src/utils/dates';

import {
  editorReset,
  selectInvoiceEditor,
  type InvoiceEditorState,
} from '../redux/invoiceEditorSlice';
import { fetchFlowDocument, moveEstimate, saveEstimateDraft } from '../redux/salesFlowThunk';
import {
  fetchInvoice,
  fetchSalesContext,
  issueInvoice,
  saveInvoiceDraft,
} from '../redux/salesThunk';
import {
  defaultBillingMode,
  emptyInvoiceForm,
  fromDocument,
  paymentWireBody,
  previewInput,
  toWireBody,
  type InvoiceFormValues,
  type PaymentRowForm,
} from '../view-model/invoiceForm';
import { computeDocumentTotals, type EngineResult } from '../view-model/taxEngine';

import type { SalesDocumentEnvelope } from '../types/sales.types';

/**
 * SAL-02 §14 — the editor orchestrator. React Hook Form owns what the merchant
 * types; `invoiceEditorSlice` owns what the server says. The preview totals
 * are the client engine over the form (≤ 16 ms for 50 lines, §5), replaced
 * by the server's figures the moment a save returns — and at issue the server
 * recomputes everything regardless (FR-3).
 */
/** SAL-01 TSK-SAL-01-07 — the kind drives the title, the fields and the actions; one editor. */
export type EditorKind = 'invoice' | 'estimate';

/** The draft body for the kind: an estimate adds its validity and never has a due date. */
const wireBodyFor = (kind: EditorKind, values: InvoiceFormValues): Record<string, unknown> =>
  kind === 'estimate'
    ? { ...toWireBody(values), due_on: null, valid_until: values.validUntil || null }
    : toWireBody(values);

export interface UseInvoiceEditorResult {
  readonly kind: EditorKind;
  readonly form: UseFormReturn<InvoiceFormValues>;
  readonly values: InvoiceFormValues;
  readonly preview: EngineResult;
  readonly editor: InvoiceEditorState;
  readonly today: string;
  readonly canWrite: boolean;
  readonly save: (quiet: boolean) => Promise<SalesDocumentEnvelope | null>;
  readonly issue: (
    payment: readonly PaymentRowForm[] | null,
    override?: boolean
  ) => Promise<SalesDocumentEnvelope | null>;
  readonly restart: () => void;
}

export const useInvoiceEditor = (
  documentId: string | null,
  kind: EditorKind = 'invoice'
): UseInvoiceEditorResult => {
  const dispatch = useAppDispatch();
  const editor = useAppSelector(selectInvoiceEditor);
  const timezone = useAppSelector(selectTenantTimezone);
  const { can, hasModule } = usePermissions();
  const today = useMemo(() => todayInTenantTz(timezone ?? undefined), [timezone]);
  const canWrite =
    hasModule('sales') && can(kind === 'estimate' ? 'sales.estimate.write' : 'sales.invoice.write');
  const idempotency = useIdempotencyKey();

  const form = useForm<InvoiceFormValues>({
    defaultValues: emptyInvoiceForm(today, 'party', ''),
    mode: 'onTouched',
  });
  const values = useWatch({ control: form.control }) as InvoiceFormValues;

  // Load: the shop's context always, the draft when editing one.
  useEffect(() => {
    dispatch(editorReset());
    const context = dispatch(fetchSalesContext(today));
    const draft = !documentId
      ? null
      : kind === 'estimate'
        ? dispatch(fetchFlowDocument({ kind: 'estimate', id: documentId }))
        : dispatch(fetchInvoice(documentId));
    return () => {
      context.abort();
      draft?.abort();
    };
  }, [dispatch, documentId, today, kind]);

  // Seed the form ONCE per editor: from the draft, or from the shop's defaults.
  const seeded = useRef<string | null>(null);
  const { context, document } = editor;
  useEffect(() => {
    if (documentId) {
      if (document && document.id === documentId && seeded.current !== documentId) {
        seeded.current = documentId;
        form.reset(fromDocument(document));
      }
      return;
    }
    if (context && seeded.current !== 'new') {
      seeded.current = 'new';
      form.reset(
        emptyInvoiceForm(today, defaultBillingMode(context.businessType), context.stateCode)
      );
    }
  }, [documentId, document, context, form, today]);

  // FR-17 — rates are by the bill's date; a changed date re-reads them.
  const documentDate = values.documentDate;
  useEffect(() => {
    if (!context || !documentDate || context.ratesDate === documentDate) return undefined;
    const promise = dispatch(fetchSalesContext(documentDate));
    return () => promise.abort();
  }, [dispatch, context, documentDate]);

  const preview: EngineResult = useMemo(
    () =>
      computeDocumentTotals(
        previewInput(
          values,
          context?.rates ?? {},
          context?.gstType ?? 'regular',
          context?.stateCode ?? ''
        )
      ),
    [values, context]
  );

  const { documentId: savedId, version } = editor;
  const save = useCallback(
    async (quiet: boolean): Promise<SalesDocumentEnvelope | null> => {
      const arg = { id: savedId, version, body: wireBodyFor(kind, form.getValues()), quiet };
      const result =
        kind === 'estimate'
          ? await dispatch(saveEstimateDraft(arg))
          : await dispatch(saveInvoiceDraft(arg));
      if (!(
        saveInvoiceDraft.fulfilled.match(result) || saveEstimateDraft.fulfilled.match(result)
      )) {
        return null;
      }
      // FR-5 — the server resolved the place of supply for a freshly picked party.
      if (!form.getValues('placeOfSupplyState')) {
        form.setValue('placeOfSupplyState', result.payload.document.placeOfSupplyState);
      }
      return result.payload;
    },
    [dispatch, savedId, version, form, kind]
  );

  const issue = useCallback(
    async (payment: readonly PaymentRowForm[] | null, override = false) => {
      const saved = await save(false);
      if (!saved) return null;
      if (kind === 'estimate') {
        // SAL-01 FR-2 — an estimate's "issue" is `mark-sent`, which numbers it.
        const sent = await dispatch(
          moveEstimate({ id: saved.document.id, move: 'sent', version: saved.document.version })
        );
        return moveEstimate.fulfilled.match(sent) ? sent.payload : null;
      }
      const body: Record<string, unknown> = { version: saved.document.version, override };
      if (payment) body.payment = paymentWireBody(payment, form.getValues('documentDate'));
      const result = await dispatch(
        issueInvoice({ id: saved.document.id, body, idempotencyKey: idempotency.key })
      );
      if (issueInvoice.fulfilled.match(result)) {
        idempotency.rotate();
        return result.payload;
      }
      // A network failure keeps the key for the retry (EC-8); anything the
      // server answered is a new attempt next time (EC-9).
      if (result.payload?.code !== 'network_error' && result.payload?.code !== 'timeout') {
        idempotency.rotate();
      }
      return null;
    },
    [save, dispatch, form, idempotency, kind]
  );

  /** "New bill" after an issue on `/new`: a blank editor without a page load (Ctrl+N, §6). */
  const restart = useCallback(() => {
    dispatch(editorReset());
    seeded.current = 'new';
    form.reset(
      emptyInvoiceForm(today, defaultBillingMode(context?.businessType), context?.stateCode ?? '')
    );
    idempotency.rotate();
  }, [dispatch, form, today, context, idempotency]);

  return { kind, form, values, preview, editor, today, canWrite, save, issue, restart };
};
