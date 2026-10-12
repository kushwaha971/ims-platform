import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import './lendingInvalidation';

import type { BorrowerCollectResult, CollectResult, LoanPage } from '../api/lendingService';
import type {
  BorrowerEditValues,
  BorrowerPage,
  BorrowerRow,
  BorrowerSplit,
  BorrowerStatusFilter,
  CollectFormValues,
  CollectionPreview,
  CollectionRow,
  LendingRoute,
  LoanDetail,
  LoanDueFigures,
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
  { status?: string; q?: string; route?: string; borrower?: string; page?: string },
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

export const fetchLendingBorrowers = createAsyncThunk<
  BorrowerPage,
  { q?: string; status?: BorrowerStatusFilter },
  Reject
>('lendingForm/fetchBorrowers', async (params, { signal, rejectWithValue }) => {
  try {
    return await (await service()).listBorrowers(params, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'lending.borrowers.error'));
  }
});

/** QUERY — one borrower and their loans added up, for the head of their loan list. */
export const fetchLendingBorrower = createAsyncThunk<BorrowerRow, string, Reject>(
  'lendingForm/fetchBorrower',
  async (id, { signal, rejectWithValue }) => {
    try {
      return await (await service()).getBorrower(id, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'lending.borrowers.error'));
    }
  }
);

// ── Owner, 12 Oct 2026 — edit, block and unblock a borrower (owner or admin) ──

/** COMMAND — name and mobile (the party's), area and notes. */
export const updateLendingBorrower = createAsyncThunk<
  BorrowerRow,
  { id: string; values: BorrowerEditValues; version: number },
  Reject
>('lendingForm/updateBorrower', async ({ id, values, version }, { rejectWithValue }) => {
  try {
    return await (await service()).updateBorrower(id, values, version);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'lending.borrower.edit.error'));
  }
});

/** COMMAND — no new loans for this person; collections carry on. */
export const blockLendingBorrower = createAsyncThunk<
  BorrowerRow,
  { id: string; reason: string },
  Reject
>('lendingForm/blockBorrower', async ({ id, reason }, { rejectWithValue }) => {
  try {
    return await (await service()).blockBorrower(id, reason);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'lending.borrower.block.error'));
  }
});

/** COMMAND — new loans allowed again. */
export const unblockLendingBorrower = createAsyncThunk<BorrowerRow, string, Reject>(
  'lendingForm/unblockBorrower',
  async (id, { rejectWithValue }) => {
    try {
      return await (await service()).unblockBorrower(id);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'lending.borrower.block.error'));
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

/** "Collect from <borrower>" (review L5) — the split, before anything is saved. */
export const previewBorrowerCollection = createAsyncThunk<
  BorrowerSplit,
  { borrowerId: string; amount: string },
  Reject
>(
  'lendingForm/previewBorrowerCollection',
  async ({ borrowerId, amount }, { signal, rejectWithValue }) => {
    try {
      return await (await service()).previewBorrowerCollection(borrowerId, amount, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'lending.collect.error'));
    }
  }
);

/** One collection per loan, exactly as `split` showed. */
export const collectFromBorrower = createAsyncThunk<
  BorrowerCollectResult,
  { split: BorrowerSplit; values: CollectFormValues; key: string },
  Reject
>('lendingForm/collectFromBorrower', async ({ split, values, key }, { rejectWithValue }) => {
  try {
    return await (await service()).collectFromBorrower(split, values, key);
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

/** QUERY. LEN-09 — one instalment's late-fee suggestion and what can still be forgiven. */
export const fetchLendingDue = createAsyncThunk<
  LoanDueFigures,
  { loanId: string; dueId: string },
  Reject
>('lendingForm/fetchDue', async ({ loanId, dueId }, { signal, rejectWithValue }) => {
  try {
    return await (await service()).getLoanDue(loanId, dueId, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'lending.adjust.error'));
  }
});

/** MUTATION. LEN-09 — add a late fee ("fee") or forgive part of an instalment ("waive"). */
export const adjustLendingDue = createAsyncThunk<
  LoanDetail,
  {
    loanId: string;
    kind: 'fee' | 'waive';
    dueId: string;
    amount: string;
    reason: string;
    component?: 'interest' | 'fee' | 'principal';
    key: string;
  },
  Reject
>('lendingForm/adjustDue', async ({ loanId, key, ...body }, { rejectWithValue }) => {
  try {
    return await (await service()).adjustLoanDue(loanId, body, key);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'lending.adjust.error'));
  }
});

/** MUTATION. LEN-10 — write a loan off (owner) or cancel one nothing was collected on. */
export const endLendingLoan = createAsyncThunk<
  LoanDetail,
  {
    loanId: string;
    body:
      | { kind: 'write_off'; amount: string; reasonCode: string; reason: string }
      | { kind: 'cancel'; reason: string };
  },
  Reject
>('lendingForm/endLoan', async ({ loanId, body }, { rejectWithValue }) => {
  try {
    return await (await service()).endLoan(loanId, body);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'lending.end.error'));
  }
});
