import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import './lendingInvalidation';

import type { CollectResult, LoanPage } from '../api/lendingService';
import type {
  BorrowerRow,
  CollectFormValues,
  CollectionPreview,
  CollectionRow,
  LendingRoute,
  LoanDetail,
  LoanFormValues,
  LoanMessageRow,
  LoanPreview,
  TodayRound,
  VisitOutcome,
  VisitRow,
} from '../types/lending.types';

/** Lending's thunks: one service call each; the service loads with the first request. */
const service = () => import('../api/lendingService');

type Reject = { rejectValue: ApiErrorShape };

export const fetchLendingToday = createAsyncThunk<TodayRound, string, Reject>(
  'lendingToday/fetch',
  async (route, { signal, rejectWithValue }) => {
    try {
      return await (await service()).getToday(route, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'lending.today.error'));
    }
  }
);

export const fetchLendingRoutes = createAsyncThunk<LendingRoute[], void, Reject>(
  'lendingToday/fetchRoutes',
  async (_arg, { signal, rejectWithValue }) => {
    try {
      return await (await service()).listRoutes(signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'lending.routes.error'));
    }
  }
);

export const fetchLendingLoans = createAsyncThunk<
  LoanPage,
  { status?: string; q?: string; route?: string; page?: string },
  Reject
>('lendingLoans/fetch', async (params, { signal, rejectWithValue }) => {
  try {
    return await (await service()).listLoans(params, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'lending.loans.error'));
  }
});

export const fetchLendingLoan = createAsyncThunk<
  {
    loan: LoanDetail;
    collections: CollectionRow[];
    visits: VisitRow[];
    messages: LoanMessageRow[];
  },
  string,
  Reject
>('lendingLoans/fetchOne', async (id, { signal, rejectWithValue }) => {
  try {
    const api = await service();
    const [loan, activity] = await Promise.all([
      api.getLoan(id, signal),
      api.getLoanActivity(id, signal),
    ]);
    return { loan, ...activity };
  } catch (error) {
    return rejectWithValue(toApiError(error, 'lending.loan.error'));
  }
});

export const fetchLendingBorrowers = createAsyncThunk<BorrowerRow[], string, Reject>(
  'lendingForm/fetchBorrowers',
  async (q, { signal, rejectWithValue }) => {
    try {
      return await (await service()).listBorrowers(q, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'lending.borrowers.error'));
    }
  }
);

export const previewLendingLoan = createAsyncThunk<LoanPreview, Record<string, unknown>, Reject>(
  'lendingForm/preview',
  async (body, { signal, rejectWithValue }) => {
    try {
      return await (await service()).previewLoan(body, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'lending.loan.error'));
    }
  }
);

export const previewLendingCollection = createAsyncThunk<
  CollectionPreview,
  { loanId: string; amount: string },
  Reject
>('lendingForm/previewCollection', async ({ loanId, amount }, { signal, rejectWithValue }) => {
  try {
    return await (await service()).previewCollection(loanId, amount, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'lending.collect.error'));
  }
});

export const createLendingLoan = createAsyncThunk<
  LoanDetail,
  { values: LoanFormValues; key: string },
  Reject
>('lendingForm/create', async ({ values, key }, { rejectWithValue }) => {
  try {
    return await (await service()).createLoan(values, key);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'lending.loan.error'));
  }
});

export const collectLendingLoan = createAsyncThunk<
  CollectResult,
  { loanId: string; values: CollectFormValues; key: string },
  Reject
>('lendingForm/collect', async ({ loanId, values, key }, { rejectWithValue }) => {
  try {
    return await (await service()).collect(loanId, values, key);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'lending.collect.error'));
  }
});

export const recordLendingVisit = createAsyncThunk<
  boolean,
  { loanId: string; outcome: VisitOutcome; reason: string; promisedOn?: string },
  Reject
>('lendingForm/visit', async ({ loanId, ...body }, { rejectWithValue }) => {
  try {
    await (await service()).recordVisit(loanId, body);
    return true;
  } catch (error) {
    return rejectWithValue(toApiError(error, 'lending.collect.error'));
  }
});

export const saveLendingRoute = createAsyncThunk<boolean, string, Reject>(
  'lendingToday/saveRoute',
  async (name, { rejectWithValue }) => {
    try {
      await (await service()).saveRoute(name);
      return true;
    } catch (error) {
      return rejectWithValue(toApiError(error, 'lending.routes.error'));
    }
  }
);
