'use client';

import { useMemo, useState } from 'react';

import dynamic from 'next/dynamic';

import { Settings2 } from 'lucide-react';

import {
  UbActionLink,
  UbButton,
  UbCard,
  UbChoiceChips,
  UbEmptyState,
  UbListItemText,
  UbPageHeader,
  UbPageShell,
  UbPageSkeleton,
  UbPressable,
  UbStack,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { cn } from 'src/utils/cn';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import { useSeats } from '../hooks/useSeats';
import { FEE_TONE, isNonZero, shiftHours } from '../view-model/memberDisplay';
import { SEAT_FILL, seatState, type SeatState } from '../view-model/seatDisplay';

import type { SeatMapRow } from '../types/seat.types';

/** The setup drawer loads with the tap that opens it (CLAUDE.md). */
const SeatSetupDrawerLazy = dynamic(
  () => import('./SeatSetupDrawer').then((m) => m.SeatSetupDrawer),
  { ssr: false }
);

const WHOLE_DAY = '';
const LEGEND: readonly SeatState[] = ['paid', 'due_soon', 'unpaid', 'overdue', 'free'];

/**
 * W03 (owner, 4 Oct 2026) — `/library/seats`: the room as the librarian sees
 * it. One tile per desk, coloured by the fee of whoever holds it in the chosen
 * shift, with the word on the tile as well — a colour alone says nothing to a
 * colour-blind owner or on a sun-washed phone. A tap shows who sits there.
 */
export function SeatsPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  const lists = useSeats();
  // Until the shifts arrive, ask for nothing; then default to the first shift.
  const current = shiftId ?? (lists.listsStatus === 'succeeded' ? (lists.activeShifts[0]?.id ?? WHOLE_DAY) : undefined);
  const seating = useSeats(current);
  const map = seating.map?.shiftId === current ? seating.map : null;

  const zones = useMemo(() => {
    const groups = new Map<string, SeatMapRow[]>();
    for (const seat of map?.seats ?? []) {
      groups.set(seat.zone, [...(groups.get(seat.zone) ?? []), seat]);
    }
    return [...groups.entries()];
  }, [map]);
  const chosen = map?.seats.find((seat) => seat.id === picked) ?? null;

  if (!seating.canRead) {
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

  const shiftOptions = [
    ...seating.activeShifts.map((shift) => ({
      value: shift.id,
      label: `${shift.name} ${shiftHours(shift)}`,
    })),
    { value: WHOLE_DAY, label: t('library.seats.wholeDay') },
  ];
  const counts = map?.counts ?? {};

  return (
    <UbPageShell>
      <UbPageHeader
        title={t('library.seats.title')}
        actions={
          seating.canManage ? (
            <UbButton
              variant="secondary"
              icon={<Settings2 className="h-4 w-4" aria-hidden />}
              onClick={() => setSetup(true)}
              data-testid="library-seats-setup"
            >
              {t('library.seats.setup')}
            </UbButton>
          ) : undefined
        }
      />
      {seating.seats.length === 0 && seating.listsStatus === 'succeeded' ? (
        <UbEmptyState
          variant="firstUse"
          title={t('library.seats.empty.title')}
          description={t('library.seats.empty.body')}
          action={
            seating.canManage ? (
              <UbButton variant="secondary" onClick={() => setSetup(true)}>
                {t('library.seats.setup')}
              </UbButton>
            ) : undefined
          }
        />
      ) : !map ? (
        <UbPageSkeleton variant="card" />
      ) : (
        <UbStack gap={4} data-testid="library-seats-screen">
          {shiftOptions.length > 1 && (
            <UbChoiceChips<string>
              id="library-seats-shift"
              ariaLabel={t('library.enrol.shift')}
              value={current ?? WHOLE_DAY}
              onChange={(next) => {
                setShiftId(next);
                setPicked(null);
              }}
              options={shiftOptions}
            />
          )}
          <UbText variant="body-sm" tone="secondary" data-testid="library-seats-counts">
            {[
              t('library.seats.count.occupied', { count: counts.occupied ?? 0 }),
              t('library.seats.count.free', { count: counts.free ?? 0 }),
              ...((counts.overdue ?? 0) > 0
                ? [t('library.seats.count.overdue', { count: counts.overdue ?? 0 })]
                : []),
            ].join(' · ')}
          </UbText>
          <UbStack direction="row" gap={2} wrap aria-hidden>
            {LEGEND.map((state) => (
              <UbStack key={state} direction="row" gap={1} align="center">
                <UbStack gap={0} className={cn('h-3 w-3 rounded-xs border', SEAT_FILL[state])} />
                <UbText variant="caption" tone="tertiary">
                  {t(`library.seats.state.${state}`)}
                </UbText>
              </UbStack>
            ))}
          </UbStack>

          {zones.map(([zone, seats]) => (
            <UbStack key={zone || '-'} gap={2}>
              {zone && <UbText variant="label">{zone}</UbText>}
              <UbStack
                as="ul"
                gap={0}
                className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10"
                aria-label={zone || t('library.seats.title')}
              >
                {seats.map((seat) => {
                  const state = seatState(seat);
                  return (
                    <UbStack as="li" key={seat.id} gap={0}>
                      <UbPressable
                        onClick={() => setPicked(seat.id === picked ? null : seat.id)}
                        aria-pressed={seat.id === picked}
                        aria-label={t('library.seats.tile', {
                          seat: seat.label,
                          state: t(`library.seats.state.${state}`),
                        })}
                        data-testid={`seat-${seat.label}`}
                        className={cn(
                          'flex h-14 w-full flex-col items-center justify-center rounded-control border',
                          SEAT_FILL[state],
                          seat.id === picked && 'ring-2 ring-primary-500'
                        )}
                      >
                        <UbText as="span" variant="body-sm-medium">
                          {seat.label}
                        </UbText>
                        <UbText as="span" variant="caption" className="max-w-full truncate px-1">
                          {t(`library.seats.state.${state}`)}
                        </UbText>
                      </UbPressable>
                    </UbStack>
                  );
                })}
              </UbStack>
            </UbStack>
          ))}

          {chosen && (
            <UbCard padded>
              <UbStack gap={3} data-testid="library-seat-detail">
                <UbText variant="label">
                  {t('library.seats.detailTitle', { seat: chosen.label })}
                </UbText>
                {chosen.occupants.length === 0 ? (
                  <UbText variant="body-sm" tone="tertiary">
                    {t('library.seats.freeIn')}
                  </UbText>
                ) : (
                  chosen.occupants.map((o) => (
                    <UbStack key={o.membershipId} gap={2}>
                      <UbStack direction="row" justify="between" align="start" gap={2}>
                        <UbListItemText
                          primary={o.name}
                          secondary={[
                            o.memberNumber,
                            o.shift?.name ?? t('library.seats.wholeDay'),
                            o.validUntil
                              ? t('library.member.validUntilOn', {
                                  date: formatBusinessDate(o.validUntil),
                                })
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        />
                        <UbStatusBadge
                          tone={FEE_TONE[o.feeState]}
                          label={t(`library.fee.${o.feeState}`)}
                        />
                      </UbStack>
                      <UbStack direction="row" gap={2} wrap>
                        <UbActionLink
                          href={`${ROUTES.LIBRARY_MEMBERS}/${o.membershipId}`}
                          variant="secondary"
                          size="sm"
                        >
                          {isNonZero(o.duesAmount)
                            ? t('library.seats.collect', { amount: formatInr(o.duesAmount) })
                            : t('library.seats.open')}
                        </UbActionLink>
                      </UbStack>
                    </UbStack>
                  ))
                )}
              </UbStack>
            </UbCard>
          )}
        </UbStack>
      )}
      {setup && <SeatSetupDrawerLazy onClose={() => setSetup(false)} />}
    </UbPageShell>
  );
}
