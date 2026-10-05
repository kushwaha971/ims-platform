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
  readonly shift: { readonly id: string; readonly name: string } | null;
  readonly validUntil: string | null;
  readonly feeState: FeeState;
  readonly duesAmount: string;
}

export interface SeatMapRow extends LibrarySeat {
  readonly occupants: readonly SeatOccupant[];
}

export interface SeatMap {
  /** The shift the map was asked for; '' = the whole day. */
  readonly shiftId: string;
  readonly seats: readonly SeatMapRow[];
  readonly counts: Readonly<Partial<Record<'occupied' | 'free' | FeeState, number>>>;
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
