'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { UserPlus } from 'lucide-react';

import {
  UbButton,
  UbEmptyState,
  UbFilterBar,
  UbFilterChip,
  UbFilterChipGroup,
  UbNativeSelect,
  UbPageHeader,
  UbPageShell,
  UbSearchInput,
  UbStack,
  UbText,
} from 'src/design-system';
import { UbDataGrid, type UbDataGridEmptyStates } from 'src/design-system/UbDataGrid';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useCommittedSearch } from 'src/hooks/useCommittedSearch';
import { useIdempotencyKey } from 'src/hooks/useIdempotencyKey';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { ROUTES } from 'src/routes';
import { applyServerErrors } from 'src/utils/applyServerErrors';
import { todayInTenantTz } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import { MEMBER_SEARCH_DEBOUNCE_MS } from '../constants/memberConstants';
import { useLibraryGridLabels } from '../hooks/useLibraryGridLabels';
import { useMemberList } from '../hooks/useMemberList';
import { enrolLibraryMember, fetchLibraryMembershipTypes } from '../redux/libraryMemberThunk';
import { MEMBER_STATUSES, type EnrolFormValues, type MemberSummary } from '../types/member.types';
import { listGridState } from '../view-model/copyDisplay';
import { toEnrolBody } from '../view-model/memberDisplay';

import { createMemberColumns } from './MemberColumns';

import type { UseFormSetError } from 'react-hook-form';

/** The enrol form loads with the tap that opens it (CLAUDE.md). */
const EnrolMemberDrawerLazy = dynamic(
  () => import('./EnrolMemberDrawer').then((m) => m.EnrolMemberDrawer),
  { ssr: false }
);

const ALL = 'all';
const ENROL_FIELDS = [
  'partyId',
  'name',
  'mobile',
  'membershipTypeId',
  'memberNumber',
  'groupLabel',
  'guardianName',
  'guardianMobile',
] as const;
/** Server field paths → the drawer's own names. */
const SERVER_FIELD: Readonly<Record<string, string>> = {
  party_id: 'partyId',
  'party.name': 'name',
  'party.mobile': 'mobile',
  membership_type_id: 'membershipTypeId',
  member_number: 'memberNumber',
  group_label: 'groupLabel',
  'guardian.name': 'guardianName',
  'guardian.mobile': 'guardianMobile',
};

/**
 * F04 (LIB-04 FR-6, §8) — `/library/members`: who belongs to the library, in
 * which state, owing what. The status chips are one choice at a time; the
 * totals strip counts the FILTERED set (FR-2's rule). A row opens the member.
 */
export function MemberListPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const list = useMemberList();
  const labels = useLibraryGridLabels();
  const timezone = useAppSelector(selectTenantTimezone);
  const today = todayInTenantTz(timezone ?? undefined);
  const { key, rotate } = useIdempotencyKey();
  const [enrolling, setEnrolling] = useState(false);
  const { filters, setFilters, clearFilters, refetch, error, canRead, canWrite, totals } = list;

  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchLibraryMembershipTypes());
    return () => promise.abort();
  }, [dispatch, canRead]);

  const commitSearch = useCallback((q: string) => setFilters({ q }), [setFilters]);
  const [search, setSearch] = useCommittedSearch(
    filters.q,
    commitSearch,
    MEMBER_SEARCH_DEBOUNCE_MS
  );

  const columns = useMemo(() => createMemberColumns({ t, today }), [t, today]);
  const typeOptions = useMemo(
    () => [
      { value: ALL, label: t('library.members.allTypes') },
      ...list.types.map((type) => ({ value: type.id, label: type.name })),
    ],
    [t, list.types]
  );

  const enrol = useCallback(
    async (values: EnrolFormValues, setError: UseFormSetError<EnrolFormValues>) => {
      const type = list.types.find((row) => row.id === values.membershipTypeId);
      const result = await dispatch(
        enrolLibraryMember({ body: toEnrolBody(values, type, today), key })
      );
      if (enrolLibraryMember.fulfilled.match(result)) {
        rotate();
        setEnrolling(false);
        dispatch(
          showSnackbar({
            severity: 'success',
            id: 'library.enrol.done',
            params: { name: result.payload.name, number: result.payload.memberNumber },
          })
        );
        router.push(`${ROUTES.LIBRARY_MEMBERS}/${result.payload.membershipId}`);
        return;
      }
      const failure = result.payload;
      if (!failure) return;
      rotate();
      if (failure.code === 'validation_error') {
        const details = Object.fromEntries(
          Object.entries(failure.details ?? {}).map(([path, messages]) => [
            SERVER_FIELD[path] ?? path,
            messages,
          ])
        );
        applyServerErrors({ ...failure, details }, setError, ENROL_FIELDS);
      } else if (failure.code === 'library_member_number_taken') {
        setError('memberNumber', { message: failure.message });
      } else if (failure.code === 'library_membership_exists') {
        setError(values.partyMode === 'existing' ? 'partyId' : 'name', {
          message: t('library.enrol.exists'),
        });
      }
    },
    [dispatch, list.types, today, key, rotate, router, t]
  );

  const emptyStates = useMemo<UbDataGridEmptyStates>(
    () => ({
      firstUse: {
        title: t('library.members.empty.first'),
        description: t('library.members.empty.firstBody'),
        action: canWrite ? (
          <UbButton variant="secondary" onClick={() => setEnrolling(true)}>
            {t('library.members.add')}
          </UbButton>
        ) : undefined,
      },
      filtered: {
        title: filters.q
          ? t('library.members.empty.search', { q: filters.q })
          : t('library.members.empty.filtered'),
        action: (
          <UbButton variant="secondary" onClick={clearFilters}>
            {t('common.action.clearFilters')}
          </UbButton>
        ),
      },
      error: {
        title: t('library.members.error.title'),
        description: error?.message,
        requestId: error?.requestId ?? null,
        requestIdLabel: t('common.error.reference'),
        action: (
          <UbButton variant="secondary" onClick={refetch}>
            {t('common.action.retry')}
          </UbButton>
        ),
      },
    }),
    [t, canWrite, filters.q, clearFilters, error, refetch]
  );

  const rowId = useCallback((row: MemberSummary) => row.membershipId, []);
  const rowName = useCallback((row: MemberSummary) => `${row.name} ${row.memberNumber}`, []);
  const openRow = useCallback(
    (row: MemberSummary) => router.push(`${ROUTES.LIBRARY_MEMBERS}/${row.membershipId}`),
    [router]
  );

  if (!canRead) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('library.noAccess.title')}
          description={t('library.noAccess.body')}
        />
      </UbPageShell>
    );
  }

  return (
    <UbPageShell>
      <UbPageHeader
        title={t('library.member.title')}
        actions={
          canWrite ? (
            <UbButton
              icon={<UserPlus className="h-4 w-4" aria-hidden />}
              onClick={() => setEnrolling(true)}
              data-testid="library-member-add"
            >
              {t('library.members.add')}
            </UbButton>
          ) : undefined
        }
      />
      <UbStack gap={4} data-testid="library-members-screen">
        {totals && (
          <UbText variant="body-sm" tone="secondary" data-testid="library-members-totals">
            {[
              t('library.members.totals.members', { count: totals.members }),
              t('library.members.totals.dues', { amount: formatInr(totals.dues) }),
              t('library.members.totals.deposits', { amount: formatInr(totals.depositsHeld) }),
            ].join(' · ')}
          </UbText>
        )}
        <UbSearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('library.members.search.placeholder')}
          aria-label={t('library.members.search.label')}
        />
        <UbFilterBar
          end={
            list.types.length > 1 ? (
              <UbNativeSelect
                name="library-member-type"
                aria-label={t('library.members.filter.type')}
                value={filters.type || ALL}
                options={typeOptions}
                onChange={(value: string) => setFilters({ type: value === ALL ? '' : value })}
                className="w-40"
              />
            ) : undefined
          }
        >
          <UbFilterChipGroup label={t('library.members.filter.status')}>
            {MEMBER_STATUSES.map((status) => (
              <UbFilterChip
                key={status}
                label={t(`library.members.chip.${status}`)}
                pressed={filters.status === status}
                onToggle={(pressed) => setFilters({ status: pressed ? status : '' })}
              />
            ))}
            <UbFilterChip
              label={t('library.members.chip.hasDues')}
              pressed={filters.hasDues === 'true'}
              onToggle={(pressed) => setFilters({ hasDues: pressed ? 'true' : '' })}
            />
          </UbFilterChipGroup>
        </UbFilterBar>
        <UbDataGrid
          rows={list.rows}
          columns={columns}
          rowId={rowId}
          rowName={rowName}
          state={listGridState(list)}
          labels={labels}
          emptyStates={emptyStates}
          caption={t('library.members.caption')}
          storageId="library.members"
          page={{
            page: list.page,
            pageSize: list.pageSize,
            total: list.total,
            totalPages: list.totalPages,
          }}
          onPageChange={list.setPage}
          onRowOpen={openRow}
          cardAvatar={false}
        />
      </UbStack>
      {enrolling && (
        <EnrolMemberDrawerLazy
          types={list.types}
          busy={list.enrolling}
          onClose={() => setEnrolling(false)}
          onSubmit={enrol}
        />
      )}
    </UbPageShell>
  );
}
