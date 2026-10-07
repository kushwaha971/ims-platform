'use client';

import { Fragment } from 'react';

import { UbQrCode } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';
import type { PrintBranding } from 'src/print/brandingPrintService';
import type { Locale } from 'src/types/domain.types';
import { amountInWords } from 'src/utils/amountInWords';
import { formatBusinessDate } from 'src/utils/dates';
import { formatAmount, formatInr, subtractMoney } from 'src/utils/money';
import { formatPhoneForDisplay } from 'src/utils/share';

import { stateName } from 'modules/DigiKhaato/features/onboarding/constants/gstStates';

import {
  documentTitleId,
  sgstLabelId,
  isNotABill,
  notTaxInvoiceId,
} from '../../view-model/invoiceDisplay';

import { InvoicePrintLines } from './InvoicePrintLines';
import {
  halfRate,
  hasCess,
  hsnSummary,
  isPaidStamp,
  pct,
  taxColumns,
  watermark,
} from './printModel';

import type { SalesAddress, SalesDocument, UpiIntent } from '../../types/sales.types';

/** The document number's label, by kind: a credit note is not an "Invoice no.". */
const numberLabelId = (kind: SalesDocument['kind']): string =>
  kind === 'credit_note'
    ? 'sales.print.number.creditNote'
    : kind === 'estimate'
      ? 'sales.print.number.estimate'
      : kind === 'sales_order'
        ? 'sales.print.number.order'
        : kind === 'delivery_challan'
          ? 'sales.print.number.challan'
          : 'sales.print.number';

const COMPOSITION_FOOTER = 'Composition taxable person, not eligible to collect tax on supplies';

const addressLines = (a: SalesAddress): string =>
  [a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ');

/**
 * SAL-03 §7 `InvoicePrintA4` — 210 × 297 mm, in the layout every Indian
 * accounting product prints and every buyer's accountant expects (owner,
 * 6 Oct 2026: "like the standard other applications follow"): one ruled box
 * with the title and "Original for recipient"; seller (logo, GSTIN, state and
 * code, phone, email) beside the document details (number, dates, place of
 * supply, reverse charge, the invoice a credit note is against); the buyer;
 * the line table (§7.4, tax as rate and amount per head, a totals row); the
 * amount in words, the HSN/SAC-wise tax summary, bank details and the UPI QR
 * beside the totals; terms, the declaration and "For <business> / Authorised
 * signatory". The same sheet serves invoices, bills of supply, estimates and
 * credit notes, titled by kind. Primary colour on the title rule only; black
 * text regardless (EC-8).
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

  const buyerName = party?.name || doc.walkInName || t('sales.walkIn.customer');
  const buyerMobile = party?.mobile || doc.walkInMobile;
  const bank = supplier.bankDetails;
  const bankRows: [string, string | undefined][] = [
    [t('sales.print.bankName'), bank.bank_name],
    [t('sales.print.accountName'), bank.account_name],
    [t('sales.print.accountNumber'), bank.account_number],
    [t('sales.print.ifsc'), bank.ifsc],
    [t('sales.print.branch'), bank.branch],
  ];
  const business = supplier.legalName || supplier.name;
  const credited = subtractMoney(subtractMoney(doc.grandTotal, doc.amountPaid), doc.amountDue);

  return (
    <article
      className="ub-print-sheet ub-print-a4 ub-gst relative bg-white p-6 text-black"
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

      {/* The standard Indian GST layout (Tally, Zoho, Vyapar): one ruled box
          — title, seller and document details, buyer, the line table, the
          HSN-wise tax summary, totals with the amount in words, bank and UPI,
          terms, and "For <business> / Authorised signatory". */}
      <div className="gst-box">
        <div className="gst-row gst-title" style={{ borderBottomColor: rule }}>
          <h2 className="text-center text-base font-bold uppercase tracking-wide">
            {t(documentTitleId(doc.kind, supplier.gstType))}
          </h2>
          {columns !== 'none' && (
            <p className="text-center text-[9px] uppercase sm:absolute sm:right-2 sm:top-1 print:absolute print:right-2 print:top-1">
              {t('sales.print.original')}
            </p>
          )}
          {isPaidStamp(doc) && (
            <p
              className="absolute left-2 top-1 border-2 border-black px-2 text-xs font-bold"
              data-testid="print-paid"
            >
              {t('sales.status.paid')}
            </p>
          )}
        </div>

        <div className="gst-row grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2">
          <div className="gst-cell gst-divide flex items-start gap-3">
            {branding?.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- a print sheet, served by the API host
              <img
                src={branding.logoUrl}
                alt=""
                className="max-h-[16mm] max-w-[32mm] object-contain"
              />
            )}
            <div className="min-w-0">
              {/* h2, not h1: on screen this sheet is the preview INSIDE the
                  document page, whose h1 is the document number. */}
              <h2 className="text-sm font-bold">{business}</h2>
              {addressLines(supplier.address) && <p>{addressLines(supplier.address)}</p>}
              {supplier.gstin && (
                <p>
                  <span className="font-semibold">GSTIN:</span>{' '}
                  <span className="font-mono">{supplier.gstin}</span>
                </p>
              )}
              <p>
                <span className="font-semibold">{t('sales.print.state')}:</span>{' '}
                {stateName(supplier.stateCode, locale)} ({supplier.stateCode})
              </p>
              {supplier.phone && (
                <p>
                  <span className="font-semibold">{t('sales.print.phone')}:</span>{' '}
                  {formatPhoneForDisplay(supplier.phone)}
                </p>
              )}
              {supplier.email && (
                <p>
                  <span className="font-semibold">{t('sales.print.email')}:</span> {supplier.email}
                </p>
              )}
              {branding?.docHeader && <p>{branding.docHeader}</p>}
            </div>
          </div>
          <table className="gst-meta">
            <tbody>
              <tr>
                <th scope="row">{t(numberLabelId(doc.kind))}</th>
                <td className="font-semibold">{doc.number ?? '—'}</td>
              </tr>
              <tr>
                <th scope="row">{t('sales.editor.date')}</th>
                <td>{formatBusinessDate(doc.documentDate)}</td>
              </tr>
              {doc.dueOn && (
                <tr>
                  <th scope="row">{t('sales.editor.dueOn')}</th>
                  <td>{formatBusinessDate(doc.dueOn)}</td>
                </tr>
              )}
              {doc.kind === 'estimate' && doc.validUntil && (
                <tr>
                  <th scope="row">{t('sales.estimate.validUntil')}</th>
                  <td>{formatBusinessDate(doc.validUntil)}</td>
                </tr>
              )}
              {/* Shop item 4 — SAL-09 FR-6: what the driver carries the goods under. */}
              {doc.kind === 'delivery_challan' && doc.links.challan && (
                <>
                  <tr>
                    <th scope="row">{t('sales.challan.type.label')}</th>
                    <td>{t(`sales.challan.type.${doc.links.challan.type}`)}</td>
                  </tr>
                  {doc.links.challan.transporter && (
                    <tr>
                      <th scope="row">{t('sales.challan.transporter')}</th>
                      <td>{doc.links.challan.transporter}</td>
                    </tr>
                  )}
                  {doc.links.challan.vehicleNumber && (
                    <tr>
                      <th scope="row">{t('sales.challan.vehicle')}</th>
                      <td>{doc.links.challan.vehicleNumber}</td>
                    </tr>
                  )}
                  {doc.links.challan.ewayBillNumber && (
                    <tr>
                      <th scope="row">{t('sales.challan.eway')}</th>
                      <td>{doc.links.challan.ewayBillNumber}</td>
                    </tr>
                  )}
                </>
              )}
              <tr>
                <th scope="row">{t('sales.editor.pos')}</th>
                <td>
                  {stateName(doc.placeOfSupplyState, locale)} ({doc.placeOfSupplyState})
                </td>
              </tr>
              <tr>
                <th scope="row">{t('sales.print.reverseCharge')}</th>
                <td>{doc.reverseCharge ? t('sales.print.yes') : t('sales.print.no.value')}</td>
              </tr>
              {doc.links.against && (
                <tr data-testid="print-against">
                  <th scope="row">{t('sales.print.againstInvoice')}</th>
                  <td>
                    {t('sales.print.againstValue', {
                      number: doc.links.against.number ?? '',
                      date: formatBusinessDate(doc.links.against.documentDate),
                    })}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="gst-row gst-cell">
          <p className="gst-label">{t('sales.print.billTo')}</p>
          <p className="text-sm font-bold">{buyerName}</p>
          {party && addressLines(party.address) && <p>{addressLines(party.address)}</p>}
          {party?.gstin && (
            <p>
              <span className="font-semibold">GSTIN:</span>{' '}
              <span className="font-mono">{party.gstin}</span>
            </p>
          )}
          {party?.stateCode && (
            <p>
              <span className="font-semibold">{t('sales.print.state')}:</span>{' '}
              {stateName(party.stateCode, locale)} ({party.stateCode})
            </p>
          )}
          {buyerMobile && (
            <p>
              <span className="font-semibold">{t('sales.print.phone')}:</span>{' '}
              {formatPhoneForDisplay(buyerMobile)}
            </p>
          )}
        </div>

        <div className="gst-row">
          <InvoicePrintLines doc={doc} columns={columns} sgstLabel={sgst} t={t} />
        </div>

        <div className="ub-print-closing gst-row grid grid-cols-1 sm:grid-cols-[1fr_38%] print:grid-cols-[1fr_38%]">
          <div className="gst-cell gst-divide space-y-2">
            <div>
              <p className="gst-label">{t('sales.print.amountInWords')}</p>
              <p className="font-semibold" data-testid="print-words">
                {amountInWords(doc.grandTotal, locale)}
              </p>
            </div>
            {columns !== 'none' && (
              <table className="gst-grid gst-grid-boxed" data-testid="print-hsn-summary">
                <thead>
                  <tr>
                    <th rowSpan={2}>{t('sales.print.hsn')}</th>
                    <th rowSpan={2}>{t('sales.print.taxableValue')}</th>
                    {columns === 'intra' && <th colSpan={2}>{t('sales.tax.cgst')}</th>}
                    {columns === 'intra' && <th colSpan={2}>{sgst}</th>}
                    {columns === 'inter' && <th colSpan={2}>{t('sales.tax.igst')}</th>}
                    <th rowSpan={2}>{t('sales.print.totalTax')}</th>
                  </tr>
                  <tr>
                    {(columns === 'intra' ? [0, 1] : [0]).map((index) => (
                      <Fragment key={index}>
                        <th>{t('sales.print.ratePct')}</th>
                        <th>{t('sales.print.amount')}</th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hsnSummary(doc.lines).map((row) => (
                    <tr key={`${row.hsn}-${row.rate}`}>
                      <td className="text-center">{row.hsn}</td>
                      <td className="text-right">{formatAmount(row.taxable)}</td>
                      {columns === 'intra' && (
                        <>
                          <td className="text-right">{pct(halfRate(row.rate))}</td>
                          <td className="text-right">{formatAmount(row.cgst)}</td>
                          <td className="text-right">{pct(halfRate(row.rate))}</td>
                          <td className="text-right">{formatAmount(row.sgst)}</td>
                        </>
                      )}
                      {columns === 'inter' && (
                        <>
                          <td className="text-right">{pct(row.rate)}</td>
                          <td className="text-right">{formatAmount(row.igst)}</td>
                        </>
                      )}
                      <td className="text-right">{formatAmount(row.tax)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {bankRows.some(([, value]) => value) && (
              <div>
                <p className="gst-label">{t('sales.print.bank')}</p>
                {bankRows
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <p key={label}>
                      <span className="font-semibold">{label}:</span> {value}
                    </p>
                  ))}
              </div>
            )}
            {upi && !mark && (
              <div className="flex flex-wrap items-center gap-3">
                <UbQrCode modules={upi.qr.modules} size="24mm" label={t('sales.print.scanToPay')} />
                {/* min-w-0 + a breakable VPA: in a narrow column (the share page
                    on a phone) the VPA ran into the totals beside it otherwise. */}
                <div className="min-w-0 break-words">
                  <p className="font-semibold">
                    {upi.amount
                      ? t('sales.print.scanToPayAmount', { amount: formatInr(upi.amount) })
                      : t('sales.print.scanToPay')}
                  </p>
                  <p className="break-all font-mono">{supplier.upiVpa}</p>
                </div>
              </div>
            )}
          </div>
          <table className="gst-totals self-start">
            <tbody>
              {/* Label ↔ figure rows: the label cell is the ROW HEADER, so a
                  screen reader says "CGST, ₹20.25" (WCAG 1.3.1, Sprint 12). */}
              {totals.map(([label, value]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{value}</td>
                </tr>
              ))}
              <tr className="gst-grand">
                <th scope="row">{t('sales.totals.grand')}</th>
                <td data-testid="print-grand-total">{formatInr(doc.grandTotal)}</td>
              </tr>
              {doc.status !== 'draft' && !isNotABill(doc.kind) && doc.kind !== 'credit_note' && (
                <>
                  <tr>
                    <th scope="row">{t('sales.print.paid')}</th>
                    <td>{formatInr(doc.amountPaid)}</td>
                  </tr>
                  {/* What returns took off the bill, so Paid + this + Balance
                      due adds up to the grand total on paper. */}
                  {credited !== '0.00' && (
                    <tr>
                      <th scope="row">{t('sales.print.credited')}</th>
                      <td>{`−${formatInr(credited)}`}</td>
                    </tr>
                  )}
                  <tr>
                    <th scope="row">{t('sales.print.balance')}</th>
                    <td className="font-semibold">{formatInr(doc.amountDue)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        <div className="gst-row grid grid-cols-1 sm:grid-cols-[1fr_38%] print:grid-cols-[1fr_38%]">
          <div className="gst-cell gst-divide space-y-1">
            {doc.kind === 'bill_of_supply' && <p className="font-semibold">{COMPOSITION_FOOTER}</p>}
            {isNotABill(doc.kind) && (
              <p className="font-semibold" data-testid="print-not-tax-invoice">
                {t(notTaxInvoiceId(doc.kind))}
              </p>
            )}
            {doc.kind === 'credit_note' && doc.links.against && (
              <p data-testid="print-sec34">
                {t('sales.creditNote.sec34', {
                  number: doc.links.against.number ?? '',
                  date: formatBusinessDate(doc.links.against.documentDate),
                })}
              </p>
            )}
            {doc.terms && (
              <div>
                <p className="gst-label">{t('sales.print.terms')}</p>
                <p className="whitespace-pre-line">{doc.terms}</p>
              </div>
            )}
            {doc.notes && <p className="whitespace-pre-line">{doc.notes}</p>}
            {!isNotABill(doc.kind) && <p className="italic">{t('sales.print.declaration')}</p>}
            {branding?.docFooter && <p>{branding.docFooter}</p>}
          </div>
          <div className="gst-cell flex flex-col justify-between text-right">
            <p className="font-semibold">{t('sales.print.forBusiness', { business })}</p>
            {branding?.signatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a print sheet
              <img src={branding.signatureUrl} alt="" className="ml-auto max-h-[14mm]" />
            ) : (
              <span className="block h-[14mm]" aria-hidden />
            )}
            <p>{t('sales.print.signatory')}</p>
          </div>
        </div>
      </div>

      <footer className="mt-1 flex justify-between text-[9px] text-black/60">
        <p>{t('sales.print.computerGenerated')}</p>
        {/* CR-2026-09-29-BRAND-A: signed by the business that issued it. No
            product name, no domain, nothing of ours. */}
        <p data-testid="print-issued-by">{t('sales.print.issuedBy', { business })}</p>
      </footer>
    </article>
  );
}
