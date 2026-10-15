'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';

import { ChevronRight, UserPlus } from 'lucide-react';

import {
  UbLoadMore,
  UbAvatar,
  UbPressable,
  UbStatusBadge,
  UbStatCard,
  UbButton,
  UbEmptyState,
  UbPageHeader,
  UbPageShell,
  UbSearchInput,
  UbStack,
  UbSkeleton,
  UbText,
  UbActiveFilters,
  UbFilterSelect,
  UbFilterSheet,
  type UbFilterSpec,
  type UbFilterValues,
} from 'src/design-system';
import {
  UbDataGridEmptyState,
  useGridTier,
  type UbDataGridEmptyStates,
} from 'src/design-system/UbDataGrid';
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
import { formatPhoneForDisplay } from 'src/utils/share';

import { ImportActionLink } from 'modules/DigiKhaato/features/imports/components/ListHeaderActions';

import { MEMBER_SEARCH_DEBOUNCE_MS } from '../constants/memberConstants';
import { useMemberList } from '../hooks/useMemberList';
import { useSeats } from '../hooks/useSeats';
import { enrolLibraryMember, fetchLibraryMembershipTypes } from '../redux/libraryMemberThunk';
import { MEMBER_STATUSES, type EnrolFormValues, type MemberSummary } from '../types/member.types';
import { listGridState } from '../view-model/copyDisplay';
import { FEE_TONE, feeLabel, toEnrolBody } from '../view-model/memberDisplay';

import { LibraryCard } from './LibraryCard';

import type { UseFormSetError } from 'react-hook-form';

/** The enrol form loads with the tap that opens it (CLAUDE.md). */
const EnrolMemberDrawerLazy = dynamic(
  () => import('./EnrolMemberDrawer').then((m) => m.EnrolMemberDrawer),
  { ssr: false }
);

const MemberDetailDrawerLazy = dynamic(
  () => import('./MemberDetailDrawer').then((m) => m.MemberDetailDrawer),
  { ssr: false }
);

const ENROL_FIELDS = [
  'partyId',
  'name',
  'mobile',
  'membershipTypeId',
  'memberNumber',
  'groupLabel',
  'guardianName',
  'guardianMobile',
  'shiftId',
  'seatId',
  'lockerLabel',
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
  shift_id: 'shiftId',
  seat_id: 'seatId',
  locker_label: 'lockerLabel',
};

/**
 * F04 (LIB-04 FR-6, §8) — `/library/members`: who belongs to the library, in
 * which state, owing what. The status chips are one choice at a time; the
 * totals strip counts the FILTERED set (FR-2's rule). A row opens the member.
 */
export function MemberListPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const dispatch = useAppDispatch();
  const list = useMemberList();
  const tier = useGridTier();
  const timezone = useAppSelector(selectTenantTimezone);
  const today = todayInTenantTz(timezone ?? undefined);
  const { key, rotate } = useIdempotencyKey();
  // W04 — the home's "New admission" opens the drawer here (`?add=1`).
  const query = useSearchParams();
  const asksToAdd = query.get('add') === '1';
  // URL filters clean unrelated parameters after mount. Preserve admission
  // context before that cleanup, and keep it separate from the list's shift filter.
  const [admissionRequest, setAdmissionRequest] = useState(() =>
    asksToAdd
      ? {
          seatId: query.get('seat') ?? '',
          shiftId: query.get('admitShift') ?? '',
        }
      : null
  );
  const requestedSeatId = admissionRequest?.seatId ?? '';
  const requestedShiftId = admissionRequest?.shiftId ?? '';
  const [enrolling, setEnrolling] = useState(asksToAdd);
  const admissionQuery = asksToAdd ? query.toString() : '';
  const [observedAdmissionQuery, setObservedAdmissionQuery] = useState(admissionQuery);
  // Next may retain an already visited list. Adjust only when its external
  // admission request changes; URL cleanup must not discard the active form.
  if (admissionQuery !== observedAdmissionQuery) {
    setObservedAdmissionQuery(admissionQuery);
    if (admissionQuery) {
      const request = new URLSearchParams(admissionQuery);
      setAdmissionRequest({
        seatId: request.get('seat') ?? '',
        shiftId: request.get('admitShift') ?? '',
      });
      setEnrolling(true);
    }
  }
  const { filters, setFilters, clearFilters, refetch, error, canRead, canWrite, totals } = list;
  const seating = useSeats();
  const { activeShifts } = seating;
  const initialPlacement =
    requestedSeatId &&
    seating.seats.some((seat) => seat.id === requestedSeatId && seat.isActive) &&
    (!requestedShiftId || activeShifts.some((shift) => shift.id === requestedShiftId))
      ? { seatId: requestedSeatId, shiftId: requestedShiftId }
      : undefined;

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

  const sheetSpecs = useMemo<UbFilterSpec[]>(
    () => [
      {
        kind: 'single',
        key: 'hasDues',
        label: t('library.members.chip.hasDues'),
        anyLabel: t('library.members.filter.any'),
        options: [{ value: 'true', label: t('library.members.filter.yes') }],
      },
      ...(activeShifts.length > 1
        ? [
            {
              kind: 'single' as const,
              key: 'shift',
              label: t('library.members.filter.shift'),
              anyLabel: t('library.members.allShifts'),
              options: activeShifts.map((shift) => ({ value: shift.id, label: shift.name })),
            },
          ]
        : []),
      ...(list.types.length > 1
        ? [
            {
              kind: 'single' as const,
              key: 'type',
              label: t('library.members.filter.type'),
              anyLabel: t('library.members.allTypes'),
              options: list.types.map((type) => ({ value: type.id, label: type.name })),
            },
          ]
        : []),
    ],
    [t, activeShifts, list.types]
  );
  const sheetValues: UbFilterValues = {
    hasDues: filters.hasDues,
    shift: filters.shift,
    type: filters.type,
  };
  const applySheet = (next: UbFilterValues) =>
    setFilters({
      hasDues: next.hasDues ?? '',
      shift: next.shift ?? '',
      type: next.type ?? '',
    } as Partial<typeof filters>);

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
      } else if (failure.code === 'library_seat_taken') {
        // "A12 is taken by Asha (Morning)": said on the seat, so another is picked.
        setError('seatId', { message: failure.message });
      } else if (failure.code === 'library_member_number_taken') {
        setError('memberNumber', { message: failure.message });
      } else if (failure.code === 'library_membership_exists') {
        setError(values.partyMode === 'existing' ? 'partyId' : 'name', {
          message: t('library.enrol.exists'),
        });
      } else {
        // The request was quiet so a field refusal is said once; anything else
        // still reaches the snackbar.
        dispatch(
          showSnackbar({
            severity: 'error',
            message: failure.message,
            requestId: failure.requestId,
          })
        );
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

  const rowName = useCallback((row: MemberSummary) => `${row.name} ${row.memberNumber}`, []);
  const openRow = useCallback((row: MemberSummary) => setSelectedMember(row.membershipId), []);

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

  /* Approved design (12 Oct 2026): nobody admitted yet is the empty state
     alone — no "0 students · ₹0.00 fee due", search or filters. */
  const emptyBook = list.status === 'succeeded' && list.rows.length === 0 && list.hasAny === false;
  const statusSpec: UbFilterSpec = {
    kind: 'single',
    key: 'status',
    label: t('library.members.filter.status'),
    anyLabel: t('library.members.filter.any'),
    options: MEMBER_STATUSES.map((status) => ({
      value: status,
      label: t(`library.members.chip.${status}`),
    })),
  };
  // On a phone the status joins the one Filters sheet (approved design).
  const phone = tier === 'cards';
  const specs = phone ? [statusSpec, ...sheetSpecs] : sheetSpecs;
  const values = phone ? { ...sheetValues, status: filters.status } : sheetValues;
  // One update for the whole sheet: two would each start from the same
  // filters, and the second would undo the first.
  const apply = (next: UbFilterValues) =>
    setFilters({
      hasDues: next.hasDues ?? '',
      shift: next.shift ?? '',
      type: next.type ?? '',
      ...(phone ? { status: next.status ?? '' } : {}),
    } as Partial<typeof filters>);

  return (
    <UbPageShell>
      <UbPageHeader
        title={t('library.member.title')}
        actions={
          canWrite ? (
            <>
              <UbButton
                icon={<UserPlus className="h-4 w-4" aria-hidden />}
                onClick={() => setEnrolling(true)}
                data-testid="library-member-add"
              >
                {t('library.members.add')}
              </UbButton>
              {/* QA F10 — the paper register in one file (existing students, F1). */}
              <ImportActionLink kind="students" />
            </>
          ) : undefined
        }
      />
      <UbStack gap={3} data-testid="library-members-screen">
        {emptyBook ? (
          <UbEmptyState
            variant="firstUse"
            title={emptyStates.firstUse.title}
            description={emptyStates.firstUse.description}
            action={emptyStates.firstUse.action}
          />
        ) : (
          <>
            {typeof totals?.active === 'number' && typeof totals.expired === 'number' && (
              <UbStack className="grid max-w-xl grid-cols-2 gap-3">
                <UbStatCard
                  value={String(totals.active)}
                  label={t('library.members.summary.active')}
                  tone="success"
                  className="bg-success-dim"
                />
                <UbStatCard
                  value={String(totals.expired)}
                  label={t('library.members.summary.expired')}
                  className="bg-surface-sunken"
                />
              </UbStack>
            )}
            <UbStack
              className="min-h-5 max-sm:min-h-10"
              aria-busy={list.status === 'loading' || list.status === 'idle'}
              data-testid="library-members-summary"
            >
              {totals ? (
                <UbText variant="body-sm" tone="secondary" data-testid="library-members-totals">
                  {[
                    t('library.members.totals.members', { count: totals.members }),
                    t('library.members.totals.dues', { amount: formatInr(totals.dues) }),
                    ...(Number(totals.depositsHeld) > 0
                      ? [
                          t('library.members.totals.deposits', {
                            amount: formatInr(totals.depositsHeld),
                          }),
                        ]
                      : []),
                  ].join(' · ')}
                </UbText>
              ) : list.status === 'loading' || list.status === 'idle' ? (
                <UbSkeleton
                  variant="text"
                  count={1}
                  label={t('library.list.loading')}
                  className="max-w-64"
                />
              ) : null}
            </UbStack>
            {/* Owner, 6 Oct 2026: the status a desk changes most is the one
            dropdown; dues, shift and plan sit behind Filters, as pills when on.
            Owner, 12 Oct 2026: search and those controls are ONE row. */}
            <UbStack direction="row" align="center" gap={2}>
              <UbSearchInput
                value={search}
                onChange={setSearch}
                placeholder={t('library.members.search.label')}
                aria-label={t('library.members.search.label')}
                className="min-w-0 flex-1"
              />
              {!phone && (
                <UbFilterSelect
                  spec={statusSpec}
                  value={filters.status}
                  onChange={(status) => setFilters({ status } as Partial<typeof filters>)}
                  closeLabel={t('common.action.close')}
                />
              )}
              <UbFilterSheet
                compact
                className="h-10"
                specs={specs}
                values={values}
                onApply={apply}
                labels={{
                  title: t('common.filters.title'),
                  apply: t('common.action.apply'),
                  reset: t('common.action.reset'),
                  close: t('common.action.close'),
                }}
              />
            </UbStack>
            <UbActiveFilters
              specs={sheetSpecs}
              values={sheetValues}
              onChange={applySheet}
              labels={{
                remove: (pill) => t('common.filters.remove', { filter: pill }),
                clearAll: t('common.filters.clearAll'),
              }}
            />
            {list.rows.length > 0 ? (
              <>
                <UbStack
                  className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
                  aria-label={t('library.members.caption')}
                >
                  {list.rows.map((row) => (
                    <LibraryCard key={row.membershipId} padded={false} elevated>
                      <UbPressable
                        onClick={() => openRow(row)}
                        aria-label={rowName(row)}
                        className="w-full rounded-card px-3 py-2.5 text-left"
                      >
                        <UbStack direction="row" align="center" gap={2}>
                          <UbAvatar name={row.name} className="bg-primary-50 text-text-accent" />
                          <UbStack gap={0} className="min-w-0 flex-1">
                            <UbText variant="body-medium" className="break-words">
                              {row.name}
                            </UbText>
                            <UbText variant="caption" tone="tertiary">
                              {[
                                formatPhoneForDisplay(row.mobile) || row.memberNumber,
                                row.locationLabel || row.groupLabel,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </UbText>
                            <UbText variant="caption" tone="secondary" className="font-medium">
                              {row.effectiveStatus === 'expired'
                                ? t('library.members.membershipExpired')
                                : row.seat
                                  ? `${t('library.seats.detailTitle', { seat: row.seat.label })} · ${row.shift?.name || t('library.seats.day.allDay')}`
                                  : row.shift?.name || t('library.members.noSeat')}
                            </UbText>
                          </UbStack>
                          <UbStack gap={2} align="end" className="max-w-[40%] shrink-0">
                            <UbStatusBadge
                              tone={FEE_TONE[row.feeState]}
                              label={
                                Number(row.duesAmount) > 0
                                  ? t('library.fee.amountDue', {
                                      amount: formatInr(row.duesAmount),
                                    })
                                  : feeLabel(t, row.feeState, null)
                              }
                            />
                            <ChevronRight className="h-4 w-4 text-text-tertiary" aria-hidden />
                          </UbStack>
                        </UbStack>
                      </UbPressable>
                    </LibraryCard>
                  ))}
                </UbStack>
                {list.page < list.totalPages &&
                  (list.status === 'failed' ? (
                    <UbButton variant="secondary" onClick={refetch}>
                      {t('common.action.retry')}
                    </UbButton>
                  ) : (
                    <UbLoadMore
                      loading={
                        list.status === 'loading' ||
                        list.status === 'refreshing' ||
                        Number(filters.page) > list.page
                      }
                      loadingLabel={t('library.list.loading')}
                      moreLabel={t('library.members.loadMore')}
                      onLoadMore={() => {
                        if (list.status === 'succeeded' && Number(filters.page) === list.page)
                          list.setPage(list.page + 1);
                      }}
                    />
                  ))}
              </>
            ) : listGridState(list) === 'loading' ? (
              <UbSkeleton variant="card" count={3} label={t('library.list.loading')} />
            ) : (
              <UbDataGridEmptyState state={listGridState(list)} copy={emptyStates} />
            )}
          </>
        )}
      </UbStack>
      {selectedMember && (
        <MemberDetailDrawerLazy
          key={selectedMember}
          id={selectedMember}
          onClose={() => setSelectedMember(null)}
        />
      )}
      {enrolling && canWrite && (!requestedSeatId || seating.listsStatus === 'succeeded') && (
        <EnrolMemberDrawerLazy
          key={admissionRequest ? `${admissionRequest.seatId}:${admissionRequest.shiftId}` : 'new'}
          types={list.types}
          initialPlacement={initialPlacement}
          busy={list.enrolling}
          onClose={() => setEnrolling(false)}
          onSubmit={enrol}
        />
      )}
    </UbPageShell>
  );
}
