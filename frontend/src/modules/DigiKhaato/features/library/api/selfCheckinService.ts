import { api } from 'src/api/AxiosInstances';

import { LIBRARY_PATHS } from './libraryPaths';

import type { CheckInPoster } from '../types/attendance.types';

/** Library P0 — the door's poster for QR self check-in (signed in). */

type Wire = Record<string, unknown>;

export const getCheckInPoster = async (signal?: AbortSignal): Promise<CheckInPoster> => {
  const response = await api.get<{ data: Wire }>(LIBRARY_PATHS.CHECKIN_POSTER, { signal });
  const row = response.data.data;
  return {
    url: String(row.url ?? ''),
    library: String(row.library ?? ''),
    qrModules: (((row.qr ?? {}) as Wire).modules ?? []) as readonly string[],
  };
};
