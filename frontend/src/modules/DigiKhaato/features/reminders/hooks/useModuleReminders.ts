'use client';

import { useCallback, useEffect, useRef } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  selectModuleError,
  selectModuleRows,
  selectModuleStatus,
  selectSentCount,
  selectSentSourceIds,
} from '../redux/moduleReminderSlice';
import { fetchModuleReminders } from '../redux/moduleReminderThunk';

import type { ModuleReminderRow } from '../types/reminder.types';

/**
 * Part 19 §19.1.1 layer 4 — the only door into Redux for one module's reminder
 * tab (A7). `canRemind` is the shop screen's rule: reading the entries the
 * message is about and writing reminders (§10).
 */
export interface UseModuleRemindersResult {
  readonly rows: readonly ModuleReminderRow[];
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  readonly sentIds: readonly string[];
  readonly canRemind: boolean;
  readonly refetch: () => void;
}

export function useModuleReminders(module: string): UseModuleRemindersResult {
  const dispatch = useAppDispatch();
  const { can } = usePermissions();
  const rows = useAppSelector(selectModuleRows(module));
  const status = useAppSelector(selectModuleStatus(module));
  const error = useAppSelector(selectModuleError(module));
  const sentIds = useAppSelector(selectSentSourceIds);

  useEffect(() => {
    const promise = dispatch(fetchModuleReminders(module));
    return () => promise.abort();
  }, [dispatch, module]);

  const refetch = useCallback(() => {
    void dispatch(fetchModuleReminders(module));
  }, [dispatch, module]);

  // Ask again once a send has LANDED. The sheet closes on the tap, before the
  // create-then-send pair is recorded, so a refetch on close alone answers
  // "allowed" and leaves Remind on a row the cap now refuses (look pass).
  const sentCount = useAppSelector(selectSentCount);
  const seen = useRef(sentCount);
  useEffect(() => {
    if (sentCount === seen.current) return;
    seen.current = sentCount;
    refetch();
  }, [sentCount, refetch]);

  return {
    rows,
    status,
    error,
    sentIds,
    canRemind: can('ledger.entry.read') && can('ledger.reminder.write'),
    refetch,
  };
}
