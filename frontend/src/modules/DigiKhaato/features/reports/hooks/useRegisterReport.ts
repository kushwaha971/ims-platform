'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import type { RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';
import { todayInTenantTz } from 'src/utils/dates';

import { selectRegisterReport } from '../redux/taxReportsSlice';
import { fetchRegister } from '../redux/taxReportsThunk';
import {
  registerFiltersFromQuery,
  registerPath,
  registerQueryFromFilters,
} from '../view-model/registerDisplay';
import { resolveTaxPeriod } from '../view-model/taxPeriod';

import type {
  RegisterBook,
  RegisterFilters,
  RegisterPage,
  TaxPeriodPreset,
} from '../types/taxReports.types';

/**
 * Part 19 §19.4 — everything a register screen does, so the page only renders.
 *
 * ── Who may see it (FRD §12, both registers) ──────────────────────────────
 * `reports.basic.read` plus the module's own read. Staff hold both: the
 * registers carry no cost column, and the one that does — a purchase line's
 * unit cost — is decided by the SERVER (absent without
 * `reports.financial.read`). Export is `reports.export`, which staff do not
 * hold, so for them the button is not rendered.
 */
export interface UseRegisterReportResult {
  readonly book: RegisterBook;
  readonly filters: RegisterFilters;
  readonly today: string;
  readonly data: RegisterPage | null;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  readonly canRead: boolean;
  readonly exportPath: string;
  readonly update: (next: Partial<RegisterFilters>) => void;
  readonly setPreset: (preset: TaxPeriodPreset) => void;
  readonly setRange: (from: string | null, to: string | null) => void;
  readonly setPage: (page: number) => void;
  readonly clearFilters: () => void;
  readonly refetch: () => void;
}

export const useRegisterReport = (book: RegisterBook): UseRegisterReportResult => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const search = useSearchParams();
  const { can, hasModule } = usePermissions();
  const timezone = useAppSelector(selectTenantTimezone);
  const slot = useAppSelector((state: RootState) => selectRegisterReport(state, book));

  const moduleRead =
    book === 'sales'
      ? hasModule('sales') && can('sales.invoice.read')
      : hasModule('purchases') && can('purchases.bill.read');
  const canRead = hasModule('reports') && can('reports.basic.read') && moduleRead;
  const today = useMemo(() => todayInTenantTz(timezone ?? undefined), [timezone]);

  // Keyed on the query STRING — `useSearchParams()` is a new object every render.
  const queryString = search?.toString() ?? '';
  const filters = useMemo(
    () => registerFiltersFromQuery(new URLSearchParams(queryString), today),
    [queryString, today]
  );
  const query = useMemo(() => ({ book, filters }), [book, filters]);

  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchRegister(query));
    return () => promise.abort();
  }, [dispatch, canRead, query]);

  const push = useCallback(
    (next: RegisterFilters) => {
      const qs = registerQueryFromFilters(next);
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router]
  );

  /* Every setter but `setPage` returns to page one: page three of a narrower
     set is, as often as not, an empty screen. */
  const update = useCallback(
    (next: Partial<RegisterFilters>) => push({ ...filters, ...next, page: 1 }),
    [push, filters]
  );
  const setPreset = useCallback(
    (preset: TaxPeriodPreset) => {
      const resolved = resolveTaxPeriod(preset, today);
      update({ preset, ...(resolved ?? {}) });
    },
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
  const clearFilters = useCallback(
    () =>
      update({
        status: 'all',
        party: 'all',
        kind: 'all',
        itc: 'all',
        taxCode: null,
        interState: null,
      }),
    [update]
  );
  const refetch = useCallback(() => {
    void dispatch(fetchRegister(query));
  }, [dispatch, query]);

  return {
    book,
    filters,
    today,
    data: slot.data,
    status: slot.status,
    error: slot.error,
    canRead,
    exportPath: registerPath(query),
    update,
    setPreset,
    setRange,
    setPage,
    clearFilters,
    refetch,
  };
};
