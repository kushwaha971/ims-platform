import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import type { ModuleCode } from 'src/types/domain.types';
import { toQueryString } from 'src/utils/queryString';

import type {
  AddedClosedDays,
  BusinessDays,
  ClosedDay,
  ClosedDayApiRow,
  ClosedDayDraft,
  SavedWeekdays,
  Weekday,
  WeekdaysDraft,
} from '../types/calendar.types';

/**
 * A9b (PLT-X08 §6) — one function per endpoint, owning the snake_case mapping.
 * No React, no Redux, no `Ub*`, no `react-intl`.
 */

interface ListResponse {
  readonly data: readonly ClosedDayApiRow[];
  readonly meta?: {
    readonly closed_weekdays?: readonly Weekday[];
    readonly module_weekdays?: Readonly<Partial<Record<ModuleCode, readonly Weekday[]>>>;
    readonly readers?: readonly ModuleCode[];
  };
}

const toClosedDay = (row: ClosedDayApiRow): ClosedDay => ({
  id: row.id,
  date: row.date,
  reason: row.reason,
  module: row.module ?? null,
});

/**
 * GET /calendar/closed-days — a whole-page read, so its failure is drawn in
 * place by the screen (with the request id and a retry), not as a toast.
 */
export const listClosedDays = async (
  range: { readonly from: string; readonly to: string },
  signal?: AbortSignal
): Promise<BusinessDays> => {
  const response = await api.get<ListResponse>(
    `${API_PATHS.CALENDAR_CLOSED_DAYS}${toQueryString(range)}`,
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  const meta = response.data.meta ?? {};
  return {
    rows: response.data.data.map(toClosedDay),
    closedWeekdays: meta.closed_weekdays ?? [],
    moduleWeekdays: meta.module_weekdays ?? {},
    readers: meta.readers ?? [],
  };
};

/** POST /calendar/closed-days — a range add; days already closed are skipped and counted. */
export const addClosedDays = async (draft: ClosedDayDraft): Promise<AddedClosedDays> => {
  const response = await api.post<{
    data: readonly ClosedDayApiRow[];
    meta?: { skipped_existing?: number };
  }>(API_PATHS.CALENDAR_CLOSED_DAYS, {
    from: draft.from,
    ...(draft.to ? { to: draft.to } : {}),
    reason: draft.reason,
    ...(draft.module ? { module: draft.module } : {}),
  });
  return {
    rows: response.data.data.map(toClosedDay),
    skippedExisting: response.data.meta?.skipped_existing ?? 0,
  };
};

/** DELETE /calendar/closed-days/{id}. */
export const deleteClosedDay = async (id: string): Promise<void> => {
  await api.delete(API_PATHS.CALENDAR_CLOSED_DAY(id));
};

/** PUT /calendar/weekdays — the tenant's closed weekdays and any module overrides. */
export const saveWeekdays = async (draft: WeekdaysDraft): Promise<SavedWeekdays> => {
  const response = await api.put<{ data: SavedWeekdays }>(API_PATHS.CALENDAR_WEEKDAYS, {
    value: draft.value,
    modules: draft.modules,
  });
  return response.data.data;
};
