'use client';

import { UbInfoRow, UbPanel, UbPanelSection, UbStatCard, UbStatGrid } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatInr } from 'src/utils/money';

import { ReportAmount } from './ReportAmount';

import type { RegisterBook, RegisterTotals as Totals } from '../types/taxReports.types';

/**
 * RPT-03 FR-4 / RPT-04 FR-4 — the totals over the FILTERED set, every one of
 * them the server's figure (the page's rows are one page of it). Four tiles
 * for the questions asked at a glance; the panel below carries the rest of
 * the footer — each head, round-off, paid and due, the B2B/B2C split for
 * sales, and ITC / RCM / not-claimable for purchases.
 */
export function RegisterTotals({
  book,
  totals,
}: Readonly<{ book: RegisterBook; totals: Totals }>): React.JSX.Element {
  const { t } = useTranslation();
  const ns = book === 'sales' ? 'reports.salesRegister' : 'reports.purchaseRegister';
  const row = (label: string, value: string | null) => (
    <UbInfoRow key={label} label={label} value={<ReportAmount value={value} />} />
  );
  return (
    <>
      <UbStatGrid label={t('reports.register.totals')}>
        <UbStatCard
          label={t('reports.register.tile.taxable')}
          value={formatInr(totals.taxableTotal)}
          subtext={t('reports.register.tile.documents', { count: totals.count })}
        />
        <UbStatCard label={t('reports.register.tile.tax')} value={formatInr(totals.tax)} />
        {book === 'purchase' && totals.itcEligible ? (
          <UbStatCard
            label={t('reports.purchaseRegister.tile.itc')}
            value={formatInr(totals.itcEligible.total)}
            tone="success"
          />
        ) : (
          <UbStatCard
            label={t('reports.register.tile.total')}
            value={formatInr(totals.grandTotal)}
          />
        )}
        <UbStatCard
          label={t(`${ns}.tile.due`)}
          value={formatInr(totals.amountDue)}
          tone={
            totals.amountDue.startsWith('-') || totals.amountDue === '0.00' ? 'default' : 'warning'
          }
        />
      </UbStatGrid>
      <UbPanel as="section">
        <UbPanelSection title={t('reports.register.footer.title')} collapsible defaultOpen={false}>
          {row(t('reports.register.column.cgst'), totals.cgst)}
          {row(t('reports.register.column.sgst'), totals.sgst)}
          {row(t('reports.register.column.igst'), totals.igst)}
          {row(t('reports.register.column.cess'), totals.cess)}
          {row(t('reports.register.column.roundOff'), totals.roundOff)}
          {row(t('reports.register.column.total'), totals.grandTotal)}
          {row(t('reports.register.footer.paid'), totals.amountPaid)}
          {row(t('reports.register.column.due'), totals.amountDue)}
          {book === 'sales' && totals.b2b && totals.b2c && (
            <>
              <UbInfoRow
                label={t('reports.salesRegister.footer.b2b', { count: totals.b2b.count })}
                value={<ReportAmount value={totals.b2b.taxable} />}
              />
              <UbInfoRow
                label={t('reports.salesRegister.footer.b2c', { count: totals.b2c.count })}
                value={<ReportAmount value={totals.b2c.taxable} />}
              />
              <UbInfoRow
                label={t('reports.salesRegister.footer.creditNotes')}
                value={String(totals.countByKind.credit_note ?? 0)}
              />
            </>
          )}
          {book === 'purchase' && (
            <>
              {row(t('reports.purchaseRegister.footer.rcm'), totals.rcmTax)}
              {row(t('reports.purchaseRegister.footer.notClaimable'), totals.notClaimableTax)}
            </>
          )}
        </UbPanelSection>
      </UbPanel>
    </>
  );
}
