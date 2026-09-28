import { FY_START_MONTH, TAX_PERIOD_PRESETS } from '../constants/taxReportConstants';

import type { TaxPeriodPreset } from '../types/taxReports.types';

/**
 * The GST periods of RPT-03 FR-7 / RPT-07 FR-1, resolved against the
 * TENANT's today (passed in, never the device clock — a phone set to UTC at
 * 11.50 p.m. IST would otherwise end "This month" yesterday).
 *
 * Quarters are quarters of the FINANCIAL year — Q1 is April–June — because
 * those are the quarters returns are filed for. A period that has not ended
 * stops at today: a report dated into the future describes days nobody has
 * traded yet.
 */

const iso = (year: number, month: number, day: number): string =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const lastDayOf = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

const clampTo = (date: string, today: string): string => (date > today ? today : date);

/** The first month (1–12) of the financial quarter containing `month`. */
const quarterStartMonth = (month: number): number => {
  const offset = (month - FY_START_MONTH + 12) % 12;
  return ((FY_START_MONTH - 1 + offset - (offset % 3)) % 12) + 1;
};

const addMonths = (year: number, month: number, delta: number): [number, number] => {
  const index = year * 12 + (month - 1) + delta;
  return [Math.floor(index / 12), (index % 12) + 1];
};

export interface ResolvedPeriod {
  readonly dateFrom: string;
  readonly dateTo: string;
}

export const resolveTaxPeriod = (preset: TaxPeriodPreset, today: string): ResolvedPeriod | null => {
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  switch (preset) {
    case 'thisMonth':
      return { dateFrom: iso(year, month, 1), dateTo: iso(year, month, day) };
    case 'lastMonth': {
      const [y, m] = addMonths(year, month, -1);
      return { dateFrom: iso(y, m, 1), dateTo: iso(y, m, lastDayOf(y, m)) };
    }
    case 'thisQuarter': {
      const startMonth = quarterStartMonth(month);
      const [y, m] = startMonth > month ? [year - 1, startMonth] : [year, startMonth];
      return { dateFrom: iso(y, m, 1), dateTo: today };
    }
    case 'lastQuarter': {
      const startMonth = quarterStartMonth(month);
      const [qy, qm] = startMonth > month ? [year - 1, startMonth] : [year, startMonth];
      const [fy, fm] = addMonths(qy, qm, -3);
      const [ty, tm] = addMonths(qy, qm, -1);
      return { dateFrom: iso(fy, fm, 1), dateTo: iso(ty, tm, lastDayOf(ty, tm)) };
    }
    case 'thisFy': {
      const fyStart = month >= FY_START_MONTH ? year : year - 1;
      return { dateFrom: iso(fyStart, FY_START_MONTH, 1), dateTo: today };
    }
    case 'custom':
    default:
      return null;
  }
};

/**
 * The period out of the address bar: `?period=` is a preset; `custom` also
 * carries `from`/`to`. Anything unreadable falls back to `fallback`, so a
 * pasted link with a typo opens the default rather than an empty report.
 */
export const periodFromQuery = (
  query: URLSearchParams,
  today: string,
  fallback: TaxPeriodPreset
): { readonly preset: TaxPeriodPreset } & ResolvedPeriod => {
  const raw = query.get('period') as TaxPeriodPreset | null;
  const preset = raw && TAX_PERIOD_PRESETS.includes(raw) ? raw : fallback;
  const resolved = resolveTaxPeriod(preset, today);
  if (resolved) return { preset, ...resolved };
  const from = query.get('from');
  const to = query.get('to');
  const valid = (value: string | null): value is string =>
    !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!valid(from) || !valid(to) || from > to) {
    return { preset: fallback, ...(resolveTaxPeriod(fallback, today) as ResolvedPeriod) };
  }
  return { preset, dateFrom: from, dateTo: clampTo(to, today) };
};

export const periodToQuery = (
  search: URLSearchParams,
  period: { readonly preset: TaxPeriodPreset } & ResolvedPeriod,
  fallback: TaxPeriodPreset
): void => {
  if (period.preset !== fallback) search.set('period', period.preset);
  if (period.preset === 'custom') {
    search.set('from', period.dateFrom);
    search.set('to', period.dateTo);
  }
};

/** RPT-07 — the return due dates are the 11th and 20th of the month after the period. */
export const nextMonthDay = (date: string, day: number): string => {
  const [year, month] = date.split('-').map(Number) as [number, number];
  const [y, m] = addMonths(year, month, 1);
  return iso(y, m, day);
};
