'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  UbButton,
  UbChoiceChips,
  UbFilterSelect,
  UbGrid,
  UbPeriodSelect,
  UbSkeleton,
  UbStack,
  UbText,
  isoToday,
} from 'src/design-system';
import {
  UbAgingBars,
  UbChartCard,
  UbGroupedBars,
  UbRankedBars,
  type UbGroupedBarsGroup,
} from 'src/design-system/charts';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation, type TranslateFn } from 'src/hooks/useTranslation';
import { selectLocale } from 'src/redux/slice/localeSlice';
import type { ApiErrorShape } from 'src/types/api.types';
import { flattenErrorDetails } from 'src/utils/errorDetails';
import { formatInr } from 'src/utils/money';

import {
  CHART_GROUPS,
  CHART_RANGES,
  MAX_BARS,
  barsFor,
  getDashboardCharts,
  type ChartGroup,
  type ChartQuery,
  type ChartRange,
  type DashboardCharts as Charts,
  type RankedRow,
  type SeriesBlock,
  type TopBy,
  type TrendMetric,
} from '../api/dashboardChartsService';

/**
 * The dashboard's graphs (owner, 6 Oct 2026: "see how on dashboard that
 * competitors showing graph, want that as well", then "via graph user able to
 * see sales, profit, purchase, based on day, monthly, week, year, all time").
 *
 * The competitors' pattern, which this follows: one RANGE (7 days … this
 * financial year … all time, or a custom from–to) and one GROUPING (day, week,
 * month, year) drive every chart; the main chart lets the owner pick WHAT to
 * compare (sales, purchases, profit, expenses — up to three at once); every
 * chart has a table view. A grouping that would draw more bars than a phone can
 * hold is greyed out rather than refused after the tap. Blocks the reader may
 * not read never arrive, so they are not drawn — never drawn as zeros.
 *
 * Loaded with `dynamic()` from the dashboard, so the tiles paint first.
 */
type Load =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly message: string | null }
  | { readonly status: 'ready'; readonly charts: Charts };

const TREND_METRICS: readonly TrendMetric[] = ['sales', 'purchases', 'profit', 'expenses'];
const DEFAULT_METRICS: readonly TrendMetric[] = ['sales', 'purchases'];
const MAX_METRICS = 3;

const intlLocale = (locale: string): string => (locale === 'hi' ? 'hi-IN' : 'en-IN');

/** Axis ticks and tooltip headings, in the reader's language. */
export const groupLabels = (
  date: string,
  group: ChartGroup,
  locale: string,
  t?: TranslateFn
): { label: string; longLabel: string } => {
  const day = new Date(`${date}T00:00:00`);
  const lang = intlLocale(locale);
  const fmt = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(lang, options).format(day);
  if (group === 'year')
    return { label: fmt({ year: 'numeric' }), longLabel: fmt({ year: 'numeric' }) };
  if (group === 'month') {
    return { label: fmt({ month: 'short' }), longLabel: fmt({ month: 'long', year: 'numeric' }) };
  }
  if (group === 'week') {
    const start = fmt({ day: 'numeric', month: 'short' });
    return {
      label: fmt({ day: '2-digit', month: '2-digit' }),
      longLabel: t ? t('reports.charts.weekOf', { date: start }) : start,
    };
  }
  return {
    label: fmt({ day: '2-digit', month: '2-digit' }),
    longLabel: fmt({ weekday: 'short', day: 'numeric', month: 'short' }),
  };
};

/** The server's message for the control it names, if the read was refused. */
const refusal = (error: unknown): string | null => {
  const shape = error as Partial<ApiErrorShape> | null;
  if (!shape || shape.status !== 400) return null;
  return flattenErrorDetails(shape.details)[0]?.message ?? shape.message ?? null;
};

export function DashboardCharts({
  refreshKey,
}: Readonly<{ refreshKey?: string }>): React.JSX.Element | null {
  const { t } = useTranslation();
  const locale = useAppSelector(selectLocale);
  const today = isoToday();
  const [query, setQuery] = useState<ChartQuery>({
    range: '7d',
    group: null,
    from: null,
    to: null,
    topBy: 'value',
  });
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [metrics, setMetrics] = useState<readonly TrendMetric[]>(DEFAULT_METRICS);
  /** The range's real dates, from the last answer — what greys a grouping out. */
  const [span, setSpan] = useState<{ from: string; to: string } | null>(null);

  const waiting = query.range === 'custom' && (!query.from || !query.to);
  useEffect(() => {
    if (waiting) return undefined;
    const controller = new AbortController();
    getDashboardCharts(query, controller.signal)
      .then((charts) => {
        setLoad({ status: 'ready', charts });
        setSpan({ from: charts.from, to: charts.to });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoad({ status: 'failed', message: refusal(error) });
      });
    return () => controller.abort();
  }, [query, attempt, refreshKey, waiting]);

  const update = (patch: Partial<ChartQuery>) => {
    setLoad({ status: 'loading' });
    setQuery((current) => ({ ...current, ...patch }));
  };

  const rangeDates =
    query.range === 'custom' && query.from && query.to ? { from: query.from, to: query.to } : span;
  const presets = useMemo(
    () => CHART_RANGES.map((value) => ({ value, label: t(`reports.charts.range.${value}`) })),
    [t]
  );
  const viewLabels = useMemo(
    () => ({ chart: t('reports.charts.view.chart'), table: t('reports.charts.view.table') }),
    [t]
  );

  const charts = load.status === 'ready' ? load.charts : null;
  const nothing =
    charts &&
    !charts.trend &&
    !charts.money &&
    !charts.topItems &&
    !charts.topCustomers &&
    !charts.receivableAging;
  if (nothing) return null;
  const activeGroup = query.group ?? charts?.group ?? null;
  const rangeLabel = t(`reports.charts.range.${query.range}`);

  return (
    <UbStack gap={3} data-testid="dashboard-charts">
      {/* One row: the title, then the two dropdowns the owner approved in
          place of two rows of chips — the period, and what each bar covers. */}
      <UbStack direction="row" align="center" gap={2} className="flex-wrap">
        <UbText as="h2" variant="h3" className="mr-auto">
          {t('reports.charts.title')}
        </UbText>
        <UbPeriodSelect<ChartRange>
          presets={presets}
          value={query.range}
          customValue="custom"
          from={query.from}
          to={query.to}
          max={today}
          locale={locale}
          onChange={(range, from, to) => update({ range, from, to, group: null })}
          labels={{
            period: t('reports.charts.range.label'),
            from: t('reports.charts.from'),
            to: t('reports.charts.to'),
            apply: t('reports.charts.apply'),
            close: t('common.action.close'),
          }}
        />
        <UbFilterSelect
          spec={{
            kind: 'single',
            key: 'group',
            label: t('reports.charts.group.label'),
            options: CHART_GROUPS.map((group) => {
              const tooMany = rangeDates
                ? barsFor(rangeDates.from, rangeDates.to, group) > MAX_BARS
                : false;
              return {
                value: group,
                label: t(`reports.charts.group.${group}`),
                disabled: tooMany,
                hint: tooMany ? t('reports.charts.group.tooMany') : undefined,
              };
            }),
          }}
          value={activeGroup ?? ''}
          onChange={(group) => update({ group: group as ChartGroup })}
          closeLabel={t('common.action.close')}
        />
      </UbStack>

      {waiting && (
        <UbText variant="body-sm" tone="secondary">
          {t('reports.charts.pickDates')}
        </UbText>
      )}
      {!waiting && load.status === 'loading' && <UbSkeleton variant="card" />}
      {!waiting && load.status === 'failed' && (
        <UbStack direction="row" align="center" gap={2} className="flex-wrap">
          <UbText variant="body-sm" tone={load.message ? 'error' : 'secondary'} role="alert">
            {load.message ?? t('reports.charts.failed')}
          </UbText>
          {!load.message && (
            <UbButton
              size="sm"
              variant="secondary"
              onClick={() => {
                setLoad({ status: 'loading' });
                setAttempt((n) => n + 1);
              }}
            >
              {t('reports.charts.retry')}
            </UbButton>
          )}
        </UbStack>
      )}
      {!waiting && charts && (
        <UbGrid columns={{ base: 1, lg: 2 }} gap={4}>
          {charts.trend && (
            <TrendCard
              block={charts.trend}
              uncosted={charts.uncostedLines ?? 0}
              metrics={metrics}
              onMetrics={setMetrics}
              group={charts.group}
              rangeLabel={rangeLabel}
              locale={locale}
              viewLabels={viewLabels}
              t={t}
            />
          )}
          {charts.money && (
            <SeriesCard
              id="money"
              title={t('reports.charts.money.title')}
              block={charts.money}
              keys={charts.money.series}
              names={{ in: t('reports.charts.money.in'), out: t('reports.charts.money.out') }}
              group={charts.group}
              rangeLabel={rangeLabel}
              locale={locale}
              viewLabels={viewLabels}
              t={t}
            />
          )}
          {charts.topItems && (
            <RankedCard
              title={t('reports.charts.topItems.title')}
              description={t(
                query.topBy === 'qty'
                  ? 'reports.charts.topItems.hintQty'
                  : 'reports.charts.topItems.hint'
              )}
              empty={t('reports.charts.topItems.empty')}
              rows={charts.topItems}
              nameLabel={t('reports.charts.topItems.item')}
              byQty={query.topBy === 'qty'}
              onTopBy={(topBy) => update({ topBy })}
              viewLabels={viewLabels}
              t={t}
            />
          )}
          {charts.topCustomers && (
            <RankedCard
              title={t('reports.charts.topCustomers.title')}
              description={t('reports.charts.topCustomers.hint')}
              empty={t('reports.charts.topCustomers.empty')}
              rows={charts.topCustomers}
              nameLabel={t('reports.charts.topCustomers.customer')}
              viewLabels={viewLabels}
              t={t}
            />
          )}
          {charts.receivableAging && (
            <AgingCard
              rows={charts.receivableAging}
              asOf={charts.to}
              locale={locale}
              viewLabels={viewLabels}
              t={t}
            />
          )}
        </UbGrid>
      )}
    </UbStack>
  );
}

type ViewLabels = { readonly chart: string; readonly table: string };

/** Sales, purchases, profit, expenses — the owner picks up to three to compare. */
function TrendCard({
  block,
  uncosted,
  metrics,
  onMetrics,
  group,
  rangeLabel,
  locale,
  viewLabels,
  t,
}: Readonly<{
  block: SeriesBlock<TrendMetric>;
  uncosted: number;
  metrics: readonly TrendMetric[];
  onMetrics: (next: readonly TrendMetric[]) => void;
  group: ChartGroup;
  rangeLabel: string;
  locale: string;
  viewLabels: ViewLabels;
  t: TranslateFn;
}>): React.JSX.Element {
  const available = TREND_METRICS.filter((metric) => block.series.includes(metric));
  const chosen = available.filter((metric) => metrics.includes(metric));
  const shown = chosen.length > 0 ? chosen : available.slice(0, 1);
  const names = Object.fromEntries(
    TREND_METRICS.map((metric) => [metric, t(`reports.charts.trend.${metric}`)])
  ) as Record<TrendMetric, string>;
  return (
    <SeriesCard
      id="trend"
      title={t('reports.charts.trend.title')}
      block={block}
      keys={available}
      visible={shown}
      onToggle={(metric) =>
        onMetrics(
          shown.includes(metric)
            ? shown.filter((m) => m !== metric)
            : [...shown, metric].slice(-MAX_METRICS)
        )
      }
      names={names}
      group={group}
      rangeLabel={rangeLabel}
      locale={locale}
      viewLabels={viewLabels}
      t={t}
      note={
        shown.includes('profit') && uncosted > 0
          ? t('reports.charts.trend.uncosted', { count: uncosted })
          : undefined
      }
    />
  );
}

function SeriesCard<K extends string>({
  id,
  title,
  block,
  keys,
  visible = keys,
  onToggle,
  names,
  group,
  rangeLabel,
  locale,
  viewLabels,
  t,
  note,
}: Readonly<{
  id: string;
  title: string;
  block: SeriesBlock<K>;
  /** Every series the reader may show, in legend order. */
  keys: readonly K[];
  /** The ones drawn; with `onToggle` the legend shows and hides them. */
  visible?: readonly K[];
  onToggle?: (key: K) => void;
  names: Readonly<Record<K, string>>;
  group: ChartGroup;
  rangeLabel: string;
  locale: string;
  viewLabels: ViewLabels;
  t: TranslateFn;
  note?: string;
}>): React.JSX.Element {
  const series = keys.map((key) => ({ key, label: names[key] }));
  const groups: UbGroupedBarsGroup[] = block.points.map((point) => ({
    key: point.date,
    ...groupLabels(point.date, group, locale, t),
    values: keys.map((key) => point[key] ?? '0.00'),
  }));
  const drawn = keys.filter((key) => visible.includes(key));
  const totals = drawn
    .map((key) => `${names[key]} ${formatInr(block.totals[key] ?? '0.00')}`)
    .join(' · ');
  return (
    <UbChartCard
      title={title}
      description={t('reports.charts.totals', { range: rangeLabel, totals })}
      viewLabels={viewLabels}
      table={{
        caption: title,
        columns: [
          { key: 'when', label: t('reports.charts.when') },
          ...drawn.map((key) => ({ key, label: names[key], numeric: true })),
        ],
        rows: block.points.map((point, index) => ({
          key: point.date,
          cells: [
            groups[index]?.longLabel ?? point.date,
            ...drawn.map((key) => formatInr(point[key] ?? '0.00')),
          ],
        })),
      }}
    >
      {(a11y) => (
        <UbStack gap={2}>
          <UbGroupedBars
            series={series}
            visible={drawn}
            onToggle={onToggle ? (key) => onToggle(key as K) : undefined}
            toggleLabel={(name, shown) =>
              t(shown ? 'reports.charts.legend.hide' : 'reports.charts.legend.show', {
                series: name,
              })
            }
            groups={groups}
            labelledBy={a11y.labelledBy}
            describedBy={a11y.describedBy}
            className={`dashboard-chart-${id}`}
          />
          {note && (
            <UbText variant="caption" tone="tertiary">
              {note}
            </UbText>
          )}
        </UbStack>
      )}
    </UbChartCard>
  );
}

function RankedCard({
  title,
  description,
  empty,
  rows,
  nameLabel,
  byQty = false,
  onTopBy,
  viewLabels,
  t,
}: Readonly<{
  title: string;
  description: string;
  empty: string;
  rows: readonly RankedRow[];
  nameLabel: string;
  byQty?: boolean;
  onTopBy?: (next: TopBy) => void;
  viewLabels: ViewLabels;
  t: TranslateFn;
}>): React.JSX.Element {
  const figure = (row: RankedRow): string =>
    byQty
      ? `${Number(row.qty ?? 0).toLocaleString('en-IN')} ${row.unit ?? ''}`.trim()
      : formatInr(row.amount);
  const plotted = byQty ? rows.map((row) => ({ ...row, amount: row.qty ?? '0' })) : rows;
  return (
    <UbChartCard
      title={title}
      description={description}
      viewLabels={viewLabels}
      table={{
        caption: title,
        columns: [
          { key: 'name', label: nameLabel },
          {
            key: 'amount',
            label: t(byQty ? 'reports.charts.quantity' : 'reports.charts.amount'),
            numeric: true,
          },
        ],
        rows: rows.map((row) => ({ key: row.id, cells: [row.name, figure(row)] })),
      }}
    >
      {(a11y) => (
        <UbStack gap={2}>
          {onTopBy && (
            <UbChoiceChips<TopBy>
              ariaLabel={t('reports.charts.topItems.by')}
              value={byQty ? 'qty' : 'value'}
              options={[
                { value: 'value', label: t('reports.charts.topItems.byValue') },
                { value: 'qty', label: t('reports.charts.topItems.byQty') },
              ]}
              onChange={onTopBy}
            />
          )}
          {rows.length === 0 ? (
            <UbText variant="body-sm" tone="tertiary" className="py-6 text-center">
              {empty}
            </UbText>
          ) : (
            <UbRankedBars
              parties={plotted}
              formatValue={(party) =>
                figure(rows.find((row) => row.id === party.id) ?? (party as RankedRow))
              }
              labelledBy={a11y.labelledBy}
              describedBy={a11y.describedBy}
            />
          )}
        </UbStack>
      )}
    </UbChartCard>
  );
}

function AgingCard({
  rows,
  asOf,
  locale,
  viewLabels,
  t,
}: Readonly<{
  rows: readonly { readonly key: string; readonly amount: string }[];
  asOf: string;
  locale: string;
  viewLabels: ViewLabels;
  t: TranslateFn;
}>): React.JSX.Element {
  const buckets = rows.map((row) => ({
    key: row.key,
    label: t(`ledger.aging.bucket.${row.key}`),
    amount: row.amount,
  }));
  const title = t('reports.charts.aging.title');
  const date = new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${asOf}T00:00:00`));
  return (
    <UbChartCard
      title={title}
      description={t('reports.charts.aging.hint', { date })}
      viewLabels={viewLabels}
      table={{
        caption: title,
        columns: [
          { key: 'age', label: t('reports.charts.aging.age') },
          { key: 'amount', label: t('reports.charts.amount'), numeric: true },
        ],
        rows: buckets.map((bucket) => ({
          key: bucket.key,
          cells: [bucket.label, formatInr(bucket.amount)],
        })),
      }}
    >
      {(a11y) => (
        <UbAgingBars
          buckets={buckets}
          labelledBy={a11y.labelledBy}
          describedBy={a11y.describedBy}
        />
      )}
    </UbChartCard>
  );
}
