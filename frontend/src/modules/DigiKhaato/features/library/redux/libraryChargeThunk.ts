import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import './libraryInvalidation';

import type { ChargeRow, ChargeTotals, ManualChargeKind } from '../types/charge.types';

/**
 * F06 (LIB-07 §7) — the charges' thunks. Charges live in the member page's
 * slice (`libraryMemberDetail.charges`, no new store key); the counter keeps
 * its own rows. Every write stales the member, the lists and the khata, whose
 * balance moved (a refetch, never a guessed patch).
 */
const service = () => import('../api/libraryChargeService');

type Reject = { rejectValue: ApiErrorShape };

export const fetchMemberCharges = createAsyncThunk<
  { rows: ChargeRow[]; totals: ChargeTotals },
  string,
  Reject
>('libraryMemberDetail/fetchCharges', async (membershipId, { signal, rejectWithValue }) => {
  try {
    return await (await service()).listMemberCharges(membershipId, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'library.charge.error.title'));
  }
});

export const waiveLibraryCharge = createAsyncThunk<
  ChargeRow,
  { id: string; amount: string; reason: string },
  Reject
>('libraryMemberDetail/waiveCharge', async ({ id, amount, reason }, { rejectWithValue }) => {
  try {
    return await (await service()).waiveCharge(id, { amount, reason });
  } catch (error) {
    return rejectWithValue(toApiError(error, 'library.charge.error.save'));
  }
});

export const reverseLibraryCharge = createAsyncThunk<
  ChargeRow,
  { id: string; reason: string },
  Reject
>('libraryMemberDetail/reverseCharge', async ({ id, reason }, { rejectWithValue }) => {
  try {
    return await (await service()).reverseCharge(id, reason);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'library.charge.error.save'));
  }
});

export const createLibraryCharge = createAsyncThunk<
  ChargeRow,
  {
    body: { membership_id: string; kind: ManualChargeKind; amount: string; description: string };
    key: string;
  },
  Reject
>('libraryMemberDetail/createCharge', async ({ body, key }, { rejectWithValue }) => {
  try {
    return await (await service()).createManualCharge(body, key);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'library.charge.error.save'));
  }
});

export const markLibraryLoanLost = createAsyncThunk<
  ChargeRow[],
  { loanId: string; price?: string; reason?: string },
  Reject
>('libraryCounter/markLost', async ({ loanId, ...body }, { rejectWithValue }) => {
  try {
    return await (await service()).markLost(loanId, body);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'library.charge.error.save'));
  }
});

export const markLibraryCopyFound = createAsyncThunk<{ refunded: string | null }, string, Reject>(
  'libraryCopyDetail/found',
  async (copyId, { rejectWithValue }) => {
    try {
      return await (await service()).markFound(copyId);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.charge.error.save'));
    }
  }
);
