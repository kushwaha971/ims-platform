import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import { LIBRARY_PATHS } from './libraryPaths';

import type { FeeState } from '../types/member.types';
import type {
  LibrarySeat,
  LibraryShift,
  SeatMap,
  SeatRowFormValues,
  ShiftFormValues,
} from '../types/seat.types';

/** W02 — shifts, seats and the seat map: one async function each and the mapping. */
type Wire = Readonly<Record<string, unknown>>;

const str = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value);

export const toShift = (row: Wire): LibraryShift => ({
  id: str(row.id),
  name: str(row.name),
  startsAt: str(row.starts_at),
  endsAt: str(row.ends_at),
  isActive: Boolean(row.is_active),
  sortOrder: Number(row.sort_order ?? 0),
  version: Number(row.version ?? 1),
});

export const toSeat = (row: Wire): LibrarySeat => ({
  id: str(row.id),
  label: str(row.label),
  zone: str(row.zone),
  isActive: Boolean(row.is_active),
  version: Number(row.version ?? 1),
});

export const listShifts = async (signal?: AbortSignal): Promise<LibraryShift[]> => {
  const response = await api.get<{ data: readonly Wire[] }>(LIBRARY_PATHS.SHIFTS, { signal });
  return response.data.data.map(toShift);
};

export const listSeats = async (signal?: AbortSignal): Promise<LibrarySeat[]> => {
  const response = await api.get<{ data: readonly Wire[] }>(LIBRARY_PATHS.SEATS, { signal });
  return response.data.data.map(toSeat);
};

export const getSeatMap = async (shiftId: string, signal?: AbortSignal): Promise<SeatMap> => {
  const response = await api.get<{ data: readonly Wire[]; meta: { counts: Wire } }>(
    `${LIBRARY_PATHS.SEAT_MAP}${toQueryString({ shift: shiftId || undefined })}`,
    { signal }
  );
  return {
    shiftId,
    seats: response.data.data.map((row) => ({
      ...toSeat(row),
      occupants: ((row.occupants as Wire[] | undefined) ?? []).map((o) => {
        const shift = o.shift as Wire | null;
        return {
          membershipId: str(o.membership_id),
          name: str(o.name),
          memberNumber: str(o.member_number),
          shift: shift ? { id: str(shift.id), name: str(shift.name) } : null,
          validUntil: o.valid_until ? str(o.valid_until) : null,
          feeState: str(o.fee_state) as FeeState,
          duesAmount: str(o.dues_amount || '0.00'),
        };
      }),
    })),
    counts: response.data.meta.counts as SeatMap['counts'],
  };
};

/** The forms say a refusal on their own fields, so these are quiet. */
const quiet = ubConfig({ suppressErrorSnackbar: true });

export const saveShift = async (
  values: ShiftFormValues,
  existing?: LibraryShift
): Promise<LibraryShift> => {
  const body = { name: values.name.trim(), starts_at: values.startsAt, ends_at: values.endsAt };
  const response = existing
    ? await api.patch<{ data: Wire }>(
        LIBRARY_PATHS.SHIFT(existing.id),
        { ...body, version: existing.version },
        quiet
      )
    : await api.post<{ data: Wire }>(LIBRARY_PATHS.SHIFTS, body, quiet);
  return toShift(response.data.data);
};

export const setShiftActive = async (shift: LibraryShift, active: boolean): Promise<LibraryShift> =>
  toShift(
    (
      await api.patch<{ data: Wire }>(LIBRARY_PATHS.SHIFT(shift.id), {
        is_active: active,
        version: shift.version,
      })
    ).data.data
  );

export const addSeatRow = async (values: SeatRowFormValues): Promise<number> => {
  const response = await api.post<{ data: readonly Wire[]; meta: { created: number } }>(
    LIBRARY_PATHS.SEAT_ROW,
    {
      prefix: values.prefix.trim(),
      from: Number(values.from),
      to: Number(values.to),
      zone: values.zone.trim(),
    },
    quiet
  );
  return response.data.meta.created;
};

export const setSeatActive = async (seat: LibrarySeat, active: boolean): Promise<LibrarySeat> =>
  toSeat(
    (
      await api.patch<{ data: Wire }>(LIBRARY_PATHS.SEAT(seat.id), {
        is_active: active,
        version: seat.version,
      })
    ).data.data
  );
