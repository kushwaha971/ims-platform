'use client';

import { useMemo, useState } from 'react';

import dynamic from 'next/dynamic';

import { ChevronRight, Plus, Settings2 } from 'lucide-react';

import {
  UbActionLink,
  UbLink,
  UbAvatar,
  UbButton,
  UbDisclosure,
  UbSearchInput,
  UbStatCard,
  UbStatusBadge,
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
import { ROUTES } from 'src/routes';
import { cn } from 'src/utils/cn';
import { formatInr } from 'src/utils/money';

import { useSeats } from '../hooks/useSeats';
import { FEE_TONE, isNonZero, shiftHours } from '../view-model/memberDisplay';
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

import { LibraryCard } from './LibraryCard';
import { LibraryDrawer } from './LibraryOverlays';

import type { SeatMapRow } from '../types/seat.types';

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
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
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
  const occupancyCounts = useMemo(() => {
    const counts = { free: 0, partial: 0, full: 0 };
    for (const seat of map?.seats ?? []) counts[seat.dayState] += 1;
    return counts;
  }, [map]);
  const chosen = map?.seats.find((seat) => seat.id === picked) ?? null;
  const admissionShift = chosen
    ? !wholeDay
      ? chosen.viewState === 'free'
        ? shiftId
        : undefined
      : chosen.dayState === 'free'
        ? ''
        : seating.activeShifts.find((shift) => !chosen.takenShiftIds.includes(shift.id))?.id
    : undefined;
  const admissionHref =
    chosen && admissionShift !== undefined
      ? `${ROUTES.LIBRARY_MEMBERS}?add=1&seat=${encodeURIComponent(chosen.id)}&admitShift=${encodeURIComponent(admissionShift)}`
      : undefined;

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
          <UbStack direction="row" gap={2} wrap>
            {canWrite && (
              <UbActionLink
                href={`${ROUTES.LIBRARY_MEMBERS}?add=1`}
                variant="primary"
                icon={<Plus className="h-4 w-4" aria-hidden />}
              >
                {t('library.members.add')}
              </UbActionLink>
            )}
            {seating.canManage && (
              <UbButton
                variant="secondary"
                icon={<Settings2 className="h-4 w-4" aria-hidden />}
                onClick={() => setSetup(true)}
                data-testid="library-seats-setup"
              >
                {t('library.seats.setup')}
              </UbButton>
            )}
          </UbStack>
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
        <UbStack gap={3} data-testid="library-seats-screen">
          {wholeDay && (
            <UbStack
              className="grid grid-cols-3 gap-2"
              gap={0}
              data-testid="library-seat-occupancy"
            >
              <UbPressable
                aria-label={t('library.seats.filter.free')}
                aria-pressed={filters.freeOnly}
                className={cn('rounded-control', filters.freeOnly && 'ring-2 ring-action')}
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    freeOnly: !current.freeOnly,
                    occupancy: 'all',
                  }))
                }
              >
                <UbStatCard
                  value={String(occupancyCounts.free)}
                  label={t('library.seats.state.free')}
                  tone={occupancyCounts.free > 0 ? 'success' : undefined}
                  className="bg-surface-card [&_*]:text-success"
                />
              </UbPressable>
              {(['partial', 'full'] as const).map((occupancy) => (
                <UbPressable
                  key={occupancy}
                  aria-label={t(`library.seats.day.${occupancy}`)}
                  aria-pressed={filters.occupancy === occupancy}
                  className={cn(
                    'rounded-control',
                    filters.occupancy === occupancy && 'ring-2 ring-action'
                  )}
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      occupancy: current.occupancy === occupancy ? 'all' : occupancy,
                      freeOnly: false,
                    }))
                  }
                >
                  <UbStatCard
                    value={String(occupancyCounts[occupancy])}
                    label={t(`library.seats.day.${occupancy}`)}
                    className={
                      occupancy === 'partial'
                        ? 'bg-surface-card [&_*]:text-warning'
                        : 'bg-surface-card'
                    }
                  />
                </UbPressable>
              ))}
            </UbStack>
          )}
          <UbSearchInput
            value={filters.query ?? ''}
            onChange={(query) => setFilters((current) => ({ ...current, query }))}
            aria-label={t('library.seats.search')}
            placeholder={t('library.seats.search')}
          />
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
            {!wholeDay && (
              <UbFilterChip
                label={t('library.seats.filter.free')}
                pressed={filters.freeOnly}
                onToggle={(freeOnly) => setFilters((f) => ({ ...f, freeOnly, occupancy: 'all' }))}
              />
            )}
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

          <UbDisclosure label={t('library.seats.guide')} keepMounted>
            <SeatLegend wholeDay={wholeDay} t={t} />
          </UbDisclosure>

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
                className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3"
                aria-label={zone || t('library.seats.title')}
              >
                {seats.map((seat) => (
                  <UbStack as="li" key={seat.id} gap={0}>
                    <LibraryCard
                      padded={false}
                      elevated
                      className={cn('[&>div]:p-0', 'bg-surface-card')}
                    >
                      <SeatTile
                        seat={seat}
                        wholeDay={wholeDay}
                        activeShiftCount={seating.activeShifts.length}
                        picked={seat.id === picked}
                        onPick={() => setPicked(seat.id === picked ? null : seat.id)}
                        t={t}
                      />
                      <UbStack gap={3} className="p-3" data-testid={`library-seat-card-${seat.id}`}>
                        {wholeDay && seating.activeShifts.length > 0 && (
                          <UbStack
                            className="grid grid-cols-[repeat(auto-fit,minmax(4rem,1fr))] gap-1"
                            gap={0}
                          >
                            {seating.activeShifts.map((shift) => (
                              <UbStack
                                key={shift.id}
                                gap={1}
                                className={cn(
                                  'rounded-control px-2 py-2 text-center',
                                  seat.takenShiftIds.includes(shift.id)
                                    ? 'bg-surface-sunken'
                                    : 'bg-success-dim'
                                )}
                              >
                                <UbText variant="body-sm-medium">{shift.name}</UbText>
                                <UbText
                                  variant="caption"
                                  tone={
                                    seat.takenShiftIds.includes(shift.id) ? 'secondary' : 'success'
                                  }
                                >
                                  {t(
                                    seat.takenShiftIds.includes(shift.id)
                                      ? 'library.seats.shift.taken'
                                      : 'library.seats.shift.available'
                                  )}
                                </UbText>
                              </UbStack>
                            ))}
                          </UbStack>
                        )}
                        {canWrite &&
                          (wholeDay ? seat.dayState === 'free' : seat.viewState === 'free') && (
                            <UbLink
                              href={`${ROUTES.LIBRARY_MEMBERS}?add=1&seat=${encodeURIComponent(seat.id)}&admitShift=${encodeURIComponent(wholeDay ? '' : shiftId)}`}
                              tone="success"
                              underline={false}
                              className="flex min-h-11 items-center justify-between gap-2 rounded-control bg-success-dim px-3 py-2"
                            >
                              {t('library.seats.allAvailable')}
                              <UbText as="span" variant="body-sm-medium" tone="success">
                                {t('library.seats.assign')}
                              </UbText>
                            </UbLink>
                          )}
                        {(wholeDay ? seat.holders : seat.occupants).map((person) => (
                          <UbStack
                            key={person.membershipId}
                            direction="row"
                            align="center"
                            gap={2}
                            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-t border-border-hairline pt-3"
                          >
                            <UbAvatar
                              name={person.name}
                              size="sm"
                              className="bg-primary-50 text-text-accent"
                            />
                            <UbStack gap={0} className="min-w-0 flex-1">
                              <UbLink
                                tone="primary"
                                underline={false}
                                href={`${ROUTES.LIBRARY_MEMBERS}/${person.membershipId}`}
                                onClick={(event) => {
                                  if (
                                    !event.metaKey &&
                                    !event.ctrlKey &&
                                    !event.shiftKey &&
                                    !event.altKey
                                  ) {
                                    event.preventDefault();
                                    setSelectedMember(person.membershipId);
                                  }
                                }}
                                className="block min-w-0 max-w-full whitespace-normal break-words text-left font-medium"
                              >
                                {person.name}
                              </UbLink>
                              <UbText variant="caption" tone="tertiary">
                                {person.shift
                                  ? `${person.shift.name} · ${shiftHours(person.shift)}`
                                  : t('library.seats.day.allDay')}
                              </UbText>
                            </UbStack>
                            <UbStack direction="row" gap={1} align="center" className="max-w-28">
                              <UbStatusBadge
                                tone={FEE_TONE[person.feeState]}
                                label={
                                  isNonZero(person.duesAmount)
                                    ? t('library.fee.amountDue', {
                                        amount: formatInr(person.duesAmount),
                                      })
                                    : t(`library.fee.${person.feeState}`)
                                }
                              />
                              <ChevronRight
                                className="h-4 w-4 shrink-0 text-text-tertiary"
                                aria-hidden
                              />
                            </UbStack>
                          </UbStack>
                        ))}
                      </UbStack>
                    </LibraryCard>
                  </UbStack>
                ))}
              </UbStack>
            </UbStack>
          ))}

          {chosen && (
            <LibraryDrawer
              open
              title={t('library.seats.detailTitle', { seat: chosen.label })}
              closeLabel={t('common.action.close')}
              onOpenChange={(open) => !open && setPicked(null)}
            >
              <SeatPanelLazy
                seat={chosen}
                canWrite={canWrite}
                admissionHref={admissionHref}
                onOpenMember={setSelectedMember}
              />
            </LibraryDrawer>
          )}
        </UbStack>
      )}
      {selectedMember && (
        <MemberDetailDrawerLazy
          key={selectedMember}
          id={selectedMember}
          onClose={() => setSelectedMember(null)}
        />
      )}
      {setup && <SeatSetupDrawerLazy onClose={() => setSetup(false)} />}
    </UbPageShell>
  );
}

const MemberDetailDrawerLazy = dynamic(
  () => import('./MemberDetailDrawer').then((m) => m.MemberDetailDrawer),
  { ssr: false }
);

type T = TranslateFn;

/** One desk. The word is always on the tile: colour is never the only signal. */
function SeatTile({
  seat,
  wholeDay,
  activeShiftCount,
  picked,
  onPick,
  t,
}: Readonly<{
  seat: SeatMapRow;
  wholeDay: boolean;
  activeShiftCount: number;
  picked: boolean;
  onPick: () => void;
  t: T;
}>): React.JSX.Element {
  const viewState = viewTileState(seat);
  const word = wholeDay ? dayTileLabel(seat, t) : t(`library.seats.view.${viewState}`);
  const fill = wholeDay
    ? seat.dayState === 'free'
      ? 'bg-success text-text-inverse border-success'
      : 'bg-text-primary text-text-inverse border-text-primary'
    : viewState === 'other_shift'
      ? OTHER_SHIFT_FILL
      : SEAT_FILL[viewState];
  // Keep the worst fee in the whole-day tile's accessible name; rows show each fee.
  const fee = wholeDay ? worstFee(seat.holders) : null;
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
        'relative flex min-h-16 w-full items-center justify-between gap-3 rounded-control px-3 py-2 text-text-primary',
        picked && 'ring-2 ring-primary-500'
      )}
    >
      <UbStack direction="row" align="center" gap={3}>
        <UbStack
          className={cn(
            'h-10 w-10 shrink-0 items-center justify-center rounded-control border',
            fill
          )}
        >
          <UbText as="span" variant="body-sm-medium" tone={wholeDay ? 'inverse' : undefined}>
            {seat.label}
          </UbText>
        </UbStack>
        <UbStack gap={0} className="min-w-0">
          <UbText variant="body-sm-medium">
            {t('library.seats.detailTitle', { seat: seat.label })}
          </UbText>
          {seat.zone && (
            <UbText variant="caption" tone="tertiary">
              {seat.zone}
            </UbText>
          )}
        </UbStack>
      </UbStack>
      <UbText
        as="span"
        variant="caption"
        className={cn(
          'rounded-pill px-2 py-1 leading-tight',
          seat.dayState === 'free'
            ? 'bg-success-dim text-success'
            : seat.dayState === 'partial'
              ? 'bg-warning-dim text-warning'
              : 'bg-surface-sunken'
        )}
      >
        {wholeDay && seat.dayState === 'partial'
          ? t('library.seats.occupiedShifts', {
              count: seat.takenShiftIds.length,
              total: activeShiftCount,
            })
          : word}
      </UbText>
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
