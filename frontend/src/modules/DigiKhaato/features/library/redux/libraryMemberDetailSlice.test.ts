import { resetAllFeatureState } from 'src/redux/actions';

import { fetchMemberCharges } from './libraryChargeThunk';
import { libraryMemberDetailSlice } from './libraryMemberDetailSlice';
import { fetchLibraryMember } from './libraryMemberThunk';

import type { MemberDetail } from '../types/member.types';

const reducer = libraryMemberDetailSlice.reducer;
const member = (membershipId: string): MemberDetail =>
  ({ membershipId, name: membershipId }) as MemberDetail;
const charges = (paid: string) => ({
  rows: [],
  totals: { amount: '900.00', paid, due: '700.00', waived: '0.00' },
});

it('ignores a delayed previous student after opening the next student', () => {
  let state = reducer(undefined, fetchLibraryMember.pending('old', 'm1'));
  state = reducer(state, fetchLibraryMember.pending('new', 'm2'));
  state = reducer(state, fetchLibraryMember.fulfilled(member('m2'), 'new', 'm2'));
  state = reducer(state, fetchLibraryMember.fulfilled(member('m1'), 'old', 'm1'));
  expect(state.member?.membershipId).toBe('m2');
});

it('ignores previous-student charges after the current student loads', () => {
  let state = reducer(undefined, fetchLibraryMember.pending('one', 'm1'));
  state = reducer(state, fetchLibraryMember.fulfilled(member('m1'), 'one', 'm1'));
  state = reducer(state, fetchMemberCharges.pending('old-charges', 'm1'));
  state = reducer(state, fetchLibraryMember.pending('two', 'm2'));
  state = reducer(state, fetchLibraryMember.fulfilled(member('m2'), 'two', 'm2'));
  state = reducer(state, fetchMemberCharges.fulfilled(charges('200.00'), 'old-charges', 'm1'));
  expect(state.chargeTotals).toBeNull();
});

it('keeps the fresh charge totals when an older read finishes after them', () => {
  let state = reducer(undefined, fetchLibraryMember.pending('one', 'm1'));
  state = reducer(state, fetchLibraryMember.fulfilled(member('m1'), 'one', 'm1'));
  state = reducer(state, fetchMemberCharges.pending('before-save', 'm1'));
  state = reducer(state, fetchMemberCharges.pending('after-save', 'm1'));
  state = reducer(state, fetchMemberCharges.fulfilled(charges('200.00'), 'after-save', 'm1'));
  state = reducer(state, fetchMemberCharges.fulfilled(charges('0.00'), 'before-save', 'm1'));
  expect(state.chargeTotals?.paid).toBe('200.00');
});

it('does not restore a student or fees after logout or tenant reset', () => {
  let state = reducer(undefined, fetchLibraryMember.pending('one', 'm1'));
  state = reducer(state, fetchMemberCharges.pending('fees', 'm1'));
  state = reducer(state, resetAllFeatureState());
  state = reducer(state, fetchLibraryMember.fulfilled(member('m1'), 'one', 'm1'));
  state = reducer(state, fetchMemberCharges.fulfilled(charges('200.00'), 'fees', 'm1'));
  expect(state.member).toBeNull();
  expect(state.chargeTotals).toBeNull();
});
