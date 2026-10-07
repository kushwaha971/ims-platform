'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';
import { todayInTenantTz } from 'src/utils/dates';

import { selectProfitReport } from '../redux/profitReportSlice';
import { fetchProfitReport } from '../redux/profitReportThunk';
import {
  profitFiltersFromQuery,
  profitPath,
  profitQueryFromFilters,
} from '../view-model/profitDisplay';
import { resolveTaxPeriod } from '../view-model/taxPeriod';

import type { ProfitFilters, ProfitPage } from '../types/profitReport.types';
import type { TaxPeriodPreset } from '../types/taxReports.types';

/**
 * Part 19 §19.4 — everything the profit screen does, so the page only renders.
 *
 * Every figure on it is a cost or a margin, so it is `reports.financial.read`
 * on top of `reports.basic.read` and `sales.invoice.read` — exactly the
 * server's gate, so a reader who would be refused never sends the request.
 */
export interface UseProfitReportResult {
  readonly filters: ProfitFilters;
  readonly today: string;
  readonly data: ProfitPage | null;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  readonly canRead: boolean;
  readonly exportPath: string;
  readonly update: (next: Partial<ProfitFilters>) => void;
  readonly setPreset: (preset: TaxPeriodPreset) => void;
  readonly setRange: (from: string | null, to: string | null) => void;
  readonly setPage: (page: number) => void;
  readonly refetch: () => void;
}

export const useProfitReport = (): UseProfitReportResult => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const search = useSearchParams();
  const { can, hasModule } = usePermissions();
  const timezone = useAppSelector(selectTenantTimezone);
  const slot = useAppSelector(selectProfitReport);

  const canRead =
    hasModule('reports') &&
    hasModule('sales') &&
    can('reports.basic.read') &&
    can('sales.invoice.read') &&
    can('reports.financial.read');
  const today = useMemo(() => todayInTenantTz(timezone ?? undefined), [timezone]);

  // Keyed on the query STRING — `useSearchParams()` is a new object every render.
  const queryString = search?.toString() ?? '';
  const filters = useMemo(
    () => profitFiltersFromQuery(new URLSearchParams(queryString), today),
    [queryString, today]
  );

  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchProfitReport(filters));
    return () => promise.abort();
  }, [dispatch, canRead, filters]);

  const push = useCallback(
    (next: ProfitFilters) => {
      const qs = profitQueryFromFilters(next);
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router]
  );

  // Every setter but `setPage` returns to page one: page three of another cut is another list.
  const update = useCallback(
    (next: Partial<ProfitFilters>) => push({ ...filters, ...next, page: 1 }),
    [push, filters]
  );
  const setPreset = useCallback(
    (preset: TaxPeriodPreset) => update({ preset, ...(resolveTaxPeriod(preset, today) ?? {}) }),
    [update, today]
  );
  const setRange = useCallback(
    (from: string | null, to: string | null) =>
      update({
        preset: 'custom',
        dateFrom: from ?? filters.dateFrom,
        dateTo: to ?? filters.dateTo,
      }),
    [update, filters]
  );
  const setPage = useCallback((page: number) => push({ ...filters, page }), [push, filters]);
  const refetch = useCallback(() => {
    void dispatch(fetchProfitReport(filters));
  }, [dispatch, filters]);

  return {
    filters,
    today,
    data: slot.data,
    status: slot.status,
    error: slot.error,
    canRead,
    exportPath: profitPath(filters),
    update,
    setPreset,
    setRange,
    setPage,
    refetch,
  };
};
