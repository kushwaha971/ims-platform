'use client';

import type { TranslateFn } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';
import { formatAmount, formatInr } from 'src/utils/money';

import { documentTitleId, sgstLabelId } from '../../view-model/invoiceDisplay';

import { pct, taxColumns, taxSummary, thermalName, trimQty, watermark } from './printModel';
import { UbQrCode } from './UbQrCode';

import type { PrintBranding } from '../../redux/salesThunk';
import type { SalesDocument, UpiIntent } from '../../types/sales.types';

const COMPOSITION_FOOTER = 'Composition taxable person, not eligible to collect tax on supplies';

/**
 * SAL-03 §7 `InvoicePrintThermal80` — 80 mm paper, 72 mm printable, 11 px
 * monospaced numerals, a 42-character budget and pure black (§8: no grey on
 * thermal). Printer-agnostic: no ESC/POS, just `window.print()` onto the
 * `thermal80` named page (`app/globals.css`).
 */
export function InvoicePrintThermal80({
  doc,
  upi,
  branding,
  t,
}: Readonly<{
  doc: SalesDocument;
  upi: UpiIntent | null;
  branding: PrintBranding | null;
  t: TranslateFn;
}>): React.JSX.Element {
  const columns = taxColumns(doc);
  const mark = watermark(doc);
  const supplier = doc.supplier;
  const who = doc.partySnapshot?.name || doc.walkInName || t('sales.walkIn.customer');
  const row = (label: string, value: string, strong = false) => (
    <p
      key={label}
      className={strong ? 'flex justify-between text-base font-bold' : 'flex justify-between'}
    >
      <span>{label}</span>
      <span>{value}</span>
    </p>
  );

  return (
    <article
      className="ub-print-sheet ub-print-thermal w-[72mm] bg-white font-mono text-[11px] leading-tight text-black"
      data-print-template="thermal80"
      data-testid="print-thermal"
    >
      <header className="text-center">
        {branding?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- a print sheet
          <img src={branding.logoUrl} alt="" className="mx-auto max-h-[20mm] grayscale" />
        )}
        <p className="font-bold">{supplier.legalName || supplier.name}</p>
        <p>{[supplier.address.line1, supplier.address.city].filter(Boolean).join(', ')}</p>
        {supplier.phone && <p>{supplier.phone}</p>}
        {supplier.gstin && <p>GSTIN {supplier.gstin}</p>}
        {branding?.docHeader && <p>{branding.docHeader}</p>}
      </header>
      <p className="mt-1 text-center font-bold uppercase">
        {t(documentTitleId(doc.kind, supplier.gstType))}
        {mark && ` · ${mark === 'draft' ? t('sales.print.draftMark') : t('sales.print.voidMark')}`}
      </p>
      <p>
        {t('sales.print.no')}: {doc.number ?? '—'}
      </p>
      <p>
        {t('sales.editor.date')}: {formatBusinessDate(doc.documentDate)}
      </p>
      <p>
        {t('sales.print.to')}: {thermalName(who)}
      </p>
      <p className="border-b border-dashed border-black" />
      {doc.lines.map((line) => (
        <div key={line.lineNo} className="py-0.5">
          <p>{thermalName(line.description)}</p>
          <p className="flex justify-between">
            <span>
              {trimQty(line.qty)} {line.unitCode} x {formatAmount(line.unitPrice)}
            </span>
            <span>{formatAmount(line.lineTotal)}</span>
          </p>
          {columns !== 'none' && (
            <p>
              {line.hsnSac ? `HSN ${line.hsnSac} · ` : ''}GST {pct(line.taxRate)}
            </p>
          )}
        </div>
      ))}
      <p className="border-b border-dashed border-black" />
      {row(t('sales.totals.subtotal'), formatAmount(doc.subtotal))}
      {doc.discountAmount !== '0.00' &&
        row(t('sales.totals.discount'), `-${formatAmount(doc.discountAmount)}`)}
      {columns !== 'none' && row(t('sales.totals.taxable'), formatAmount(doc.taxableTotal))}
      {columns === 'intra' && row(t('sales.tax.cgst'), formatAmount(doc.cgstTotal))}
      {columns === 'intra' &&
        row(t(sgstLabelId(doc.placeOfSupplyState, doc.isInterState)), formatAmount(doc.sgstTotal))}
      {columns === 'inter' && row(t('sales.tax.igst'), formatAmount(doc.igstTotal))}
      {row(t('sales.totals.roundOff'), formatAmount(doc.roundOff))}
      {row(t('sales.print.total'), formatInr(doc.grandTotal), true)}
      {doc.status !== 'draft' && row(t('sales.print.paid'), formatAmount(doc.amountPaid))}
      {doc.status !== 'draft' &&
        doc.kind !== 'estimate' &&
        row(t('sales.print.balance'), formatAmount(doc.amountDue))}
      {doc.kind === 'estimate' && <p>{t('sales.estimate.notTaxInvoice')}</p>}
      {columns !== 'none' &&
        taxSummary(doc.lines).map((s) => (
          <p key={s.rate}>
            GST {pct(s.rate)}: {formatAmount(s.taxable)} |{' '}
            {columns === 'intra'
              ? `${formatAmount(s.cgst)} | ${formatAmount(s.sgst)}`
              : formatAmount(s.igst)}
          </p>
        ))}
      {upi && !mark && (
        <div className="mt-2 flex flex-col items-center">
          <UbQrCode modules={upi.qr.modules} size="32mm" label={t('sales.print.scanToPay')} />
          <p>
            {upi.amount
              ? t('sales.print.scanToPayAmount', { amount: formatInr(upi.amount) })
              : t('sales.print.scanToPay')}
          </p>
          <p>{supplier.upiVpa}</p>
        </div>
      )}
      <footer className="mt-2 text-center">
        <p>{t('sales.print.thanks')}</p>
        {doc.kind === 'bill_of_supply' && <p>{COMPOSITION_FOOTER}</p>}
        {doc.terms && <p className="line-clamp-2">{doc.terms}</p>}
        {/* CR-2026-09-29-BRAND-A: signed by the shop, never by the product. */}
        <p data-testid="print-issued-by">
          {t('sales.print.issuedBy', { business: supplier.legalName || supplier.name })}
        </p>
      </footer>
    </article>
  );
}
