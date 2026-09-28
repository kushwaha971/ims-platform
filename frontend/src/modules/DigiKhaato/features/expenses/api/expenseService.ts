import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import type { PaymentMode, UpiApp } from 'src/types/domain.types';
import { toQueryString } from 'src/utils/queryString';

import type {
  Expense,
  ExpenseCategory,
  ExpenseFilters,
  ExpenseFormValues,
  ExpensePage,
  ExpensePerson,
  ExpenseSaveResult,
} from '../types/expense.types';

/**
 * Part 19 §19.3.4 — EXP-01 / EXP-02's endpoints. One async function each, the
 * snake ⇄ camel mapping and nothing else: no React, no Redux, no `Ub*`.
 */

// ── Wire shapes ──────────────────────────────────────────────────────────────

interface CategoryApiRow {
  readonly id: string;
  readonly name: string;
  readonly system_code: string | null;
  readonly color: string;
  readonly is_system: boolean;
  readonly status: 'active' | 'archived';
}

interface ExpenseApiRow {
  readonly id: string;
  readonly number: string;
  readonly expense_date: string;
  readonly amount: string;
  readonly category: { id: string; name: string; color: string; status: 'active' | 'archived' };
  readonly party: ExpensePerson | null;
  readonly mode: PaymentMode | null;
  readonly upi_app: UpiApp | null;
  readonly reference: string;
  readonly note: string;
  readonly paid: boolean;
  readonly due_on: string | null;
  readonly status: 'recorded' | 'void';
  readonly void_reason: string | null;
  readonly voided_at: string | null;
  readonly voided_by: ExpensePerson | null;
  readonly created_by: ExpensePerson | null;
  readonly created_at: string;
}

interface ExpenseListApiResponse {
  readonly data: readonly ExpenseApiRow[];
  readonly meta: {
    readonly page: number;
    readonly page_size: number;
    readonly total: number;
    readonly totals: {
      readonly amount: string;
      readonly count: number;
      readonly by_category: readonly {
        category_id: string;
        name: string;
        color: string;
        amount: string;
      }[];
    };
  };
}

interface ExpenseWriteApiResponse {
  readonly data: ExpenseApiRow;
  readonly meta?: { readonly party_balance?: string } | null;
}

// ── Mappers ─────────────────────────────────────────────────────────────────

export const toCategory = (row: CategoryApiRow): ExpenseCategory => ({
  id: row.id,
  name: row.name,
  systemCode: row.system_code,
  color: row.color,
  isSystem: row.is_system,
  status: row.status,
});

export const toExpense = (row: ExpenseApiRow): Expense => ({
  id: row.id,
  number: row.number,
  expenseDate: row.expense_date,
  amount: row.amount,
  category: row.category,
  party: row.party,
  mode: row.mode,
  upiApp: row.upi_app,
  reference: row.reference ?? '',
  note: row.note ?? '',
  paid: row.paid,
  dueOn: row.due_on,
  status: row.status,
  voidReason: row.void_reason,
  voidedAt: row.voided_at,
  voidedBy: row.voided_by,
  createdBy: row.created_by,
  createdAt: row.created_at,
});

/**
 * The POST body. An unpaid expense sends no mode, app or reference — the
 * server would drop them anyway (money that has not moved has no "how"), and
 * sending them would put a UTR in the request log against nothing. A paid one
 * sends no party-owed fields.
 */
export const toWireBody = (values: ExpenseFormValues): Record<string, unknown> => ({
  amount: values.amount,
  category_id: values.categoryId || null,
  expense_date: values.expenseDate,
  paid: values.paid,
  note: values.note.trim(),
  party_id: values.partyId || null,
  ...(values.paid
    ? {
        mode: values.mode || null,
        upi_app: values.mode === 'upi' ? values.upiApp || null : null,
        reference: values.mode && values.mode !== 'cash' ? values.reference.trim() : '',
      }
    : { due_on: values.dueOn || null }),
});

/** The list query for a set of filters — shared by the page and its tests. */
export const expenseListQuery = (filters: ExpenseFilters): string =>
  toQueryString({
    date_from: filters.dateFrom || undefined,
    date_to: filters.dateTo || undefined,
    category: filters.categoryId || undefined,
    mode: filters.mode || undefined,
    status: filters.tab === 'void' ? 'void' : undefined,
    paid: filters.tab === 'unpaid' ? 'false' : undefined,
    q: filters.q.trim() || undefined,
    page: filters.page > 1 ? filters.page : undefined,
  });

/** IMP-02 — the list's path with its filters and no page, for the Export button. */
export const expenseExportPath = (filters: ExpenseFilters): string =>
  `${API_PATHS.EXPENSES}${expenseListQuery({ ...filters, page: 1 })}`;

// ── Endpoints ───────────────────────────────────────────────────────────────

export const listExpenses = async (
  filters: ExpenseFilters,
  signal?: AbortSignal
): Promise<ExpensePage> => {
  const response = await api.get<ExpenseListApiResponse>(
    `${API_PATHS.EXPENSES}${expenseListQuery(filters)}`,
    ubConfig({ signal })
  );
  const { data, meta } = response.data;
  return {
    rows: data.map(toExpense),
    totals: {
      amount: meta.totals.amount,
      count: meta.totals.count,
      byCategory: meta.totals.by_category.map((row) => ({
        categoryId: row.category_id,
        name: row.name,
        color: row.color,
        amount: row.amount,
      })),
    },
    page: meta.page,
    pageSize: meta.page_size,
    total: meta.total,
  };
};

/**
 * Every category, archived ones included, fetched once per session.
 *
 * Archived rows ride along so the list can label an old expense "(archived)"
 * (EXP-02 EC-5); the picker filters them out. Server order is usage-first.
 */
export const listExpenseCategories = async (
  signal?: AbortSignal
): Promise<readonly ExpenseCategory[]> => {
  const response = await api.get<{ data: readonly CategoryApiRow[] }>(
    `${API_PATHS.EXPENSE_CATEGORIES}${toQueryString({ status: 'all' })}`,
    ubConfig({ signal })
  );
  return response.data.data.map(toCategory);
};

/** Inline create. A duplicate name answers 200 with the existing row (EC-1). */
export const createExpenseCategory = async (name: string): Promise<ExpenseCategory> => {
  const response = await api.post<{ data: CategoryApiRow }>(API_PATHS.EXPENSE_CATEGORIES, {
    name,
  });
  return toCategory(response.data.data);
};

/**
 * Record one expense. `idempotencyKey` is minted per logical save and REUSED
 * on a retry, so a slow-but-successful first attempt never becomes two
 * expenses and a cashbook short by the amount (EC-7).
 */
export const createExpense = async (
  values: ExpenseFormValues,
  idempotencyKey: string
): Promise<ExpenseSaveResult> => {
  const response = await api.post<ExpenseWriteApiResponse>(
    API_PATHS.EXPENSES,
    toWireBody(values),
    ubConfig({ headers: { 'Idempotency-Key': idempotencyKey } })
  );
  return {
    expense: toExpense(response.data.data),
    partyBalance: response.data.meta?.party_balance ?? null,
  };
};

export const voidExpense = async (
  id: string,
  reason: string,
  idempotencyKey: string
): Promise<ExpenseSaveResult> => {
  const response = await api.post<ExpenseWriteApiResponse>(
    API_PATHS.EXPENSE_VOID(id),
    { reason },
    ubConfig({ headers: { 'Idempotency-Key': idempotencyKey } })
  );
  return {
    expense: toExpense(response.data.data),
    partyBalance: response.data.meta?.party_balance ?? null,
  };
};
