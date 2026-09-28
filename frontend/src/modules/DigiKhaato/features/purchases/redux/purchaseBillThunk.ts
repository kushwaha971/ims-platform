import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import type { PurchaseBillListQuery, PurchaseBillWireBody } from '../api/purchaseBillService';
import type {
  DuplicateSupplierInvoice,
  PurchaseBillEnvelope,
  PurchaseBillListPage,
} from '../types/purchase.types';

/**
 * Part 19 §19.3.3 — one service call each, and a catch that normalises.
 *
 * The service is imported INSIDE each thunk (the expenses and sales thunks
 * record why): a service imported at the top of this file would ship to every
 * route through the invalidation registry, which imports every thunk.
 */
const service = () => import('../api/purchaseBillService');

type Reject = { rejectValue: ApiErrorShape };

/** QUERY. PUR-03 — one page of the list with its totals and tab counts. */
export const fetchPurchaseBillList = createAsyncThunk<
  PurchaseBillListPage,
  PurchaseBillListQuery,
  Reject
>('purchaseBillList/fetchPurchaseBillList', async (filters, { signal, rejectWithValue }) => {
  try {
    return await (await service()).listPurchaseBills(filters, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'purchases.list.error.title'));
  }
});

/** QUERY. PUR-01 FR-9 — one bill, for the detail page and for editing a draft. */
export const fetchPurchaseBill = createAsyncThunk<PurchaseBillEnvelope, string, Reject>(
  'purchaseBill/fetchPurchaseBill',
  async (id, { signal, rejectWithValue }) => {
    try {
      return await (await service()).getPurchaseBill(id, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'purchases.detail.error.title'));
    }
  }
);

export interface SavePurchaseDraftArg {
  readonly id: string | null;
  readonly version: number | null;
  readonly body: PurchaseBillWireBody;
  /** Autosave: failures show in the header indicator, not as a toast. */
  readonly quiet: boolean;
}

/** MUTATION. POST the first time, PATCH with the version read after that (FR-1, FR-8). */
export const savePurchaseBillDraft = createAsyncThunk<
  PurchaseBillEnvelope,
  SavePurchaseDraftArg,
  Reject
>('purchaseBillEditor/savePurchaseBillDraft', async ({ id, version, body, quiet }, api) => {
  try {
    const client = await service();
    return id
      ? await client.updatePurchaseBill(id, { ...body, version }, { quiet })
      : await client.createPurchaseBill(body, { quiet });
  } catch (error) {
    return api.rejectWithValue(toApiError(error, 'purchases.editor.error.save'));
  }
});

export interface RecordPurchaseBillArg {
  readonly id: string;
  readonly version: number;
  readonly idempotencyKey: string;
}

/** MUTATION. FR-6 — the key is reused on a retry and rotated only on a new attempt (BR-13). */
export const recordPurchaseBill = createAsyncThunk<
  PurchaseBillEnvelope,
  RecordPurchaseBillArg,
  Reject
>('purchaseBillEditor/recordPurchaseBill', async ({ id, version, idempotencyKey }, api) => {
  try {
    return await (await service()).recordPurchaseBill(id, { version }, idempotencyKey);
  } catch (error) {
    return api.rejectWithValue(toApiError(error, 'purchases.editor.error.record'));
  }
});

/** MUTATION. FR-8 — drafts only; a recorded bill is voided. */
export const deletePurchaseBillDraft = createAsyncThunk<string, string, Reject>(
  'purchaseBillEditor/deletePurchaseBillDraft',
  async (id, { rejectWithValue }) => {
    try {
      await (await service()).deletePurchaseBill(id);
      return id;
    } catch (error) {
      return rejectWithValue(toApiError(error, 'purchases.editor.error.delete'));
    }
  }
);

/** MUTATION. PUR-04 — reverse stock and the supplier's khata, keep the number. */
export const voidPurchaseBill = createAsyncThunk<
  PurchaseBillEnvelope,
  { readonly id: string; readonly reason: string },
  Reject
>('purchaseBill/voidPurchaseBill', async ({ id, reason }, { rejectWithValue }) => {
  try {
    return await (await service()).voidPurchaseBill(id, reason);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'purchases.void.error'));
  }
});

/** QUERY. FR-7 — on blur of the supplier invoice number; quiet, null on any failure. */
export const checkDuplicateSupplierInvoice = createAsyncThunk<
  DuplicateSupplierInvoice | null,
  { readonly partyId: string; readonly number: string; readonly excludeId: string | null },
  Reject
>('purchaseBillEditor/checkDuplicateSupplierInvoice', async (arg) => {
  try {
    return await (
      await service()
    ).findDuplicateSupplierInvoice(arg.partyId, arg.number, arg.excludeId);
  } catch {
    return null;
  }
});

export interface PurchaseContext {
  readonly gstType: 'regular' | 'composition' | 'unregistered';
  readonly stateCode: string;
  readonly rates: Readonly<Record<string, { rate: string; cessRate: string }>>;
  readonly rateOptions: readonly { code: string; name: string }[];
  readonly ratesDate: string;
}

/** QUERY. The shop's GST type and state, and the rates selectable on the bill's date. */
export const fetchPurchaseContext = createAsyncThunk<PurchaseContext, string, Reject>(
  'purchaseBillEditor/fetchPurchaseContext',
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
        rates: Object.fromEntries(
          rates.map((row) => [row.code, { rate: row.rate, cessRate: row.cessRate }])
        ),
        rateOptions: rates.map((row) => ({ code: row.code, name: row.name })),
        ratesDate: asOf,
      };
    } catch (error) {
      return rejectWithValue(toApiError(error, 'purchases.editor.error.context'));
    }
  }
);
