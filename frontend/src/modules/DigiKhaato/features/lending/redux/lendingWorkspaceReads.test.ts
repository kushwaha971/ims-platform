import { resetAllFeatureState } from 'src/redux/actions';
import { cacheInvalidated } from 'src/redux/invalidation/listener';

import { lendingFormSlice } from './lendingFormSlice';
import { lendingLoansSlice } from './lendingLoansSlice';
import { fetchLendingBorrower, fetchLendingLoan, fetchLendingLoans } from './lendingThunk';

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
