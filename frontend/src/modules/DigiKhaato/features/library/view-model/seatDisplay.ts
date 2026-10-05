import type { FeeState } from '../types/member.types';
import type { SeatMapRow } from '../types/seat.types';

/** W03 — a tile's state: free, or the WORST fee of whoever holds it in the shift. */
export type SeatState = Exclude<FeeState, 'left'> | 'free';

const WORST_FIRST: readonly Exclude<FeeState, 'left'>[] = ['overdue', 'unpaid', 'due_soon', 'paid'];

export const seatState = (seat: Pick<SeatMapRow, 'occupants'>): SeatState => {
  if (seat.occupants.length === 0) return 'free';
  const states = new Set(seat.occupants.map((o) => o.feeState));
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
