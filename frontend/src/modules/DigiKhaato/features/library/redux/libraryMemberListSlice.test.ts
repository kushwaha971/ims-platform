import { MEMBER_FILTER_DEFAULTS } from '../constants/memberConstants';

import { libraryMemberListSlice, memberFiltersChanged } from './libraryMemberListSlice';
import { fetchLibraryMembers } from './libraryMemberThunk';

import type { MemberPage } from '../api/libraryMemberService';
import type { MemberSummary } from '../types/member.types';

const reducer = libraryMemberListSlice.reducer;
const first = { ...MEMBER_FILTER_DEFAULTS, page: '1' };
const second = { ...first, page: '2' };
const page = (number: number, ids: string[]): MemberPage => ({
  rows: ids.map((membershipId) => ({ membershipId }) as MemberSummary),
  page: number,
  pageSize: 2,
  total: 4,
  totalPages: 2,
  totals: { members: 4, dues: '0.00', depositsHeld: '0.00' },
  hasAny: true,
});

it('appends the next page, deduplicates students and replaces a retried page', () => {
  // Scrolling must retain earlier students and never duplicate retry results.
  let state = reducer(undefined, fetchLibraryMembers.fulfilled(page(1, ['a', 'b']), '1', first));
  state = reducer(state, memberFiltersChanged({ page: '2' }));
  state = reducer(state, fetchLibraryMembers.fulfilled(page(2, ['b', 'c']), '2', second));
  expect(state.rows.map((row) => row.membershipId)).toEqual(['a', 'b', 'c']);
  state = reducer(state, fetchLibraryMembers.fulfilled(page(2, ['c', 'd']), '3', second));
  expect(state.rows.map((row) => row.membershipId)).toEqual(['a', 'b', 'c', 'd']);
});

it('clears accumulated cards on search and rejects a late previous-filter page', () => {
  // A slow old page must not contaminate a new search or tenant view.
  let state = reducer(undefined, fetchLibraryMembers.fulfilled(page(1, ['a']), '1', first));
  state = reducer(state, memberFiltersChanged({ q: 'new student' }));
  expect(state.rows).toEqual([]);
  state = reducer(state, fetchLibraryMembers.fulfilled(page(2, ['old']), '2', second));
  expect(state.rows).toEqual([]);
});

it('replaces all accumulated pages when refreshing page one after a write', () => {
  let state = reducer(undefined, fetchLibraryMembers.fulfilled(page(1, ['a', 'b']), '1', first));
  state = reducer(state, memberFiltersChanged({ page: '2' }));
  state = reducer(state, fetchLibraryMembers.fulfilled(page(2, ['c', 'd']), '2', second));
  state = reducer(state, memberFiltersChanged({ page: '1' }));
  state = reducer(state, fetchLibraryMembers.fulfilled(page(1, ['updated']), '3', first));
  expect(state.rows.map((row) => row.membershipId)).toEqual(['updated']);
  expect(Object.keys(state.pages)).toEqual(['1']);
});
