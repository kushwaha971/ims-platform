'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';
import { todayInTenantTz } from 'src/utils/dates';

import {
  historyKindChanged,
  selectCollectionSummary,
  selectDueError,
  selectDuePage,
  selectDuePageSize,
  selectDueRows,
  selectDueStatus,
  selectDueTotal,
  selectHistoryError,
  selectHistoryKind,
  selectHistoryPage,
  selectHistoryRows,
  selectHistoryStatus,
  selectHistoryTotal,
  selectReminderSettings,
  selectRemindersStale,
} from '../redux/reminderSlice';
import {
  fetchCollectionSummary,
  fetchDueParties,
  fetchReminderHistory,
  fetchReminderSettings,
} from '../redux/reminderThunk';
import { REMINDER_TABS, isBucket } from '../view-model/reminderDisplay';

import type {
  CollectionSummary,
  DueParty,
  Reminder,
  ReminderKindFilter,
  ReminderSettings,
  ReminderTab,
} from '../types/reminder.types';

/**
 * The reminders screen's state: the tab lives in the address bar (`?bucket=`)
 * so the inbox's "3 parties have a payment due today" can open exactly that
 * list, and `?status=failed` opens the history on what did not go.
 */
const DUE_PAGE_SIZE = 25;

const tabFromQuery = (raw: string | null): ReminderTab =>
  REMINDER_TABS.includes(raw as ReminderTab) ? (raw as ReminderTab) : 'today';

export interface UseRemindersResult {
  readonly tab: ReminderTab;
  readonly setTab: (next: ReminderTab) => void;
  readonly today: string;
  readonly summary: CollectionSummary | null;
  readonly settings: ReminderSettings | null;
  readonly canRead: boolean;
  readonly canRemind: boolean;
  readonly canManageSettings: boolean;
  readonly selected: readonly string[];
  readonly setSelected: (ids: readonly string[]) => void;
  readonly due: {
    readonly rows: readonly DueParty[];
    readonly status: RequestStatus;
    readonly error: ApiErrorShape | null;
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
  readonly history: {
    readonly rows: readonly Reminder[];
    readonly status: RequestStatus;
    readonly error: ApiErrorShape | null;
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
    readonly filter: ReminderKindFilter;
  };
  readonly setPage: (next: number) => void;
  readonly setHistoryFilter: (next: ReminderKindFilter) => void;
  readonly refetch: () => void;
}

export const useReminders = (): UseRemindersResult => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const search = useSearchParams();
  const { can, hasModule } = usePermissions();
  const timezone = useAppSelector(selectTenantTimezone);

  const tab = tabFromQuery(search.get('bucket'));
  const [page, setPageState] = useState(1);
  const [selected, setSelected] = useState<readonly string[]>([]);

  const summary = useAppSelector(selectCollectionSummary);
  const stale = useAppSelector(selectRemindersStale);
  const settings = useAppSelector(selectReminderSettings);
  const dueRows = useAppSelector(selectDueRows);
  const dueStatus = useAppSelector(selectDueStatus);
  const dueError = useAppSelector(selectDueError);
  const duePage = useAppSelector(selectDuePage);
  const duePageSize = useAppSelector(selectDuePageSize);
  const dueTotal = useAppSelector(selectDueTotal);
  const historyKind = useAppSelector(selectHistoryKind);
  const historyRows = useAppSelector(selectHistoryRows);
  const historyStatus = useAppSelector(selectHistoryStatus);
  const historyError = useAppSelector(selectHistoryError);
  const historyPage = useAppSelector(selectHistoryPage);
  const historyTotal = useAppSelector(selectHistoryTotal);

  const canRead = hasModule('ledger') && can('ledger.entry.read');
  const canRemind = canRead && can('ledger.reminder.write');
  const canManageSettings = can('notifications.settings.manage');
  const today = useMemo(() => todayInTenantTz(timezone ?? undefined), [timezone]);

  /* `?status=failed` (the reminder_failed notification's link) seeds the
     history filter once, the way the party list seeds from its URL. */
  const failedLink = search.get('status') === 'failed';
  useEffect(() => {
    if (failedLink) dispatch(historyKindChanged('failed'));
  }, [failedLink, dispatch]);

  useEffect(() => {
    if (!canRead) return;
    void dispatch(fetchCollectionSummary());
    void dispatch(fetchReminderSettings());
  }, [canRead, dispatch]);

  useEffect(() => {
    if (!canRead) return;
    const request = isBucket(tab)
      ? dispatch(fetchDueParties({ bucket: tab, page, pageSize: DUE_PAGE_SIZE }))
      : dispatch(fetchReminderHistory({ filter: historyKind, page }));
    return () => request.abort();
  }, [canRead, tab, page, historyKind, dispatch]);

  /* A posting or a reminder elsewhere marked the screen stale: re-read the
     figures and the list the merchant is looking at. */
  useEffect(() => {
    if (!stale || !canRead) return;
    void dispatch(fetchCollectionSummary());
    if (isBucket(tab))
      void dispatch(fetchDueParties({ bucket: tab, page, pageSize: DUE_PAGE_SIZE }));
    else void dispatch(fetchReminderHistory({ filter: historyKind, page }));
  }, [stale, canRead, tab, page, historyKind, dispatch]);

  const setTab = useCallback(
    (next: ReminderTab) => {
      setPageState(1);
      setSelected([]);
      router.replace(`?bucket=${next}`, { scroll: false });
    },
    [router]
  );
  const setPage = useCallback((next: number) => {
    setPageState(next);
    setSelected([]);
  }, []);
  const setHistoryFilter = useCallback(
    (next: ReminderKindFilter) => {
      setPageState(1);
      dispatch(historyKindChanged(next));
    },
    [dispatch]
  );
  const refetch = useCallback(() => {
    if (isBucket(tab))
      void dispatch(fetchDueParties({ bucket: tab, page, pageSize: DUE_PAGE_SIZE }));
    else void dispatch(fetchReminderHistory({ filter: historyKind, page }));
  }, [dispatch, tab, page, historyKind]);

  return {
    tab,
    setTab,
    today,
    summary,
    settings,
    canRead,
    canRemind,
    canManageSettings,
    selected,
    setSelected,
    due: {
      rows: dueRows,
      status: dueStatus,
      error: dueError,
      page: duePage,
      pageSize: duePageSize,
      total: dueTotal,
    },
    history: {
      rows: historyRows,
      status: historyStatus,
      error: historyError,
      page: historyPage,
      pageSize: 25,
      total: historyTotal,
      filter: historyKind,
    },
    setPage,
    setHistoryFilter,
    refetch,
  };
};
