'use client';

import { UbCard, UbDivider, UbProgress, UbStack, UbText } from 'src/design-system';
import {
  UB_RANKED_BARS_CAP,
  UbAgingBars,
  UbChartCard,
  UbChartGrid,
  UbRankedBars,
  UbStatCard,
  UbStatGrid,
  UbTrendArea,
  type UbAgingBucket,
  type UbRankedParty,
  type UbTrendPoint,
} from 'src/design-system/charts';
import { formatInr } from 'src/utils/money';

/**
 * Part 23 §23.4 — the chart and stat-tile layer in the live gallery.
 *
 * Storybook is not a dependency (ADR-021), so this is where a reviewer sees the
 * three approved chart forms, the stat tile in every tone, and the responsive
 * policy that decides how many charts a width gets.
 *
 * **Every figure below is INVENTED.** It is shaped like a real kirana shop's
 * ledger — Indian digit grouping, dd/mm/yyyy dates, party names a shopkeeper
 * would recognise — so that the components are reviewed against the data they
 * will actually carry. `/dashboard` is a documented redirect to `/parties` and
 * RPT-01 lands in Sprint 11; nothing here is wired to an endpoint.
 *
 * Literal strings rather than `t()` are deliberate here and only here: the
 * gallery is developer chrome, not product (§23.2.2).
 */

/** Example: what the shop is owed, by how long it has been owed. */
const AGING: readonly UbAgingBucket[] = [
  { key: '0_30', label: '0–30 days', amount: '42000.00' },
  { key: '31_60', label: '31–60 days', amount: '18500.00' },
  { key: '61_90', label: '61–90 days', amount: '9250.00' },
  { key: '90_plus', label: '90+ days', amount: '31000.00' },
];

/** Example: money actually received, week by week. */
const COLLECTIONS: readonly UbTrendPoint[] = [
  { date: '2026-08-03', amount: '18400.00' },
  { date: '2026-08-10', amount: '22750.00' },
  { date: '2026-08-17', amount: '15300.00' },
  { date: '2026-08-24', amount: '27900.00' },
  { date: '2026-08-31', amount: '21050.00' },
  { date: '2026-09-07', amount: '33600.00' },
  { date: '2026-09-14', amount: '19850.00' },
  { date: '2026-09-21', amount: '41200.00' },
];

/** Example: twelve parties owe money; five of them are most of it. */
const DEBTORS: readonly UbRankedParty[] = [
  { id: 'pty-1', name: 'Rajesh Traders', amount: '32400.00' },
  { id: 'pty-2', name: 'Shree Balaji Kirana Stores', amount: '21150.00' },
  { id: 'pty-3', name: 'Meenakshi Provision Store', amount: '15800.00' },
  { id: 'pty-4', name: 'Gupta Electricals & Hardware', amount: '11300.00' },
  { id: 'pty-5', name: 'Annapurna Sweets', amount: '8900.00' },
  { id: 'pty-6', name: 'Nakoda Cloth House', amount: '4250.00' },
  { id: 'pty-7', name: 'Vaibhav Mobile Point', amount: '3100.00' },
  { id: 'pty-8', name: 'Chaudhary General Store', amount: '2200.00' },
  { id: 'pty-9', name: 'Lakshmi Steel & Cement', amount: '1650.00' },
];

const AGING_TABLE = {
  caption: 'Receivables by age — example data',
  columns: [
    { key: 'bucket', label: 'Age' },
    { key: 'amount', label: 'Amount', numeric: true },
  ],
  rows: AGING.map((bucket) => ({
    key: bucket.key,
    cells: [bucket.label, formatInr(bucket.amount)],
  })),
};

const COLLECTIONS_TABLE = {
  caption: 'Collections by week — example data',
  columns: [
    { key: 'week', label: 'Week starting' },
    { key: 'amount', label: 'Collected', numeric: true },
  ],
  rows: COLLECTIONS.map((point) => ({
    key: point.date,
    cells: [
      `${point.date.slice(8, 10)}/${point.date.slice(5, 7)}/${point.date.slice(0, 4)}`,
      formatInr(point.amount),
    ],
  })),
};

const DEBTORS_TABLE = {
  caption: 'Every party that owes money — example data',
  columns: [
    { key: 'party', label: 'Customer' },
    { key: 'amount', label: 'Owes', numeric: true },
  ],
  rows: DEBTORS.map((party) => ({
    key: party.id,
    cells: [party.name, formatInr(party.amount)],
  })),
};

const VIEW_LABELS = { chart: 'Chart', table: 'Table' };
const DEBTORS_OVERFLOW = DEBTORS.length - UB_RANKED_BARS_CAP;

export function DesignSystemChartsGallery(): React.JSX.Element {
  return (
    <UbStack gap={6}>
      <UbCard
        title="UbStatCard · UbStatGrid"
        description="§23.4 — a single current value is a tile, never a one-bar bar chart. Six of RPT-01's seven tiles are these. Example data."
      >
        <UbStatGrid>
          <UbStatCard
            label="To collect"
            value={formatInr('100750.00')}
            tone="danger"
            delta={{ value: '+8%', direction: 'up', baseline: 'vs last month', tone: 'bad' }}
          />
          <UbStatCard
            label="To pay"
            value={formatInr('38900.00')}
            tone="success"
            delta={{ value: '−4%', direction: 'down', baseline: 'vs last month', tone: 'good' }}
          />
          <UbStatCard label="Overdue" value={formatInr('31000.00')} tone="danger" />
          <UbStatCard label="Cash in hand" value={formatInr('12480.00')} />
          <UbStatCard
            label="Today's sales"
            value={formatInr('8650.00')}
            delta={{ value: '0%', direction: 'flat', baseline: 'vs yesterday' }}
          />
          <UbStatCard label="Low stock" value="7 items" tone="warning" />
        </UbStatGrid>
        <UbDivider decorative className="my-5" />
        <UbStack gap={2}>
          <UbText variant="body-sm-medium">A ratio against a limit is a meter, not a donut</UbText>
          <UbText variant="caption" tone="tertiary">
            Plan usage — `UbProgress`. Pies, donuts and gauges are banned product-wide.
          </UbText>
          <UbProgress used={4} limit={5} ariaLabel="Team members used" />
        </UbStack>
      </UbCard>

      <UbChartCard
        title="Receivables aging"
        description="What you are owed, by how long it has been owed. Example data."
        table={AGING_TABLE}
        viewLabels={VIEW_LABELS}
      >
        {(a11y) => (
          <UbAgingBars
            buckets={AGING}
            labelledBy={a11y.labelledBy}
            describedBy={a11y.describedBy}
          />
        )}
      </UbChartCard>

      <UbChartCard
        title="Collections over time"
        description="Money actually received, week by week. Example data."
        table={COLLECTIONS_TABLE}
        viewLabels={VIEW_LABELS}
      >
        {(a11y) => (
          <UbTrendArea
            points={COLLECTIONS}
            labelledBy={a11y.labelledBy}
            describedBy={a11y.describedBy}
          />
        )}
      </UbChartCard>

      <UbChartCard
        title="Who owes most"
        description="The five biggest balances. Example data."
        table={DEBTORS_TABLE}
        viewLabels={VIEW_LABELS}
      >
        {(a11y) => (
          <UbRankedBars
            parties={DEBTORS}
            labelledBy={a11y.labelledBy}
            describedBy={a11y.describedBy}
            moreLabel={`and ${DEBTORS_OVERFLOW} more`}
          />
        )}
      </UbChartCard>

      <UbCard
        title="UbChartGrid"
        description="The responsive policy: one chart at 360 (aging only), two at 768, all three on a 12-column grid at 1024. Narrow the window to see it. Example data."
      >
        <UbChartGrid
          aging={
            <UbChartCard
              title="Receivables aging"
              description="Example data."
              table={AGING_TABLE}
              viewLabels={VIEW_LABELS}
            >
              {(a11y) => (
                <UbAgingBars
                  buckets={AGING}
                  labelledBy={a11y.labelledBy}
                  describedBy={a11y.describedBy}
                />
              )}
            </UbChartCard>
          }
          trend={
            <UbChartCard
              title="Collections over time"
              description="Example data."
              table={COLLECTIONS_TABLE}
              viewLabels={VIEW_LABELS}
            >
              {(a11y) => (
                <UbTrendArea
                  points={COLLECTIONS}
                  labelledBy={a11y.labelledBy}
                  describedBy={a11y.describedBy}
                />
              )}
            </UbChartCard>
          }
          debtors={
            <UbChartCard
              title="Who owes most"
              description="Example data."
              table={DEBTORS_TABLE}
              viewLabels={VIEW_LABELS}
            >
              {(a11y) => (
                <UbRankedBars
                  parties={DEBTORS}
                  labelledBy={a11y.labelledBy}
                  describedBy={a11y.describedBy}
                  moreLabel={`and ${DEBTORS_OVERFLOW} more`}
                />
              )}
            </UbChartCard>
          }
        />
      </UbCard>
    </UbStack>
  );
}
