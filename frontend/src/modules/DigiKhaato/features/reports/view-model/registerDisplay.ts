import { API_PATHS } from 'src/api/APIPaths';
import { ROUTES } from 'src/routes';
import { toQueryString, type QueryValue } from 'src/utils/queryString';

import {
  ITC_FILTERS,
  PURCHASE_STATUSES_FOR,
  REGISTER_DEFAULT_PRESET,
  REGISTER_PARTY_FILTERS,
  REGISTER_STATUS_FILTERS,
  SALES_KIND_FILTERS,
  SALES_STATUSES_FOR,
} from '../constants/taxReportConstants';

import { periodFromQuery, periodToQuery } from './taxPeriod';

import type {
  GstQuery,
  RegisterBook,
  RegisterFilters,
  RegisterQuery,
  RegisterRow,
} from '../types/taxReports.types';

/**
 * RPT-03 / RPT-04 — the register's filters live in the address bar, so an
 * owner can send the accountant "September, B2B, credit notes" as a link, and
 * the GST summary can drill into the register with its grouping keys
 * (CR-RPT-2: `tax_code`, `inter_state`, `b2b`).
 */

const pick = <T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T =>
  raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;

const bool = (raw: string | null): boolean | null =>
  raw === 'true' ? true : raw === 'false' ? false : null;

export const registerFiltersFromQuery = (
  query: URLSearchParams,
  today: string
): RegisterFilters => {
  const period = periodFromQuery(query, today, REGISTER_DEFAULT_PRESET);
  const page = Number(query.get('page') ?? '1');
  return {
    ...period,
    level: query.get('level') === 'line' ? 'line' : 'document',
    status: pick(query.get('status'), REGISTER_STATUS_FILTERS, 'all'),
    party: pick(query.get('party'), REGISTER_PARTY_FILTERS, 'all'),
    kind: pick(query.get('kind'), SALES_KIND_FILTERS, 'all'),
    itc: pick(query.get('itc'), ITC_FILTERS, 'all'),
    includeVoid: query.get('void') === 'true',
    taxCode: query.get('tax_code') || null,
    interState: bool(query.get('inter_state')),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
};

export const registerQueryFromFilters = (filters: RegisterFilters): string => {
  const search = new URLSearchParams();
  periodToQuery(search, filters, REGISTER_DEFAULT_PRESET);
  if (filters.level === 'line') search.set('level', 'line');
  if (filters.status !== 'all') search.set('status', filters.status);
  if (filters.party !== 'all') search.set('party', filters.party);
  if (filters.kind !== 'all') search.set('kind', filters.kind);
  if (filters.itc !== 'all') search.set('itc', filters.itc);
  if (filters.includeVoid) search.set('void', 'true');
  if (filters.taxCode) search.set('tax_code', filters.taxCode);
  if (filters.interState !== null) search.set('inter_state', String(filters.interState));
  if (filters.page > 1) search.set('page', String(filters.page));
  return search.toString();
};

/** Whether anything beyond the period narrows the set (for the filtered-empty state). */
export const isRegisterNarrowed = (filters: RegisterFilters): boolean =>
  filters.status !== 'all' ||
  filters.party !== 'all' ||
  filters.kind !== 'all' ||
  filters.itc !== 'all' ||
  filters.taxCode !== null ||
  filters.interState !== null;

/** The server's parameter names (RPT-03 FR-1 / RPT-04 FR-1), shared by the page and the file. */
export const registerParams = (
  book: RegisterBook,
  filters: RegisterFilters
): Record<string, QueryValue> => ({
  date_from: filters.dateFrom,
  date_to: filters.dateTo,
  level: filters.level === 'line' ? 'line' : null,
  status: (book === 'sales' ? SALES_STATUSES_FOR : PURCHASE_STATUSES_FOR)[filters.status] || null,
  b2b: book === 'sales' && filters.party !== 'all' ? filters.party === 'b2b' : null,
  kind: book === 'sales' && filters.kind !== 'all' ? filters.kind : null,
  itc: book === 'purchase' && filters.itc !== 'all' ? filters.itc === 'eligible' : null,
  include_void: filters.includeVoid || null,
  tax_code: filters.taxCode,
  inter_state: filters.interState,
});

const isNegative = (value: string): boolean => value.trim().startsWith('-');

/** RPT-03 §8 — a credit note reads as one: negative, in the error tone, badged. */
export const isCreditRow = (row: RegisterRow): boolean =>
  row.kind === 'credit_note' || isNegative(row.grandTotal || row.taxableValue);

export const isVoidRow = (row: RegisterRow): boolean => row.status === 'void';

/**
 * Where a row opens (FR "Row click → document detail"). A credit note has its
 * own route (SAL-04); every other sales kind opens the invoice.
 */
export const documentHref = (book: RegisterBook, row: RegisterRow): string => {
  const id = encodeURIComponent(row.documentId);
  if (book === 'purchase') return `${ROUTES.PURCHASE_BILLS}/${id}`;
  return row.kind === 'credit_note'
    ? `${ROUTES.SALES_CREDIT_NOTES}/${id}`
    : `${ROUTES.SALES_INVOICES}/${id}`;
};

const REGISTER_PATH: Readonly<Record<RegisterBook, string>> = {
  sales: API_PATHS.REPORT_SALES_REGISTER,
  purchase: API_PATHS.REPORT_PURCHASE_REGISTER,
};

/** The register's path WITH its filters — what the page reads and the export sends. */
export const registerPath = (query: RegisterQuery): string =>
  `${REGISTER_PATH[query.book]}${toQueryString(registerParams(query.book, query.filters))}`;

/** The GST summary's path — the same one the ZIP export appends `format=csv` to. */
export const gstPath = (query: GstQuery): string =>
  `${API_PATHS.REPORT_GST_SUMMARY}${toQueryString({
    date_from: query.dateFrom,
    date_to: query.dateTo,
    rounding: query.rounding === 'rupee' ? 'rupee' : null,
  })}`;
