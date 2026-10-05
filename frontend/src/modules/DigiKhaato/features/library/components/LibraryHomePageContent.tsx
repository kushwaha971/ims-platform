'use client';

import { useEffect } from 'react';

import { useRouter } from 'next/navigation';

import { Armchair, CalendarClock, CircleAlert, IndianRupee, UserPlus } from 'lucide-react';

import {
  UbActionLink,
  UbAmount,
  UbButton,
  UbCard,
  UbEmptyState,
  UbListItemText,
  UbPageHeader,
  UbPageShell,
  UbPageSkeleton,
  UbPressable,
  UbProgress,
  UbStack,
  UbStatCard,
  UbStatGrid,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import { AppSetupCard } from 'modules/DigiKhaato/features/appSetup/components/AppSetupCard';

import { selectLibraryHome } from '../redux/libraryHomeSlice';
import { fetchLibraryHome } from '../redux/libraryHomeThunk';
import { FEE_TONE, isNonZero, shiftHours } from '../view-model/memberDisplay';

/**
 * W04 (owner, 4 Oct 2026) — `/library`: a reading room's day. How full each
 * shift is, whose fee is due this week, overdue or unpaid, and what came in
 * this month; then the students who have to pay, each one tap from their page.
 * Each tile opens the list it counts — a figure the owner cannot act on is
 * decoration.
 */
export function LibraryHomePageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectLibraryHome);
  const { can, hasModule } = usePermissions();
  const canRead = hasModule('library') && can('library.loan.read');
  const canAdmit = hasModule('library') && can('library.member.write');

  // Fresh on every visit. Found by looking: keying this effect on the status
  // aborted its own request the moment the status became 'loading', and an
  // aborted fetch leaves the status there — the home sat on a skeleton for ever.
  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchLibraryHome());
    return () => promise.abort();
  }, [canRead, dispatch]);
  const staleNow = state.stale && state.staleUrgency === 'now';
  useEffect(() => {
    if (canRead && staleNow) void dispatch(fetchLibraryHome());
  }, [canRead, staleNow, dispatch]);

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
  if (state.status === 'failed' && !state.home) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="error"
          title={t('library.home.error.title')}
          description={state.error?.message}
          requestId={state.error?.requestId ?? null}
          requestIdLabel={t('common.error.reference')}
          action={
            <UbButton variant="secondary" onClick={() => void dispatch(fetchLibraryHome())}>
              {t('common.action.retry')}
            </UbButton>
          }
        />
      </UbPageShell>
    );
  }
  if (!state.home) return <UbPageSkeleton variant="card" />;

  const study = state.home.study;
  const students = `${ROUTES.LIBRARY_MEMBERS}`;

  return (
    <UbPageShell>
      <UbPageHeader
        title={t('library.home.title')}
        actions={
          canAdmit ? (
            <UbActionLink
              href={`${students}?add=1`}
              icon={<UserPlus className="h-4 w-4" aria-hidden />}
            >
              {t('library.members.add')}
            </UbActionLink>
          ) : undefined
        }
      />
      {/* docs/platform/14 step 5 — never blocking; gone once done or hidden. */}
      <AppSetupCard app="library" appName={t('nav.workspace.library')} />
      {!study ? (
        <UbText variant="body-sm" tone="tertiary">
          {t('library.home.noFigures')}
        </UbText>
      ) : (
        <UbStack gap={5} data-testid="library-home">
          <UbStatGrid>
            <UbStatCard
              icon={<CalendarClock className="h-4 w-4" aria-hidden />}
              label={t('library.home.dueThisWeek')}
              value={String(study.fees.dueThisWeek)}
              onClick={() => router.push(`${students}?status=expiring`)}
            />
            <UbStatCard
              icon={<CircleAlert className="h-4 w-4" aria-hidden />}
              label={t('library.home.overdue')}
              value={String(study.fees.overdue)}
              tone={study.fees.overdue > 0 ? 'danger' : undefined}
              onClick={() => router.push(`${students}?status=expired`)}
            />
            <UbStatCard
              icon={<IndianRupee className="h-4 w-4" aria-hidden />}
              label={t('library.home.unpaid')}
              value={String(study.fees.unpaid)}
              onClick={() => router.push(`${students}?hasDues=true`)}
            />
            <UbStatCard
              icon={<IndianRupee className="h-4 w-4" aria-hidden />}
              label={t('library.home.collected')}
              value={formatInr(study.fees.collectedThisMonth)}
            />
          </UbStatGrid>

          <UbCard padded>
            <UbStack gap={3} data-testid="library-home-shifts">
              <UbStack direction="row" justify="between" align="center" gap={2}>
                <UbText variant="label">{t('library.home.seatsTitle')}</UbText>
                <UbActionLink
                  href={ROUTES.LIBRARY_SEATS}
                  variant="ghost"
                  size="sm"
                  icon={<Armchair className="h-4 w-4" aria-hidden />}
                >
                  {t('library.home.openSeats')}
                </UbActionLink>
              </UbStack>
              {study.shifts.length === 0 ? (
                <UbText variant="body-sm" tone="tertiary">
                  {study.seats === 0
                    ? t('library.seats.empty.body')
                    : t('library.seats.shifts.none')}
                </UbText>
              ) : (
                study.shifts.map((shift) => (
                  <UbStack key={shift.id} gap={1}>
                    <UbStack direction="row" justify="between" gap={2}>
                      <UbText variant="body-sm-medium">
                        {`${shift.name} · ${shiftHours(shift)}`}
                      </UbText>
                      <UbText variant="body-sm" tone="secondary">
                        {t('library.home.filledOf', { filled: shift.filled, seats: study.seats })}
                      </UbText>
                    </UbStack>
                    <UbProgress
                      used={shift.filled}
                      limit={study.seats || null}
                      tone="accent"
                      ariaLabel={t('library.home.filledAria', { shift: shift.name })}
                    />
                  </UbStack>
                ))
              )}
            </UbStack>
          </UbCard>

          <UbCard padded>
            <UbStack gap={1} data-testid="library-home-to-pay">
              <UbText variant="label">{t('library.home.toPay')}</UbText>
              {study.toPay.length === 0 ? (
                <UbText variant="body-sm" tone="tertiary">
                  {t('library.home.allPaid')}
                </UbText>
              ) : (
                <UbStack as="ul" gap={0} aria-label={t('library.home.toPay')}>
                  {study.toPay.map((row) => (
                    <UbStack as="li" key={row.membershipId} gap={0}>
                      <UbPressable
                        className="w-full rounded-control px-1 py-2 text-left"
                        onClick={() => router.push(`${students}/${row.membershipId}`)}
                      >
                        <UbStack direction="row" justify="between" align="center" gap={3}>
                          <UbListItemText
                            primary={row.name}
                            secondary={[
                              [row.seat, row.shift].filter(Boolean).join(' · '),
                              row.validUntil
                                ? t('library.member.validUntilOn', {
                                    date: formatBusinessDate(row.validUntil),
                                  })
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          />
                          <UbStack gap={1} align="end" className="shrink-0">
                            {isNonZero(row.duesAmount) ? (
                              <UbAmount
                                value={row.duesAmount}
                                tone="receivable"
                                label={t('library.member.owes')}
                              />
                            ) : (
                              <UbText variant="body-sm">{formatInr(row.planFee)}</UbText>
                            )}
                            <UbStatusBadge
                              tone={FEE_TONE[row.feeState]}
                              label={t(`library.fee.${row.feeState}`)}
                            />
                          </UbStack>
                        </UbStack>
                      </UbPressable>
                    </UbStack>
                  ))}
                </UbStack>
              )}
            </UbStack>
          </UbCard>
        </UbStack>
      )}
    </UbPageShell>
  );
}
