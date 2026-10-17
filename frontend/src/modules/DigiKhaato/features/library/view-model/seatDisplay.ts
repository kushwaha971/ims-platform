import type { TranslateFn } from 'src/hooks/useTranslation';

import type { FeeState } from '../types/member.types';
import type { SeatDayState, SeatMapRow, SeatOccupant } from '../types/seat.types';

/** W03 — a tile's state: free, or the WORST fee of whoever holds it in the shift. The
 *  map keeps four colours: part paid reads as unpaid, a free plan or a student on
 *  hold as nothing owed (QA B26 added the words, not new colours). */
export type SeatState = 'overdue' | 'unpaid' | 'due_soon' | 'paid' | 'free';

const ON_THE_MAP: Readonly<Record<FeeState, Exclude<SeatState, 'free'>>> = {
  overdue: 'overdue',
  unpaid: 'unpaid',
  part_paid: 'unpaid',
  due_soon: 'due_soon',
  paid: 'paid',
  no_fee: 'paid',
  on_hold: 'paid',
  left: 'paid',
};

const WORST_FIRST: readonly Exclude<SeatState, 'free'>[] = [
  'overdue',
  'unpaid',
  'due_soon',
  'paid',
];

export const seatState = (seat: Pick<SeatMapRow, 'occupants'>): SeatState => {
  if (seat.occupants.length === 0) return 'free';
  const states = new Set(seat.occupants.map((o) => ON_THE_MAP[o.feeState]));
  return WORST_FIRST.find((state) => states.has(state)) ?? 'paid';
};

/** Fill and edge per state, from the status tokens (light and dark alike). */
export const SEAT_FILL: Readonly<Record<SeatState, string>> = {
  paid: 'bg-success-dim border-success text-text-primary',
  due_soon: 'bg-warning-dim border-warning text-text-primary',
  unpaid: 'bg-warning-dim border-warning text-text-primary',
  overdue: 'bg-error-dim border-error text-text-primary',
  free: 'bg-surface-card border-border-default text-text-secondary',
};

// ── QA F6: the whole day, the other shift, and the filters ──────────────────

/** Tile fill across the whole day: free, part taken, every shift taken. */
export const DAY_FILL: Readonly<Record<SeatDayState, string>> = {
  free: 'bg-surface-card border-border-default text-text-secondary',
  partial: 'bg-info-dim border-info text-text-primary',
  full: 'bg-accent-quiet border-action text-text-primary',
};

/** In one shift, a seat held only by an overlapping OTHER shift: neither free nor
 *  this shift's student, so it is never painted with somebody's fee colour. */
export const OTHER_SHIFT_FILL =
  'border-dashed bg-surface-sunken border-border-default text-text-secondary';

/** The small fee dot on a taken tile — the fee is a dot now, not the tile colour. */
export const FEE_DOT: Readonly<Record<Exclude<SeatState, 'free'>, string>> = {
  paid: 'bg-success',
  due_soon: 'bg-warning',
  unpaid: 'bg-warning',
  overdue: 'bg-error',
};

/** The worst fee among `people`, or null when nobody is there. */
export const worstFee = (
  people: readonly Pick<SeatOccupant, 'feeState'>[]
): Exclude<SeatState, 'free'> | null => {
  if (people.length === 0) return null;
  const state = seatState({ occupants: people as SeatOccupant[] });
  return state === 'free' ? null : state;
};

/**
 * The word on a whole-day tile. Free; "All day" for a student with no shift;
 * "Full" when every shift is taken; the one holder's shift name ("Evening");
 * otherwise how many shifts are taken. Short on purpose: a tile at 360 px is
 * about 78 px wide, and a word cut by an ellipsis is the thing the owner banned.
 */
export const dayTileLabel = (
  seat: Pick<SeatMapRow, 'dayState' | 'holders' | 'takenShiftIds'>,
  t: TranslateFn
): string => {
  if (seat.dayState === 'free') return t('library.seats.state.free');
  if (seat.holders.some((h) => h.shift === null)) return t('library.seats.day.allDay');
  if (seat.dayState === 'full') return t('library.seats.day.full');
  const [only] = seat.holders;
  if (seat.holders.length === 1 && only?.shift) return only.shift.name;
  return t('library.seats.day.shifts', { count: seat.holders.length });
};

/** What a tile's screen-reader name and caption say in one shift's view. */
export type ViewTileState = SeatState | 'other_shift';

export const viewTileState = (seat: Pick<SeatMapRow, 'viewState' | 'occupants'>): ViewTileState =>
  seat.viewState === 'other_shift' ? 'other_shift' : seatState(seat);

export interface SeatFilters {
  readonly zone: string;
  readonly freeOnly: boolean;
  readonly unpaidOnly: boolean;
  readonly query?: string;
  readonly occupancy?: 'all' | SeatDayState;
}

/**
 * "Free only" means free in what is on screen — no student at all across the day,
 * or none in the chosen shift. "Unpaid only" means somebody on screen owes: an
 * unpaid or overdue fee among the holders in view.
 */
export const seatMatches = (seat: SeatMapRow, filters: SeatFilters, wholeDay: boolean): boolean => {
  const query = filters.query?.trim().toLocaleLowerCase() ?? '';
  if (
    query &&
    ![
      seat.label,
      seat.zone,
      ...seat.holders.flatMap((person) => [person.name, person.memberNumber, person.mobile]),
    ].some((value) => value.toLocaleLowerCase().includes(query))
  )
    return false;
  if (
    wholeDay &&
    filters.occupancy &&
    filters.occupancy !== 'all' &&
    seat.dayState !== filters.occupancy
  )
    return false;
  if (filters.zone && seat.zone !== filters.zone) return false;
  if (filters.freeOnly && (wholeDay ? seat.dayState !== 'free' : seat.viewState !== 'free'))
    return false;
  if (filters.unpaidOnly) {
    const people = wholeDay ? seat.holders : seat.occupants;
    const owes = (state: FeeState) => ON_THE_MAP[state] === 'unpaid' || state === 'overdue';
    if (!people.some((p) => owes(p.feeState))) return false;
  }
  return true;
};
