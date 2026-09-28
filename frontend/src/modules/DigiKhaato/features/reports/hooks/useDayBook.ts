'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectNetworkImpaired } from 'src/redux/slice/networkSlice';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';
import { todayInTenantTz } from 'src/utils/dates';

import {
  dayBookAsked,
  selectDayBookData,
  selectDayBookError,
  selectDayBookStale,
  selectDayBookStatus,
} from '../redux/dayBookSlice';
import { fetchDayBook } from '../redux/dayBookThunk';
import { dayBookFiltersFromQuery, dayBookQueryFromFilters } from '../view-model/dayBookDisplay';
import { resolveReportPreset } from '../view-model/reportPeriod';

import type {
  DayBookData,
  DayBookFilters,
  DayBookTypeFilter,
  ReportPreset,
} from '../types/reports.types';

export interface UseDayBookResult {
  readonly data: DayBookData | null;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  readonly filters: DayBookFilters;
  readonly today: string;
  readonly canRead: boolean;
  readonly canExport: boolean;
  readonly setPreset: (preset: ReportPreset) => void;
  readonly setRange: (from: string | null, to: string | null) => void;
  readonly toggleType: (group: DayBookTypeFilter, on: boolean) => void;
  readonly clearTypes: () => void;
  readonly setIncludeVoid: (on: boolean) => void;
  readonly setPage: (page: number) => void;
  readonly refetch: () => void;
}

/**
 * RPT-02 — the day book's state. The filters live in the ADDRESS BAR (the
 * party list's rule): an owner can send the accountant "last month, payments
 * only" as a link, and Back restores the view they left.
 */
export const useDayBook = (): UseDayBookResult => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const search = useSearchParams();
  const { can, hasModule } = usePermissions();
  const timezone = useAppSelector(selectTenantTimezone);
  const impaired = useAppSelector(selectNetworkImpaired);
  const data = useAppSelector(selectDayBookData);
  const status = useAppSelector(selectDayBookStatus);
  const error = useAppSelector(selectDayBookError);
  const stale = useAppSelector(selectDayBookStale);

  const canRead = hasModule('reports') && can('reports.basic.read');
  const canExport = canRead && can('reports.export');
  const today = useMemo(() => todayInTenantTz(timezone ?? undefined), [timezone]);
  const queryString = search?.toString() ?? '';
  const filters = useMemo(
    () => dayBookFiltersFromQuery(new URLSearchParams(queryString), today),
    [queryString, today]
  );

  useEffect(() => {
    if (!canRead) return undefined;
    dispatch(dayBookAsked(filters));
    const promise = dispatch(fetchDayBook(filters));
    return () => promise.abort();
  }, [dispatch, canRead, filters]);

  const settled = status === 'succeeded';
  useEffect(() => {
    if (!stale || impaired || !canRead || !settled) return undefined;
    const promise = dispatch(fetchDayBook(filters));
    return () => promise.abort();
  }, [dispatch, stale, impaired, canRead, settled, filters]);

  const push = useCallback(
    (next: DayBookFilters) => {
      const query = dayBookQueryFromFilters(next);
      router.replace(query ? `?${query}` : '?', { scroll: false });
    },
    [router]
  );
  const setPreset = useCallback(
    (preset: ReportPreset) => {
      const resolved = resolveReportPreset(preset, today);
      push({
        ...filters,
        preset,
        dateFrom: resolved?.dateFrom ?? filters.dateFrom,
        dateTo: resolved?.dateTo ?? filters.dateTo,
        page: 1,
      });
    },
    [push, filters, today]
  );
  const setRange = useCallback(
    (from: string | null, to: string | null) =>
      push({
        ...filters,
        preset: 'custom',
        dateFrom: from ?? filters.dateFrom,
        dateTo: to ?? filters.dateTo,
        page: 1,
      }),
    [push, filters]
  );
  const toggleType = useCallback(
    (group: DayBookTypeFilter, on: boolean) =>
      push({
        ...filters,
        types: on
          ? [...filters.types.filter((g) => g !== group), group]
          : filters.types.filter((g) => g !== group),
        page: 1,
      }),
    [push, filters]
  );
  const clearTypes = useCallback(() => push({ ...filters, types: [], page: 1 }), [push, filters]);
  const setIncludeVoid = useCallback(
    (on: boolean) => push({ ...filters, includeVoid: on, page: 1 }),
    [push, filters]
  );
  const setPage = useCallback((page: number) => push({ ...filters, page }), [push, filters]);
  const refetch = useCallback(() => {
    void dispatch(fetchDayBook(filters));
  }, [dispatch, filters]);

  return useMemo(
    () => ({
      data,
      status,
      error,
      filters,
      today,
      canRead,
      canExport,
      setPreset,
      setRange,
      toggleType,
      clearTypes,
      setIncludeVoid,
      setPage,
      refetch,
    }),
    [
      data,
      status,
      error,
      filters,
      today,
      canRead,
      canExport,
      setPreset,
      setRange,
      toggleType,
      clearTypes,
      setIncludeVoid,
      setPage,
      refetch,
    ]
  );
};
