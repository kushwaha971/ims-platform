import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import type { CreditNoteIssued, VoidedEnvelope } from '../api/creditNoteService';
import type { FlowListPage, FlowListQuery } from '../api/estimateService';
import type { InvoiceListPage, SalesDocumentEnvelope } from '../types/sales.types';
import type { EstimateMove, FlowKind } from '../types/salesFlows.types';

/**
 * SAL-01 / SAL-04 / SAL-05 thunks — one service call each and a catch that
 * normalises. Services are imported INSIDE each thunk (salesThunk.ts records
 * why): the invalidation registry imports this file, and a service at the top
 * of it would ship to every route.
 */
const estimates = () => import('../api/estimateService');
const credits = () => import('../api/creditNoteService');

type Reject = { rejectValue: ApiErrorShape };

export interface FlowListArg extends FlowListQuery {
  readonly kind: FlowKind;
}

/** QUERY. The estimates or credit notes list (one is on screen at a time). */
export const fetchFlowDocuments = createAsyncThunk<FlowListPage, FlowListArg, Reject>(
  'salesDocList/fetchFlowDocuments',
  async ({ kind, ...filters }, { signal, rejectWithValue }) => {
    try {
      return await (await estimates()).listFlowDocuments(kind, filters, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'sales.list.error.title'));
    }
  }
);

/** QUERY. One estimate or credit note — the detail page and the estimate editor. */
export const fetchFlowDocument = createAsyncThunk<
  SalesDocumentEnvelope,
  { readonly kind: FlowKind; readonly id: string },
  Reject
>('invoice/fetchFlowDocument', async ({ kind, id }, { signal, rejectWithValue }) => {
  try {
    return await (await estimates()).getFlowDocument(kind, id, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'sales.detail.error.title'));
  }
});

/** QUERY. The invoice a return is written against — its lines, caps and snapshot rates. */
export const fetchCreditSource = createAsyncThunk<SalesDocumentEnvelope, string, Reject>(
  'creditNoteEditor/fetchCreditSource',
  async (invoiceId, { signal, rejectWithValue }) => {
    try {
      return await (await import('../api/salesService')).getInvoice(invoiceId, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'sales.detail.error.title'));
    }
  }
);

/** QUERY. A party's bills with something due — the apply-credit dialog's choices (FR-9). */
export const fetchOpenInvoices = createAsyncThunk<InvoiceListPage, string, Reject>(
  'invoice/fetchOpenInvoices',
  async (partyId, { signal, rejectWithValue }) => {
    try {
      const { listInvoices } = await import('../api/salesService');
      return await listInvoices(
        { tab: 'unpaid', dateFrom: '', dateTo: '', partyId, q: '', page: 1 },
        signal
      );
    } catch (error) {
      return rejectWithValue(toApiError(error, 'sales.list.error.title'));
    }
  }
);

export interface SaveEstimateArg {
  readonly id: string | null;
  readonly version: number | null;
  readonly body: Record<string, unknown>;
  readonly quiet: boolean;
}

/** MUTATION. The estimate draft: POST the first time, PATCH with the version after. */
export const saveEstimateDraft = createAsyncThunk<SalesDocumentEnvelope, SaveEstimateArg, Reject>(
  'invoiceEditor/saveEstimateDraft',
  async ({ id, version, body, quiet }, { rejectWithValue }) => {
    try {
      const api = await estimates();
      return id
        ? await api.updateEstimate(id, { ...body, version }, { quiet })
        : await api.createEstimate(body, { quiet });
    } catch (error) {
      return rejectWithValue(toApiError(error, 'sales.editor.error.save'));
    }
  }
);

/** MUTATION. FR-12 — only a draft estimate is deleted; a sent one is rejected instead. */
export const deleteEstimateDraft = createAsyncThunk<string, string, Reject>(
  'invoiceEditor/deleteEstimateDraft',
  async (id, { rejectWithValue }) => {
    try {
      await (await estimates()).deleteEstimate(id);
      return id;
    } catch (error) {
      return rejectWithValue(toApiError(error, 'sales.editor.error.delete'));
    }
  }
);

/** MUTATION. `draft → sent` (numbered), `sent → accepted | rejected`. */
export const moveEstimate = createAsyncThunk<
  SalesDocumentEnvelope,
  {
    readonly id: string;
    readonly move: EstimateMove;
    readonly version?: number;
    readonly note?: string;
  },
  Reject
>('invoice/moveEstimate', async ({ id, move, version, note }, { rejectWithValue }) => {
  try {
    const body: Record<string, unknown> = {};
    if (version !== undefined) body.version = version;
    if (note) body.note = note;
    return await (await estimates()).moveEstimate(id, move, body);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'sales.estimate.error.move'));
  }
});

/** MUTATION. The draft invoice an estimate becomes (FR-6). */
export const convertEstimate = createAsyncThunk<SalesDocumentEnvelope, string, Reject>(
  'invoice/convertEstimate',
  async (id, { rejectWithValue }) => {
    try {
      return await (await estimates()).convertEstimate(id);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'sales.estimate.error.convert'));
    }
  }
);

/** MUTATION. The return, issued in one request; the key survives a retry (EC-8). */
export const issueCreditNote = createAsyncThunk<
  CreditNoteIssued,
  { readonly body: Record<string, unknown>; readonly idempotencyKey: string },
  Reject
>('creditNoteEditor/issueCreditNote', async ({ body, idempotencyKey }, { rejectWithValue }) => {
  try {
    return await (await credits()).createAndIssueCreditNote(body, idempotencyKey);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'sales.creditNote.error.issue'));
  }
});

/** MUTATION. Open credit onto another unpaid bill (FR-9). */
export const applyCreditNote = createAsyncThunk<
  CreditNoteIssued,
  { readonly id: string; readonly invoiceId: string; readonly amount: string },
  Reject
>('invoice/applyCreditNote', async ({ id, invoiceId, amount }, { rejectWithValue }) => {
  try {
    return await (await credits()).applyCreditNote(id, invoiceId, amount);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'sales.creditNote.error.apply'));
  }
});

/** MUTATION. SAL-05 — the bill voided with a reason; payments it held are reported back. */
export const voidInvoice = createAsyncThunk<
  VoidedEnvelope,
  { readonly id: string; readonly reason: string; readonly confirmOrigin?: boolean },
  Reject
>('invoice/voidInvoice', async ({ id, reason, confirmOrigin }, { rejectWithValue }) => {
  try {
    const service = await credits();
    // A5 — the third argument only when answering an origin's question (R55).
    return await (confirmOrigin
      ? service.voidInvoice(id, reason, true)
      : service.voidInvoice(id, reason));
  } catch (error) {
    return rejectWithValue(toApiError(error, 'sales.void.error'));
  }
});

/** MUTATION. SAL-04 FR-10 — stock, ledger, applications and returned quantities undone. */
export const voidCreditNote = createAsyncThunk<
  VoidedEnvelope,
  { readonly id: string; readonly reason: string; readonly confirmOrigin?: boolean },
  Reject
>('invoice/voidCreditNote', async ({ id, reason, confirmOrigin }, { rejectWithValue }) => {
  try {
    const service = await credits();
    // A5 — the third argument only when answering an origin's question (R55).
    return await (confirmOrigin
      ? service.voidCreditNote(id, reason, true)
      : service.voidCreditNote(id, reason));
  } catch (error) {
    return rejectWithValue(toApiError(error, 'sales.void.error'));
  }
});
