import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import { LIBRARY_PATHS } from './libraryPaths';

import type { AttendanceDay, CheckInOutcome } from '../types/attendance.types';
import type { FeeState } from '../types/member.types';

/** W05 — the reading room's day register: one async function each and the mapping. */
type Wire = Readonly<Record<string, unknown>>;

const str = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value);
const strOrNull = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

export const getAttendanceDay = async (on: string, signal?: AbortSignal): Promise<AttendanceDay> => {
  const response = await api.get<{
    data: readonly Wire[];
    meta: { on: string; students: number; present: number; in_now: number };
  }>(`${LIBRARY_PATHS.ATTENDANCE}${toQueryString({ date: on || undefined })}`, { signal });
  const { data, meta } = response.data;
  return {
    on: meta.on,
    students: meta.students,
    present: meta.present,
    inNow: meta.in_now,
    rows: data.map((row) => ({
      membershipId: str(row.membership_id),
      name: str(row.name),
      memberNumber: str(row.member_number),
      seat: strOrNull(row.seat),
      shift: strOrNull(row.shift),
      feeState: str(row.fee_state) as FeeState,
      markId: strOrNull(row.mark_id),
      checkInAt: strOrNull(row.check_in_at),
      checkOutAt: strOrNull(row.check_out_at),
    })),
  };
};

/** The desk says a block, a duplicate or a warning itself, so this is quiet. */
export const checkIn = async (
  membershipId: string,
  overrideReason?: string
): Promise<CheckInOutcome> => {
  const response = await api.post<{ data: Wire }>(
    LIBRARY_PATHS.ATTENDANCE,
    { membership_id: membershipId, ...(overrideReason ? { override_reason: overrideReason } : {}) },
    ubConfig({ suppressErrorSnackbar: true })
  );
  const row = response.data.data;
  return {
    markId: str(row.mark_id),
    decision: str(row.decision) as CheckInOutcome['decision'],
    reason: str(row.reason),
  };
};

export const checkOut = async (markId: string): Promise<void> => {
  await api.post(LIBRARY_PATHS.ATTENDANCE_OUT(markId), {});
};

export const getMemberAttendance = async (
  membershipId: string,
  month: string,
  signal?: AbortSignal
): Promise<string[]> => {
  const response = await api.get<{ data: readonly string[] }>(
    `${LIBRARY_PATHS.MEMBER_ATTENDANCE(membershipId)}${toQueryString({ month })}`,
    { signal }
  );
  return [...response.data.data];
};
