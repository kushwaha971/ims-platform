import type { PaymentMode, UpiApp } from 'src/types/domain.types';

/**
 * EXP-01 / EXP-02 domain shapes, camelCase. Money is a decimal STRING all the
 * way through (R-TS-7) — there is no `Number(amount)` anywhere in this feature.
 */

export type ExpenseStatus = 'recorded' | 'void';

/** A palette token (`viz-1`…`viz-8`), never hex — the tag palette (PTY-05). */
export interface ExpenseCategory {
  readonly id: string;
  readonly name: string;
  readonly systemCode: string | null;
  readonly color: string;
  readonly isSystem: boolean;
  readonly status: 'active' | 'archived';
}

export interface ExpenseCategoryRef {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly status: 'active' | 'archived';
}

export interface ExpensePerson {
  readonly id: string;
  readonly name: string;
}

export interface Expense {
  readonly id: string;
  readonly number: string;
  readonly expenseDate: string;
  readonly amount: string;
  readonly category: ExpenseCategoryRef;
  readonly party: ExpensePerson | null;
  /** `null` on an unpaid expense — how it was paid is not a fact yet. */
  readonly mode: PaymentMode | null;
  readonly upiApp: UpiApp | null;
  readonly reference: string;
  readonly note: string;
  readonly paid: boolean;
  readonly dueOn: string | null;
  readonly status: ExpenseStatus;
  readonly voidReason: string | null;
  readonly voidedAt: string | null;
  readonly voidedBy: ExpensePerson | null;
  readonly createdBy: ExpensePerson | null;
  readonly createdAt: string;
}

export interface ExpenseTotals {
  readonly amount: string;
  readonly count: number;
  readonly byCategory: readonly {
    readonly categoryId: string;
    readonly name: string;
    readonly color: string;
    readonly amount: string;
  }[];
}

/** FR-9's three tabs. `all` means every RECORDED expense, never a void. */
export type ExpenseTab = 'all' | 'unpaid' | 'void';

/** The period chips shared by the list and the cashbook. */
export type ExpensePreset =
  'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'thisFy' | 'custom';

export interface ExpenseFilters {
  readonly preset: ExpensePreset;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly tab: ExpenseTab;
  readonly categoryId: string | null;
  readonly mode: PaymentMode | null;
  readonly q: string;
  readonly page: number;
}

export interface ExpensePage {
  readonly rows: readonly Expense[];
  readonly totals: ExpenseTotals;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

/** The drawer's form state. `mode`/`upiApp` are kept even when `paid` is off
 *  (the service drops them) so switching Paid now back on does not lose them. */
export interface ExpenseFormValues {
  amount: string;
  categoryId: string;
  expenseDate: string;
  paid: boolean;
  mode: PaymentMode | '';
  upiApp: UpiApp | '';
  reference: string;
  partyId: string;
  partyName: string;
  dueOn: string;
  note: string;
}

export interface ExpenseSaveResult {
  readonly expense: Expense;
  readonly partyBalance: string | null;
}
