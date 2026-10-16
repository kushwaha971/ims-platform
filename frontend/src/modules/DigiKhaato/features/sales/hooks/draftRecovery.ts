import { draftReplyOutcome, draftSnapshot } from 'src/utils/draftCreation';
import { localDraftKey, removeLocalDraft, writeLocalDraft } from 'src/utils/localDrafts';
import { newRequestId } from 'src/utils/requestId';

import { salesDraftReply } from '../redux/invoiceEditorSlice';
import { fromDocument, toWireBody, type InvoiceFormValues } from '../view-model/invoiceForm';

import type { EditorKind } from './useInvoiceEditor';
import type { InvoiceEditorState } from '../redux/invoiceEditorSlice';
import type { SaveDraftArg } from '../redux/salesThunk';
import type { SalesDocumentEnvelope } from '../types/sales.types';
import type { UseFormReturn } from 'react-hook-form';

/** The draft body for the kind: an estimate adds its validity; neither has a due date. */
const wireBodyFor = (kind: EditorKind, values: InvoiceFormValues): Record<string, unknown> =>
  kind === 'estimate'
    ? { ...toWireBody(values), due_on: null, valid_until: values.validUntil || null }
    : kind === 'sales_order'
      ? { ...toWireBody(values), due_on: null }
      : kind === 'delivery_challan'
        ? {
            ...toWireBody(values),
            due_on: null,
            challan_type: values.challanType || 'other',
            transporter: values.transporter.trim(),
            vehicle_number: values.vehicleNumber.trim(),
            eway_bill_number: values.ewayBillNumber.trim(),
          }
        : toWireBody(values);

/** Loaded on the first save, not on every editor's first paint. */
export const saveDraftWithRecovery = async ({
  form,
  kind,
  documentId,
  tenantId,
  userId,
  quiet,
  currentScope,
  getEditor,
  send,
}: {
  form: UseFormReturn<InvoiceFormValues>;
  kind: EditorKind;
  documentId: string | null;
  tenantId: string | undefined;
  userId: string | undefined;
  quiet: boolean;
  currentScope: () => boolean;
  getEditor: () => InvoiceEditorState;
  send: (arg: SaveDraftArg) => Promise<SalesDocumentEnvelope | null>;
}): Promise<SalesDocumentEnvelope | null> => {
  if (!currentScope() || !tenantId || !userId) return null;
  const current = getEditor();
  if (
    current.saveState === 'conflict' ||
    current.issued ||
    (documentId && current.loadStatus !== 'succeeded')
  )
    return null;
  const id = current.documentId ?? documentId;
  if (!id && !form.getValues('clientDraftKey')) {
    form.setValue('clientDraftKey', newRequestId());
  }
  // Persist identity and current typing BEFORE the first request. A lost
  // response/reload must retry that identity, even if the text has changed.
  const values = form.getValues();
  const submitted = draftSnapshot(values);
  writeLocalDraft(localDraftKey(tenantId, kind, id ?? 'new', userId), values, current.version);
  const body = wireBodyFor(kind, values);
  if (!id) body.client_draft_key = values.clientDraftKey;
  const arg = { id, version: current.version, body, quiet };
  let result = await send(arg);
  if (!currentScope() || !result) return null;
  if (draftReplyOutcome(salesDraftReply(result)) === 'adopt') {
    // The create retry only looked up the original draft. Save the current
    // typing explicitly against version 1, so a concurrent server edit
    // still produces a conflict instead of being silently overwritten.
    const recoveredId = result.document.id;
    writeLocalDraft(localDraftKey(tenantId, kind, recoveredId, userId), form.getValues(), 1);
    removeLocalDraft(localDraftKey(tenantId, kind, 'new', userId));
    const recoveredArg = {
      id: recoveredId,
      version: 1,
      body: wireBodyFor(kind, form.getValues()),
      quiet,
    };
    result = await send(recoveredArg);
    if (!currentScope() || !result) return null;
  }
  // Move the newest local copy synchronously before the URL changes.
  const outcome = draftReplyOutcome(salesDraftReply(result));
  const recoveredConflict = outcome === 'conflict';
  const recoveredKey = localDraftKey(tenantId, kind, result.document.id, userId);
  if (recoveredConflict || submitted !== draftSnapshot(form.getValues())) {
    writeLocalDraft(
      recoveredKey,
      form.getValues(),
      recoveredConflict ? (current.version ?? 1) : result.document.version
    );
  } else {
    removeLocalDraft(recoveredKey);
  }
  removeLocalDraft(localDraftKey(tenantId, kind, 'new', userId));
  if (outcome === 'posted') {
    form.reset(fromDocument(result.document));
    return result;
  }
  // Another device has edited this recovered draft. Explicit conflict
  // review is required before any PATCH can overwrite its current version.
  if (recoveredConflict) return null;
  if (!form.getValues('placeOfSupplyState')) {
    form.setValue('placeOfSupplyState', result.document.placeOfSupplyState);
  }
  return result;
};
