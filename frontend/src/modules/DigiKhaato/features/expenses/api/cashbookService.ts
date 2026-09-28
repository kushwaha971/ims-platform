import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import type {
  CashBucket,
  CashbookData,
  CashbookFilters,
  CashDay,
  CashFigures,
  CashRow,
} from '../types/cashbook.types';

/** EXP-03 — the one read the cashbook screen makes. */

interface CashRowApi {
  readonly id: string;
  readonly source_type: string;
  readonly source_id: string;
  readonly date: string;
  readonly at: string;
  readonly direction: 'in' | 'out';
  readonly mode: CashRow['mode'];
  readonly upi_app: CashRow['upiApp'];
  readonly bucket: CashBucket;
  readonly amount: string;
  readonly party: CashRow['party'];
  readonly category: CashRow['category'];
  readonly number: string | null;
  readonly reference: string;
  readonly note: string;
  readonly running_after: CashFigures;
}

interface CashDayApi {
  readonly date: string;
  readonly opening: CashFigures;
  readonly in: CashFigures;
  readonly out: CashFigures;
  readonly closing: CashFigures;
  readonly voided_count: number;
  readonly rows: readonly CashRowApi[];
}

interface CashbookApiResponse {
  readonly data: {
    readonly range: {
      readonly date_from: string;
      readonly date_to: string;
      readonly opening: CashFigures;
      readonly in: CashFigures;
      readonly out: CashFigures;
      readonly closing: CashFigures;
    };
    readonly days: readonly CashDayApi[];
    readonly breakdown: { readonly by_category: CashbookData['byCategory'] };
    readonly buckets: readonly CashBucket[];
    readonly scope: CashbookData['scope'];
  };
}

const toRow = (row: CashRowApi): CashRow => ({
  id: row.id,
  sourceType: row.source_type,
  sourceId: row.source_id,
  date: row.date,
  at: row.at,
  direction: row.direction,
  mode: row.mode,
  upiApp: row.upi_app,
  bucket: row.bucket,
  amount: row.amount,
  party: row.party,
  category: row.category,
  number: row.number,
  reference: row.reference ?? '',
  note: row.note ?? '',
  runningAfter: row.running_after,
});

const toDay = (day: CashDayApi): CashDay => ({
  date: day.date,
  opening: day.opening,
  in: day.in,
  out: day.out,
  closing: day.closing,
  voidedCount: day.voided_count,
  rows: day.rows.map(toRow),
});

/**
 * A member scoped to today's till (FR-13) sends no parameters at all: the
 * server's default for them IS today and the cash bucket, and anything wider
 * is a 403 — so the request that cannot be refused is the one to send.
 */
export const getCashbook = async (
  filters: CashbookFilters | null,
  signal?: AbortSignal
): Promise<CashbookData> => {
  const query = filters
    ? toQueryString({
        date_from: filters.dateFrom,
        date_to: filters.dateTo,
        bucket: filters.bucket,
      })
    : '';
  const response = await api.get<CashbookApiResponse>(
    `${API_PATHS.CASHBOOK}${query}`,
    ubConfig({ signal })
  );
  const { data } = response.data;
  return {
    range: {
      dateFrom: data.range.date_from,
      dateTo: data.range.date_to,
      opening: data.range.opening,
      in: data.range.in,
      out: data.range.out,
      closing: data.range.closing,
    },
    days: data.days.map(toDay),
    byCategory: data.breakdown.by_category,
    buckets: data.buckets,
    scope: data.scope,
  };
};
