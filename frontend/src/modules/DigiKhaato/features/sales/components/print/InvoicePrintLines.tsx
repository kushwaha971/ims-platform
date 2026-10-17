'use client';

import { Fragment } from 'react';

import type { TranslateFn } from 'src/hooks/useTranslation';
import { formatAmount } from 'src/utils/money';

import { halfRate, hasCess, lineTotals, pct, trimQty, type TaxColumns } from './printModel';

import type { SalesDocument } from '../../types/sales.types';

/**
 * SAL-03 §7.4 — the A4 line table, in the standard Indian GST layout. A real `<table>` with a `<thead>`, because
 * `display: table-header-group` is what repeats the headings on every page of
 * a sixty-line bill (FR-10) — the reason the print directory may use raw
 * elements at all. Columns: S.No · Item · HSN/SAC · Qty (with unit) · Rate ·
 * Disc · Taxable value · CGST %/amount · SGST %/amount (or IGST) · Cess ·
 * Amount, then a totals row — the inter/intra/tax-free subsets §7.4 names.
 *
 * ── Below `sm` on SCREEN the lines are stacked (UAT D2) ──────────────────────
 * Thirteen columns cannot fit a 390 px phone: the customer's share page and the
 * in-app detail cut the table off at SGST, hiding each line's total. On screen
 * below `sm` each line is a block — item (HSN beneath), qty × rate and
 * discount, the tax split, and the line total on the right — and the table is
 * hidden; from `sm` up and in PRINT (`print:`) it is the A4 table and the
 * stacked copy is hidden, so paper never changes.
 */
export function InvoicePrintLines({
  doc,
  columns,
  sgstLabel,
  t,
}: Readonly<{
  doc: SalesDocument;
  columns: TaxColumns;
  sgstLabel: string;
  t: TranslateFn;
}>): React.JSX.Element {
  const cess = hasCess(doc) && columns !== 'none';
  // A tax heading spans its rate and amount, so the plain columns span two rows.
  const taxRows = columns === 'none' ? 1 : 2;
  const sums = lineTotals(doc.lines);
  return (
    <>
      <ol
        className="divide-y px-2 text-xs sm:hidden print:hidden"
        data-testid="print-lines-stacked"
      >
        {doc.lines.map((line) => (
          <li key={line.lineNo} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="break-words font-semibold">
                {line.lineNo}. {line.description}
              </p>
              {line.hsnSac && <p className="text-[0.625rem]">HSN/SAC {line.hsnSac}</p>}
              <p>
                {`${trimQty(line.qty)} ${line.unitCode} × ${formatAmount(line.unitPrice)}`}
                {line.discountAmount !== '0.00' &&
                  ` · ${t('sales.line.discount')} ${formatAmount(line.discountAmount)}`}
              </p>
              {columns !== 'none' && (
                <p>
                  {`${t('sales.line.gst')} ${pct(line.taxRate)} · ${t('sales.totals.taxable')} ${formatAmount(line.taxableValue)}`}
                  {columns === 'intra' &&
                    ` · ${t('sales.tax.cgst')} ${formatAmount(line.cgst)} · ${sgstLabel} ${formatAmount(line.sgst)}`}
                  {columns === 'inter' && ` · ${t('sales.tax.igst')} ${formatAmount(line.igst)}`}
                  {cess && ` · ${t('sales.tax.cess')} ${formatAmount(line.cess)}`}
                </p>
              )}
            </div>
            <p className="shrink-0 text-right font-semibold">{formatAmount(line.lineTotal)}</p>
          </li>
        ))}
      </ol>
      {/* The standard Indian GST layout (Tally, Zoho, Vyapar): every cell
          ruled, HSN/SAC in its own column, each tax as a rate and an amount
          under one heading, and a totals row that adds the columns up. */}
      <table className="gst-grid hidden w-full sm:table print:table" data-testid="print-lines">
        <thead>
          <tr>
            <th rowSpan={taxRows} className="w-[4%]">
              {t('sales.print.sno')}
            </th>
            <th rowSpan={taxRows} className="text-left">
              {t('sales.line.description')}
            </th>
            <th rowSpan={taxRows}>{t('sales.print.hsn')}</th>
            <th rowSpan={taxRows}>{t('sales.line.qty')}</th>
            <th rowSpan={taxRows}>{t('sales.line.rate')}</th>
            <th rowSpan={taxRows}>{t('sales.line.discount')}</th>
            <th rowSpan={taxRows}>
              {columns === 'none' ? t('sales.line.amount') : t('sales.print.taxableValue')}
            </th>
            {columns === 'intra' && (
              <th colSpan={2} data-col="cgst">
                {t('sales.tax.cgst')}
              </th>
            )}
            {columns === 'intra' && (
              <th colSpan={2} data-col="sgst">
                {sgstLabel}
              </th>
            )}
            {columns === 'inter' && (
              <th colSpan={2} data-col="igst">
                {t('sales.tax.igst')}
              </th>
            )}
            {cess && <th rowSpan={taxRows}>{t('sales.tax.cess')}</th>}
            {columns !== 'none' && <th rowSpan={taxRows}>{t('sales.line.total')}</th>}
          </tr>
          {columns !== 'none' && (
            <tr>
              {Array.from({ length: columns === 'intra' ? 2 : 1 }, (_, index) => (
                <Fragment key={index}>
                  <th>{t('sales.print.ratePct')}</th>
                  <th>{t('sales.print.amount')}</th>
                </Fragment>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {doc.lines.map((line) => (
            <tr key={line.lineNo}>
              <td className="text-center">{line.lineNo}</td>
              <td className="text-left">{line.description}</td>
              <td className="text-center">{line.hsnSac || '—'}</td>
              <td className="whitespace-nowrap text-right">
                {trimQty(line.qty)} {line.unitCode}
              </td>
              <td className="text-right">{formatAmount(line.unitPrice)}</td>
              <td className="text-right">
                {line.discountAmount !== '0.00' ? formatAmount(line.discountAmount) : '—'}
              </td>
              <td className="text-right">
                {formatAmount(columns === 'none' ? line.lineTotal : line.taxableValue)}
              </td>
              {columns === 'intra' && (
                <>
                  <td className="text-right">{pct(halfRate(line.taxRate))}</td>
                  <td className="text-right">{formatAmount(line.cgst)}</td>
                  <td className="text-right">{pct(halfRate(line.taxRate))}</td>
                  <td className="text-right">{formatAmount(line.sgst)}</td>
                </>
              )}
              {columns === 'inter' && (
                <>
                  <td className="text-right">{pct(line.taxRate)}</td>
                  <td className="text-right">{formatAmount(line.igst)}</td>
                </>
              )}
              {cess && <td className="text-right">{formatAmount(line.cess)}</td>}
              {columns !== 'none' && (
                <td className="text-right font-semibold">{formatAmount(line.lineTotal)}</td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td />
            <td className="text-left">{t('sales.print.total')}</td>
            <td />
            <td className="whitespace-nowrap text-right">
              {sums.qty !== null ? `${sums.qty} ${doc.lines[0]?.unitCode ?? ''}` : ''}
            </td>
            <td />
            <td />
            <td className="text-right">
              {formatAmount(columns === 'none' ? sums.total : sums.taxable)}
            </td>
            {columns === 'intra' && (
              <>
                <td />
                <td className="text-right">{formatAmount(sums.cgst)}</td>
                <td />
                <td className="text-right">{formatAmount(sums.sgst)}</td>
              </>
            )}
            {columns === 'inter' && (
              <>
                <td />
                <td className="text-right">{formatAmount(sums.igst)}</td>
              </>
            )}
            {cess && <td className="text-right">{formatAmount(sums.cess)}</td>}
            {columns !== 'none' && <td className="text-right">{formatAmount(sums.total)}</td>}
          </tr>
        </tfoot>
      </table>
    </>
  );
}
