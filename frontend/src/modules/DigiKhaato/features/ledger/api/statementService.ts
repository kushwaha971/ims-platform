import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import type {
  StatementFilters,
  StatementPage,
  StatementRow,
  StatementRowApi,
} from '../types/statement.types';

/**
 * Part 19 §19.3.4 — LED-04's endpoint, and nothing else.
 *
 * Its own service file rather than three more functions in `ledgerService.ts`,
 * because the statement has its own response shape, its own query parameters
 * and — the reason that matters for the bundle — its own ROUTE. A file the
 * khata page does not import is a file the khata page does not download.
 */

interface StatementApiResponse {
  readonly data: {
    readonly party: { readonly id: string; readonly name: string; readonly mobile_masked: string | null };
    readonly period: { readonly from: string | null; readonly to: string | null };
    readonly opening_balance: string;
    readonly closing_balance: string;
    readonly totals: { readonly debit: string; readonly credit: string };
    readonly has_entries_before_opening: boolean;
    readonly rows: readonly StatementRowApi[];
  };
  readonly meta?: { readonly next_cursor: string | null; readonly has_more: boolean };
}

const toRow = (row: StatementRowApi): StatementRow => ({
  id: row.id,
  entryDate: row.entry_date,
  entryType: row.entry_type,
  direction: row.direction,
  // Money stays a string all the way through (R-TS-7), and `running_balance`
  // is the one that would hurt most: it is a cumulative figure, so a rounding
  // error introduced by a `Number()` here compounds down the page.
  amount: row.amount,
  note: row.note ?? '',
  status: row.status,
  runningBalance: row.running_balance,
  source: row.source ? { type: row.source.type, id: row.source.id, number: row.source.number } : null,
  reversesId: row.reverses_id,
  supersedesId: row.supersedes_id,
  reason: row.reason,
});

/**
 * The query the server takes.
 *
 * `preset` is deliberately NOT sent. It is what the merchant chose; the dates
 * are what it resolved to, and resolving a preset twice — once on a device set
 * to UTC and once in the tenant's timezone — is how "This month" returns
 * thirty-one days on the first of the month.
 *
 * `include_corrections` is sent only when true, so the ordinary request stays
 * the ordinary URL. The server's parameter is LED-04's spelling;
 * `/ledger-entries` keeps LED-03's `include_reversed` for the same predicate,
 * which is a wart the FRDs created and renaming either now would compound.
 */
const toQuery = (
  filters: StatementFilters,
  extra: { readonly cursor?: string | null; readonly limit?: number } = {}
): string =>
  toQueryString({
    date_from: filters.dateFrom || undefined,
    date_to: filters.dateTo || undefined,
    include_corrections: filters.includeCorrections ? 'true' : undefined,
    cursor: extra.cursor || undefined,
    limit: extra.limit || undefined,
  });

export const getStatement = async (
  partyId: string,
  filters: StatementFilters,
  extra: { readonly cursor?: string | null; readonly limit?: number } = {},
  signal?: AbortSignal
): Promise<StatementPage> => {
  const response = await api.get<StatementApiResponse>(
    `${API_PATHS.PARTY_STATEMENT(partyId)}${toQuery(filters, extra)}`,
    ubConfig({ signal })
  );
  const { data, meta } = response.data;
  return {
    party: { id: data.party.id, name: data.party.name, mobileMasked: data.party.mobile_masked },
    period: data.period,
    summary: {
      openingBalance: data.opening_balance,
      closingBalance: data.closing_balance,
      totalDebit: data.totals.debit,
      totalCredit: data.totals.credit,
      hasEntriesBeforeOpening: data.has_entries_before_opening,
    },
    rows: data.rows.map(toRow),
    nextCursor: meta?.next_cursor ?? null,
    hasMore: Boolean(meta?.has_more),
  };
};

/**
 * FR-10 — the CSV, as a browser download.
 *
 * A plain link rather than a fetch, and that is the whole design: the server
 * streams it with a `Content-Disposition`, so the browser saves it without the
 * client ever holding five thousand rows in memory. Building a blob would undo
 * the streaming the endpoint was written for.
 *
 * It carries no `Idempotency-Key` and no body; it is a GET, and the only thing
 * this function does is compose the address.
 */
export const statementCsvUrl = (partyId: string, filters: StatementFilters): string =>
  `${API_PATHS.PARTY_STATEMENT(partyId)}${toQuery(filters)}${
    toQuery(filters) ? '&' : '?'
  }format=csv`;
