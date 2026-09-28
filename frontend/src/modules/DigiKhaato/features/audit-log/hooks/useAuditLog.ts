'use client';

import { useCallback, useEffect, useState } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDebounce } from 'src/hooks/useDebounce';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import type { ApiErrorShape, PageMeta, RequestStatus } from 'src/types/api.types';
import { todayInTenantTz } from 'src/utils/dates';

import { auditExportUrl } from '../api/auditLogService';
import {
  auditFiltersChanged,
  auditPageChanged,
  auditRowClosed,
  auditRowOpened,
  selectAuditActors,
  selectAuditError,
  selectAuditFilters,
  selectAuditMeta,
  selectAuditRows,
  selectAuditSelectedId,
  selectAuditStatus,
} from '../redux/auditLogSlice';
import { fetchActors, fetchAuditRows } from '../redux/auditLogThunk';
import { periodRange } from '../view-model/auditDisplay';

import type {
  AuditActor,
  AuditFilters,
  AuditGroup,
  AuditPeriod,
  AuditRow,
} from '../types/audit.types';

/**
 * Part 19 §19.1.1 layer 4 — the only door into Redux for the activity log.
 *
 * The search box is local and debounced (R-P-7): a keystroke is not a request.
 * Everything else is a filter in the slice, and a filter change is a refetch
 * from page 1.
 */
export interface UseAuditLogResult {
  readonly rows: readonly AuditRow[];
  readonly meta: PageMeta;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  readonly filters: AuditFilters;
  readonly today: string;
  readonly actors: readonly AuditActor[];
  readonly search: string;
  readonly setSearch: (value: string) => void;
  readonly setPeriod: (period: AuditPeriod) => void;
  readonly setRange: (from: string | null, to: string | null) => void;
  readonly setActor: (actorId: string | null) => void;
  readonly setGroup: (group: AuditGroup | null) => void;
  readonly clearFilters: () => void;
  readonly setPage: (page: number, pageSize?: number) => void;
  readonly refetch: () => void;
  readonly selected: AuditRow | null;
  readonly openRow: (row: AuditRow) => void;
  readonly closeRow: () => void;
  readonly exportUrl: string;
  readonly isFiltered: boolean;
}

export function useAuditLog(): UseAuditLogResult {
  const dispatch = useAppDispatch();
  const rows = useAppSelector(selectAuditRows);
  const meta = useAppSelector(selectAuditMeta);
  const status = useAppSelector(selectAuditStatus);
  const error = useAppSelector(selectAuditError);
  const filters = useAppSelector(selectAuditFilters);
  const actors = useAppSelector(selectAuditActors);
  const selectedId = useAppSelector(selectAuditSelectedId);
  const timezone = useAppSelector(selectTenantTimezone);
  const today = todayInTenantTz(timezone ?? undefined);

  const [search, setSearch] = useState(filters.q);
  const settledSearch = useDebounce(search, 300);

  // FR-3: the default range is TODAY in the tenant's zone, resolved once here
  // because the slice cannot know the date at import time.
  useEffect(() => {
    if (filters.dateFrom === null && filters.period !== 'custom') {
      const range = periodRange(filters.period, today);
      dispatch(auditFiltersChanged({ dateFrom: range.from, dateTo: range.to }));
    }
  }, [dispatch, filters.dateFrom, filters.period, today]);

  useEffect(() => {
    if (settledSearch !== filters.q) dispatch(auditFiltersChanged({ q: settledSearch }));
  }, [dispatch, settledSearch, filters.q]);

  useEffect(() => {
    if (filters.dateFrom === null && filters.period !== 'custom') return undefined;
    const promise = dispatch(fetchAuditRows(filters));
    return () => promise.abort();
  }, [dispatch, filters]);

  useEffect(() => {
    const promise = dispatch(fetchActors());
    return () => promise.abort();
  }, [dispatch]);

  const setPeriod = useCallback(
    (period: AuditPeriod) => {
      if (period === 'custom') {
        dispatch(auditFiltersChanged({ period }));
        return;
      }
      const range = periodRange(period, today);
      dispatch(auditFiltersChanged({ period, dateFrom: range.from, dateTo: range.to }));
    },
    [dispatch, today]
  );
  const setRange = useCallback(
    (from: string | null, to: string | null) =>
      dispatch(auditFiltersChanged({ period: 'custom', dateFrom: from, dateTo: to })),
    [dispatch]
  );
  const setActor = useCallback(
    (actorId: string | null) => dispatch(auditFiltersChanged({ actorId })),
    [dispatch]
  );
  const setGroup = useCallback(
    (group: AuditGroup | null) => dispatch(auditFiltersChanged({ group })),
    [dispatch]
  );
  const clearFilters = useCallback(() => {
    setSearch('');
    const range = periodRange('today', today);
    dispatch(
      auditFiltersChanged({
        period: 'today',
        dateFrom: range.from,
        dateTo: range.to,
        actorId: null,
        group: null,
        q: '',
      })
    );
  }, [dispatch, today]);
  const setPage = useCallback(
    (page: number, pageSize?: number) => dispatch(auditPageChanged({ page, pageSize })),
    [dispatch]
  );
  const refetch = useCallback(() => {
    void dispatch(fetchAuditRows(filters));
  }, [dispatch, filters]);
  const openRow = useCallback((row: AuditRow) => dispatch(auditRowOpened(row.id)), [dispatch]);
  const closeRow = useCallback(() => dispatch(auditRowClosed()), [dispatch]);

  return {
    rows,
    meta,
    status,
    error,
    filters,
    today,
    actors,
    search,
    setSearch,
    setPeriod,
    setRange,
    setActor,
    setGroup,
    clearFilters,
    setPage,
    refetch,
    selected: rows.find((row) => row.id === selectedId) ?? null,
    openRow,
    closeRow,
    exportUrl: auditExportUrl(filters),
    isFiltered: Boolean(filters.actorId || filters.group || filters.q),
  };
}
