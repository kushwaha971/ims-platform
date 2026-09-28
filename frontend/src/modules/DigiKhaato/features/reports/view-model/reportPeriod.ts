import { isValidWireDate } from 'src/utils/dates';

import { resolveExpensePreset } from '../../expenses/view-model/expenseDisplay';
import { resolvePreset } from '../../ledger/view-model/statementDisplay';

import type { ReportPreset } from '../types/reports.types';

/**
 * The report shell's period (RPT-common: "`UbDateRangePicker` with FY
 * presets"), resolved against the TENANT's today.
 *
 * No arithmetic of its own: the day, week and month presets are the
 * cashbook's (`resolveExpensePreset`) and the financial-year ones the
 * statement's (`resolvePreset`), so the day book, the cashbook and a party's
 * statement cannot disagree about when this week began or when April starts.
 */

export const REPORT_PRESETS: readonly ReportPreset[] = [
  'today',
  'yesterday',
  'thisWeek',
  'thisMonth',
  'lastMonth',
  'thisFy',
  'lastFy',
  'custom',
];

export const resolveReportPreset = (
  preset: ReportPreset,
  today: string
): { readonly dateFrom: string; readonly dateTo: string } | null => {
  if (preset === 'custom') return null;
  if (preset === 'lastFy') {
    const range = resolvePreset('lastFy', today);
    return range.dateFrom && range.dateTo
      ? { dateFrom: range.dateFrom, dateTo: range.dateTo }
      : null;
  }
  return resolveExpensePreset(preset, today);
};

/**
 * `?period=` and `?from=&to=` out of the address bar — a named preset wins, a
 * valid custom pair is kept, anything else falls back to the report's default.
 */
export const periodFromQuery = (
  query: URLSearchParams,
  today: string,
  presets: readonly ReportPreset[],
  fallback: ReportPreset
): { readonly preset: ReportPreset; readonly dateFrom: string; readonly dateTo: string } => {
  const raw = query.get('period') as ReportPreset | null;
  const from = query.get('from');
  const to = query.get('to');
  const hasDates =
    isValidWireDate(from) && isValidWireDate(to) && (from as string) <= (to as string);
  const preset: ReportPreset = raw && presets.includes(raw) ? raw : hasDates ? 'custom' : fallback;
  const resolved = resolveReportPreset(preset, today);
  if (resolved) return { preset, ...resolved };
  return hasDates
    ? { preset: 'custom', dateFrom: from as string, dateTo: to as string }
    : {
        preset: fallback,
        ...(resolveReportPreset(fallback, today) ?? { dateFrom: today, dateTo: today }),
      };
};

/** The inverse, writing only what differs from the default. */
export const periodToQuery = (
  period: { readonly preset: ReportPreset; readonly dateFrom: string; readonly dateTo: string },
  fallback: ReportPreset,
  query: URLSearchParams
): void => {
  if (period.preset === 'custom') {
    query.set('period', 'custom');
    query.set('from', period.dateFrom);
    query.set('to', period.dateTo);
  } else if (period.preset !== fallback) {
    query.set('period', period.preset);
  }
};

/** Days in a closed range — the day book shows a Date column past one day. */
export const spansDays = (dateFrom: string, dateTo: string): number =>
  Math.round(
    (Date.parse(`${dateTo}T00:00:00Z`) - Date.parse(`${dateFrom}T00:00:00Z`)) / 86_400_000
  ) + 1;
