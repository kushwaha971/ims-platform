'use client';

import type { TranslateFn } from 'src/hooks/useTranslation';
import type { Locale } from 'src/types/domain.types';
import { amountInWords } from 'src/utils/amountInWords';
import { formatBusinessDate } from 'src/utils/dates';
import { formatAmount, formatInr } from 'src/utils/money';

import { stateName } from 'modules/DigiKhaato/features/onboarding/constants/gstStates';

import { documentTitleId, sgstLabelId } from '../../view-model/invoiceDisplay';

import { InvoicePrintLines } from './InvoicePrintLines';
import { hasCess, isPaidStamp, pct, taxColumns, taxSummary, watermark } from './printModel';
import { UbQrCode } from './UbQrCode';

import type { PrintBranding } from '../../redux/salesThunk';
import type { SalesAddress, SalesDocument, UpiIntent } from '../../types/sales.types';

const COMPOSITION_FOOTER = 'Composition taxable person, not eligible to collect tax on supplies';

const addressLines = (a: SalesAddress): string =>
  [a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ');

/**
 * SAL-03 §7 `InvoicePrintA4` — 210 × 297 mm: header band with logo, GSTIN and
 * title; the meta grid; Bill to; the line table (tax columns by kind and state
 * split, §7.4); totals with the amount in words; the tax summary by rate; the
 * UPI QR and bank details; terms, composition wording, footer and signatory.
 * Primary colour on the header rule only; black text regardless (EC-8).
 */
export function InvoicePrintA4({
  doc,
  upi,
  branding,
  locale,
  t,
}: Readonly<{
  doc: SalesDocument;
  upi: UpiIntent | null;
  branding: PrintBranding | null;
  locale: Locale;
  t: TranslateFn;
}>): React.JSX.Element {
  const columns = taxColumns(doc);
  const mark = watermark(doc);
  const party = doc.partySnapshot;
  const supplier = doc.supplier;
  const rule = branding?.primaryHex ?? '#111';
  const sgst = t(sgstLabelId(doc.placeOfSupplyState, doc.isInterState));
  const totals: [string, string][] = [
    [t('sales.totals.subtotal'), formatInr(doc.subtotal)],
    ...(doc.discountAmount !== '0.00'
      ? ([[t('sales.totals.discount'), `−${formatInr(doc.discountAmount)}`]] as [string, string][])
      : []),
    [t('sales.totals.taxable'), formatInr(doc.taxableTotal)],
    ...(columns === 'intra'
      ? ([
          [t('sales.tax.cgst'), formatInr(doc.cgstTotal)],
          [sgst, formatInr(doc.sgstTotal)],
        ] as [string, string][])
      : []),
    ...(columns === 'inter'
      ? ([[t('sales.tax.igst'), formatInr(doc.igstTotal)]] as [string, string][])
      : []),
    ...(hasCess(doc)
      ? ([[t('sales.tax.cess'), formatInr(doc.cessTotal)]] as [string, string][])
      : []),
    [t('sales.totals.roundOff'), formatInr(doc.roundOff)],
  ];

  return (
    <article
      className="ub-print-sheet ub-print-a4 relative bg-white p-6 text-black"
      data-print-template="a4"
      data-testid="print-a4"
    >
      {mark && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          aria-hidden
        >
          <span
            className="-rotate-30 text-7xl font-bold text-black/10"
            data-testid="print-watermark"
          >
            {mark === 'draft' ? t('sales.print.draftMark') : t('sales.print.voidMark')}
          </span>
        </div>
      )}
      <header
        className="flex items-start justify-between gap-4 border-b-2 pb-3"
        style={{ borderColor: rule }}
      >
        <div className="flex items-start gap-3">
          {branding?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- a print sheet, served by the API host
            <img
              src={branding.logoUrl}
              alt=""
              className="max-h-[14mm] max-w-[40mm] object-contain"
            />
          )}
          <div>
            <h1 className="text-lg font-bold">{supplier.legalName || supplier.name}</h1>
            <p className="text-xs">{addressLines(supplier.address)}</p>
            {supplier.phone && <p className="text-xs">{supplier.phone}</p>}
            {supplier.gstin && <p className="font-mono text-xs">GSTIN {supplier.gstin}</p>}
            {branding?.docHeader && <p className="text-xs">{branding.docHeader}</p>}
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-base font-bold uppercase">
            {t(documentTitleId(doc.kind, supplier.gstType))}
          </h2>
          {columns !== 'none' && <p className="text-xs">{t('sales.print.original')}</p>}
          {isPaidStamp(doc) && (
            <p
              className="mt-1 inline-block border-2 border-black px-2 text-sm font-bold"
              data-testid="print-paid"
            >
              {t('sales.status.paid')}
            </p>
          )}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-x-6 gap-y-1 py-3 text-xs">
        <p>
          {t('sales.print.number')}: <strong>{doc.number ?? '—'}</strong>
        </p>
        <p>
          {t('sales.editor.pos')}: {stateName(doc.placeOfSupplyState, locale)} (
          {doc.placeOfSupplyState})
        </p>
        <p>
          {t('sales.editor.date')}: {formatBusinessDate(doc.documentDate)}
        </p>
        <p>
          {t('sales.print.reverseCharge')}:{' '}
          {doc.reverseCharge ? t('sales.print.yes') : t('sales.print.no.value')}
        </p>
        {doc.dueOn && (
          <p>
            {t('sales.editor.dueOn')}: {formatBusinessDate(doc.dueOn)}
          </p>
        )}
      </section>

      <section className="border-y py-2 text-xs">
        <p className="font-semibold">{t('sales.print.billTo')}</p>
        <p>{party?.name || doc.walkInName || t('sales.walkIn.customer')}</p>
        {party && addressLines(party.address) && <p>{addressLines(party.address)}</p>}
        {party?.gstin && <p className="font-mono">GSTIN {party.gstin}</p>}
        {party?.stateCode && (
          <p>
            {stateName(party.stateCode, locale)} ({party.stateCode})
          </p>
        )}
      </section>

      <InvoicePrintLines doc={doc} columns={columns} sgstLabel={sgst} t={t} />

      <section className="ub-print-closing mt-3 grid grid-cols-2 gap-6 text-xs">
        <div className="space-y-2">
          {columns !== 'none' && (
            <table>
              <thead>
                <tr>
                  <th className="text-left">{t('sales.print.rate')}</th>
                  <th className="text-right">{t('sales.totals.taxable')}</th>
                  {columns === 'intra' && <th className="text-right">{t('sales.tax.cgst')}</th>}
                  {columns === 'intra' && <th className="text-right">{sgst}</th>}
                  {columns === 'inter' && <th className="text-right">{t('sales.tax.igst')}</th>}
                </tr>
              </thead>
              <tbody>
                {taxSummary(doc.lines).map((row) => (
                  <tr key={row.rate}>
                    <td>{pct(row.rate)}</td>
                    <td className="text-right">{formatAmount(row.taxable)}</td>
                    {columns === 'intra' && (
                      <td className="text-right">{formatAmount(row.cgst)}</td>
                    )}
                    {columns === 'intra' && (
                      <td className="text-right">{formatAmount(row.sgst)}</td>
                    )}
                    {columns === 'inter' && (
                      <td className="text-right">{formatAmount(row.igst)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {upi && !mark && (
            <div className="flex items-center gap-3">
              <UbQrCode modules={upi.qr.modules} size="28mm" label={t('sales.print.scanToPay')} />
              <div>
                <p className="font-semibold">
                  {upi.amount
                    ? t('sales.print.scanToPayAmount', { amount: formatInr(upi.amount) })
                    : t('sales.print.scanToPay')}
                </p>
                <p className="font-mono">{supplier.upiVpa}</p>
              </div>
            </div>
          )}
          {Object.keys(supplier.bankDetails).length > 0 && (
            <p>
              {t('sales.print.bank')}:{' '}
              {Object.values(supplier.bankDetails).filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <div>
          <table>
            <tbody>
              {totals.map(([label, value]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td className="text-right">{value}</td>
                </tr>
              ))}
              <tr>
                <td className="font-bold">{t('sales.totals.grand')}</td>
                <td className="text-right text-base font-bold" data-testid="print-grand-total">
                  {formatInr(doc.grandTotal)}
                </td>
              </tr>
              {doc.status !== 'draft' && (
                <>
                  <tr>
                    <td>{t('sales.print.paid')}</td>
                    <td className="text-right">{formatInr(doc.amountPaid)}</td>
                  </tr>
                  <tr>
                    <td>{t('sales.print.balance')}</td>
                    <td className="text-right">{formatInr(doc.amountDue)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
          <p className="mt-2 italic" data-testid="print-words">
            {amountInWords(doc.grandTotal, locale)}
          </p>
        </div>
      </section>

      <footer className="mt-4 space-y-1 border-t pt-2 text-xs">
        {doc.kind === 'bill_of_supply' && <p className="font-semibold">{COMPOSITION_FOOTER}</p>}
        {doc.terms && <p className="whitespace-pre-line">{doc.terms}</p>}
        {doc.notes && <p className="whitespace-pre-line">{doc.notes}</p>}
        {branding?.docFooter && <p>{branding.docFooter}</p>}
        <div className="flex items-end justify-between pt-6">
          <p className="text-[10px] text-black/60">
            {t('sales.print.generatedBy', { app: branding?.appName ?? '' })}
          </p>
          <div className="text-right">
            {branding?.signatureUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- a print sheet
              <img src={branding.signatureUrl} alt="" className="ml-auto max-h-[14mm]" />
            )}
            <p>{t('sales.print.signatory')}</p>
          </div>
        </div>
      </footer>
    </article>
  );
}
