import type { ExpensePreset } from '../types/expense.types';

/**
 * The period presets, in a module that imports NOTHING — the statement's
 * `statementPeriod.ts` records the 2.2 KB of shell it cost to keep constants
 * like these beside the arithmetic that uses them. A lazily injected slice
 * reads its default from here.
 */

/** FR-9 — the expense list's chips. "This month" is the default. */
export const EXPENSE_PRESETS: readonly ExpensePreset[] = [
  'today',
  'thisWeek',
  'thisMonth',
  'lastMonth',
  'thisFy',
  'custom',
];
export const DEFAULT_EXPENSE_PRESET: ExpensePreset = 'thisMonth';

/** EXP-03 FR-6 — the cashbook's chips. Yesterday matters at closing time. */
export const CASHBOOK_PRESETS: readonly ExpensePreset[] = [
  'today',
  'yesterday',
  'thisWeek',
  'thisMonth',
  'lastMonth',
  'custom',
];
export const DEFAULT_CASHBOOK_PRESET: ExpensePreset = 'thisMonth';

export const EXPENSE_PAGE_SIZE = 25;
