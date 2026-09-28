import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import type {
  CollectQr,
  OpenDocument,
  Payment,
  PaymentDirection,
  PaymentFilters,
  PaymentFormValues,
  PaymentPage,
  PaymentSaveResult,
} from '../types/payment.types';

/**
 * Part 19 §19.3.3 — one service call each, and a catch that normalises.
 *
 * The service is imported INSIDE each thunk: the invalidation registry imports
 * every thunk statically and the registry is in the shell, so a service
 * imported at the top of this file would ship to every route (the expenses
 * track measured it). Nothing prefetches payments, so the price is one small
 * chunk with the first payment request of a session.
 */
const service = () => import('../api/paymentService');

type Reject = { rejectValue: ApiErrorShape };

/** QUERY. One page of the payments list with its filtered totals. */
export const fetchPayments = createAsyncThunk<PaymentPage, PaymentFilters, Reject>(
  'paymentList/fetchPayments',
  async (filters, { signal, rejectWithValue }) => {
    try {
      return await (await service()).listPayments(filters, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'payments.list.error.title'));
    }
  }
);

/** QUERY. One receipt (the receipt page and its print sheet). */
export const fetchPayment = createAsyncThunk<Payment, string, Reject>(
  'paymentReceipt/fetchPayment',
  async (id, { signal, rejectWithValue }) => {
    try {
      return await (await service()).getPayment(id, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'payments.receipt.error.title'));
    }
  }
);

/** QUERY. The allocation panel's open bills for a party, oldest first. */
export const fetchOpenDocuments = createAsyncThunk<
  readonly OpenDocument[],
  { readonly partyId: string; readonly direction: PaymentDirection },
  Reject
>('paymentForm/fetchOpenDocuments', async ({ partyId, direction }, { signal, rejectWithValue }) => {
  try {
    return await (await service()).listOpenDocuments(partyId, direction, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'payments.alloc.error'));
  }
});

/** QUERY. PAY-03 — the Collect QR, or the receipt footer's static one. */
export const fetchCollectQr = createAsyncThunk<
  CollectQr,
  { readonly amount?: string; readonly partyId?: string },
  Reject
>('paymentForm/fetchCollectQr', async (body, { rejectWithValue }) => {
  try {
    return await (await service()).createUpiIntent(body);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'payments.upi.error'));
  }
});

/** MUTATION. Record one payment, with the key the hook minted for this save. */
export const recordPayment = createAsyncThunk<
  PaymentSaveResult,
  {
    readonly values: PaymentFormValues;
    readonly idempotencyKey: string;
    readonly context: string;
  },
  Reject
>('paymentForm/recordPayment', async ({ values, idempotencyKey, context }, { rejectWithValue }) => {
  try {
    return await (await service()).recordPayment(values, idempotencyKey, context);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'payments.save.error'));
  }
});

/** MUTATION. PAY-05 — void with a reason; bills reopen, the khata line is reversed. */
export const voidPayment = createAsyncThunk<
  PaymentSaveResult,
  { readonly id: string; readonly reason: string; readonly idempotencyKey: string },
  Reject
>('paymentReceipt/voidPayment', async ({ id, reason, idempotencyKey }, { rejectWithValue }) => {
  try {
    return await (await service()).voidPayment(id, reason, idempotencyKey);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'payments.void.error'));
  }
});

/** MUTATION (audit only). PAY-04 — the receipt's WhatsApp text, written by the server. */
export const shareReceipt = createAsyncThunk<
  { readonly text: string; readonly mobile: string | null },
  { readonly id: string; readonly locale: string; readonly idempotencyKey: string },
  Reject
>('paymentReceipt/shareReceipt', async ({ id, locale, idempotencyKey }, { rejectWithValue }) => {
  try {
    return await (await service()).shareReceipt(id, locale, idempotencyKey);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'payments.share.error'));
  }
});
