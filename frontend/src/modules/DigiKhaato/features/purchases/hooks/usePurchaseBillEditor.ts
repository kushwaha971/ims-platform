'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { useStore } from 'react-redux';
import { ValidationError } from 'yup';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDraftSaveQueue } from 'src/hooks/useDraftSaveQueue';
import { useIdempotencyKey } from 'src/hooks/useIdempotencyKey';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectNetworkImpaired } from 'src/redux/slice/networkSlice';
import {
  selectActiveTenant,
  selectSessionUser,
  selectTenantTimezone,
} from 'src/redux/slice/sessionSlice';
import type { RootState } from 'src/redux/store';
import { applyServerErrors } from 'src/utils/applyServerErrors';
import { todayInTenantTz } from 'src/utils/dates';
import { draftReplyOutcome, draftSnapshot, settleAutosave } from 'src/utils/draftCreation';
import { newRequestId } from 'src/utils/requestId';

import { computeDocumentTotals, type EngineResult } from '../../sales/view-model/taxEngine';
import { PURCHASE_AUTOSAVE_MS } from '../constants/purchaseConstants';
import {
  purchaseDraftReply,
  purchaseEditorReset,
  selectPurchaseBillEditor,
  type PurchaseBillEditorState,
} from '../redux/purchaseBillEditorSlice';
import {
  checkDuplicateSupplierInvoice,
  fetchPurchaseBill,
  fetchPurchaseContext,
  movePurchaseOrder,
  recordPurchaseBill,
  savePurchaseBillDraft,
  type SavePurchaseDraftArg,
} from '../redux/purchaseBillThunk';
import { usePurchaseBillSchemas } from '../validation/purchaseBillSchemas';
import {
  emptyPurchaseForm,
  fromPurchaseBill,
  isCompletePurchaseLine,
  purchasePaymentWireBody,
  purchasePreviewInput,
  toPurchaseWireBody,
  type PurchaseBillFormValues,
  type PurchasePaymentRow,
} from '../view-model/purchaseBillForm';

import type { PurchaseBillEnvelope, PurchaseKind } from '../types/purchase.types';

/** The fields `applyServerErrors` may anchor a server 400 on. */
const FORM_FIELDS: readonly string[] = [
  'partyId',
  'supplierInvoiceNumber',
  'supplierInvoiceDate',
  'documentDate',
  'dueOn',
  'discountValue',
  'notes',
  'lines',
];

/**
 * PUR-01 — the purchase bill editor's orchestrator, the shape of the invoice
 * editor's `useInvoiceEditor`. React Hook Form owns what the merchant types;
 * `purchaseBillEditorSlice` owns what the server says. The preview is the
 * shared GST engine over the form, replaced by the server's figures the moment
 * a save returns — and at Record the server recomputes everything (§0.11-3).
 *
 * FR-8 autosave lives here too: 10 s after the last change, while the form is
 * dirty and the bill means something (a supplier or a complete line), the
 * draft is PATCHed quietly; the header shows the state.
 *
 * SH-011 / ADR-063 — every save (autosave, supplier pick, "Save draft", the
 * save before Record) runs in ONE queue, and the first create carries a
 * creation key kept for this editor session, so a retry after a lost reply
 * finds the same draft instead of making a second. The key lives in memory
 * only: this editor keeps no device copy, so a reload starts a new bill; a
 * stored "new" key would let a second tab adopt the first tab's draft.
 */
export interface UsePurchaseBillEditorResult {
  readonly form: UseFormReturn<PurchaseBillFormValues>;
  /**
   * The form holds the opened draft (or a blank bill), not the defaults it was
   * created with. The draft is reset into the form in an effect AFTER the load
   * succeeds, so a page that renders on the load alone draws one frame of an
   * empty bill: the supplier fold opened itself for a "new" bill on every
   * reopened draft (WP-05, found by measuring).
   */
  readonly seeded: boolean;
  readonly values: PurchaseBillFormValues;
  readonly preview: EngineResult;
  readonly editor: PurchaseBillEditorState;
  readonly today: string;
  readonly canWrite: boolean;
  readonly regular: boolean;
  readonly save: (quiet: boolean) => Promise<PurchaseBillEnvelope | null>;
  /** Record; `payment` is FR-6h's "Paid now" rows, absent or empty for a bill on credit. */
  readonly record: (
    payment?: readonly PurchasePaymentRow[] | null
  ) => Promise<PurchaseBillEnvelope | null>;
  /** The header rules, run before the "Paid now" sheet opens so it never opens on a bad bill. */
  readonly validate: () => Promise<boolean>;
  /** PUR-02 — "Paid now" is a supplier payment: the payments module and its write codename. */
  readonly canPayNow: boolean;
  readonly checkDuplicate: () => void;
  readonly restart: () => void;
}

export const usePurchaseBillEditor = (
  documentId: string | null,
  kind: PurchaseKind = 'purchase_bill'
): UsePurchaseBillEditorResult => {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const { t } = useTranslation();
  const tenantId = useAppSelector(selectActiveTenant)?.id;
  const userId = useAppSelector(selectSessionUser)?.id;
  const saves = useDraftSaveQueue(tenantId, userId);
  /** The first create's identity, minted on the first save of a new bill. */
  const creationKey = useRef<string | null>(null);
  const editor = useAppSelector(selectPurchaseBillEditor);
  const timezone = useAppSelector(selectTenantTimezone);
  const offline = useAppSelector(selectNetworkImpaired);
  const { can, hasModule } = usePermissions();
  const { purchaseBillSchema } = usePurchaseBillSchemas();
  const today = useMemo(() => todayInTenantTz(timezone ?? undefined), [timezone]);
  const canWrite = hasModule('purchases') && can('purchases.bill.write');
  const idempotency = useIdempotencyKey();

  const form = useForm<PurchaseBillFormValues>({
    defaultValues: emptyPurchaseForm(today, true),
    mode: 'onTouched',
  });
  const values = useWatch({ control: form.control }) as PurchaseBillFormValues;

  // Seed the form ONCE per editor: from the draft, or from the shop's defaults.
  const seeded = useRef<string | null>(null);
  const [seededFor, setSeededFor] = useState<string | null>(null);

  // Load: the shop's context always, the draft when editing one. A different
  // document, business or user is a new editor: queued saves are abandoned.
  useEffect(() => {
    saves.invalidate();
    creationKey.current = null;
    seeded.current = null;
    dispatch(purchaseEditorReset());
    const context = dispatch(fetchPurchaseContext(today));
    const draft = documentId ? dispatch(fetchPurchaseBill({ id: documentId, kind })) : null;
    return () => {
      saves.invalidate();
      context.abort();
      draft?.abort();
    };
  }, [dispatch, documentId, today, kind, tenantId, userId, saves]);

  const { context, document } = editor;
  useEffect(() => {
    if (documentId) {
      if (document && document.id === documentId && seeded.current !== documentId) {
        seeded.current = documentId;
        form.reset(fromPurchaseBill(document));
        setSeededFor(documentId);
      }
      return;
    }
    if (context && seeded.current !== 'new') {
      seeded.current = 'new';
      form.reset(emptyPurchaseForm(today, context.gstType === 'regular'));
      setSeededFor('new');
    }
  }, [documentId, document, context, form, today]);

  // Rates are by the bill's date; a changed date re-reads them.
  const documentDate = values.documentDate;
  useEffect(() => {
    if (!context || !documentDate || context.ratesDate === documentDate) return undefined;
    const promise = dispatch(fetchPurchaseContext(documentDate));
    return () => promise.abort();
  }, [dispatch, context, documentDate]);

  const preview: EngineResult = useMemo(
    () =>
      computeDocumentTotals(
        purchasePreviewInput(values, context?.rates ?? {}, context?.stateCode ?? '')
      ),
    [values, context]
  );

  const { documentId: savedId } = editor;
  const save = useCallback(
    (quiet: boolean): Promise<PurchaseBillEnvelope | null> =>
      saves.enqueue(async (currentScope) => {
        // Read when the task STARTS: an earlier save in the queue may have
        // just created the draft or moved its version.
        const current = selectPurchaseBillEditor(store.getState());
        if (
          current.saveState === 'conflict' ||
          current.recorded ||
          (documentId && current.loadStatus !== 'succeeded')
        )
          return null;
        const send = async (
          arg: Omit<SavePurchaseDraftArg, 'kind' | 'quiet'>
        ): Promise<PurchaseBillEnvelope | null> => {
          const pending = dispatch(savePurchaseBillDraft({ ...arg, kind, quiet }));
          saves.track(pending);
          const result = await pending;
          if (!currentScope()) return null;
          if (savePurchaseBillDraft.fulfilled.match(result)) return result.payload;
          if (!quiet && result.payload?.code === 'validation_error') {
            applyServerErrors(result.payload, form.setError, FORM_FIELDS);
          }
          return null;
        };
        const id = current.documentId ?? documentId;
        const body = toPurchaseWireBody(form.getValues());
        if (!id) {
          creationKey.current ??= newRequestId();
          body.client_draft_key = creationKey.current;
        }
        let result = await send({ id, version: current.version, body });
        if (!result) return null;
        const outcome = draftReplyOutcome(purchaseDraftReply(result));
        if (outcome === 'adopt') {
          // The retry only looked the draft up. Save today's typing explicitly
          // against version 1, so an edit made elsewhere still conflicts.
          result = await send({
            id: result.bill.id,
            version: 1,
            body: toPurchaseWireBody(form.getValues()),
          });
        }
        return outcome === 'conflict' ? null : result;
      }),
    [saves, store, documentId, dispatch, kind, form]
  );

  /** §10 — the header rules at Record only; a draft is saved half-entered (FR-8). */
  const validate = useCallback(async (): Promise<boolean> => {
    try {
      await purchaseBillSchema.validate(form.getValues(), { abortEarly: false });
      return true;
    } catch (error) {
      if (error instanceof ValidationError) {
        error.inner.forEach((issue) => {
          if (issue.path)
            form.setError(issue.path as keyof PurchaseBillFormValues, {
              type: 'client',
              message: issue.message,
            });
        });
      }
      return false;
    }
  }, [purchaseBillSchema, form]);

  const record = useCallback(
    async (
      payment?: readonly PurchasePaymentRow[] | null
    ): Promise<PurchaseBillEnvelope | null> => {
      if (!(await validate())) return null;
      const saved = await save(false);
      if (!saved) return null;
      // Recovered as already recorded/sent: show it, never post it again.
      if (saved.bill.status !== 'draft') return saved;
      if (kind === 'purchase_order') {
        // Shop item 3 — an order's "Record" is Send: numbered, owing nothing, no stock.
        const sent = await dispatch(
          movePurchaseOrder({ id: saved.bill.id, verb: 'send', version: saved.bill.version })
        );
        if (!movePurchaseOrder.fulfilled.match(sent)) return null;
        form.reset(form.getValues());
        return sent.payload;
      }
      const result = await dispatch(
        recordPurchaseBill({
          id: saved.bill.id,
          version: saved.bill.version,
          idempotencyKey: idempotency.key,
          // FR-6h — dated with the bill, as the invoice editor dates money taken at issue.
          payment: payment?.length
            ? purchasePaymentWireBody(payment, form.getValues('documentDate'))
            : null,
        })
      );
      if (recordPurchaseBill.fulfilled.match(result)) {
        idempotency.rotate();
        form.reset(form.getValues());
        return result.payload;
      }
      // A network failure keeps the key for the retry (EC-11); anything the
      // server answered is a new attempt next time.
      const code = result.payload?.code;
      if (code !== 'network_error' && code !== 'timeout') idempotency.rotate();
      if (code === 'validation_error' && result.payload) {
        applyServerErrors(result.payload, form.setError, FORM_FIELDS, t);
      }
      return null;
    },
    [validate, form, save, dispatch, idempotency, t, kind]
  );

  /** FR-7 — on blur of the supplier invoice number. */
  const checkDuplicate = useCallback(() => {
    const { partyId, supplierInvoiceNumber } = form.getValues();
    const number = supplierInvoiceNumber.trim();
    if (!partyId || !number) return;
    void dispatch(checkDuplicateSupplierInvoice({ partyId, number, excludeId: savedId }));
  }, [dispatch, form, savedId]);

  // FR-8 — the quiet server copy, 10 s after the last change.
  const dirty = form.formState.isDirty;
  const meaningful = !!values.partyId || (values.lines ?? []).some(isCompletePurchaseLine);
  const blocked =
    offline || editor.saveState === 'conflict' || editor.recording || !!editor.recorded;
  const saving = useRef(false);
  const [saveRevision, setSaveRevision] = useState(0);
  useEffect(() => {
    if (!dirty || blocked || !meaningful || !canWrite) return undefined;
    const timer = window.setTimeout(() => {
      if (saving.current) return;
      saving.current = true;
      const submitted = draftSnapshot(form.getValues());
      void save(true).then((result) => {
        saving.current = false;
        // Only what was submitted is saved; typing since stays dirty and re-arms.
        if (result && settleAutosave(form, submitted)) setSaveRevision((n) => n + 1);
      });
    }, PURCHASE_AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [values, dirty, blocked, meaningful, canWrite, save, form, saveRevision]);

  /** "New bill" after recording on `/new`: a blank editor without a page load. */
  const restart = useCallback(() => {
    saves.invalidate();
    creationKey.current = null;
    dispatch(purchaseEditorReset());
    seeded.current = 'new';
    form.reset(emptyPurchaseForm(today, context?.gstType === 'regular'));
    setSeededFor('new');
    idempotency.rotate();
  }, [dispatch, form, today, context, idempotency, saves]);

  return {
    form,
    seeded: seededFor === (documentId ?? 'new'),
    values,
    preview,
    editor,
    today,
    canWrite,
    regular: (context?.gstType ?? 'regular') === 'regular',
    save,
    record,
    validate,
    canPayNow: hasModule('payments') && can('payments.payment.write'),
    checkDuplicate,
    restart,
  };
};
