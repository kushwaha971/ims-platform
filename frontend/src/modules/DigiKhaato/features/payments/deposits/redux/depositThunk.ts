import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import type { PartyDeposits } from '../api/depositService';
import type {
  ApplyDepositFormValues,
  Deposit,
  DepositDetail,
  DepositMoneyFormValues,
  DepositWriteResult,
} from '../types/deposit.types';

/**
 * A4b — one service call each (Part 19 §19.3.3). The service is imported inside
 * each thunk so nothing of it reaches a route that never shows a deposit.
 */
const service = () => import('../api/depositService');

type Reject = { rejectValue: ApiErrorShape };

/** QUERY. A party's deposits and what they hold. */
export const fetchPartyDeposits = createAsyncThunk<PartyDeposits, string, Reject>(
  'deposit/fetchPartyDeposits',
  async (partyId, { signal, rejectWithValue }) => {
    try {
      return await (await service()).listPartyDeposits(partyId, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'payments.deposit.error.load'));
    }
  }
);

/** QUERY. One deposit with its evidence — what the slip prints. */
export const fetchDeposit = createAsyncThunk<DepositDetail, string, Reject>(
  'deposit/fetchDeposit',
  async (id, { signal, rejectWithValue }) => {
    try {
      return await (await service()).getDeposit(id, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'payments.deposit.error.load'));
    }
  }
);

interface MoneyArgs {
  readonly deposit: Deposit;
  readonly values: DepositMoneyFormValues;
  readonly idempotencyKey: string;
}

/** MUTATION. "Take deposit" — a payment IN to the deposit bucket. */
export const receiveDeposit = createAsyncThunk<DepositWriteResult, MoneyArgs, Reject>(
  'deposit/receiveDeposit',
  async ({ deposit, values, idempotencyKey }, { rejectWithValue }) => {
    try {
      return await (await service()).receiveDeposit(deposit, values, idempotencyKey);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'payments.deposit.error.save'));
    }
  }
);

/** MUTATION. "Return deposit" — a payment OUT of the deposit bucket. */
export const refundDeposit = createAsyncThunk<DepositWriteResult, MoneyArgs, Reject>(
  'deposit/refundDeposit',
  async ({ deposit, values, idempotencyKey }, { rejectWithValue }) => {
    try {
      return await (await service()).refundDeposit(deposit, values, idempotencyKey);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'payments.deposit.error.save'));
    }
  }
);

/** MUTATION. "Adjust from deposit" — the two adjustment payments, one act. */
export const applyDeposit = createAsyncThunk<
  DepositWriteResult,
  {
    readonly deposit: Deposit;
    readonly values: ApplyDepositFormValues;
    readonly idempotencyKey: string;
  },
  Reject
>('deposit/applyDeposit', async ({ deposit, values, idempotencyKey }, { rejectWithValue }) => {
  try {
    return await (await service()).applyDeposit(deposit, values, idempotencyKey);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'payments.deposit.error.save'));
  }
});
