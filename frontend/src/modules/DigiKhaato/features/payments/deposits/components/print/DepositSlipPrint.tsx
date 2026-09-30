'use client';

import type { TranslateFn } from 'src/hooks/useTranslation';
import type { PrintBranding } from 'src/print/brandingPrintService';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import type { DepositDetail } from '../../types/deposit.types';

// Loaded with the panel's own chunk, so its words come with it.
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/deposits';
import 'src/i18n/catalogues/payments';

const CELLS =
  'w-full [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_td:first-child]:pl-0 [&_th:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:last-child]:pr-0';

/**
 * A4b (FRD 00 PLT-X02 §8, T-PLT-X02-12) — the deposit slip: what the member
 * paid in, what was adjusted from it and why, what was returned, and what is
 * still held. It prints the `purpose` ("Library deposit") and is signed with
 * the tenant's name only — never the product (the no-product-name test).
 *
 * Voided receipts and voided applications stay on the slip, struck through,
 * because the member may be holding the paper that recorded them. The raw
 * elements are the print directory's exemption: a slip needs a real `<table>`.
 */
export function DepositSlipPrint({
  deposit,
  businessName,
  branding,
  t,
}: Readonly<{
  deposit: DepositDetail;
  businessName: string;
  branding: PrintBranding | null;
  t: TranslateFn;
}>): React.JSX.Element {
  const moneyRows = [
    ...deposit.receipts.map((row) => ({ ...row, kind: 'receipt' as const })),
    ...deposit.refunds.map((row) => ({ ...row, kind: 'refund' as const })),
  ].sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));

  return (
    <article
      className="ub-print-sheet ub-print-a5 mx-auto w-full max-w-[148mm] bg-white p-6 text-[11pt] text-black"
      data-testid="deposit-slip-print"
    >
      <header className="flex items-start justify-between gap-4 border-b border-black pb-3">
        <section>
          {branding?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- a print sheet
            <img src={branding.logoUrl} alt="" className="mb-1 max-h-10" />
          )}
          <p className="text-lg font-semibold">{businessName}</p>
          {branding?.docHeader && <p>{branding.docHeader}</p>}
        </section>
        <section className="text-right">
          <p className="font-semibold">{t('payments.deposit.slip.title')}</p>
          <p>{deposit.purpose}</p>
          <p>{formatBusinessDate(deposit.createdAt)}</p>
        </section>
      </header>

      <section className="mt-3">
        <p className="text-[9pt] uppercase text-neutral-600">{t('payments.deposit.slip.member')}</p>
        <p className="font-semibold">{deposit.party.name}</p>
      </section>

      <table className={`mt-3 ${CELLS}`}>
        <thead>
          <tr>
            <th className="text-left">{t('payments.column.date')}</th>
            <th className="text-left">{t('payments.deposit.slip.what')}</th>
            <th className="text-left">{t('payments.deposit.slip.number')}</th>
            <th className="text-right">{t('payments.column.amount')}</th>
          </tr>
        </thead>
        <tbody>
          {moneyRows.map((row) => (
            <tr key={row.id} className={row.status === 'void' ? 'line-through' : undefined}>
              <td>{formatBusinessDate(row.paymentDate)}</td>
              <td>
                {t(
                  row.kind === 'refund'
                    ? 'payments.deposit.slip.returned'
                    : row.opening
                      ? 'payments.deposit.slip.opening'
                      : 'payments.deposit.slip.received'
                )}
              </td>
              <td className="font-mono">{row.number}</td>
              <td className="text-right">{formatInr(row.amount)}</td>
            </tr>
          ))}
          {deposit.applications.map((row) => (
            <tr key={row.id} className={row.voidedAt ? 'line-through' : undefined}>
              <td>{formatBusinessDate(row.createdAt)}</td>
              <td>{t('payments.deposit.slip.adjusted', { reason: row.reason })}</td>
              <td className="font-mono">{row.settlePayment.number}</td>
              <td className="text-right">{formatInr(row.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-3 border-t border-black pt-2 text-right">
        <p className="text-lg font-semibold tabular-nums" data-testid="deposit-slip-held">
          {t('payments.deposit.slip.held', { amount: formatInr(deposit.heldAmount) })}
        </p>
      </section>

      <footer className="mt-6 text-[9pt]">
        {branding?.docFooter && <p>{branding.docFooter}</p>}
        <p data-testid="deposit-slip-issued-by">
          {t('payments.receipt.issuedBy', { business: businessName })}
        </p>
      </footer>
    </article>
  );
}
