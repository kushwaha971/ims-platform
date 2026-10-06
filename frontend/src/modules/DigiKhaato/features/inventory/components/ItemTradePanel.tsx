'use client';

import { useEffect, useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';

import {
  UbButton,
  UbCard,
  UbEmptyState,
  UbFilterSelect,
  UbListItemText,
  UbPressable,
  UbSectionHeading,
  UbSkeleton,
  UbStack,
  UbText,
  isoToday,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { partyPath, ROUTES } from 'src/routes';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';
import { formatQuantity } from 'src/utils/quantity';

import {
  getItemTrade,
  type ItemTrade,
  type TradeLine,
  type TradeSide,
} from '../api/itemTradeService';

type Period = 'all' | '30' | '90' | '365';
const PERIODS: readonly Period[] = ['all', '30', '90', '365'];

type Load =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly trade: ItemTrade }
  | { readonly status: 'failed' };

const daysBack = (today: string, days: number): string => {
  const at = new Date(`${today}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() - (days - 1));
  return at.toISOString().slice(0, 10);
};

const documentHref = (side: TradeSide, line: TradeLine): string =>
  `${side === 'sales' ? ROUTES.SALES_INVOICES : ROUTES.PURCHASE_BILLS}/${encodeURIComponent(
    line.document.id
  )}`;

/**
 * Shop gap §1.4 — the item page's Sales and Purchases tabs. Who buys this most
 * and at what rate, with the margin it made (for a reader who may see costs);
 * or who sold it to us and what they charged last time — the question asked
 * before ordering again. Grouped by party, then the latest bills.
 */
export function ItemTradePanel({
  itemId,
  side,
  unitCode,
}: Readonly<{ itemId: string; side: TradeSide; unitCode: string }>): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const [period, setPeriod] = useState<Period>('all');
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const from = period === 'all' ? null : daysBack(isoToday(), Number(period));

  useEffect(() => {
    const controller = new AbortController();
    getItemTrade(itemId, side, from, controller.signal)
      .then((trade) => setLoad({ status: 'ready', trade }))
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ status: 'failed' });
      });
    return () => controller.abort();
  }, [itemId, side, from, attempt]);

  const periodSpec = useMemo(
    () => ({
      kind: 'single' as const,
      key: 'period',
      label: t('items.trade.period.label'),
      options: PERIODS.map((value) => ({ value, label: t(`items.trade.period.${value}`) })),
    }),
    [t]
  );
  const choose = (value: string) => {
    setLoad({ status: 'loading' });
    setPeriod(value as Period);
  };

  const sales = side === 'sales';
  const trade = load.status === 'ready' ? load.trade : null;

  return (
    <UbStack gap={3} data-testid={`item-trade-${side}`}>
      <UbStack direction="row" align="center" gap={2} wrap>
        <UbFilterSelect
          spec={periodSpec}
          value={period}
          onChange={choose}
          closeLabel={t('common.action.close')}
        />
        {trade && trade.byParty.length > 0 && (
          <UbText variant="caption" tone="secondary" data-testid="item-trade-totals">
            {[
              t(sales ? 'items.trade.totals.sold' : 'items.trade.totals.bought', {
                qty: formatQuantity(trade.totals.qty, unitCode),
                amount: formatInr(trade.totals.amount),
              }),
              trade.totals.avgRate
                ? t('items.trade.totals.avg', { rate: formatInr(trade.totals.avgRate) })
                : '',
              trade.totals.margin !== undefined
                ? trade.totals.marginPct
                  ? t('items.trade.totals.marginPct', {
                      amount: formatInr(trade.totals.margin),
                      pct: trade.totals.marginPct,
                    })
                  : t('items.trade.totals.margin', { amount: formatInr(trade.totals.margin) })
                : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </UbText>
        )}
      </UbStack>

      {load.status === 'loading' && <UbSkeleton variant="list" count={3} />}
      {load.status === 'failed' && (
        <UbEmptyState
          variant="error"
          title={t('items.trade.error')}
          action={
            <UbButton variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              {t('common.action.retry')}
            </UbButton>
          }
        />
      )}
      {trade && trade.byParty.length === 0 && (
        <UbEmptyState
          variant="firstUse"
          title={t(sales ? 'items.trade.empty.sales' : 'items.trade.empty.purchases')}
          description={t('items.trade.empty.body')}
        />
      )}
      {trade && trade.byParty.length > 0 && (
        <>
          {trade.totals.uncostedLines ? (
            <UbText variant="caption" tone="tertiary">
              {t('items.trade.uncosted', { count: trade.totals.uncostedLines })}
            </UbText>
          ) : null}
          <UbSectionHeading
            as="h3"
            title={t(sales ? 'items.trade.byCustomer' : 'items.trade.bySupplier')}
          />
          <UbCard padded>
            <UbStack
              as="ul"
              gap={0}
              aria-label={t(sales ? 'items.trade.byCustomer' : 'items.trade.bySupplier')}
            >
              {trade.byParty.map((row) => {
                const name = row.party?.name ?? t('items.trade.walkIn');
                const body = (
                  <UbStack direction="row" justify="between" align="start" gap={3}>
                    <UbListItemText
                      className="min-w-0 flex-1"
                      primary={name}
                      secondary={[
                        formatQuantity(row.qty, unitCode),
                        row.avgRate
                          ? t('items.trade.atRate', { rate: formatInr(row.avgRate) })
                          : '',
                        t(sales ? 'items.trade.bills' : 'items.trade.purchaseBills', {
                          count: row.documents,
                        }),
                        row.lastDate
                          ? t('items.trade.last', { date: formatBusinessDate(row.lastDate) })
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                    <UbStack gap={0} align="end" className="shrink-0">
                      <UbText variant="body-sm-medium" className="ds-num">
                        {formatInr(row.amount)}
                      </UbText>
                      {row.margin !== undefined && (
                        <UbText
                          variant="caption"
                          tone={row.margin.startsWith('-') ? 'error' : 'success'}
                          className="ds-num"
                        >
                          {t('items.trade.marginShort', { amount: formatInr(row.margin) })}
                        </UbText>
                      )}
                    </UbStack>
                  </UbStack>
                );
                return (
                  <UbStack
                    as="li"
                    key={row.party?.id ?? 'walk-in'}
                    gap={0}
                    className="border-b border-border-hairline py-3 last:border-b-0"
                    data-testid="item-trade-party"
                  >
                    {row.party ? (
                      <UbPressable
                        className="w-full text-left"
                        onClick={() => router.push(partyPath(row.party?.id ?? ''))}
                      >
                        {body}
                      </UbPressable>
                    ) : (
                      body
                    )}
                  </UbStack>
                );
              })}
            </UbStack>
          </UbCard>

          <UbSectionHeading
            as="h3"
            title={t(sales ? 'items.trade.recentSales' : 'items.trade.recentPurchases')}
          />
          <UbCard padded>
            <UbStack
              as="ul"
              gap={0}
              aria-label={t(sales ? 'items.trade.recentSales' : 'items.trade.recentPurchases')}
            >
              {trade.lines.map((line, index) => (
                <UbStack
                  as="li"
                  key={`${line.document.id}-${index}`}
                  gap={0}
                  className="border-b border-border-hairline py-3 last:border-b-0"
                  data-testid="item-trade-line"
                >
                  <UbPressable
                    className="w-full text-left"
                    onClick={() => router.push(documentHref(side, line))}
                  >
                    <UbStack direction="row" justify="between" align="start" gap={3}>
                      <UbListItemText
                        className="min-w-0 flex-1"
                        primary={line.party?.name ?? line.walkInName ?? t('items.trade.walkIn')}
                        secondary={[
                          line.document.number ?? '',
                          formatBusinessDate(line.document.date),
                          t('items.trade.qtyAt', {
                            qty: formatQuantity(line.qty, unitCode),
                            rate: formatInr(line.rate),
                          }),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      />
                      <UbStack gap={0} align="end" className="shrink-0">
                        <UbText variant="body-sm-medium" className="ds-num">
                          {formatInr(line.amount)}
                        </UbText>
                        {line.margin !== undefined && (
                          <UbText
                            variant="caption"
                            tone={
                              line.margin === null
                                ? 'tertiary'
                                : line.margin.startsWith('-')
                                  ? 'error'
                                  : 'success'
                            }
                            className="ds-num"
                          >
                            {line.margin === null
                              ? t('items.trade.noCost')
                              : t('items.trade.marginShort', { amount: formatInr(line.margin) })}
                          </UbText>
                        )}
                      </UbStack>
                    </UbStack>
                  </UbPressable>
                </UbStack>
              ))}
            </UbStack>
          </UbCard>
        </>
      )}
    </UbStack>
  );
}
