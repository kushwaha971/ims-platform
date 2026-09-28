'use client';

import type { TranslateFn } from 'src/hooks/useTranslation';
import { formatAmount } from 'src/utils/money';

import { hasCess, pct, trimQty, type TaxColumns } from './printModel';

import type { SalesDocument } from '../../types/sales.types';

/**
 * SAL-03 §7.4 — the A4 line table. A real `<table>` with a `<thead>`, because
 * `display: table-header-group` is what repeats the headings on every page of
 * a sixty-line bill (FR-10) — the reason the print directory may use raw
 * elements at all. Columns: # · Description (HSN beneath) · Qty · Unit · Rate
 * · Disc · Taxable · GST % · CGST · SGST/UTGST · IGST · Cess · Total, with the
 * inter/intra/tax-free subsets §7.4 names.
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
  return (
    <>
      <ol
        className="mt-2 divide-y text-xs sm:hidden print:hidden"
        data-testid="print-lines-stacked"
      >
        {doc.lines.map((line) => (
          <li key={line.lineNo} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="break-words font-semibold">
                {line.lineNo}. {line.description}
              </p>
              {line.hsnSac && <p className="text-[10px]">HSN/SAC {line.hsnSac}</p>}
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
      <table className="mt-2 hidden w-full text-xs sm:table print:table" data-testid="print-lines">
        <thead>
          <tr>
            <th className="text-left">#</th>
            <th className="text-left">{t('sales.line.description')}</th>
            <th className="text-right">{t('sales.line.qty')}</th>
            <th className="text-left">{t('sales.line.unit')}</th>
            <th className="text-right">{t('sales.line.rate')}</th>
            <th className="text-right">{t('sales.line.discount')}</th>
            <th className="text-right">
              {columns === 'none' ? t('sales.line.amount') : t('sales.totals.taxable')}
            </th>
            {columns !== 'none' && <th className="text-right">{t('sales.line.gst')}</th>}
            {columns === 'intra' && (
              <th className="text-right" data-col="cgst">
                {t('sales.tax.cgst')}
              </th>
            )}
            {columns === 'intra' && (
              <th className="text-right" data-col="sgst">
                {sgstLabel}
              </th>
            )}
            {columns === 'inter' && (
              <th className="text-right" data-col="igst">
                {t('sales.tax.igst')}
              </th>
            )}
            {cess && <th className="text-right">{t('sales.tax.cess')}</th>}
            {columns !== 'none' && <th className="text-right">{t('sales.line.total')}</th>}
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((line) => (
            <tr key={line.lineNo}>
              <td>{line.lineNo}</td>
              <td>
                <span className="block">{line.description}</span>
                {line.hsnSac && <span className="block text-[10px]">HSN/SAC {line.hsnSac}</span>}
              </td>
              <td className="text-right">{trimQty(line.qty)}</td>
              <td>{line.unitCode}</td>
              <td className="text-right">{formatAmount(line.unitPrice)}</td>
              <td className="text-right">
                {line.discountAmount !== '0.00' ? formatAmount(line.discountAmount) : '—'}
              </td>
              <td className="text-right">
                {formatAmount(columns === 'none' ? line.lineTotal : line.taxableValue)}
              </td>
              {columns !== 'none' && <td className="text-right">{pct(line.taxRate)}</td>}
              {columns === 'intra' && <td className="text-right">{formatAmount(line.cgst)}</td>}
              {columns === 'intra' && <td className="text-right">{formatAmount(line.sgst)}</td>}
              {columns === 'inter' && <td className="text-right">{formatAmount(line.igst)}</td>}
              {cess && <td className="text-right">{formatAmount(line.cess)}</td>}
              {columns !== 'none' && <td className="text-right">{formatAmount(line.lineTotal)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
