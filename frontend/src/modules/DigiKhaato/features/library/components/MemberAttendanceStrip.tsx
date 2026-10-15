'use client';

import { useEffect } from 'react';

import { UbStack, UbText } from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { cn } from 'src/utils/cn';

import { selectLibraryAttendance } from '../redux/libraryAttendanceSlice';
import { fetchMemberAttendance } from '../redux/libraryAttendanceThunk';

import { LibraryCard } from './LibraryCard';

/**
 * W05 — the student page's month: one square per day so far, filled when they
 * came. "16 of 18 days" is the figure; the squares are what a parent asking
 * "does he actually go?" is shown.
 */
export function MemberAttendanceStrip({
  membershipId,
  startsOn,
  today,
  t,
}: Readonly<{
  membershipId: string;
  startsOn: string;
  today: string;
  t: TranslateFn;
}>): React.JSX.Element | null {
  const dispatch = useAppDispatch();
  const { member } = useAppSelector(selectLibraryAttendance);
  const month = today.slice(0, 7);

  useEffect(() => {
    const promise = dispatch(fetchMemberAttendance({ membershipId, month }));
    return () => promise.abort();
  }, [dispatch, membershipId, month]);

  if (!member || member.membershipId !== membershipId || member.month !== month) return null;
  // Found by looking: a student who joined today read "1 of 5 days". The
  // month starts for them on the day they joined.
  const first = startsOn.slice(0, 7) === month ? Number(startsOn.slice(8, 10)) : 1;
  const daysSoFar = Math.max(Number(today.slice(8, 10)) - first + 1, 0);
  const came = new Set(member.days.map((day) => Number(day.slice(8, 10))));

  return (
    <LibraryCard padded={false}>
      <UbStack gap={3} className="p-3" data-testid="library-member-attendance">
        <UbStack direction="row" justify="between" gap={2}>
          <UbText as="h2" variant="body-medium">
            {t('library.attendance.thisMonth')}
          </UbText>
          <UbText variant="caption" tone="secondary">
            {t('library.attendance.daysOf', {
              came: [...came].filter((day) => day >= first).length,
              days: daysSoFar,
            })}
          </UbText>
        </UbStack>
        <UbStack direction="row" gap={1} wrap aria-hidden>
          {Array.from({ length: daysSoFar }, (_, i) => (
            <UbStack
              key={i}
              gap={0}
              className={cn(
                'h-4 w-4 rounded-xs border',
                came.has(first + i)
                  ? 'border-success bg-success-dim'
                  : 'border-border-default bg-surface-card'
              )}
            />
          ))}
        </UbStack>
      </UbStack>
    </LibraryCard>
  );
}
