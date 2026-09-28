import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import type { InvoiceListQuery, InvoiceWireBody } from '../api/salesService';
import type {
  InvoiceListPage,
  SalesDocumentEnvelope,
  ShareLink,
  UpiIntent,
} from '../types/sales.types';

/**
 * Part 19 §19.3.3 — one service call each, and a catch that normalises.
 *
 * Every service is imported INSIDE its thunk (the expenses thunks record why):
 * nothing here prefetches, and a service imported at the top of this file
 * would ship to every route through the invalidation registry. The price is
 * one small chunk fetched with the first sales request of a session.
 */
const service = () => import('../api/salesService');

type Reject = { rejectValue: ApiErrorShape };

export const fetchInvoices = createAsyncThunk<InvoiceListPage, InvoiceListQuery, Reject>(
  'invoiceList/fetchInvoices',
  async (filters, { signal, rejectWithValue }) => {
    try {
      return await (await service()).listInvoices(filters, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'sales.list.error.title'));
    }
  }
);

export const fetchInvoice = createAsyncThunk<SalesDocumentEnvelope, string, Reject>(
  'invoice/fetchInvoice',
  async (id, { signal, rejectWithValue }) => {
    try {
      return await (await service()).getInvoice(id, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'sales.detail.error.title'));
    }
  }
);

export interface SaveDraftArg {
  readonly id: string | null;
  readonly version: number | null;
  readonly body: InvoiceWireBody;
  /** Autosave: failures show in the header indicator, not as a toast (SAL-06 §9). */
  readonly quiet: boolean;
}

/** MUTATION. POST the first time, PATCH with the version read after that (SAL-06 FR-2). */
export const saveInvoiceDraft = createAsyncThunk<SalesDocumentEnvelope, SaveDraftArg, Reject>(
  'invoiceEditor/saveInvoiceDraft',
  async ({ id, version, body, quiet }, { rejectWithValue }) => {
    try {
      const api = await service();
      return id
        ? await api.updateInvoice(id, { ...body, version }, { quiet })
        : await api.createInvoice(body, { quiet });
    } catch (error) {
      return rejectWithValue(toApiError(error, 'sales.editor.error.save'));
    }
  }
);

export interface IssueArg {
  readonly id: string;
  readonly body: InvoiceWireBody;
  readonly idempotencyKey: string;
}

/** MUTATION. The key is reused on a retry and rotated only on an explicit re-issue (EC-9). */
export const issueInvoice = createAsyncThunk<SalesDocumentEnvelope, IssueArg, Reject>(
  'invoiceEditor/issueInvoice',
  async ({ id, body, idempotencyKey }, { rejectWithValue }) => {
    try {
      return await (await service()).issueInvoice(id, body, idempotencyKey);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'sales.editor.error.issue'));
    }
  }
);

export const deleteInvoiceDraft = createAsyncThunk<string, string, Reject>(
  'invoiceEditor/deleteInvoiceDraft',
  async (id, { rejectWithValue }) => {
    try {
      await (await service()).deleteInvoice(id);
      return id;
    } catch (error) {
      return rejectWithValue(toApiError(error, 'sales.editor.error.delete'));
    }
  }
);

export interface SalesContext {
  readonly gstType: 'regular' | 'composition' | 'unregistered';
  readonly stateCode: string;
  readonly businessType: string;
  readonly rates: Readonly<Record<string, { rate: string; cessRate: string }>>;
  readonly rateOptions: readonly { code: string; name: string }[];
  readonly ratesDate: string;
}

/** QUERY. The shop's GST type and state, and the rates selectable on the bill's date (FR-17). */
export const fetchSalesContext = createAsyncThunk<SalesContext, string, Reject>(
  'invoiceEditor/fetchSalesContext',
  async (asOf, { signal, rejectWithValue }) => {
    try {
      const [{ fetchTenant }, { listTaxRates }] = await Promise.all([
        import('../../business-profile/api/businessProfileService'),
        import('../../inventory/api/mastersService'),
      ]);
      const [profile, rates] = await Promise.all([
        fetchTenant(signal),
        listTaxRates(asOf, [], signal),
      ]);
      return {
        gstType: profile.gstType,
        stateCode: profile.stateCode,
        businessType: profile.businessType,
        rates: Object.fromEntries(
          rates.map((row) => [row.code, { rate: row.rate, cessRate: row.cessRate }])
        ),
        rateOptions: rates.map((row) => ({ code: row.code, name: row.name })),
        ratesDate: asOf,
      };
    } catch (error) {
      return rejectWithValue(toApiError(error, 'sales.editor.error.context'));
    }
  }
);

export const fetchUpiIntent = createAsyncThunk<UpiIntent | null, string, Reject>(
  'invoice/fetchUpiIntent',
  async (id) => (await service()).getUpiIntent(id)
);

export interface PrintBranding {
  readonly logoUrl: string | null;
  readonly signatureUrl: string | null;
  readonly docHeader: string;
  readonly docFooter: string;
  readonly appName: string;
  readonly primaryHex: string | null;
}

/** QUERY. T1's `GET /tenants/current/branding`, for the A4 letterhead (FR-12). */
export const fetchPrintBranding = createAsyncThunk<PrintBranding, void, Reject>(
  'invoice/fetchPrintBranding',
  async (_arg, { signal, rejectWithValue }) => {
    try {
      const { fetchBranding } = await import('../../branding/api/brandingService');
      const branding = await fetchBranding(signal);
      return {
        logoUrl: branding.logoUrl,
        signatureUrl: branding.signatureUrl,
        docHeader: branding.docHeader,
        docFooter: branding.docFooter,
        appName: branding.appName,
        primaryHex: branding.primaryHex,
      };
    } catch (error) {
      return rejectWithValue(toApiError(error, 'sales.detail.error.title'));
    }
  }
);

export const createInvoiceShareLink = createAsyncThunk<
  ShareLink,
  { readonly id: string; readonly channel: 'link' | 'whatsapp' },
  Reject
>('invoice/createInvoiceShareLink', async ({ id, channel }, { rejectWithValue }) => {
  try {
    return await (await service()).createShareLink(id, channel);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'sales.share.error'));
  }
});
