import { API_PATHS } from 'src/api/APIPaths';
import { itemPath, partyPath, ROUTES } from 'src/routes';
import { toQueryString } from 'src/utils/queryString';

import {
  PROFIT_DEFAULT_GROUP,
  PROFIT_DEFAULT_ORDERING,
  PROFIT_GROUPS,
  PROFIT_ORDERINGS,
} from '../constants/profitReportConstants';
import { REGISTER_DEFAULT_PRESET } from '../constants/taxReportConstants';

import { periodFromQuery, periodToQuery } from './taxPeriod';

import type {
  ProfitFilters,
  ProfitGroup,
  ProfitOrdering,
  ProfitRow,
  ProfitSortField,
} from '../types/profitReport.types';

/**
 * Shop item 1 — the profit report's filters live in the address bar, like the
 * registers', so "last quarter, by customer, losses first" is a link an owner
 * can send to the accountant. It opens on this month, by item, most profit first.
 */

const pick = <T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T =>
  raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;

export const profitFiltersFromQuery = (query: URLSearchParams, today: string): ProfitFilters => {
  const page = Number(query.get('page') ?? '1');
  return {
    ...periodFromQuery(query, today, REGISTER_DEFAULT_PRESET),
    group: pick(query.get('by'), PROFIT_GROUPS, PROFIT_DEFAULT_GROUP),
    ordering: pick(query.get('sort'), PROFIT_ORDERINGS, PROFIT_DEFAULT_ORDERING),
    q: (query.get('q') ?? '').trim(),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
};

export const profitQueryFromFilters = (filters: ProfitFilters): string => {
  const search = new URLSearchParams();
  periodToQuery(search, filters, REGISTER_DEFAULT_PRESET);
  if (filters.group !== PROFIT_DEFAULT_GROUP) search.set('by', filters.group);
  if (filters.ordering !== PROFIT_DEFAULT_ORDERING) search.set('sort', filters.ordering);
  if (filters.q) search.set('q', filters.q);
  if (filters.page > 1) search.set('page', String(filters.page));
  return search.toString();
};

/** The report's API path WITH its filters — what the page reads and the export sends. */
export const profitPath = (filters: ProfitFilters): string =>
  `${API_PATHS.REPORT_PROFIT}${toQueryString({
    group: filters.group,
    date_from: filters.dateFrom,
    date_to: filters.dateTo,
    ordering: filters.ordering,
    q: filters.q || null,
  })}`;

/** The grid's sort, read from and written to the one `ordering` the server takes. */
export const sortOf = (
  ordering: ProfitOrdering
): { readonly columnId: ProfitSortField; readonly direction: 'asc' | 'desc' } => ({
  columnId: ordering.replace(/^-/, '') as ProfitSortField,
  direction: ordering.startsWith('-') ? 'desc' : 'asc',
});

export const orderingOf = (columnId: string, direction: 'asc' | 'desc'): ProfitOrdering => {
  const field = pick<ProfitSortField>(
    columnId,
    ['profit', 'sale_value', 'margin', 'name'],
    'profit'
  );
  return direction === 'desc' ? `-${field}` : field;
};

/** Where a row opens: the item, the customer's khata or the bill. The catch-all row opens nothing. */
export const profitRowHref = (group: ProfitGroup, row: ProfitRow): string | null => {
  if (!row.id) return null;
  if (group === 'item') return itemPath(row.id);
  if (group === 'party') return partyPath(row.id);
  if (group === 'bill') return `${ROUTES.SALES_INVOICES}/${encodeURIComponent(row.id)}`;
  return null;
};

/** A loss is a figure the screen has to say out loud, not just print in red. */
export const isLoss = (amount: string | null): boolean => !!amount && amount.trim().startsWith('-');
