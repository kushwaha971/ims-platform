'use client';

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
  Pick<LibraryMemberListState, 'totals' | 'types' | 'enrolling'>;

/** F04 (LIB-04 FR-6) — the members list, its totals and the membership types. */
export const useMemberList = (): MemberList => useCatalogueList(MEMBERS) as MemberList;
