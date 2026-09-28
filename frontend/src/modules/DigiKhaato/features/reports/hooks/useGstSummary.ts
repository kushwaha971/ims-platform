'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';
import { todayInTenantTz } from 'src/utils/dates';

import { GST_DEFAULT_PRESET } from '../constants/taxReportConstants';
import { selectGstReport } from '../redux/taxReportsSlice';
import { fetchGstSummary } from '../redux/taxReportsThunk';
import { gstPath } from '../view-model/registerDisplay';
import { periodFromQuery, periodToQuery, resolveTaxPeriod } from '../view-model/taxPeriod';

import type {
  GstQuery,
  GstRounding,
  GstSummary,
  GstView,
  TaxPeriodPreset,
} from '../types/taxReports.types';

/**
 * RPT-07 — the GST summary's state, so the page only renders.
 *
 * `reports.financial.read` for the whole report (§12): staff are not shown a
 * refusal to fetch, they are shown nothing to fetch. The period, the view and
 * the rounding are in the address bar; switching the view never refetches
 * (T-RPT07-15 "view toggle preserves period") — every section arrives in one
 * response and the views are three readings of it.
 */
export interface UseGstSummaryResult {
  readonly preset: TaxPeriodPreset;
  readonly query: GstQuery;
  readonly view: GstView;
  readonly today: string;
  readonly data: GstSummary | null;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  readonly canRead: boolean;
  readonly notRegistered: boolean;
  readonly exportPath: string;
  readonly setPreset: (preset: TaxPeriodPreset) => void;
  readonly setRange: (from: string | null, to: string | null) => void;
  readonly setView: (view: GstView) => void;
  readonly setRounding: (rounding: GstRounding) => void;
  readonly refetch: () => void;
}

const VIEWS: readonly GstView[] = ['gstr1', 'gstr3b', 'details'];

export const useGstSummary = (): UseGstSummaryResult => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const search = useSearchParams();
  const { can, hasModule } = usePermissions();
  const timezone = useAppSelector(selectTenantTimezone);
  const slot = useAppSelector(selectGstReport);
  const canRead = hasModule('reports') && can('reports.financial.read');
  const today = useMemo(() => todayInTenantTz(timezone ?? undefined), [timezone]);

  const queryString = search?.toString() ?? '';
  const state = useMemo(() => {
    const params = new URLSearchParams(queryString);
    const period = periodFromQuery(params, today, GST_DEFAULT_PRESET);
    const rawView = params.get('view') as GstView | null;
    return {
      period,
      view: rawView && VIEWS.includes(rawView) ? rawView : ('gstr1' as GstView),
      rounding: (params.get('rounding') === 'rupee' ? 'rupee' : 'paise') as GstRounding,
    };
  }, [queryString, today]);
  /* Keyed on the three values the SERVER is asked for, never on `state`: the
     view is in the same URL, and a query rebuilt on every view switch would
     refetch the whole summary to show a different reading of it. */
  const { dateFrom, dateTo } = state.period;
  const { rounding } = state;
  const query = useMemo<GstQuery>(
    () => ({ dateFrom, dateTo, rounding }),
    [dateFrom, dateTo, rounding]
  );

  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchGstSummary(query));
    return () => promise.abort();
  }, [dispatch, canRead, query]);

  /* The request is sent with the global toast suppressed, because the 409 for
     an unregistered business is a SCREEN. Every other failure still reaches
     the one snackbar, once per failure. */
  const { error } = slot;
  useEffect(() => {
    if (!error || error.code === 'gst_not_registered') return;
    dispatch(
      showSnackbar({ severity: 'error', message: error.message, requestId: error.requestId })
    );
  }, [dispatch, error]);

  const push = useCallback(
    (next: typeof state) => {
      const params = new URLSearchParams();
      periodToQuery(params, next.period, GST_DEFAULT_PRESET);
      if (next.view !== 'gstr1') params.set('view', next.view);
      if (next.rounding === 'rupee') params.set('rounding', 'rupee');
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router]
  );

  const setPreset = useCallback(
    (preset: TaxPeriodPreset) => {
      const resolved = resolveTaxPeriod(preset, today);
      push({ ...state, period: { ...state.period, preset, ...(resolved ?? {}) } });
    },
    [push, state, today]
  );
  const setRange = useCallback(
    (from: string | null, to: string | null) =>
      push({
        ...state,
        period: {
          preset: 'custom',
          dateFrom: from ?? state.period.dateFrom,
          dateTo: to ?? state.period.dateTo,
        },
      }),
    [push, state]
  );
  const setView = useCallback((view: GstView) => push({ ...state, view }), [push, state]);
  const setRounding = useCallback(
    (rounding: GstRounding) => push({ ...state, rounding }),
    [push, state]
  );
  const refetch = useCallback(() => {
    void dispatch(fetchGstSummary(query));
  }, [dispatch, query]);

  return {
    preset: state.period.preset,
    query,
    view: state.view,
    today,
    data: slot.data,
    status: slot.status,
    error: slot.error,
    canRead,
    notRegistered: slot.error?.code === 'gst_not_registered',
    exportPath: gstPath(query),
    setPreset,
    setRange,
    setView,
    setRounding,
    refetch,
  };
};
