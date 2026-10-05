'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import dynamic from 'next/dynamic';

import { LogIn, LogOut } from 'lucide-react';

import {
  UbButton,
  UbCard,
  UbEmptyState,
  UbListItemText,
  UbPageHeader,
  UbPageShell,
  UbPageSkeleton,
  UbSearchInput,
  UbStack,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { formatClock, todayInTenantTz } from 'src/utils/dates';

import { selectLibraryAttendance } from '../redux/libraryAttendanceSlice';
import {
  checkInLibraryStudent,
  checkOutLibraryStudent,
  fetchLibraryAttendance,
} from '../redux/libraryAttendanceThunk';
import { FEE_TONE } from '../view-model/memberDisplay';

import type { AttendanceRow } from '../types/attendance.types';

/**
 * The day picker loads after the list: the calendar it opens is ~25 KB, and
 * this is the screen the desk opens every morning to mark today, which needs
 * no calendar at all (measured: the route chunk was 86.7 KB with it static).
 */
const UbDateInputLazy = dynamic(
  () => import('src/design-system/UbDateInput').then((m) => m.UbDateInput),
  { ssr: false }
);

/** The "let in anyway" prompt loads with the refusal that needs it. */
const AttendanceOverrideDialogLazy = dynamic(
  () => import('./AttendanceOverrideDialog').then((m) => m.AttendanceOverrideDialog),
  { ssr: false }
);

const matches = (row: AttendanceRow, q: string): boolean => {
  const term = q.trim().toLowerCase();
  if (!term) return true;
  return [row.name, row.memberNumber, row.seat ?? '', row.shift ?? '']
    .join(' ')
    .toLowerCase()
    .includes(term);
};

/**
 * W05 (owner, 4 Oct 2026) — `/library/attendance`: the reading room's day.
 * Every current student, who came in and when, who is in now; one tap checks a
 * student in or out. A late fee lets the student in and SAYS so (the desk asks
 * for the money); a student who left or is on hold is refused, and an owner
 * may let them in with a reason. Today is the default; past days read only.
 */
export function AttendancePageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectLibraryAttendance);
  const timezone = useAppSelector(selectTenantTimezone);
  const today = todayInTenantTz(timezone ?? undefined);
  const { can, hasModule } = usePermissions();
  const canRead = hasModule('library') && can('library.member.read');
  const canMark = hasModule('library') && can('library.member.write');
  const canOverride = hasModule('library') && can('library.member.close');
  const [on, setOn] = useState(today);
  const [q, setQ] = useState('');
  const [blocked, setBlocked] = useState<{ row: AttendanceRow; reason: string } | null>(null);
  const isToday = on === today;

  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchLibraryAttendance(on));
    return () => promise.abort();
  }, [canRead, dispatch, on]);
  const staleNow = state.stale && state.staleUrgency === 'now';
  useEffect(() => {
    if (canRead && staleNow) void dispatch(fetchLibraryAttendance(on));
  }, [canRead, staleNow, dispatch, on]);

  const checkIn = useCallback(
    async (row: AttendanceRow, overrideReason?: string) => {
      const result = await dispatch(
        checkInLibraryStudent({ membershipId: row.membershipId, overrideReason })
      );
      if (checkInLibraryStudent.fulfilled.match(result)) {
        setBlocked(null);
        const warned = result.payload.decision === 'warn';
        dispatch(
          showSnackbar({
            severity: warned ? 'warning' : 'success',
            id: warned ? 'library.attendance.inWithWarning' : 'library.attendance.in',
            params: { name: row.name, reason: result.payload.reason },
          })
        );
        return true;
      }
      const failure = result.payload;
      if (failure?.code === 'attendance_blocked') {
        setBlocked({ row, reason: failure.message });
      } else if (failure) {
        dispatch(
          showSnackbar({
            severity: 'error',
            message: failure.message,
            requestId: failure.requestId,
          })
        );
      }
      return false;
    },
    [dispatch]
  );

  const rows = useMemo(
    () => (state.day?.on === on ? state.day.rows.filter((row) => matches(row, q)) : []),
    [state.day, on, q]
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

  const day = state.day?.on === on ? state.day : null;

  return (
    <UbPageShell>
      <UbPageHeader
        title={t('library.attendance.title')}
        actions={
          <UbDateInputLazy
            name="library-attendance-day"
            appearance="inline"
            inlineLabel={t('library.attendance.day')}
            aria-label={t('library.attendance.day')}
            value={on}
            max={today}
            onChange={(value: string | null) => setOn(value || today)}
          />
        }
      />
      {!day ? (
        state.status === 'failed' ? (
          <UbEmptyState
            variant="error"
            title={t('library.attendance.error.title')}
            description={state.error?.message}
            requestId={state.error?.requestId ?? null}
            requestIdLabel={t('common.error.reference')}
          />
        ) : (
          <UbPageSkeleton variant="card" />
        )
      ) : day.students === 0 ? (
        <UbEmptyState
          variant="firstUse"
          title={t('library.attendance.empty.title')}
          description={t('library.attendance.empty.body')}
        />
      ) : (
        <UbStack gap={4} data-testid="library-attendance">
          <UbText variant="body-sm" tone="secondary" data-testid="library-attendance-counts">
            {[
              t('library.attendance.came', { present: day.present, students: day.students }),
              ...(isToday ? [t('library.attendance.inNow', { count: day.inNow })] : []),
            ].join(' · ')}
          </UbText>
          <UbSearchInput
            value={q}
            onChange={setQ}
            placeholder={t('library.attendance.search')}
            aria-label={t('library.attendance.search')}
          />
          <UbCard padded>
            <UbStack as="ul" gap={0} aria-label={t('library.attendance.title')}>
              {rows.map((row) => {
                const busy = state.busyId === row.membershipId;
                const inNow = !!row.markId && !row.checkOutAt;
                return (
                  <UbStack
                    as="li"
                    key={row.membershipId}
                    gap={2}
                    className="border-b border-border-hairline py-3 last:border-b-0"
                    data-testid={`attendance-row-${row.memberNumber}`}
                  >
                    <UbStack direction="row" justify="between" align="start" gap={3}>
                      <UbListItemText
                        primary={row.name}
                        secondary={[row.memberNumber, row.seat, row.shift]
                          .filter(Boolean)
                          .join(' · ')}
                      />
                      <UbStack gap={1} align="end" className="shrink-0">
                        <UbText
                          variant="body-sm-medium"
                          tone={row.markId ? undefined : 'tertiary'}
                        >
                          {!row.markId
                            ? t('library.attendance.notIn')
                            : row.checkOutAt
                              ? t('library.attendance.inOut', {
                                  in: formatClock(row.checkInAt),
                                  out: formatClock(row.checkOutAt),
                                })
                              : t('library.attendance.inAt', { time: formatClock(row.checkInAt) })}
                        </UbText>
                        {row.feeState !== 'paid' && (
                          <UbStatusBadge
                            tone={FEE_TONE[row.feeState]}
                            label={t(`library.fee.${row.feeState}`)}
                          />
                        )}
                      </UbStack>
                    </UbStack>
                    {isToday && canMark && (!row.markId || inNow) && (
                      <UbStack direction="row" gap={2}>
                        {!row.markId ? (
                          <UbButton
                            size="sm"
                            busy={busy}
                            icon={<LogIn className="h-4 w-4" aria-hidden />}
                            onClick={() => void checkIn(row)}
                          >
                            {t('library.attendance.checkIn')}
                          </UbButton>
                        ) : (
                          <UbButton
                            size="sm"
                            variant="secondary"
                            busy={busy}
                            icon={<LogOut className="h-4 w-4" aria-hidden />}
                            onClick={() => void dispatch(checkOutLibraryStudent(row.markId ?? ''))}
                          >
                            {t('library.attendance.checkOut')}
                          </UbButton>
                        )}
                      </UbStack>
                    )}
                  </UbStack>
                );
              })}
              {rows.length === 0 && (
                <UbText variant="body-sm" tone="tertiary">
                  {t('library.attendance.noMatch', { q })}
                </UbText>
              )}
            </UbStack>
          </UbCard>
        </UbStack>
      )}
      {blocked && (
        <AttendanceOverrideDialogLazy
          name={blocked.row.name}
          reason={blocked.reason}
          canOverride={canOverride}
          busy={state.busyId === blocked.row.membershipId}
          onClose={() => setBlocked(null)}
          onSubmit={(why) => checkIn(blocked.row, why)}
        />
      )}
    </UbPageShell>
  );
}
