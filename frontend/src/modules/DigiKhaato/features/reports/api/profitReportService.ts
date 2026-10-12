import { api, ubConfig } from 'src/api/AxiosInstances';

import { profitPath } from '../view-model/profitDisplay';

import type {
  ProfitFilters,
  ProfitPage,
  ProfitRow,
  ProfitTotals,
} from '../types/profitReport.types';

/**
 * Part 19 §19.3.4 — `GET /reports/profit`: the snake ⇄ camel mapping and
 * nothing else. Money stays a string.
 */

type Wire = Record<string, unknown>;
const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const sn = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : String(v);
const n = (v: unknown): number => Number(v ?? 0) || 0;

const toRow = (row: Wire): ProfitRow => {
  const party = row.party as Wire | null | undefined;
  return {
    id: sn(row.id),
    name: sn(row.name),
    qty: sn(row.qty),
    unit: sn(row.unit),
    date: sn(row.date),
    party: party ? { id: s(party.id), name: s(party.name) } : null,
    bills: n(row.bills),
    saleValue: s(row.sale_value),
    cost: sn(row.cost),
    profit: sn(row.profit),
    marginPct: sn(row.margin_pct),
    uncostedLines: n(row.uncosted_lines),
  };
};

const toTotals = (raw: Wire): ProfitTotals => ({
  bills: n(raw.bills),
  saleValue: s(raw.sale_value),
  cost: sn(raw.cost),
  profit: sn(raw.profit),
  marginPct: sn(raw.margin_pct),
  uncostedLines: n(raw.uncosted_lines),
  expenses: sn(raw.expenses),
  netProfit: sn(raw.net_profit),
});

export const getProfitReport = async (
  filters: ProfitFilters,
  signal?: AbortSignal
): Promise<ProfitPage> => {
  const path = profitPath(filters);
  const separator = path.includes('?') ? '&' : '?';
  const response = await api.get<{ data: Wire[]; meta: Wire }>(
    `${path}${separator}page=${filters.page}`,
    ubConfig({ signal })
  );
  const { data, meta } = response.data;
  return {
    rows: data.map(toRow),
    totals: toTotals((meta.totals ?? {}) as Wire),
    page: n(meta.page),
    pageSize: n(meta.page_size),
    total: n(meta.total),
    ...(typeof meta.has_any === 'boolean' ? { hasAny: meta.has_any } : {}),
  };
};
