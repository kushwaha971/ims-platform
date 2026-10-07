import type { FeeState } from './member.types';

/** W05 — one student on the reading room's day register. */
export interface AttendanceRow {
  readonly membershipId: string;
  readonly name: string;
  readonly memberNumber: string;
  readonly seat: string | null;
  readonly shift: string | null;
  readonly feeState: FeeState;
  readonly markId: string | null;
  readonly checkInAt: string | null;
  readonly checkOutAt: string | null;
}

export interface AttendanceDay {
  readonly on: string;
  readonly rows: readonly AttendanceRow[];
  readonly students: number;
  readonly present: number;
  readonly inNow: number;
}

/** What the desk is told when a student comes in: allow, warn (with why), or a block overridden. */
export interface CheckInOutcome {
  readonly markId: string;
  readonly decision: 'allow' | 'warn' | 'block_overridden';
  readonly reason: string;
}

/** Library P0 — the door's poster: the self check-in page's link and its QR. */
export interface CheckInPoster {
  readonly url: string;
  readonly library: string;
  readonly qrModules: readonly string[];
}
