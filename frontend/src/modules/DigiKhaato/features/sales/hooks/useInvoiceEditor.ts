'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { useStore } from 'react-redux';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDraftSaveQueue } from 'src/hooks/useDraftSaveQueue';
import { useIdempotencyKey } from 'src/hooks/useIdempotencyKey';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import {
  selectActiveTenant,
  selectSessionUser,
  selectTenantTimezone,
} from 'src/redux/slice/sessionSlice';
import type { RootState } from 'src/redux/store';
import { todayInTenantTz } from 'src/utils/dates';

import {
  editorReset,
  saveUnavailable,
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
import { lazyInvoiceResolver } from '../validation/invoiceEditorResolver';
import {
  defaultBillingMode,
  emptyInvoiceForm,
  fromDocument,
  paymentWireBody,
  previewInput,
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
export type EditorKind = 'invoice' | 'estimate' | 'sales_order' | 'delivery_challan';

/** Shop items 3–4 — a quote, an order and a challan are written alike: never a receivable. */
export const isQuoteKind = (
  kind: EditorKind
): kind is 'estimate' | 'sales_order' | 'delivery_challan' => kind !== 'invoice';

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
  const store = useStore<RootState>();
  const tenant = useAppSelector(selectActiveTenant);
  const user = useAppSelector(selectSessionUser);
  const tenantId = tenant?.id;
  const userId = user?.id;
  const saves = useDraftSaveQueue(tenantId, userId);
  const editor = useAppSelector(selectInvoiceEditor);
  const timezone = useAppSelector(selectTenantTimezone);
  const { can, hasModule } = usePermissions();
  const today = useMemo(() => todayInTenantTz(timezone ?? undefined), [timezone]);
  const canWrite =
    hasModule('sales') &&
    can(
      isQuoteKind(kind) && kind !== 'delivery_challan'
        ? 'sales.estimate.write'
        : 'sales.invoice.write'
    );
  const idempotency = useIdempotencyKey();

  const { t } = useTranslation();
  const resolver = useMemo(
    () => lazyInvoiceResolver(t, { kind, timeZone: timezone }),
    [t, kind, timezone]
  );
  const shop = editor.context;
  // The bill-discount check prices the bill with the rates on screen.
  const schemaContext = useMemo(
    () => ({
      rates: shop?.rates ?? {},
      gstType: shop?.gstType ?? 'regular',
      tenantState: shop?.stateCode ?? '',
    }),
    [shop]
  );
  const form = useForm<InvoiceFormValues>({
    defaultValues: emptyInvoiceForm(today, 'party', ''),
    mode: 'onTouched',
    resolver,
    context: schemaContext,
  });
  const values = useWatch({ control: form.control }) as InvoiceFormValues;

  const seeded = useRef<string | null>(null);

  // Load: the shop's context always, the draft when editing one.
  useEffect(() => {
    saves.invalidate();
    seeded.current = null;
    dispatch(editorReset());
    const context = dispatch(fetchSalesContext(today));
    const draft = !documentId
      ? null
      : isQuoteKind(kind)
        ? dispatch(fetchFlowDocument({ kind, id: documentId }))
        : dispatch(fetchInvoice(documentId));
    return () => {
      saves.invalidate();
      context.abort();
      draft?.abort();
    };
  }, [dispatch, documentId, today, kind, tenantId, userId, saves]);

  // Seed the form ONCE per editor: from the draft, or from the shop's defaults.
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
        emptyInvoiceForm(
          today,
          kind === 'delivery_challan' ? 'party' : defaultBillingMode(context.businessType),
          context.stateCode
        )
      );
    }
  }, [documentId, document, context, form, today, kind]);

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

  const save = useCallback(
    (quiet: boolean): Promise<SalesDocumentEnvelope | null> =>
      // Manual save, autosave and save-before-issue share this queue. Each task
      // reads the latest server id/version and current form when it starts.
      saves.enqueue(async (currentScope) => {
        try {
          const { saveDraftWithRecovery } = await import('./draftRecovery');
          return await saveDraftWithRecovery({
            form,
            kind,
            documentId,
            tenantId,
            userId,
            quiet,
            currentScope,
            getEditor: () => selectInvoiceEditor(store.getState()),
            send: async (arg) => {
              const pending = isQuoteKind(kind)
                ? dispatch(saveEstimateDraft({ ...arg, kind }))
                : dispatch(saveInvoiceDraft(arg));
              saves.track(pending);
              const result = await pending;
              return saveInvoiceDraft.fulfilled.match(result) ||
                saveEstimateDraft.fulfilled.match(result)
                ? result.payload
                : null;
            },
          });
        } catch {
          // A deferred chunk can be unavailable offline. Keep the device copy
          // and show the existing save error instead of rejecting the UI event.
          if (currentScope()) dispatch(saveUnavailable());
          return null;
        }
      }),
    [dispatch, documentId, form, kind, store, tenantId, userId, saves]
  );

  const issue = useCallback(
    async (payment: readonly PaymentRowForm[] | null, override = false) => {
      const saved = await save(false);
      if (!saved) return null;
      if (saved.document.status !== 'draft') return saved;
      if (isQuoteKind(kind)) {
        // SAL-01 FR-2 — an estimate's "issue" is `mark-sent`, which numbers it; a sales
        // order's is `confirm` (Shop item 3).
        const sent = await dispatch(
          moveEstimate({
            id: saved.document.id,
            move: kind === 'estimate' ? 'sent' : kind === 'sales_order' ? 'confirm' : 'issue',
            version: saved.document.version,
          })
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
    saves.invalidate();
    dispatch(editorReset());
    seeded.current = 'new';
    form.reset(
      emptyInvoiceForm(
        today,
        kind === 'delivery_challan' ? 'party' : defaultBillingMode(context?.businessType),
        context?.stateCode ?? ''
      )
    );
    idempotency.rotate();
  }, [dispatch, form, today, context, idempotency, kind, saves]);

  return { kind, form, values, preview, editor, today, canWrite, save, issue, restart };
};
