import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import type { PaymentMode } from 'src/types/domain.types';
import { toQueryString } from 'src/utils/queryString';

import { DAY_BOOK_PAGE_SIZE, typesForFilters } from '../view-model/dayBookDisplay';

import type {
  CashBank,
  DayBookData,
  DayBookFilters,
  DayBookRow,
  SourceRef,
} from '../types/reports.types';

/** RPT-02 — the day book's page read, and the path its export fetches. */

interface DayBookRowWire {
  readonly id: string;
  readonly type: string;
  readonly void: boolean;
  readonly source: {
    readonly kind: SourceRef['kind'];
    readonly id: string;
    readonly party_id: string | null;
  };
  readonly date: string;
  readonly time: string;
  readonly recorded_on: string | null;
  readonly number: string | null;
  readonly party: { readonly id: string; readonly name: string } | null;
  readonly walk_in_name: string | null;
  readonly amount: string | null;
  readonly amount_due: string | null;
  readonly money_in: string | null;
  readonly money_out: string | null;
  readonly modes: readonly { readonly mode: PaymentMode; readonly amount: string }[];
  readonly note: string;
  readonly detail: string | null;
  readonly lines: number | null;
  readonly paid: boolean | null;
  readonly reference: string;
  readonly created_by: { readonly id: string; readonly name: string } | null;
  readonly cash_after?: string;
  readonly bank_after?: string;
}

interface DayBookWire {
  readonly data: {
    readonly rows: readonly DayBookRowWire[];
    readonly totals: {
      readonly count: Readonly<Record<string, number>>;
      readonly sales: string;
      readonly credit_notes: string;
      readonly purchases: string;
      readonly payments_in: string;
      readonly payments_out: string;
      readonly expenses: string;
      readonly money_in: string;
      readonly money_out: string;
    };
    readonly opening?: CashBank;
    readonly closing?: CashBank;
  };
  readonly meta: {
    readonly page: number;
    readonly page_size: number;
    readonly total: number;
    readonly total_pages: number;
    readonly balances_visible: boolean;
  };
}

const toRow = (row: DayBookRowWire): DayBookRow => ({
  id: row.id,
  type: row.type,
  void: row.void,
  source: { kind: row.source.kind, id: row.source.id, partyId: row.source.party_id },
  date: row.date,
  time: row.time,
  recordedOn: row.recorded_on,
  number: row.number,
  party: row.party,
  walkInName: row.walk_in_name,
  amount: row.amount,
  amountDue: row.amount_due,
  moneyIn: row.money_in,
  moneyOut: row.money_out,
  modes: row.modes,
  note: row.note ?? '',
  detail: row.detail,
  lines: row.lines,
  paid: row.paid,
  reference: row.reference ?? '',
  createdBy: row.created_by,
  ...(row.cash_after !== undefined ? { cashAfter: row.cash_after } : {}),
  ...(row.bank_after !== undefined ? { bankAfter: row.bank_after } : {}),
});

/** The server's parameters for a filter set — shared by the page and its file. */
const dayBookParams = (filters: DayBookFilters) => ({
  date_from: filters.dateFrom,
  date_to: filters.dateTo,
  type: filters.types.length ? typesForFilters(filters.types).join(',') : null,
  include_void: filters.includeVoid ? 'true' : null,
});

export const getDayBook = async (
  filters: DayBookFilters,
  signal?: AbortSignal
): Promise<DayBookData> => {
  const query = toQueryString({
    ...dayBookParams(filters),
    page: filters.page > 1 ? filters.page : null,
    page_size: DAY_BOOK_PAGE_SIZE,
  });
  const response = await api.get<DayBookWire>(
    `${API_PATHS.REPORT_DAY_BOOK}${query}`,
    ubConfig({ signal })
  );
  const { data, meta } = response.data;
  return {
    rows: data.rows.map(toRow),
    totals: {
      count: data.totals.count,
      sales: data.totals.sales,
      creditNotes: data.totals.credit_notes,
      purchases: data.totals.purchases,
      paymentsIn: data.totals.payments_in,
      paymentsOut: data.totals.payments_out,
      expenses: data.totals.expenses,
      moneyIn: data.totals.money_in,
      moneyOut: data.totals.money_out,
    },
    opening: data.opening ?? null,
    closing: data.closing ?? null,
    balancesVisible: meta.balances_visible,
    page: meta.page,
    pageSize: meta.page_size,
    total: meta.total,
    totalPages: meta.total_pages,
  };
};

/**
 * The file's request path: the same filters as the page and no paging —
 * RPT-08 BR-1, "the file is the screen". `ListExportButton` appends
 * `format=csv` and handles the 202 of a file over 5,000 rows.
 */
export const dayBookExportPath = (filters: DayBookFilters): string =>
  `${API_PATHS.REPORT_DAY_BOOK}${toQueryString(dayBookParams(filters))}`;
