'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { ValidationError } from 'yup';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useIdempotencyKey } from 'src/hooks/useIdempotencyKey';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectNetworkImpaired } from 'src/redux/slice/networkSlice';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { applyServerErrors } from 'src/utils/applyServerErrors';
import { todayInTenantTz } from 'src/utils/dates';

import { paymentWireBody, type PaymentRowForm } from '../../sales/view-model/invoiceForm';
import { computeDocumentTotals, type EngineResult } from '../../sales/view-model/taxEngine';
import { PURCHASE_AUTOSAVE_MS } from '../constants/purchaseConstants';
import {
  purchaseEditorReset,
  selectPurchaseBillEditor,
  type PurchaseBillEditorState,
} from '../redux/purchaseBillEditorSlice';
import {
  checkDuplicateSupplierInvoice,
  fetchPurchaseBill,
  fetchPurchaseContext,
  recordPurchaseBill,
  savePurchaseBillDraft,
} from '../redux/purchaseBillThunk';
import { usePurchaseBillSchemas } from '../validation/purchaseBillSchemas';
import {
  emptyPurchaseForm,
  fromPurchaseBill,
  isCompletePurchaseLine,
  purchasePreviewInput,
  toPurchaseWireBody,
  type PurchaseBillFormValues,
} from '../view-model/purchaseBillForm';

import type { PurchaseBillEnvelope } from '../types/purchase.types';

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
 */
export interface UsePurchaseBillEditorResult {
  readonly form: UseFormReturn<PurchaseBillFormValues>;
  readonly values: PurchaseBillFormValues;
  readonly preview: EngineResult;
  readonly editor: PurchaseBillEditorState;
  readonly today: string;
  readonly canWrite: boolean;
  readonly regular: boolean;
  readonly save: (quiet: boolean) => Promise<PurchaseBillEnvelope | null>;
  /** Record; `payment` is FR-6h's "Paid now" rows, absent or empty for a bill on credit. */
  readonly record: (
    payment?: readonly PaymentRowForm[] | null
  ) => Promise<PurchaseBillEnvelope | null>;
  /** The header rules, run before the "Paid now" sheet opens so it never opens on a bad bill. */
  readonly validate: () => Promise<boolean>;
  /** PUR-02 — "Paid now" is a supplier payment: the payments module and its write codename. */
  readonly canPayNow: boolean;
  readonly checkDuplicate: () => void;
  readonly restart: () => void;
}

export const usePurchaseBillEditor = (documentId: string | null): UsePurchaseBillEditorResult => {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
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

  // Load: the shop's context always, the draft when editing one.
  useEffect(() => {
    dispatch(purchaseEditorReset());
    const context = dispatch(fetchPurchaseContext(today));
    const draft = documentId ? dispatch(fetchPurchaseBill(documentId)) : null;
    return () => {
      context.abort();
      draft?.abort();
    };
  }, [dispatch, documentId, today]);

  // Seed the form ONCE per editor: from the draft, or from the shop's defaults.
  const seeded = useRef<string | null>(null);
  const { context, document } = editor;
  useEffect(() => {
    if (documentId) {
      if (document && document.id === documentId && seeded.current !== documentId) {
        seeded.current = documentId;
        form.reset(fromPurchaseBill(document));
      }
      return;
    }
    if (context && seeded.current !== 'new') {
      seeded.current = 'new';
      form.reset(emptyPurchaseForm(today, context.gstType === 'regular'));
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

  const { documentId: savedId, version } = editor;
  const save = useCallback(
    async (quiet: boolean): Promise<PurchaseBillEnvelope | null> => {
      const result = await dispatch(
        savePurchaseBillDraft({
          id: savedId,
          version,
          body: toPurchaseWireBody(form.getValues()),
          quiet,
        })
      );
      if (!savePurchaseBillDraft.fulfilled.match(result)) {
        if (!quiet && result.payload?.code === 'validation_error') {
          applyServerErrors(result.payload, form.setError, FORM_FIELDS);
        }
        return null;
      }
      return result.payload;
    },
    [dispatch, savedId, version, form]
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
    async (payment?: readonly PaymentRowForm[] | null): Promise<PurchaseBillEnvelope | null> => {
      if (!(await validate())) return null;
      const saved = await save(false);
      if (!saved) return null;
      const result = await dispatch(
        recordPurchaseBill({
          id: saved.bill.id,
          version: saved.bill.version,
          idempotencyKey: idempotency.key,
          // FR-6h — dated with the bill, as the invoice editor dates money taken at issue.
          payment: payment?.length
            ? paymentWireBody(payment, form.getValues('documentDate'))
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
    [validate, form, save, dispatch, idempotency, t]
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
  useEffect(() => {
    if (!dirty || blocked || !meaningful || !canWrite) return undefined;
    const timer = window.setTimeout(() => {
      if (saving.current) return;
      saving.current = true;
      void save(true).then((result) => {
        saving.current = false;
        // Keep the typed values; clear only the dirty flag so the next change re-arms.
        if (result) form.reset(form.getValues(), { keepValues: true });
      });
    }, PURCHASE_AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [values, dirty, blocked, meaningful, canWrite, save, form]);

  /** "New bill" after recording on `/new`: a blank editor without a page load. */
  const restart = useCallback(() => {
    dispatch(purchaseEditorReset());
    seeded.current = 'new';
    form.reset(emptyPurchaseForm(today, context?.gstType === 'regular'));
    idempotency.rotate();
  }, [dispatch, form, today, context, idempotency]);

  return {
    form,
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
