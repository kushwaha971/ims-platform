'use client';

import { SummaryStatGrid } from 'src/components/stats/SummaryStatGrid';
import { UbStatCard, UbStatusBanner } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatInr } from 'src/utils/money';

import { isLoss } from '../view-model/profitDisplay';

import type { ProfitTotals } from '../types/profitReport.types';

/**
 * The period's P&L, over EVERY bill in it — not the page, not the search:
 * sales, the cost of what was sold, gross profit, and — when the shop keeps
 * expenses here — the expenses and what is left, the "did we make money"
 * line Vyapar, myBillBook and Marg all put at the top.
 *
 * A loss is a word as well as a colour (R-A-2): the card's label changes.
 */
export function ProfitSummary({ totals }: Readonly<{ totals: ProfitTotals }>): React.JSX.Element {
  const { t } = useTranslation();
  const gross = isLoss(totals.profit);
  const net = totals.netProfit !== null && isLoss(totals.netProfit);
  return (
    <>
      <SummaryStatGrid storageKey="profit" label={t('reports.profit.summary')}>
        <UbStatCard
          label={t('reports.profit.tile.sales')}
          value={formatInr(totals.saleValue)}
          subtext={t('reports.profit.bills', { count: totals.bills })}
        />
        <UbStatCard label={t('reports.profit.tile.cost')} value={formatInr(totals.cost)} />
        <UbStatCard
          label={t(gross ? 'reports.profit.tile.grossLoss' : 'reports.profit.tile.gross')}
          value={formatInr(totals.profit)}
          tone={gross ? 'danger' : 'success'}
          subtext={
            totals.marginPct === null
              ? undefined
              : t('reports.profit.tile.margin', { value: totals.marginPct })
          }
        />
        {totals.expenses !== null && (
          <UbStatCard
            label={t('reports.profit.tile.expenses')}
            value={formatInr(totals.expenses)}
          />
        )}
        {totals.netProfit !== null && (
          <UbStatCard
            label={t(net ? 'reports.profit.tile.netLoss' : 'reports.profit.tile.net')}
            value={formatInr(totals.netProfit)}
            tone={net ? 'danger' : 'success'}
          />
        )}
      </SummaryStatGrid>
      {totals.uncostedLines > 0 && (
        <UbStatusBanner
          tone="warning"
          title={t('reports.profit.uncosted.title', { count: totals.uncostedLines })}
          description={t('reports.profit.uncosted.body')}
        />
      )}
    </>
  );
}
