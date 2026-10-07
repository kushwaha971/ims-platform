import { API_PATHS } from 'src/api/APIPaths';
import { publicApi } from 'src/api/AxiosInstances';

import type { SelfCheckInResult } from '../types/selfCheckin.types';

/**
 * Library P0 — the student's no-login check-in page. Core, not the library's: the
 * server decides which module the door's QR belongs to; the page only asks.
 */

type Wire = Record<string, unknown>;
const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const sn = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export const getSelfCheckIn = async (token: string, signal?: AbortSignal): Promise<string> => {
  const response = await publicApi.get<{ data: Wire }>(API_PATHS.PUBLIC_CHECKIN(token), {
    signal,
  });
  return s(response.data.data.library);
};

export const postSelfCheckIn = async (
  token: string,
  memberNumber: string,
  mobileLast4: string
): Promise<SelfCheckInResult> => {
  const response = await publicApi.post<{ data: Wire }>(API_PATHS.PUBLIC_CHECKIN(token), {
    member_number: memberNumber.trim(),
    mobile_last4: mobileLast4.trim(),
  });
  const row = response.data.data;
  return {
    firstName: s(row.first_name),
    already: Boolean(row.already),
    seat: sn(row.seat),
    shift: sn(row.shift),
    warning: sn(row.warning),
  };
};
