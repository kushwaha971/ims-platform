import type { FeeState } from './member.types';

/**
 * W02 — a study library's shifts and seats (owner, 4 Oct 2026). A shift is a
 * time range ("Morning 06:00–12:00"); a seat is a desk label ("A12"). Two
 * students share a desk when their shifts do not overlap.
 */
export interface LibraryShift {
  readonly id: string;
  readonly name: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly isActive: boolean;
  readonly sortOrder: number;
  readonly version: number;
}

export interface LibrarySeat {
  readonly id: string;
  readonly label: string;
  readonly zone: string;
  readonly isActive: boolean;
  readonly version: number;
}

export interface SeatOccupant {
  readonly membershipId: string;
  readonly name: string;
  readonly memberNumber: string;
  readonly mobile: string;
  /** `null` = the seat is theirs all day. */
  readonly shift: {
    readonly id: string;
    readonly name: string;
    readonly startsAt: string;
    readonly endsAt: string;
  } | null;
  readonly validUntil: string | null;
  readonly feeState: FeeState;
  readonly duesAmount: string;
  /** They hold the seat during the shift the map was asked for. */
  readonly inView: boolean;
  /** …but in a different, overlapping shift (QA F6: "Taken (other shift)"). */
  readonly otherShift: boolean;
  /** The membership's version, for freeing the seat from the panel. */
  readonly version: number;
}

/** QA F6 — a seat across the whole day: nobody, some shifts, or every shift. */
export type SeatDayState = 'free' | 'partial' | 'full';
/** …and in the chosen shift: free, held in it, or held only by another overlapping shift. */
export type SeatViewState = 'free' | 'taken' | 'other_shift';

export interface SeatMapRow extends LibrarySeat {
  /** The holders during the chosen shift (all of them for the whole day). */
  readonly occupants: readonly SeatOccupant[];
  /** Everybody on this seat, in any shift — what the seat panel lists. */
  readonly holders: readonly SeatOccupant[];
  /** The active shifts the seat can no longer be given in. */
  readonly takenShiftIds: readonly string[];
  readonly dayState: SeatDayState;
  readonly viewState: SeatViewState;
}

export interface ShiftCount {
  readonly id: string;
  readonly name: string;
  readonly taken: number;
  readonly total: number;
}

export interface SeatMap {
  /** The shift the map was asked for; '' = the whole day. */
  readonly shiftId: string;
  readonly seats: readonly SeatMapRow[];
  readonly counts: Readonly<Partial<Record<'occupied' | 'free' | FeeState, number>>>;
  /** "Morning 4/5 · Evening 2/5", by the same rule as the tiles. */
  readonly shiftCounts: readonly ShiftCount[];
}

export interface ShiftFormValues {
  name: string;
  startsAt: string;
  endsAt: string;
}

export interface SeatRowFormValues {
  prefix: string;
  from: string;
  to: string;
  zone: string;
}
