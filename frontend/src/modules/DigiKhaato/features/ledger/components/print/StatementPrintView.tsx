'use client';

import { UbAmount, UbBox, UbStack, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatInr } from 'src/utils/money';

import {
  balanceDirection,
  balanceLabelId,
  isStruckThrough,
  unsigned,
} from '../../view-model/statementDisplay';

import type {
  StatementParty,
  StatementPeriod,
  StatementRow,
  StatementSummary,
} from '../../types/statement.types';

/**
 * LED-04 §7 — the statement as a sheet of paper.
 *
 * ── Why this is a component and not a PDF ─────────────────────────────────
 * ADR-021 keeps the dependency list closed and FR-5 follows it: the merchant's
 * own browser renders the page and `window.print()` turns it into a PDF or
 * paper. A server-side renderer is Phase 2 (CR-044 says the `.pdf` route is
 * explicitly not mounted at MVP), and it would cost a Python HTML engine and a
 * font pipeline to produce what Chrome already produces from this markup.
 *
 * ── Why it renders the WHOLE period rather than the page ──────────────────
 * A print dialog gets what is in the DOM; it cannot page. So the caller fetches
 * every row first (FR-8) and hands them here. On a statement that already fits,
 * that is one redundant request; the alternative is a branch deciding when to
 * fetch, and a branch that is wrong prints fifty rows of a two-hundred-row
 * dispute.
 *
 * ── What it deliberately omits ────────────────────────────────────────────
 * The header band §7.1 describes carries a logo, an address, a phone number and
 * a GSTIN, and PLT-07 — the screen where a merchant enters them — does not
 * exist. None of them are rendered as blanks or placeholders: EC-4's rule for a
 * missing logo is "trade name only; no broken image", and a statement with an
 * empty GSTIN line looks like a statement from a business that has not
 * registered. The UPI QR (§7.5) is absent for two reasons at once — no
 * `tenant.upi_vpa` to encode and no QR encoder, PAY-03's being blocked on the
 * ADR-021 contradiction C3 — and FR-7 already conditions it on the VPA being
 * set, so its absence is the specified behaviour rather than a gap.
 */
export interface StatementPrintViewProps {
  readonly party: StatementParty;
  readonly period: StatementPeriod;
  readonly summary: StatementSummary;
  readonly rows: readonly StatementRow[];
  readonly shopName: string;
  /** ISO timestamp. Passed in so the markup is a pure function of its props. */
  readonly generatedAt: string;
}

export function StatementPrintView({
  party,
  period,
  summary,
  rows,
  shopName,
  generatedAt,
}: Readonly<StatementPrintViewProps>): React.JSX.Element {
  const { t, d } = useTranslation();

  const periodLabel = period.from
    ? `${d(period.from)} – ${period.to ? d(period.to) : ''}`
    : t('ledger.statement.period.allTime');

  return (
    /* `hidden print:block` — the sheet is not on screen and is the only thing on
       paper. Rendering it into a dialog instead would put a scroll container
       between the merchant and the print dialog, which is the thing EC-9's
       fallback exists to avoid on the browsers that already misbehave. */
    <UbBox className="ub-print-only ub-print-sheet hidden">
      <UbStack gap={4}>
        {/* §7.1 — who is sending it, and to whom, over what period. */}
        <UbStack direction="row" justify="between" align="start" className="gap-6">
          <UbStack gap={1}>
            <UbText variant="h2">{shopName}</UbText>
            <UbText variant="caption" tone="tertiary">
              {t('ledger.statement.title')}
            </UbText>
          </UbStack>
          <UbStack gap={1} className="text-right">
            <UbText variant="h3">{party.name}</UbText>
            {party.mobileMasked && (
              <UbText variant="caption" tone="tertiary">
                {party.mobileMasked}
              </UbText>
            )}
            <UbText variant="caption" tone="tertiary">
              {periodLabel}
            </UbText>
            <UbText variant="caption" tone="tertiary">
              {t('ledger.statement.generatedAt', { at: d(generatedAt.slice(0, 10)) })}
            </UbText>
          </UbStack>
        </UbStack>

        {/* §7.2 — the four figures, before the detail. A customer who only reads
            one line reads this one. */}
        <UbStack direction="row" className="gap-8">
          <UbAmount
            value={unsigned(summary.openingBalance)}
            tone="neutral"
            sign="none"
            label={t('ledger.statement.opening')}
            size="sm"
          />
          <UbAmount
            value={summary.totalDebit}
            tone="receivable"
            sign="none"
            label={t('ledger.statement.youGave')}
            size="sm"
          />
          <UbAmount
            value={summary.totalCredit}
            tone="payable"
            sign="none"
            label={t('ledger.statement.youGot')}
            size="sm"
          />
          <UbAmount
            value={unsigned(summary.closingBalance)}
            tone={balanceDirection(summary.closingBalance) === 'payable' ? 'payable' : 'receivable'}
            sign="none"
            label={t('ledger.statement.closing')}
            size="sm"
          />
        </UbStack>

        {summary.hasEntriesBeforeOpening && (
          <UbText variant="caption" tone="tertiary">
            {t('ledger.statement.beforeOpening')}
          </UbText>
        )}

        <StatementPrintTable rows={rows} opening={summary.openingBalance} />

        {/* §7.4 — the sentence the page exists for, and the one that must not be
            orphaned onto a page of its own. */}
        <UbBox className="ub-print-closing">
          <UbAmount
            value={unsigned(summary.closingBalance)}
            tone={balanceDirection(summary.closingBalance) === 'payable' ? 'payable' : 'receivable'}
            sign="none"
            label={`${t('ledger.statement.closing')} · ${t(balanceLabelId(summary.closingBalance))}`}
            size="lg"
          />
        </UbBox>

        <UbText variant="caption" tone="tertiary">
          {t('ledger.statement.generatedBy', { app: 'DigiKhaato' })}
        </UbText>
      </UbStack>
    </UbBox>
  );
}

/**
 * §7.3 — the ruled table.
 *
 * A real `<table>` rather than the design system's grid, and it is the one place
 * in this product that reaches past `UbDataGrid` on purpose: `display:
 * table-header-group` is what repeats column headings on every printed page,
 * and it only works on an actual `<thead>`. A grid built from divs prints its
 * headings once and leaves page four a wall of unlabelled numbers.
 *
 * `react/forbid-elements` permits this file for that reason — see the eslint
 * override, which names the print directory rather than the rule.
 */
function StatementPrintTable({
  rows,
  opening,
}: Readonly<{ rows: readonly StatementRow[]; opening: string }>): React.JSX.Element {
  const { t, d } = useTranslation();

  return (
    <table>
      <thead>
        <tr>
          <th className="text-left">{t('ledger.statement.date')}</th>
          <th className="text-left">{t('ledger.statement.particulars')}</th>
          <th className="text-right">{t('ledger.statement.youGave')}</th>
          <th className="text-right">{t('ledger.statement.youGot')}</th>
          <th className="text-right">{t('ledger.statement.balance')}</th>
        </tr>
      </thead>
      <tbody>
        {/* The opening as its own row, above the first entry. It is not an
            entry — nothing happened on that line — but a passbook that does not
            show where it started leaves the first running balance looking like
            it came from nowhere. */}
        {/* "Brought forward", not "Opening balance": LED-02's opening ENTRY is
            also called an opening balance, and the printed sheet carried the
            same two words twice meaning two different figures — the period's
            carried-in total and a row on 25 July. A passbook calls this one
            brought forward, and so does this. */}
        <tr>
          <td />
          <td>{t('ledger.statement.opening')}</td>
          <td />
          <td />
          <td className="text-right">{formatInr(unsigned(opening))}</td>
        </tr>
        {rows.map((row) => (
          <tr key={row.id} className={isStruckThrough(row) ? 'line-through opacity-60' : undefined}>
            <td>{d(row.entryDate)}</td>
            <td>
              {row.note.trim() || t(`ledger.entry.type.${row.entryType}`)}
              {row.reason ? ` · ${row.reason}` : ''}
            </td>
            {/* Grouped, with the symbol. A printed statement read "2300.00"
                where a merchant reading it out says "twenty-three hundred
                rupees", and grouping is what makes a column of figures
                scannable — which is the whole reason the columns exist. */}
            <td className="text-right">{row.direction === 'debit' ? formatInr(row.amount) : ''}</td>
            <td className="text-right">{row.direction === 'credit' ? formatInr(row.amount) : ''}</td>
            <td className="text-right">{formatInr(unsigned(row.runningBalance))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
