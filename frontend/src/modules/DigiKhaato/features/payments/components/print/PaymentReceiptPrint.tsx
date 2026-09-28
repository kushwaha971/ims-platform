'use client';

import type { TranslateFn } from 'src/hooks/useTranslation';
import type { Locale } from 'src/types/domain.types';
import { amountInWords } from 'src/utils/amountInWords';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr, isNegativeAmount, isZeroAmount, absMoney } from 'src/utils/money';

import { UbQrCode } from 'modules/DigiKhaato/features/sales/components/print/UbQrCode';
import type { PrintBranding } from 'modules/DigiKhaato/features/sales/redux/salesThunk';

import { hasAdvance, modeLabelIds } from '../../view-model/paymentDisplay';

import type { Payment } from '../../types/payment.types';

// Loaded with dynamic(), so its own words come with its own chunk rather than
// with the screen that opens it (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/payments';

/**
 * PAY-04 §7 `ReceiptPrintA5` — the paper a customer leaves the counter with.
 *
 * (1) the header band: logo, trade name, address, phone, GSTIN; "Payment
 * receipt / रसीद" (or "Payment voucher" for money out), the number and date;
 * (2) received from / paid to; (3) the amount and the amount in words;
 * (4) the modes, one row per `mode_breakup` line with its reference; (5) the
 * bills it settled, and the advance when there is one; (6) the balance after
 * this payment with its label, omitted for a walk-in; (7) the static UPI QR
 * "Pay next time" when the shop has a VPA, the footer, and "Issued by <shop>".
 *
 * A voided receipt keeps printing — the customer's copy must be able to show
 * that it was cancelled — under a diagonal VOID / रद्द watermark with the
 * reason (FR-8). The raw elements are allowed here and only here: a printed
 * receipt needs a real `<table>` (the print directory's lint exemption).
 */
/**
 * QA P-D5 — the tables' cells had no padding on screen (print adds its own in
 * globals.css), so neighbouring columns ran together: "PhonePe—",
 * "INV/26-27/000113/09/2026". A column gap on every cell, the first and last
 * flush with the sheet's edge.
 */
const CELLS =
  'w-full [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_td:first-child]:pl-0 [&_th:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:last-child]:pr-0';

export function PaymentReceiptPrint({
  payment,
  branding,
  staticQr,
  locale,
  t,
}: Readonly<{
  payment: Payment;
  branding: PrintBranding | null;
  staticQr: readonly string[] | null;
  locale: Locale;
  t: TranslateFn;
}>): React.JSX.Element {
  const business = payment.business;
  const isIn = payment.direction === 'in';
  const isVoid = payment.status === 'void';
  const balance = payment.partyBalanceAfter;
  const modeIds = modeLabelIds(payment.modeBreakup);
  /* QA P-D6 — a voided receipt settles nothing, so it states no balance after it. */
  const showBalance = !isVoid;
  const address = [business.address.line1, business.address.line2, business.address.city]
    .filter(Boolean)
    .join(', ');

  return (
    <article
      className="ub-print-sheet ub-print-a5 relative mx-auto w-full max-w-[148mm] bg-white p-6 text-[11pt] text-black"
      data-testid="payment-receipt-print"
    >
      {isVoid && (
        <p
          aria-hidden
          className="pointer-events-none absolute inset-0 flex rotate-[-24deg] items-center justify-center text-7xl font-bold uppercase opacity-15"
        >
          {t('payments.receipt.voidMark')}
        </p>
      )}
      <header className="flex items-start justify-between gap-4 border-b border-black pb-3">
        <section>
          {branding?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- a print sheet
            <img src={branding.logoUrl} alt="" className="mb-1 max-h-10" />
          )}
          <p className="text-lg font-semibold">{business.legalName || business.name}</p>
          {address && <p>{address}</p>}
          {business.phone && <p>{business.phone}</p>}
          {business.gstin && <p className="font-mono">GSTIN {business.gstin}</p>}
        </section>
        <section className="text-right">
          <p className="font-semibold">
            {t(isIn ? 'payments.receipt.title' : 'payments.voucher.title')}
          </p>
          <p className="font-mono">{payment.number}</p>
          <p>{formatBusinessDate(payment.paymentDate)}</p>
        </section>
      </header>

      <section className="mt-3">
        <p className="text-[9pt] uppercase text-neutral-600">
          {t(isIn ? 'payments.receipt.receivedFrom' : 'payments.receipt.paidTo')}
        </p>
        <p className="font-semibold">{payment.party?.name ?? t('payments.walkIn')}</p>
      </section>

      <section className="mt-3">
        <p className="text-2xl font-semibold tabular-nums">{formatInr(payment.amount)}</p>
        <p className="italic">{amountInWords(payment.amount, locale)}</p>
      </section>

      <table className={`mt-3 ${CELLS}`}>
        <thead>
          <tr>
            <th className="text-left">{t('payments.receipt.mode')}</th>
            <th className="text-left">{t('payments.reference.label')}</th>
            <th className="text-right">{t('payments.column.amount')}</th>
          </tr>
        </thead>
        <tbody>
          {payment.modeBreakup.map((line, index) => (
            <tr key={`${line.mode}-${index}`}>
              <td>{t(modeIds[index] ?? `ledger.mode.${line.mode}`)}</td>
              <td className="font-mono">{line.reference || '—'}</td>
              <td className="text-right">{formatInr(line.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {(payment.allocations.length > 0 || hasAdvance(payment)) && (
        <table className={`mt-3 ${CELLS}`}>
          <thead>
            <tr>
              <th className="text-left">{t('payments.receipt.against')}</th>
              <th className="text-left">{t('payments.column.date')}</th>
              <th className="text-right">{t('payments.receipt.allocated')}</th>
              <th className="text-right">{t('payments.receipt.billBalance')}</th>
            </tr>
          </thead>
          <tbody>
            {payment.allocations.map((row) => (
              <tr key={row.documentId}>
                <td className="font-mono">{row.number ?? '—'}</td>
                <td>{formatBusinessDate(row.documentDate)}</td>
                <td className="text-right">{formatInr(row.amount)}</td>
                <td className="text-right">{formatInr(row.amountDue)}</td>
              </tr>
            ))}
            {hasAdvance(payment) && (
              <tr>
                <td colSpan={2}>{t('payments.receipt.advance')}</td>
                <td className="text-right">{formatInr(payment.unallocatedAmount)}</td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showBalance && balance !== null && (
        <p className="ub-print-closing mt-3 font-semibold">
          {t('payments.receipt.balanceAfter')}: {formatInr(absMoney(balance))} —{' '}
          {isZeroAmount(balance)
            ? t('payments.receipt.settled')
            : isNegativeAmount(balance)
              ? t('payments.receipt.weWillGive')
              : t('payments.receipt.youWillGive')}
        </p>
      )}
      {isVoid && payment.voidReason && (
        <p className="mt-2">
          {t('payments.receipt.voidedBecause', { reason: payment.voidReason })}
        </p>
      )}

      <footer className="mt-4 flex items-end justify-between gap-4 border-t border-neutral-300 pt-3 text-[9pt]">
        <section>
          {branding?.docFooter && <p>{branding.docFooter}</p>}
          {/* CR-2026-09-29-BRAND-A: the customer's receipt names the business
              that issued it, never the product it was made in. */}
          <p className="text-neutral-600" data-testid="receipt-issued-by">
            {t('payments.receipt.issuedBy', { business: business.legalName || business.name })}
          </p>
        </section>
        {isIn && !isVoid && staticQr && staticQr.length > 0 && (
          <section className="text-center">
            <UbQrCode modules={staticQr} size="25mm" label={t('payments.receipt.payNext')} />
            <p>{t('payments.receipt.payNext')}</p>
            {business.upiVpa && <p className="font-mono">{business.upiVpa}</p>}
          </section>
        )}
      </footer>
    </article>
  );
}
