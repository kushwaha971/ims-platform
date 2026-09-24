import { PAYMENT_MODES, type PaymentMode, type UpiApp } from 'src/types/domain.types';
import { isValidWireDate } from 'src/utils/dates';
import {
  absMoney,
  compareMoney,
  isNegativeAmount,
  subtractMoney,
  toDecimal,
  toMoneyString,
} from 'src/utils/money';

import { resolvePreset } from '../../ledger/view-model/statementDisplay';
import {
  CASHBOOK_PRESETS,
  DEFAULT_CASHBOOK_PRESET,
  DEFAULT_EXPENSE_PRESET,
  EXPENSE_PRESETS,
} from '../constants/expensePeriod';

import type { CashbookBucketFilter, CashbookFilters } from '../types/cashbook.types';
import type {
  Expense,
  ExpenseCategory,
  ExpenseFilters,
  ExpensePreset,
  ExpenseTab,
} from '../types/expense.types';

/**
 * Pure helpers for the expense list and the cashbook — no React, no Redux, so
 * every rule here is a unit test away from being checked.
 */

const DAY_MS = 86_400_000;

const shiftDays = (iso: string, days: number): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** Monday of the week containing `today` (Indian shops count the week from Monday). */
const weekStart = (today: string): string => {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return shiftDays(today, -((weekday + 6) % 7));
};

/**
 * A preset's dates against the TENANT's today, never the device clock — a
 * phone set to UTC at 11.50 p.m. IST would otherwise put "Today" on
 * yesterday. The month and financial-year arithmetic is the statement's own
 * (`resolvePreset`), so the two screens cannot disagree about when April starts.
 */
export const resolveExpensePreset = (
  preset: ExpensePreset,
  today: string
): { readonly dateFrom: string; readonly dateTo: string } | null => {
  switch (preset) {
    case 'today':
      return { dateFrom: today, dateTo: today };
    case 'yesterday': {
      const yesterday = shiftDays(today, -1);
      return { dateFrom: yesterday, dateTo: yesterday };
    }
    case 'thisWeek':
      return { dateFrom: weekStart(today), dateTo: today };
    case 'thisMonth':
    case 'lastMonth':
    case 'thisFy': {
      const range = resolvePreset(preset, today);
      return { dateFrom: range.dateFrom ?? today, dateTo: range.dateTo ?? today };
    }
    case 'custom':
    default:
      return null;
  }
};

const TABS: readonly ExpenseTab[] = ['all', 'unpaid', 'void'];

/**
 * The list's filters out of the address bar, so the view is linkable and
 * survives a reload (PTY-05's lesson: filters that live only in Redux make
 * every link to a filtered list inert).
 */
export const expenseFiltersFromQuery = (query: URLSearchParams, today: string): ExpenseFilters => {
  const rawPreset = query.get('period') as ExpensePreset | null;
  const from = query.get('from');
  const to = query.get('to');
  const hasDates = isValidWireDate(from) && isValidWireDate(to);
  const preset: ExpensePreset =
    rawPreset && EXPENSE_PRESETS.includes(rawPreset)
      ? rawPreset
      : hasDates
        ? 'custom'
        : DEFAULT_EXPENSE_PRESET;
  const resolved = resolveExpensePreset(preset, today);
  const tab = query.get('tab') as ExpenseTab | null;
  const mode = query.get('mode') as PaymentMode | null;
  const page = Number(query.get('page') ?? '1');
  return {
    preset,
    dateFrom: resolved?.dateFrom ?? (hasDates ? (from as string) : today),
    dateTo: resolved?.dateTo ?? (hasDates ? (to as string) : today),
    tab: tab && TABS.includes(tab) ? tab : 'all',
    categoryId: query.get('category') || null,
    mode: mode && PAYMENT_MODES.includes(mode) ? mode : null,
    q: query.get('q') ?? '',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
};

/** The inverse — only what differs from the defaults, so the plain URL stays plain. */
export const expenseQueryFromFilters = (filters: ExpenseFilters): string => {
  const search = new URLSearchParams();
  if (filters.preset !== DEFAULT_EXPENSE_PRESET) search.set('period', filters.preset);
  if (filters.preset === 'custom') {
    search.set('from', filters.dateFrom);
    search.set('to', filters.dateTo);
  }
  if (filters.tab !== 'all') search.set('tab', filters.tab);
  if (filters.categoryId) search.set('category', filters.categoryId);
  if (filters.mode) search.set('mode', filters.mode);
  if (filters.q.trim()) search.set('q', filters.q.trim());
  if (filters.page > 1) search.set('page', String(filters.page));
  return search.toString();
};

/** Is anything narrowing the list beyond the period? (Drives filtered-empty.) */
export const isNarrowed = (filters: ExpenseFilters): boolean =>
  filters.tab !== 'all' || !!filters.categoryId || !!filters.mode || !!filters.q.trim();

const BUCKETS: readonly CashbookBucketFilter[] = ['all', 'cash', 'bank'];

export const cashbookFiltersFromQuery = (
  query: URLSearchParams,
  today: string
): CashbookFilters => {
  const rawPreset = query.get('period') as ExpensePreset | null;
  const from = query.get('from');
  const to = query.get('to');
  const hasDates = isValidWireDate(from) && isValidWireDate(to);
  const preset: ExpensePreset =
    rawPreset && CASHBOOK_PRESETS.includes(rawPreset)
      ? rawPreset
      : hasDates
        ? 'custom'
        : DEFAULT_CASHBOOK_PRESET;
  const resolved = resolveExpensePreset(preset, today);
  const bucket = query.get('bucket') as CashbookBucketFilter | null;
  return {
    preset,
    dateFrom: resolved?.dateFrom ?? (hasDates ? (from as string) : today),
    dateTo: resolved?.dateTo ?? (hasDates ? (to as string) : today),
    bucket: bucket && BUCKETS.includes(bucket) ? bucket : 'all',
  };
};

export const cashbookQueryFromFilters = (filters: CashbookFilters): string => {
  const search = new URLSearchParams();
  if (filters.preset !== DEFAULT_CASHBOOK_PRESET) search.set('period', filters.preset);
  if (filters.preset === 'custom') {
    search.set('from', filters.dateFrom);
    search.set('to', filters.dateTo);
  }
  if (filters.bucket !== 'all') search.set('bucket', filters.bucket);
  return search.toString();
};

/**
 * How it was paid, in the merchant's word: "PhonePe" rather than "UPI" when
 * the app is known — the same flattening the ledger's chips use.
 */
export const modeLabelId = (mode: PaymentMode | null, upiApp: UpiApp | null): string | null => {
  if (!mode) return null;
  if (mode === 'upi' && upiApp) return `ledger.upiApp.${upiApp}`;
  return `ledger.mode.${mode}`;
};

/** "Rent (archived)" for a category archived after the expense (EXP-02 EC-5). */
export const categoryLabel = (
  category: Pick<ExpenseCategory, 'name' | 'status'>,
  archivedSuffix: string
): string =>
  category.status === 'archived' ? `${category.name} ${archivedSuffix}` : category.name;

/** The picker's options: live categories only, in the server's usage-first order. */
export const pickerCategories = (
  categories: readonly ExpenseCategory[]
): readonly ExpenseCategory[] => categories.filter((category) => category.status === 'active');

/** Does the row's title (its note, else its category) need the category chip too? */
export const expenseTitle = (expense: Expense): string =>
  expense.note.trim() || expense.category.name;

/**
 * FR-8's close-the-day check, on the client and stored nowhere: the counted
 * cash against the expected closing. Decimal arithmetic through the shared
 * money helpers, so 0.10 + 0.20 never becomes "Short by 0.30000000000000004".
 */
export const countDifference = (
  expected: string,
  counted: string
): { readonly kind: 'matches' | 'short' | 'extra'; readonly amount: string } | null => {
  if (!counted.trim()) return null;
  const delta = subtractMoney(toMoneyString(toDecimal(counted)), expected);
  const order = compareMoney(delta, '0.00');
  if (order === 0) return { kind: 'matches', amount: '0.00' };
  return { kind: order < 0 ? 'short' : 'extra', amount: absMoney(delta) };
};

/** Percent of a total, rounded to a whole number, for the "where the money went" bars. */
export const shareOf = (part: string, total: string): number => {
  const whole = toDecimal(total);
  if (whole.lte(0)) return 0;
  return toDecimal(part).div(whole).times(100).toDecimalPlaces(0).toNumber();
};

/** A negative figure — the cashbook shows a negative closing, never hides it (BR-9). */
export const isNegative = (value: string | undefined): boolean => isNegativeAmount(value ?? '0');
