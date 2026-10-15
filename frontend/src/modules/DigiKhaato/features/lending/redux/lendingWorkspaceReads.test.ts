import { resetAllFeatureState } from 'src/redux/actions';
import { cacheInvalidated } from 'src/redux/invalidation/listener';

import { lendingFormSlice } from './lendingFormSlice';
import { lendingLoansSlice } from './lendingLoansSlice';
import {
  fetchLendingBorrower,
  fetchLendingBorrowers,
  fetchLendingLoan,
  fetchLendingLoans,
} from './lendingThunk';

import type { BorrowerRow, LoanDetail, LoanRow } from '../types/lending.types';

const loan = (id: string) => ({
  loan: { id } as LoanDetail,
  collections: [],
  visits: [],
  messages: [],
});
const list = (id: string) => ({
  rows: [{ id } as LoanRow],
  total: 1,
  totalPages: 1,
  page: 1,
  hasLoans: true,
});
const borrower = (id: string) => ({ id, name: id }) as BorrowerRow;

it('does not accept a pre-write loan response after invalidation', () => {
  const reduce = lendingLoansSlice.reducer;
  let state = reduce(undefined, fetchLendingLoan.pending('old', 'l1'));
  state = reduce(state, cacheInvalidated({ slices: ['lendingLoans'], urgency: 'now' }));
  state = reduce(state, fetchLendingLoan.fulfilled(loan('l1'), 'old', 'l1'));
  expect(state.loan).toBeNull();
});

it('keeps the selected loan when an older loan read replies later', () => {
  const reduce = lendingLoansSlice.reducer;
  let state = reduce(undefined, fetchLendingLoan.pending('old', 'l1'));
  state = reduce(state, fetchLendingLoan.pending('new', 'l2'));
  state = reduce(state, fetchLendingLoan.fulfilled(loan('l2'), 'new', 'l2'));
  state = reduce(state, fetchLendingLoan.fulfilled(loan('l1'), 'old', 'l1'));
  expect(state.loan?.id).toBe('l2');
});

it('keeps the current borrower’s loan list when a previous list replies later', () => {
  const reduce = lendingLoansSlice.reducer;
  let state = reduce(undefined, fetchLendingLoans.pending('old', { borrower: 'b1' }));
  state = reduce(state, fetchLendingLoans.pending('new', { borrower: 'b2' }));
  state = reduce(state, fetchLendingLoans.fulfilled(list('l2'), 'new', { borrower: 'b2' }));
  state = reduce(state, fetchLendingLoans.fulfilled(list('l1'), 'old', { borrower: 'b1' }));
  expect(state.rows.map((row) => row.id)).toEqual(['l2']);
});

it('keeps the current borrower when the previous borrower replies later', () => {
  const reduce = lendingFormSlice.reducer;
  let state = reduce(undefined, fetchLendingBorrower.pending('old', 'b1'));
  state = reduce(state, fetchLendingBorrower.pending('new', 'b2'));
  state = reduce(state, fetchLendingBorrower.fulfilled(borrower('b2'), 'new', 'b2'));
  state = reduce(state, fetchLendingBorrower.fulfilled(borrower('b1'), 'old', 'b1'));
  expect(state.borrower?.id).toBe('b2');
});

it('does not restore loans or a borrower after logout or tenant reset', () => {
  let loans = lendingLoansSlice.reducer(undefined, fetchLendingLoan.pending('loan', 'l1'));
  let form = lendingFormSlice.reducer(undefined, fetchLendingBorrower.pending('person', 'b1'));
  loans = lendingLoansSlice.reducer(loans, resetAllFeatureState());
  form = lendingFormSlice.reducer(form, resetAllFeatureState());
  loans = lendingLoansSlice.reducer(loans, fetchLendingLoan.fulfilled(loan('l1'), 'loan', 'l1'));
  form = lendingFormSlice.reducer(
    form,
    fetchLendingBorrower.fulfilled(borrower('b1'), 'person', 'b1')
  );
  expect(loans.loan).toBeNull();
  expect(form.borrower).toBeNull();
});

it('appends later loan pages without duplicates, then restarts when filters change', () => {
  const reduce = lendingLoansSlice.reducer;
  const first = { status: 'active', page: '1' };
  let state = reduce(undefined, fetchLendingLoans.pending('one', first));
  state = reduce(state, fetchLendingLoans.fulfilled(list('l1'), 'one', first));
  const next = { status: 'active', page: '2' };
  state = reduce(state, fetchLendingLoans.pending('two', next));
  state = reduce(
    state,
    fetchLendingLoans.fulfilled(
      { ...list('l2'), rows: [{ id: 'l1' } as LoanRow, { id: 'l2' } as LoanRow], page: 2 },
      'two',
      next
    )
  );
  expect(state.rows.map((row) => row.id)).toEqual(['l1', 'l2']);
  state = reduce(state, fetchLendingLoans.pending('filtered', { status: 'closed', page: '1' }));
  expect(state.rows).toEqual([]);
});
it('replaces a restarted first page after writes instead of retaining old accumulated loans', () => {
  const reduce = lendingLoansSlice.reducer;
  let state = reduce(undefined, fetchLendingLoans.pending('one', { page: '1' }));
  state = reduce(state, fetchLendingLoans.fulfilled(list('l1'), 'one', { page: '1' }));
  state = reduce(state, fetchLendingLoans.pending('two', { page: '2' }));
  state = reduce(
    state,
    fetchLendingLoans.fulfilled({ ...list('l2'), page: 2 }, 'two', { page: '2' })
  );
  state = reduce(state, fetchLendingLoans.pending('refresh', { page: '1' }));
  state = reduce(state, fetchLendingLoans.fulfilled(list('updated'), 'refresh', { page: '1' }));
  expect(state.rows.map((row) => row.id)).toEqual(['updated']);
});

it('does not replace a filtered borrower list with an older search response', () => {
  const reduce = lendingFormSlice.reducer;
  let state = reduce(undefined, fetchLendingBorrowers.pending('old', { q: 'A' }));
  state = reduce(state, fetchLendingBorrowers.pending('new', { q: 'B' }));
  state = reduce(
    state,
    fetchLendingBorrowers.fulfilled({ rows: [borrower('b2')], totals: null }, 'new', { q: 'B' })
  );
  state = reduce(
    state,
    fetchLendingBorrowers.fulfilled({ rows: [borrower('b1')], totals: null }, 'old', { q: 'A' })
  );
  expect(state.borrowers.map((row) => row.id)).toEqual(['b2']);
});

it('loads borrower pages without duplicates and clears them when search changes', () => {
  const reduce = lendingFormSlice.reducer;
  let state = reduce(
    undefined,
    fetchLendingBorrowers.pending('first', { status: 'all', page: '1' })
  );
  state = reduce(
    state,
    fetchLendingBorrowers.fulfilled({ rows: [borrower('b1')], totals: null, total: 3 }, 'first', {
      status: 'all',
      page: '1',
    })
  );
  state = reduce(state, fetchLendingBorrowers.pending('next', { status: 'all', page: '2' }));
  state = reduce(
    state,
    fetchLendingBorrowers.fulfilled(
      { rows: [borrower('b1'), borrower('b2')], totals: null, total: 3 },
      'next',
      { status: 'all', page: '2' }
    )
  );
  expect(state.borrowers.map((row) => row.id)).toEqual(['b1', 'b2']);
  expect(state.borrowersTotal).toBe(3);
  state = reduce(
    state,
    fetchLendingBorrowers.pending('search', { q: 'other', status: 'all', page: '1' })
  );
  expect(state.borrowers).toEqual([]);
});
