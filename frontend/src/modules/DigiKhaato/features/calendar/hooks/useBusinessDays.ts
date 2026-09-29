'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDegradedNetwork } from 'src/hooks/useDegradedNetwork';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';
import type { ModuleCode } from 'src/types/domain.types';
import { todayInTenantTz } from 'src/utils/dates';

import {
  addDialogClosed,
  addDialogOpened,
  selectAddOpen,
  selectAdding,
  selectBusinessDays,
  selectCalendarError,
  selectCalendarStatus,
  selectDeletingId,
  selectSavingWeekdays,
} from '../redux/calendarSlice';
import {
  addClosedDays,
  deleteClosedDay,
  fetchBusinessDays,
  saveWeekdays,
} from '../redux/calendarThunk';
import { nextTwelveMonths } from '../view-model/calendarDisplay';

import type { BusinessDays, ClosedDayDraft, Weekday } from '../types/calendar.types';

/**
 * Part 19 §19.1.1 layer 4 — the only door into Redux for the Business days
 * screen (A9b). Weekday changes save at once, like the Features switches: a
 * chip that does nothing until a button elsewhere is pressed is a chip that
 * lies about its state.
 */
export interface UseBusinessDaysResult {
  readonly data: BusinessDays | null;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  readonly canManage: boolean;
  readonly canWrite: boolean;
  readonly savingWeekdays: boolean;
  readonly addOpen: boolean;
  readonly adding: boolean;
  readonly deletingId: string | null;
  readonly refetch: () => void;
  readonly setWeekdays: (value: readonly Weekday[]) => void;
  readonly setModuleWeekdays: (module: ModuleCode, value: readonly Weekday[] | null) => void;
  readonly openAdd: () => void;
  readonly closeAdd: () => void;
  readonly submitAdd: (draft: ClosedDayDraft) => Promise<boolean>;
  readonly remove: (id: string) => void;
}

export function useBusinessDays(): UseBusinessDaysResult {
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectBusinessDays);
  const status = useAppSelector(selectCalendarStatus);
  const error = useAppSelector(selectCalendarError);
  const savingWeekdays = useAppSelector(selectSavingWeekdays);
  const addOpen = useAppSelector(selectAddOpen);
  const adding = useAppSelector(selectAdding);
  const deletingId = useAppSelector(selectDeletingId);
  const timezone = useAppSelector(selectTenantTimezone);
  const { can } = usePermissions();
  const { canWrite } = useDegradedNetwork();

  const range = useMemo(() => nextTwelveMonths(todayInTenantTz(timezone ?? undefined)), [timezone]);

  useEffect(() => {
    const promise = dispatch(fetchBusinessDays(range));
    return () => promise.abort();
  }, [dispatch, range]);

  const refetch = useCallback(() => {
    void dispatch(fetchBusinessDays(range));
  }, [dispatch, range]);

  const saved = useCallback(
    async (thunk: ReturnType<typeof saveWeekdays>) => {
      try {
        await dispatch(thunk).unwrap();
        dispatch(showSnackbar({ severity: 'success', id: 'calendar.saved' }));
      } catch {
        // The global snackbar carries the refusal (BR-2's "keep one day open").
      }
    },
    [dispatch]
  );

  const setWeekdays = useCallback(
    (value: readonly Weekday[]) => void saved(saveWeekdays({ value, modules: {} })),
    [saved]
  );

  const setModuleWeekdays = useCallback(
    (module: ModuleCode, value: readonly Weekday[] | null) =>
      void saved(saveWeekdays({ value: data?.closedWeekdays ?? [], modules: { [module]: value } })),
    [saved, data?.closedWeekdays]
  );

  const submitAdd = useCallback(
    async (draft: ClosedDayDraft) => {
      try {
        const added = await dispatch(addClosedDays(draft)).unwrap();
        dispatch(
          showSnackbar({
            severity: 'success',
            id: added.skippedExisting ? 'calendar.added.skipped' : 'calendar.added',
            params: { count: added.rows.length, skipped: added.skippedExisting },
          })
        );
        return true;
      } catch {
        return false;
      }
    },
    [dispatch]
  );

  const remove = useCallback(
    (id: string) => {
      void dispatch(deleteClosedDay(id))
        .unwrap()
        .then(() =>
          dispatch(showSnackbar({ severity: 'success', id: 'calendar.closures.removed' }))
        )
        .catch(() => undefined);
    },
    [dispatch]
  );

  return {
    data,
    status,
    error,
    canManage: can('platform.calendar.manage'),
    canWrite: canWrite('online-only'),
    savingWeekdays,
    addOpen,
    adding,
    deletingId,
    refetch,
    setWeekdays,
    setModuleWeekdays,
    openAdd: useCallback(() => dispatch(addDialogOpened()), [dispatch]),
    closeAdd: useCallback(() => dispatch(addDialogClosed()), [dispatch]),
    submitAdd,
    remove,
  };
}
