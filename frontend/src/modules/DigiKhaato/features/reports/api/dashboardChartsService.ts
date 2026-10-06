import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

/**
 * `GET /reports/dashboard/charts` — the dashboard's graphs for a range, grouped.
 *
 * Every block is OPTIONAL: the server leaves out what this reader may not read
 * (§10), and the screen draws only what arrived. An absent block is never
 * turned into zeros here.
 */
export type ChartRange =
  '7d' | '30d' | 'month' | 'last_month' | 'quarter' | 'fy' | 'last_fy' | '12m' | 'all' | 'custom';
export const CHART_RANGES: readonly ChartRange[] = [
  '7d',
  '30d',
  'month',
  'last_month',
  'quarter',
  'fy',
  'last_fy',
  '12m',
  'all',
  'custom',
];

export type ChartGroup = 'day' | 'week' | 'month' | 'year';
export const CHART_GROUPS: readonly ChartGroup[] = ['day', 'week', 'month', 'year'];

export type TrendMetric = 'sales' | 'purchases' | 'profit' | 'expenses';
export type TopBy = 'value' | 'qty';

/** The server's cap (`MAX_BUCKETS`): more bars than this is refused. */
export const MAX_BARS = 120;

export interface ChartQuery {
  readonly range: ChartRange;
  /** Null lets the server pick what suits the range. */
  readonly group: ChartGroup | null;
  readonly from: string | null;
  readonly to: string | null;
  readonly topBy: TopBy;
}

export interface SeriesBlock<K extends string> {
  readonly series: readonly K[];
  readonly points: readonly ({ readonly date: string } & Partial<Record<K, string>>)[];
  readonly totals: Partial<Record<K, string>>;
}

export interface RankedRow {
  readonly id: string;
  readonly name: string;
  readonly amount: string;
  readonly qty?: string;
  readonly unit?: string | null;
}

export interface DashboardCharts {
  readonly range: ChartRange;
  readonly group: ChartGroup;
  readonly from: string;
  readonly to: string;
  readonly trend?: SeriesBlock<TrendMetric>;
  /** Sale lines with no cost price, left out of profit. Present with `trend.profit`. */
  readonly uncostedLines?: number;
  readonly money?: SeriesBlock<'in' | 'out'>;
  readonly topItems?: readonly RankedRow[];
  readonly topCustomers?: readonly RankedRow[];
  readonly receivableAging?: readonly { readonly key: string; readonly amount: string }[];
}

interface ChartsWire {
  readonly data: {
    readonly range: ChartRange;
    readonly group: ChartGroup;
    readonly from: string;
    readonly to: string;
    readonly trend?: SeriesBlock<TrendMetric>;
    readonly uncosted_lines?: number;
    readonly money?: SeriesBlock<'in' | 'out'>;
    readonly top_items?: readonly RankedRow[];
    readonly top_customers?: readonly RankedRow[];
    readonly receivable_aging?: readonly { readonly key: string; readonly amount: string }[];
  };
}

export const getDashboardCharts = async (
  query: ChartQuery,
  signal?: AbortSignal
): Promise<DashboardCharts> => {
  const params = toQueryString({
    range: query.range,
    group: query.group,
    from: query.range === 'custom' ? query.from : null,
    to: query.range === 'custom' ? query.to : null,
    top_by: query.topBy === 'qty' ? 'qty' : null,
  });
  const response = await api.get<ChartsWire>(
    `${API_PATHS.REPORT_DASHBOARD_CHARTS}${params}`,
    ubConfig({ signal })
  );
  const data = response.data.data;
  return {
    range: data.range,
    group: data.group,
    from: data.from,
    to: data.to,
    trend: data.trend,
    uncostedLines: data.uncosted_lines,
    money: data.money,
    topItems: data.top_items,
    topCustomers: data.top_customers,
    receivableAging: data.receivable_aging,
  };
};

/** Bars a grouping would draw over `from`…`to` — to grey out a step that would be refused. */
export const barsFor = (from: string, to: string, group: ChartGroup): number => {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (group === 'day') return days;
  if (group === 'week') return Math.ceil((days + 6) / 7);
  const months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth()) +
    1;
  return group === 'month' ? months : end.getUTCFullYear() - start.getUTCFullYear() + 1;
};
