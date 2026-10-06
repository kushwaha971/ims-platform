'use client';

import { useEffect, useState } from 'react';

import { UbCard, UbDisclosure, UbStack, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatInr } from 'src/utils/money';

import { getInvoiceProfit, type InvoiceProfit } from '../api/profitService';

/**
 * docs/platform/15 §1.4 item 1 — "bill-wise profit" on the bill itself, as
 * Vyapar shows it: sale value before GST, the cost of goods frozen on each line
 * when the bill was issued, and what is left. Shown only to someone with
 * `reports.financial.read` (the server refuses everyone else, INV-08 EC-4).
 *
 * A line whose cost was never known is listed without a profit, and the card
 * says how many there were, so the total is never better than its data.
 * Component state, not a slice: one screen reads it, for as long as it is open.
 */
export function InvoiceProfitCard({ id }: Readonly<{ id: string }>): React.JSX.Element | null {
  const { t } = useTranslation();
  const [profit, setProfit] = useState<InvoiceProfit | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getInvoiceProfit(id, controller.signal)
      .then(setProfit)
      .catch(() => undefined);
    return () => controller.abort();
  }, [id]);

  if (!profit) return null;
  const { totals } = profit;
  const negative = totals.profit.startsWith('-');

  const row = (label: string, value: string, strong = false) => (
    <UbStack direction="row" justify="between" className="gap-3">
      <UbText variant="body-sm" tone="secondary">
        {label}
      </UbText>
      <UbText variant={strong ? 'body-sm-medium' : 'body-sm'} className="tabular-nums">
        {value}
      </UbText>
    </UbStack>
  );

  return (
    <UbCard
      padded
      className="ub-print-hide"
      title={t('sales.profit.title')}
      description={t('sales.profit.hint')}
    >
      <UbStack gap={2} data-testid="invoice-profit">
        {row(t('sales.profit.sale'), formatInr(totals.saleValue))}
        {row(t('sales.profit.cost'), formatInr(totals.cost))}
        <UbStack direction="row" justify="between" className="gap-3">
          <UbText variant="body-sm-medium">{t('sales.profit.profit')}</UbText>
          <UbText
            variant="body-sm-medium"
            tone={negative ? 'error' : 'success'}
            className="tabular-nums"
          >
            {totals.marginPct
              ? t('sales.profit.withMargin', {
                  amount: formatInr(totals.profit),
                  pct: totals.marginPct,
                })
              : formatInr(totals.profit)}
          </UbText>
        </UbStack>
        {profit.linesWithoutCost > 0 && (
          <UbText variant="caption" tone="tertiary">
            {t('sales.profit.uncosted', { count: profit.linesWithoutCost })}
          </UbText>
        )}
        {profit.lines.length > 1 && (
          <UbDisclosure label={t('sales.profit.byLine')}>
            <UbStack as="ul" gap={1}>
              {profit.lines.map((line) => (
                <UbStack
                  as="li"
                  key={line.lineNo}
                  direction="row"
                  justify="between"
                  className="gap-3"
                >
                  <UbText variant="body-sm" truncate>
                    {line.description}
                  </UbText>
                  <UbText variant="body-sm" tone="secondary" className="shrink-0 tabular-nums">
                    {line.profit === null
                      ? t('sales.profit.noCost')
                      : t('sales.profit.lineProfit', {
                          amount: formatInr(line.profit),
                          pct: line.marginPct ?? '—',
                        })}
                  </UbText>
                </UbStack>
              ))}
            </UbStack>
          </UbDisclosure>
        )}
      </UbStack>
    </UbCard>
  );
}
