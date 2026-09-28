import { API_PATHS } from 'src/api/APIPaths';
import { absoluteApiUrl } from 'src/api/apiUrl';
import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import { AGING_BUCKETS } from '../types/aging.types';

import type {
  AgingAmounts,
  AgingFilters,
  AgingPage,
  AgingRow,
  LedgerSummary,
} from '../types/aging.types';

/**
 * Part 19 §19.3.4 — LED-09's two reads.
 *
 * Its own file rather than more functions in `ledgerService.ts`, for the reason
 * the statement has one: a file the khata page does not import is a file the
 * khata page does not download, and aging lives on its own route.
 */

interface AgingApiResponse {
  readonly data: readonly (Record<string, string> & {
    readonly party: { readonly id: string; readonly name: string };
  })[];
  readonly meta: {
    readonly totals: Record<string, string>;
    readonly as_of: string;
    readonly type: 'receivable' | 'payable';
    readonly cached_at: string | null;
    readonly page: number;
    readonly page_size: number;
    readonly total: number;
  };
}

/**
 * Read the four buckets and the total off a row or a totals object.
 *
 * Written once and used for both, because they are the same five keys — and
 * because a mapper that read four of them in one place and five in another is
 * how a totals row comes to disagree with the column above it.
 */
const toAmounts = (source: Record<string, string> | undefined): AgingAmounts => {
  const amounts: Record<string, string> = { total: source?.total ?? '0.00' };
  for (const bucket of AGING_BUCKETS) amounts[bucket] = source?.[bucket] ?? '0.00';
  return amounts as AgingAmounts;
};

export const getLedgerAging = async (
  filters: AgingFilters,
  signal?: AbortSignal
): Promise<AgingPage> => {
  const response = await api.get<AgingApiResponse>(
    `${API_PATHS.LEDGER_AGING}${toQueryString({
      type: filters.kind,
      as_of: filters.asOf || undefined,
      tag: filters.tag || undefined,
      ordering: filters.ordering || undefined,
      page: filters.page > 1 ? filters.page : undefined,
    })}`,
    ubConfig({ signal })
  );
  const { data, meta } = response.data;
  return {
    rows: data.map((row): AgingRow => ({
      partyId: row.party.id,
      partyName: row.party.name,
      amounts: toAmounts(row as unknown as Record<string, string>),
    })),
    totals: toAmounts(meta.totals),
    asOf: meta.as_of,
    kind: meta.type,
    cachedAt: meta.cached_at,
    page: meta.page,
    pageSize: meta.page_size,
    total: meta.total,
  };
};

export const getLedgerSummary = async (signal?: AbortSignal): Promise<LedgerSummary> => {
  const response = await api.get<{ data: LedgerSummary }>(
    API_PATHS.LEDGER_SUMMARY,
    ubConfig({ signal })
  );
  return { receivable: response.data.data.receivable, payable: response.data.data.payable };
};

/**
 * The export, as a browser download.
 *
 * A plain link rather than a fetch, for the reason the statement's export is:
 * the server streams it with a `Content-Disposition`, so nothing has to hold
 * the rows in memory. This function only composes the address.
 */
export const agingCsvUrl = (filters: AgingFilters): string => {
  const query = toQueryString({
    type: filters.kind,
    as_of: filters.asOf || undefined,
    tag: filters.tag || undefined,
    ordering: filters.ordering || undefined,
  });
  return absoluteApiUrl(`${API_PATHS.LEDGER_AGING}${query}${query ? '&' : '?'}format=csv`);
};

/**
 * RPT-05 FR-9 — the same view as the REPORT's file: FR-5's collection-sheet
 * columns (mobile, tags, collection date, oldest entry, last payment) and a
 * TOTAL row, from `/reports/receivables-aging` or `/payables-aging`. The
 * screen offers it when the reports module is on and the reader may read
 * reports; otherwise it keeps LED-09's own file above.
 */
export const agingReportCsvUrl = (filters: AgingFilters): string => {
  const query = toQueryString({
    as_of: filters.asOf || undefined,
    tag: filters.tag || undefined,
    ordering: filters.ordering || undefined,
    format: 'csv',
  });
  const path =
    filters.kind === 'payable'
      ? API_PATHS.REPORT_PAYABLES_AGING
      : API_PATHS.REPORT_RECEIVABLES_AGING;
  return absoluteApiUrl(`${path}${query}`);
};
