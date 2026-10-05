import { libraryListCodec } from '../hooks/useLibraryListUrl';
import { MEMBER_ORDERINGS, MEMBER_STATUSES, type MemberFilters } from '../types/member.types';

/** F04 — the members list's defaults and how its filters travel in the address bar. */
export const MEMBER_FILTER_DEFAULTS: MemberFilters = {
  q: '',
  status: '',
  type: '',
  group: '',
  hasDues: '',
  shift: '',
  ordering: '',
  page: '1',
};

export const MEMBER_LIST_URL = libraryListCodec<MemberFilters>({
  keys: ['q', 'status', 'type', 'group', 'hasDues', 'shift', 'ordering', 'page'],
  closed: { status: MEMBER_STATUSES, hasDues: ['true'], ordering: MEMBER_ORDERINGS },
});

export const MEMBER_SEARCH_DEBOUNCE_MS = 300;
