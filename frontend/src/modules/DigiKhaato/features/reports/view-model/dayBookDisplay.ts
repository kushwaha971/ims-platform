import { DAY_BOOK_TYPE_FILTERS } from '../types/reports.types';

import { periodFromQuery, periodToQuery, REPORT_PRESETS } from './reportPeriod';

import type {
  DayBookFilters,
  DayBookRow,
  DayBookType,
  DayBookTypeFilter,
  ReportPreset,
} from '../types/reports.types';

/**
 * RPT-02 — pure helpers for the day-book screen: the filters in the address
 * bar, the chips' type groups, and each row's words.
 */

/** FR-5 — Today, Yesterday, This week, This month, Custom (plus last month). */
export const DAY_BOOK_PRESETS: readonly ReportPreset[] = REPORT_PRESETS.filter((preset) =>
  ['today', 'yesterday', 'thisWeek', 'thisMonth', 'lastMonth', 'custom'].includes(preset)
);
export const DEFAULT_DAY_BOOK_PRESET: ReportPreset = 'today';
export const DAY_BOOK_PAGE_SIZE = 100;

/** Each chip and the FR-2 codes it stands for. */
export const TYPE_GROUPS: Readonly<Record<DayBookTypeFilter, readonly DayBookType[]>> = {
  sales: ['sale', 'credit_note'],
  purchases: ['purchase'],
  payments: ['payment_in', 'payment_out'],
  expenses: ['expense'],
  khata: ['manual_gave', 'manual_got', 'opening', 'write_off', 'reversal'],
  stock: ['stock_adjustment'],
};

export const typesForFilters = (filters: readonly DayBookTypeFilter[]): readonly DayBookType[] =>
  filters.flatMap((group) => TYPE_GROUPS[group]);

export const dayBookFiltersFromQuery = (query: URLSearchParams, today: string): DayBookFilters => {
  const period = periodFromQuery(query, today, DAY_BOOK_PRESETS, DEFAULT_DAY_BOOK_PRESET);
  const types = (query.get('type') ?? '')
    .split(',')
    .filter((value): value is DayBookTypeFilter =>
      (DAY_BOOK_TYPE_FILTERS as readonly string[]).includes(value)
    );
  const page = Number(query.get('page') ?? '1');
  return {
    ...period,
    types: DAY_BOOK_TYPE_FILTERS.filter((group) => types.includes(group)),
    includeVoid: query.get('void') === '1',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
};

/** The inverse — only what differs from the defaults, so the plain URL stays plain. */
export const dayBookQueryFromFilters = (filters: DayBookFilters): string => {
  const query = new URLSearchParams();
  periodToQuery(filters, DEFAULT_DAY_BOOK_PRESET, query);
  if (filters.types.length) query.set('type', filters.types.join(','));
  if (filters.includeVoid) query.set('void', '1');
  if (filters.page > 1) query.set('page', String(filters.page));
  return query.toString();
};

/** The FR-2 code without FR-7's `_void` suffix. */
export const baseType = (row: Pick<DayBookRow, 'type'>): string => row.type.replace(/_void$/, '');

const KNOWN = new Set<string>([
  'sale',
  'credit_note',
  'purchase',
  'payment_in',
  'payment_out',
  'expense',
  'manual_gave',
  'manual_got',
  'opening',
  'write_off',
  'reversal',
  'correction',
  'stock_adjustment',
]);

/** The type badge's message id. */
export const typeLabelId = (row: Pick<DayBookRow, 'type'>): string => {
  const base = baseType(row);
  return `reports.daybook.type.${KNOWN.has(base) ? base : 'other'}`;
};

/** UX §8 — In success, Out error, a non-money row muted, a void row neutral. */
export const typeTone = (
  row: Pick<DayBookRow, 'type' | 'void' | 'moneyIn' | 'moneyOut'>
): 'neutral' | 'success' | 'error' | 'info' | 'warning' => {
  if (row.void) return 'neutral';
  if (row.moneyIn) return 'success';
  if (row.moneyOut) return 'error';
  return baseType(row) === 'sale' || baseType(row) === 'purchase' ? 'info' : 'neutral';
};

/** Who the row is about: the party, the walk-in's name, or nothing. */
export const rowPartyName = (row: Pick<DayBookRow, 'party' | 'walkInName'>): string | null =>
  row.party?.name || row.walkInName || null;

/** The rows grouped by business date, in the order they came (FR: mobile timeline). */
export const groupByDate = (
  rows: readonly DayBookRow[]
): readonly { readonly date: string; readonly rows: readonly DayBookRow[] }[] => {
  const groups: { date: string; rows: DayBookRow[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.date === row.date) last.rows.push(row);
    else groups.push({ date: row.date, rows: [row] });
  }
  return groups;
};
