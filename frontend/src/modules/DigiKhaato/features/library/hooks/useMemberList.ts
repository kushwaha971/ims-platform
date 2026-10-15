'use client';

import { useEffect } from 'react';

import { MEMBER_FILTER_DEFAULTS, MEMBER_LIST_URL } from '../constants/memberConstants';
import {
  memberFiltersChanged,
  selectLibraryMemberList,
  type LibraryMemberListState,
} from '../redux/libraryMemberListSlice';
import { fetchLibraryMembers } from '../redux/libraryMemberThunk';

import { useCatalogueList, type CatalogueList, type CatalogueListSpec } from './useCatalogueList';

import type { MemberFilters, MemberSummary } from '../types/member.types';

/* Module-level: `useListUrl` keys its effect on the spec's identity. */
const MEMBERS: CatalogueListSpec<MemberFilters, MemberSummary> = {
  select: selectLibraryMemberList,
  changed: memberFiltersChanged,
  fetch: fetchLibraryMembers,
  codec: MEMBER_LIST_URL,
  defaults: MEMBER_FILTER_DEFAULTS,
  readCode: 'library.member.read',
  writeCode: 'library.member.write',
};

export type MemberList = CatalogueList<MemberFilters, MemberSummary> &
  Pick<LibraryMemberListState, 'totals' | 'hasAny' | 'types' | 'enrolling'>;

/** F04 (LIB-04 FR-6) — the members list, its totals and the membership types. */
export const useMemberList = (): MemberList => {
  const list = useCatalogueList(MEMBERS) as MemberList;
  const { stale, filters, setPage } = list;
  // A fee/seat write can affect any accumulated page. Refresh from page one
  // instead of updating only the last page and retaining stale earlier cards.
  useEffect(() => {
    if (stale && filters.page !== '1') setPage(1);
  }, [stale, filters.page, setPage]);
  return list;
};
