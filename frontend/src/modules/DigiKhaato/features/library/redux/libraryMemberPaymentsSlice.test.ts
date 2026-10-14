import { resetAllFeatureState } from 'src/redux/actions';

import type { PaymentPage } from 'modules/DigiKhaato/features/payments/types/payment.types';

import { libraryMemberPaymentsSlice } from './libraryMemberPaymentsSlice';
import { fetchMemberPayments } from './libraryPaymentThunk';


const page = (partyId: string, amount: string): PaymentPage => ({
  rows: [
    {
      id: `payment-${partyId}-${amount}`,
      number: 'RCT/1',
      direction: 'in',
      party: { id: partyId, name: partyId, mobile: null },
      paymentDate: '2026-10-14',
      amount,
      primaryMode: 'cash',
      modesCount: 1,
      reference: '',
      status: 'recorded',
      unallocatedAmount: '0.00',
      allocatedAmount: amount,
    },
  ],
  totals: { count: 1, countIn: 1, countOut: 0, amountIn: amount, amountOut: '0.00' },
  page: 1,
  pageSize: 25,
  total: 1,
});
const first = { membershipId: 'm1', partyId: 'p1', page: 1 };
const second = { membershipId: 'm2', partyId: 'p2', page: 1 };
const reducer = libraryMemberPaymentsSlice.reducer;

/** A delayed history must never expose the previous student on the current one. */
it('ignores the previous student’s reply after opening another student', () => {
  let state = reducer(undefined, fetchMemberPayments.pending('old', first));
  state = reducer(state, fetchMemberPayments.pending('new', second));
  state = reducer(state, fetchMemberPayments.fulfilled(page('p1', '777.00'), 'old', first));
  expect(state.membershipId).toBe('m2');
  expect(state.data).toBeNull();
  state = reducer(state, fetchMemberPayments.fulfilled(page('p2', '200.00'), 'new', second));
  expect(state.data?.rows[0]?.party?.id).toBe('p2');
});

/** A slower pre-save read must not erase the newly saved fee's authoritative history. */
it('keeps the latest history when an older read finishes after it', () => {
  let state = reducer(undefined, fetchMemberPayments.pending('before-save', first));
  state = reducer(state, fetchMemberPayments.pending('after-save', first));
  state = reducer(state, fetchMemberPayments.fulfilled(page('p1', '200.00'), 'after-save', first));
  state = reducer(state, fetchMemberPayments.fulfilled(page('p1', '100.00'), 'before-save', first));
  expect(state.data?.totals.amountIn).toBe('200.00');
});

/** Logout or tenant changes must not be undone by a receipt read already in flight. */
it('does not restore old history after the feature state was reset', () => {
  let state = reducer(undefined, fetchMemberPayments.pending('old', first));
  state = reducer(state, resetAllFeatureState());
  state = reducer(state, fetchMemberPayments.fulfilled(page('p1', '200.00'), 'old', first));
  expect(state.data).toBeNull();
  expect(state.membershipId).toBeNull();
});
