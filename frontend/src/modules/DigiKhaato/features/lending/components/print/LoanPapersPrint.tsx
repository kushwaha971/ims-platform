'use client';

import { useEffect } from 'react';

import { UbBox } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import type { Locale } from 'src/types/domain.types';
import { amountInWords } from 'src/utils/amountInWords';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';
import { formatPhoneForDisplay } from 'src/utils/share';

import type { CollectionRow, LoanDetail } from '../../types/lending.types';

// Loaded with dynamic(), so its own words come with its own chunk.
import 'src/i18n/catalogues/lending';

export type LoanPaper = 'receipt' | 'statement' | 'closure';

/**
 * Lending P0 — the three papers a lender hands a borrower, printed from the loan page
 * by `window.print()` (ADR-021: the browser is the PDF engine):
 *
 * * **Receipt** — one collection: its number, date, amount in figures and words, mode
 *   and reference, and where the loan stands today. A voided collection still prints,
 *   marked VOID, so the borrower's copy can show it was cancelled.
 * * **Statement** — the loan as agreed (lent, handed over, to collect, instalments),
 *   every instalment with what it has taken, and every collection.
 * * **Closure letter** — "no dues" for a loan paid in full: the borrower keeps it as
 *   proof, so it names the loan, what was lent and repaid, and the date it closed.
 *
 * Every paper is the LENDER's: its name, address and phone head it and sign it,
 * never the product's (CR-2026-09-29-BRAND-A). Hidden on screen (`ub-print-only`);
 * the raw table elements are the print directory's exemption — paper needs a table.
 */
export function LoanPapersPrint({
  loan,
  collections,
  paper,
  collectionId,
  locale,
  today,
  printKey = 0,
}: Readonly<{
  loan: LoanDetail;
  collections: readonly CollectionRow[];
  paper: LoanPaper;
  collectionId?: string | null;
  locale: Locale;
  today: string;
  /** Each new value prints once the sheet is on the page (the sheet loads lazily). */
  printKey?: number;
}>): React.JSX.Element {
  const { t } = useTranslation();
  useEffect(() => {
    if (!printKey) return;
    const fonts = typeof document !== 'undefined' ? document.fonts?.ready : undefined;
    void Promise.resolve(fonts).then(() => window.print());
  }, [printKey]);
  const lender = loan.lender;
  const lenderName = lender?.legalName || lender?.name || '';
  const receipt = paper === 'receipt' ? collections.find((c) => c.id === collectionId) : null;
  const standing = collections.filter((c) => !c.voided);
  const title =
    paper === 'receipt'
      ? t('lending.papers.receipt.title')
      : paper === 'statement'
        ? t('lending.papers.statement.title')
        : t('lending.papers.closure.title');
  const row = (label: string, value: string) => (
    <tr key={label}>
      <th className="text-left font-normal">{label}</th>
      <td className="text-right">{value}</td>
    </tr>
  );

  return (
    <UbBox className="ub-print-only ub-print-sheet hidden" data-testid={`loan-paper-${paper}`}>
      <div className="relative">
        {receipt?.voided && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-6xl font-bold text-black/15">
            {t('lending.papers.void')}
          </p>
        )}
        <header className="mb-4 flex items-start justify-between gap-6 border-b border-black pb-3">
          <div>
            <h1 className="text-xl font-bold">{lenderName}</h1>
            {lender?.address.map((line) => (
              <p key={line} className="text-sm">
                {line}
              </p>
            ))}
            {lender?.phone && (
              <p className="text-sm">
                {t('lending.papers.phone', { phone: formatPhoneForDisplay(lender.phone) })}
              </p>
            )}
          </div>
          <div className="text-right">
            <h2 className="text-lg font-bold">{title}</h2>
            {receipt && <p className="text-sm">{receipt.receiptNumber}</p>}
            <p className="text-sm">
              {formatBusinessDate(
                receipt?.collectedOn ?? (paper === 'closure' ? loan.closedOn : null) ?? today
              )}
            </p>
          </div>
        </header>

        <table className="mb-4">
          <tbody>
            {row(t('lending.papers.borrower'), loan.borrower.name)}
            {row(t('lending.papers.borrowerNumber'), loan.borrower.number)}
            {loan.borrower.mobile &&
              row(t('lending.papers.mobile'), formatPhoneForDisplay(loan.borrower.mobile))}
            {row(t('lending.papers.loan'), loan.number)}
          </tbody>
        </table>

        {receipt && (
          <>
            <p className="mb-1 text-lg font-bold">
              {t('lending.papers.receipt.received', { amount: formatInr(receipt.amount) })}
            </p>
            <p className="mb-4 text-sm">{amountInWords(receipt.amount, locale)}</p>
            <table className="mb-4">
              <tbody>
                {row(t('lending.papers.receipt.mode'), t(`lending.mode.${receipt.mode}`))}
                {receipt.reference && row(t('lending.papers.receipt.reference'), receipt.reference)}
                {receipt.note && row(t('lending.papers.receipt.note'), receipt.note)}
                {row(t('lending.papers.collected'), formatInr(loan.collected))}
                {row(t('lending.papers.left'), formatInr(loan.remaining))}
              </tbody>
            </table>
          </>
        )}

        {paper === 'statement' && (
          <>
            <table className="mb-4">
              <tbody>
                {row(t('lending.papers.lent'), formatInr(loan.principal))}
                {row(t('lending.papers.handedOver'), formatInr(loan.cashHandedOver))}
                {row(t('lending.papers.toCollect'), formatInr(loan.totalPayable))}
                {row(
                  t('lending.papers.instalments'),
                  t('lending.papers.instalmentsValue', {
                    count: loan.instalmentCount,
                    amount: formatInr(loan.instalmentAmount),
                  })
                )}
                {row(t('lending.papers.givenOn'), formatBusinessDate(loan.disbursedOn))}
                {row(t('lending.papers.endsOn'), formatBusinessDate(loan.maturityOn))}
                {row(t('lending.papers.collected'), formatInr(loan.collected))}
                {row(t('lending.papers.left'), formatInr(loan.remaining))}
              </tbody>
            </table>
            <h3 className="mb-1 font-bold">{t('lending.papers.statement.schedule')}</h3>
            <table className="mb-4">
              <thead>
                <tr>
                  <th className="text-left">#</th>
                  <th className="text-left">{t('lending.papers.statement.dueOn')}</th>
                  <th className="text-right">{t('lending.papers.statement.amount')}</th>
                  <th className="text-right">{t('lending.papers.statement.paid')}</th>
                  <th className="text-right">{t('lending.papers.statement.left')}</th>
                </tr>
              </thead>
              <tbody>
                {loan.schedule.map((due) => (
                  <tr key={due.id}>
                    <td>{due.seq}</td>
                    <td>{formatBusinessDate(due.dueOn)}</td>
                    <td className="text-right">{formatInr(due.amount)}</td>
                    <td className="text-right">{formatInr(due.settled)}</td>
                    <td className="text-right">{formatInr(due.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 className="mb-1 font-bold">{t('lending.papers.statement.collections')}</h3>
            <table className="mb-4">
              <thead>
                <tr>
                  <th className="text-left">{t('lending.papers.statement.date')}</th>
                  <th className="text-left">{t('lending.papers.statement.receiptNo')}</th>
                  <th className="text-left">{t('lending.papers.receipt.mode')}</th>
                  <th className="text-right">{t('lending.papers.statement.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {standing.map((c) => (
                  <tr key={c.id}>
                    <td>{formatBusinessDate(c.collectedOn)}</td>
                    <td>{c.receiptNumber}</td>
                    <td>{t(`lending.mode.${c.mode}`)}</td>
                    <td className="text-right">{formatInr(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {paper === 'closure' && (
          <div className="mb-6 space-y-3 text-sm leading-relaxed">
            <p>
              {t('lending.papers.closure.body', {
                name: loan.borrower.name,
                number: loan.number,
                lent: formatInr(loan.principal),
                givenOn: formatBusinessDate(loan.disbursedOn),
                repaid: formatInr(loan.collected),
              })}
            </p>
            <p className="font-bold">
              {t('lending.papers.closure.noDues', {
                date: formatBusinessDate(loan.closedOn ?? today),
              })}
            </p>
          </div>
        )}

        <footer className="mt-10 flex justify-end">
          <div className="text-right text-sm">
            <p className="mb-8">{t('lending.papers.for', { name: lenderName })}</p>
            <p>{t('lending.papers.signature')}</p>
          </div>
        </footer>
      </div>
    </UbBox>
  );
}
