'use client';

import { useMemo, useState } from 'react';

import dynamic from 'next/dynamic';

import { Settings2 } from 'lucide-react';

import {
  UbButton,
  UbEmptyState,
  UbFilterChip,
  UbFilterSelect,
  UbPageHeader,
  UbPageShell,
  UbPageSkeleton,
  UbPressable,
  UbStack,
  UbText,
} from 'src/design-system';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { cn } from 'src/utils/cn';

import { useSeats } from '../hooks/useSeats';
import { shiftHours } from '../view-model/memberDisplay';
import {
  DAY_FILL,
  FEE_DOT,
  OTHER_SHIFT_FILL,
  SEAT_FILL,
  dayTileLabel,
  seatMatches,
  viewTileState,
  worstFee,
  type SeatFilters,
  type SeatState,
  type ViewTileState,
} from '../view-model/seatDisplay';

import type { LibraryShift, SeatMapRow } from '../types/seat.types';

/** The setup drawer loads with the tap that opens it (CLAUDE.md). */
const SeatSetupDrawerLazy = dynamic(
  () => import('./SeatSetupDrawer').then((m) => m.SeatSetupDrawer),
  { ssr: false }
);

/** The seat panel loads with the first tap on a seat: it carries the free-seat
 *  confirmation, the message dialog's loader and the member thunks, none of which
 *  the map itself needs to draw (the CLAUDE.md rule for dialogs and drawers). */
const SeatPanelLazy = dynamic(() => import('./SeatPanel').then((m) => m.SeatPanel), {
  ssr: false,
});

const WHOLE_DAY = '';
const ALL_ZONES = '';
const VIEW_LEGEND: readonly ViewTileState[] = [
  'paid',
  'due_soon',
  'unpaid',
  'overdue',
  'other_shift',
  'free',
];
const FEE_LEGEND: readonly Exclude<SeatState, 'free'>[] = ['paid', 'due_soon', 'unpaid', 'overdue'];
const NO_FILTERS: SeatFilters = { zone: ALL_ZONES, freeOnly: false, unpaidOnly: false };

/**
 * W03 (owner, 4 Oct 2026) — `/library/seats`: the room as the librarian sees it.
 *
 * QA F6 (owner, 12 Oct 2026) made the WHOLE DAY the default. A desk is shared by
 * shift — Asha in the morning, Imran in the evening — so the first question is how
 * taken each desk is across the day: each tile has one bar per shift, filled when
 * that shift is taken, and a word (Free, Evening, Full, All day). The fee is a dot
 * in the corner, not the tile's colour, so a part-taken desk never reads "Unpaid".
 * In one shift's view the tiles keep the fee colours, and a desk held by ANOTHER
 * overlapping shift says so instead of borrowing that student's fee. Every colour
 * has its word on the tile and in the legend. A tap lists everybody on the desk.
 */
export function SeatsPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const [shiftId, setShiftId] = useState<string>(WHOLE_DAY);
  const [picked, setPicked] = useState<string | null>(null);
  const [filters, setFilters] = useState<SeatFilters>(NO_FILTERS);
  const [setup, setSetup] = useState(false);
  const seating = useSeats(shiftId);
  const { can } = usePermissions();
  const canWrite = can('library.member.write');
  const map = seating.map?.shiftId === shiftId ? seating.map : null;
  const wholeDay = shiftId === WHOLE_DAY;

  const allZones = useMemo(
    () => [...new Set((map?.seats ?? []).map((seat) => seat.zone).filter(Boolean))],
    [map]
  );
  const zones = useMemo(() => {
    const groups = new Map<string, SeatMapRow[]>();
    for (const seat of map?.seats ?? []) {
      if (!seatMatches(seat, filters, wholeDay)) continue;
      groups.set(seat.zone, [...(groups.get(seat.zone) ?? []), seat]);
    }
    return [...groups.entries()];
  }, [map, filters, wholeDay]);
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
    { value: WHOLE_DAY, label: t('library.seats.wholeDay') },
    ...seating.activeShifts.map((shift) => ({
      value: shift.id,
      label: `${shift.name} ${shiftHours(shift)}`,
    })),
  ];
  const overdue = map?.counts.overdue ?? 0;

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
          <UbStack direction="row" gap={2} wrap align="center">
            {shiftOptions.length > 1 && (
              <UbFilterSelect
                spec={{
                  kind: 'single',
                  key: 'shift',
                  label: t('library.enrol.shift'),
                  options: shiftOptions,
                }}
                value={shiftId}
                onChange={(next) => {
                  setShiftId(next);
                  setPicked(null);
                }}
                closeLabel={t('common.action.close')}
              />
            )}
            {allZones.length > 1 && (
              <UbFilterSelect
                spec={{
                  kind: 'single',
                  key: 'zone',
                  label: t('library.seats.filter.zone'),
                  options: [
                    { value: ALL_ZONES, label: t('library.seats.filter.allZones') },
                    ...allZones.map((zone) => ({ value: zone, label: zone })),
                  ],
                }}
                value={filters.zone}
                onChange={(zone) => setFilters((f) => ({ ...f, zone }))}
                closeLabel={t('common.action.close')}
              />
            )}
            <UbFilterChip
              label={t('library.seats.filter.free')}
              pressed={filters.freeOnly}
              onToggle={(freeOnly) => setFilters((f) => ({ ...f, freeOnly }))}
            />
            <UbFilterChip
              label={t('library.seats.filter.unpaid')}
              pressed={filters.unpaidOnly}
              onToggle={(unpaidOnly) => setFilters((f) => ({ ...f, unpaidOnly }))}
            />
          </UbStack>

          <UbText variant="body-sm" tone="secondary" data-testid="library-seats-counts">
            {[
              ...map.shiftCounts.map((c) =>
                t('library.seats.count.shift', { name: c.name, taken: c.taken, total: c.total })
              ),
              ...(overdue > 0 ? [t('library.seats.count.overdue', { count: overdue })] : []),
            ].join(' · ')}
          </UbText>

          <SeatLegend wholeDay={wholeDay} t={t} />

          {zones.length === 0 && (
            <UbText variant="body-sm" tone="tertiary">
              {t('library.seats.filter.none')}
            </UbText>
          )}
          {zones.map(([zone, seats]) => (
            <UbStack key={zone || '-'} gap={2}>
              {zone && <UbText variant="label">{zone}</UbText>}
              <UbStack
                as="ul"
                gap={0}
                className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10"
                aria-label={zone || t('library.seats.title')}
              >
                {seats.map((seat) => (
                  <UbStack as="li" key={seat.id} gap={0}>
                    <SeatTile
                      seat={seat}
                      wholeDay={wholeDay}
                      shifts={seating.activeShifts}
                      picked={seat.id === picked}
                      onPick={() => setPicked(seat.id === picked ? null : seat.id)}
                      t={t}
                    />
                  </UbStack>
                ))}
              </UbStack>
            </UbStack>
          ))}

          {chosen && <SeatPanelLazy seat={chosen} canWrite={canWrite} />}
        </UbStack>
      )}
      {setup && <SeatSetupDrawerLazy onClose={() => setSetup(false)} />}
    </UbPageShell>
  );
}

type T = TranslateFn;

/** One desk. The word is always on the tile: colour is never the only signal. */
function SeatTile({
  seat,
  wholeDay,
  shifts,
  picked,
  onPick,
  t,
}: Readonly<{
  seat: SeatMapRow;
  wholeDay: boolean;
  shifts: readonly LibraryShift[];
  picked: boolean;
  onPick: () => void;
  t: T;
}>): React.JSX.Element {
  const viewState = viewTileState(seat);
  const word = wholeDay ? dayTileLabel(seat, t) : t(`library.seats.view.${viewState}`);
  const fill = wholeDay
    ? DAY_FILL[seat.dayState]
    : viewState === 'other_shift'
      ? OTHER_SHIFT_FILL
      : SEAT_FILL[viewState];
  // The fee dot: across the day, everybody on the desk; in a shift, this shift's.
  const fee = wholeDay ? worstFee(seat.holders) : null;
  const taken = new Set(seat.takenShiftIds);
  return (
    <UbPressable
      onClick={onPick}
      aria-pressed={picked}
      aria-label={t('library.seats.tile', {
        seat: seat.label,
        state: fee ? `${word}, ${t(`library.seats.state.${fee}`)}` : word,
      })}
      data-testid={`seat-${seat.label}`}
      className={cn(
        'relative flex h-16 w-full flex-col items-center justify-center gap-0.5 rounded-control border px-1',
        fill,
        picked && 'ring-2 ring-primary-500'
      )}
    >
      {fee && (
        <UbStack
          gap={0}
          aria-hidden
          className={cn('absolute right-1.5 top-1.5 h-2 w-2 rounded-full', FEE_DOT[fee])}
        />
      )}
      <UbText as="span" variant="body-sm-medium">
        {seat.label}
      </UbText>
      <UbText as="span" variant="caption" className="line-clamp-2 text-center leading-tight">
        {word}
      </UbText>
      {wholeDay && shifts.length > 1 && (
        <UbStack direction="row" gap={0} aria-hidden className="w-full gap-0.5 px-1">
          {shifts.map((shift) => (
            <UbStack
              key={shift.id}
              gap={0}
              className={cn(
                'h-1 flex-1 rounded-full',
                taken.has(shift.id) ? 'bg-text-primary' : 'bg-border-default'
              )}
            />
          ))}
        </UbStack>
      )}
    </UbPressable>
  );
}

/** Every colour, with its word — the AC: "Legend explains every colour". */
function SeatLegend({ wholeDay, t }: Readonly<{ wholeDay: boolean; t: T }>): React.JSX.Element {
  const swatch = (className: string, label: string) => (
    <UbStack key={label} direction="row" gap={1} align="center">
      <UbStack gap={0} className={cn('h-3 w-3 rounded-xs border', className)} />
      <UbText variant="caption" tone="tertiary">
        {label}
      </UbText>
    </UbStack>
  );
  if (!wholeDay) {
    return (
      <UbStack direction="row" gap={2} wrap data-testid="library-seats-legend">
        {VIEW_LEGEND.map((state) =>
          swatch(
            state === 'other_shift' ? OTHER_SHIFT_FILL : SEAT_FILL[state],
            t(`library.seats.view.${state}`)
          )
        )}
      </UbStack>
    );
  }
  return (
    <UbStack gap={1} data-testid="library-seats-legend">
      <UbStack direction="row" gap={2} wrap>
        {swatch(DAY_FILL.free, t('library.seats.state.free'))}
        {swatch(DAY_FILL.partial, t('library.seats.day.partial'))}
        {swatch(DAY_FILL.full, t('library.seats.day.full'))}
        {FEE_LEGEND.map((state) => (
          <UbStack key={state} direction="row" gap={1} align="center">
            <UbStack gap={0} className={cn('h-2 w-2 rounded-full', FEE_DOT[state])} />
            <UbText variant="caption" tone="tertiary">
              {t(`library.seats.state.${state}`)}
            </UbText>
          </UbStack>
        ))}
      </UbStack>
      <UbText variant="caption" tone="tertiary">
        {t('library.seats.day.bars')}
      </UbText>
    </UbStack>
  );
}
