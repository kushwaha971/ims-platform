'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';

import { ArrowLeft, Download, Printer } from 'lucide-react';

import {
  UbActionLink,
  UbAmount,
  UbBox,
  UbButton,
  UbCard,
  UbDivider,
  UbEmptyState,
  UbLink,
  UbPageHeader,
  UbPageShell,
  UbSkeleton,
  UbStack,
  UbStatCard,
  UbStatGrid,
  UbStatusBadge,
  UbStatusBanner,
  UbText,
} from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation, type TranslateFn } from 'src/hooks/useTranslation';
import { selectActiveTenant, selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { partyPath } from 'src/routes';
import { todayInTenantTz } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import { statementCsvUrl } from '../api/statementService';
import { usePartyStatement } from '../hooks/usePartyStatement';
import { entryAmountView, writtenOffLines } from '../view-model/entryDisplay';
import {
  balanceDirection,
  balanceLabelId,
  isStruckThrough,
  unsigned,
} from '../view-model/statementDisplay';

import { StatementPrintView } from './print/StatementPrintView';
import { StatementFilterBar } from './StatementFilterBar';

import type { StatementRow } from '../types/statement.types';

/**
 * LED-04 — the hisaab, on screen.
 *
 * The one page in this product a customer will read over the merchant's
 * shoulder, which is why the numbers are laid out as a passbook rather than as
 * a feed: two money columns and a balance, in the order things happened, with
 * the opening above the first row and the closing under the last.
 */
export function PartyStatementPageContent({ id }: Readonly<{ id: string }>): React.JSX.Element {
  const { t, d } = useTranslation();
  const timezone = useAppSelector(selectTenantTimezone);
  const tenant = useAppSelector(selectActiveTenant);
  const statement = usePartyStatement(id);
  const today = useMemo(() => todayInTenantTz(timezone ?? undefined), [timezone]);

  if (!statement.canRead) {
    /* A module the tenant has not enabled, or a role that may not read the
       ledger. Not an error screen — there is nothing wrong — and not an empty
       statement either, which would be a claim about this party. */
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('ledger.statement.noAccess.title')}
          description={t('ledger.statement.noAccess.body')}
        />
      </UbPageShell>
    );
  }

  return (
    <UbPageShell>
      {/* `data-testid` rather than a landmark, and it earns its place: this
          page renders the statement TWICE — once for the screen and once as the
          sheet — and jsdom applies no stylesheet, so a test that cannot tell
          them apart would pass if the screen rendered nothing at all and only
          the print view did. */}
      <UbBox className="ub-print-hide" data-testid="statement-screen">
        {/* The way back is a link above the title rather than a prop on the
            header, because `UbPageHeader` has none — and a statement is a place
            a merchant arrives at FROM a khata and returns to, so leaving them to
            the browser's back button on a page whose filters rewrite the URL is
            leaving them to press it four times. */}
        <UbLink href={partyPath(id)} variant="caption" tone="tertiary">
          <UbStack direction="row" align="center" className="gap-1">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            {t('ledger.statement.backToKhata')}
          </UbStack>
        </UbLink>
        <UbPageHeader
          /* The customer's name IS the title, with "Statement" moved into the
             back link above it. "Statement · Ramesh Traders" in one header is
             what a 360 px phone rendered as "Statement · Ramesh Trad…" — and
             the half it cut was the half that says which customer. `UbPageHeader`
             has no eyebrow slot, and adding one for a single caller is what §23
             says not to do; the link above already carries the context. */
          title={statement.party?.name ?? t('ledger.statement.title')}
          subtitle={
            statement.party?.mobileMasked
              ? `${t('ledger.statement.title')} · ${statement.party.mobileMasked}`
              : t('ledger.statement.title')
          }
          actions={<StatementActions statement={statement} id={id} t={t} />}
        />

        <UbStack gap={4} className="pt-4">
          <StatementFilterBar statement={statement} today={today} />

          {statement.rangeProblem && (
            <UbStatusBanner
              tone="error"
              title={t(`ledger.statement.range.${statement.rangeProblem}`)}
            />
          )}

          {statement.summary?.hasEntriesBeforeOpening && (
            <UbStatusBanner tone="info" title={t('ledger.statement.beforeOpening')} />
          )}

          {statement.summary && <StatementSummaryStrip statement={statement} t={t} />}

          <UbCard>
            <UbStack gap={3}>
              {statement.isLoading && (
                <UbSkeleton variant="list" count={6} label={t('common.loading')} />
              )}

              {statement.status === 'failed' && (
                <UbEmptyState
                  variant="error"
                  title={t('ledger.statement.error.title')}
                  description={t('ledger.statement.error.body')}
                  requestId={statement.error?.requestId}
                  requestIdLabel={t('common.error.reference')}
                  action={
                    <UbButton variant="secondary" onClick={statement.refetch}>
                      {t('common.action.retry')}
                    </UbButton>
                  }
                />
              )}

              {statement.isEmpty && (
                <UbEmptyState
                  variant="firstUse"
                  title={t('ledger.statement.empty.title')}
                  description={t('ledger.statement.empty.body')}
                />
              )}

              {statement.rows.length > 0 && (
                <>
                  {/* The opening as a row of its own, above the first entry: a
                      passbook that does not show where it started leaves the
                      first running balance looking like it came from nowhere. */}
                  <UbStack direction="row" justify="between" align="center" className="gap-3">
                    <UbText variant="body-sm" tone="tertiary">
                      {t('ledger.statement.opening')}
                    </UbText>
                    <UbAmount
                      value={unsigned(statement.summary?.openingBalance ?? '0.00')}
                      tone="neutral"
                      sign="none"
                      label={t(balanceLabelId(statement.summary?.openingBalance ?? '0.00'))}
                      labelHidden
                      size="sm"
                    />
                  </UbStack>
                  {statement.rows.map((row) => (
                    <UbBox key={row.id}>
                      <UbDivider />
                      <StatementRowView row={row} t={t} d={d} />
                    </UbBox>
                  ))}
                </>
              )}

              {statement.hasMore && (
                <UbButton
                  variant="ghost"
                  onClick={statement.loadMore}
                  busy={statement.isLoadingMore}
                  busyLabel={t('ledger.statement.loadingMore')}
                  fullWidth
                >
                  {t('ledger.statement.loadMore')}
                </UbButton>
              )}
            </UbStack>
          </UbCard>
        </UbStack>
      </UbBox>

      {/* The sheet. Hidden on screen, and the only thing on paper — see the
          print stylesheet in `app/globals.css`. */}
      {statement.party && statement.summary && (
        <StatementPrintView
          party={statement.party}
          period={{ from: statement.filters.dateFrom, to: statement.filters.dateTo }}
          summary={statement.summary}
          rows={statement.printRows ?? statement.rows}
          shopName={tenant?.name ?? ''}
          generatedAt={today}
        />
      )}
    </UbPageShell>
  );
}

/**
 * FR-5 and FR-10 — print, and export.
 *
 * ── Why printing is two steps and a `useEffect` ───────────────────────────
 * A print dialog gets what is in the DOM, so the whole period has to be fetched
 * before `window.print()` is called (FR-8). Calling it straight after the
 * dispatch would print whatever was on screen, which on a two-hundred-row
 * statement is the first fifty rows under a closing balance computed from all
 * two hundred — a document that does not add up, handed to a customer.
 *
 * So the click asks for the rows and the effect prints when they arrive. The
 * ref is what stops the effect from printing again every time the rows change
 * for some other reason.
 */
function StatementActions({
  statement,
  id,
  t,
}: Readonly<{
  statement: ReturnType<typeof usePartyStatement>;
  id: string;
  t: TranslateFn;
}>): React.JSX.Element {
  const wantsPrint = useRef(false);

  useEffect(() => {
    if (!wantsPrint.current || statement.printStatus !== 'succeeded') return;
    wantsPrint.current = false;
    /* EC-9 — a browser that blocks `window.print()` in a PWA or an iframe.
       There is no reliable way to detect the block, so the call is guarded and
       a failure surfaces as the fallback rather than as nothing happening,
       which is what a merchant sees today when a print silently does not fire. */
    try {
      window.print();
    } catch {
      window.open(window.location.href, '_blank', 'noopener');
    }
  }, [statement.printStatus]);

  const print = useCallback(() => {
    wantsPrint.current = true;
    statement.prepareForPrint();
  }, [statement]);

  /* Both are header actions, so both are buttons of one kind — outline, icon
     and word — and on a phone both are icons on the title's line. Export was a
     text link beside a filled button, two visual languages for one job. */
  return (
    <>
      <UbButton
        variant="outlineNeutral"
        icon={<Printer className="h-4 w-4" aria-hidden />}
        iconOnly="mobile"
        busy={statement.printStatus === 'loading'}
        busyLabel={t('ledger.statement.preparing')}
        onClick={print}
      >
        {t('ledger.statement.print')}
      </UbButton>
      {/* Hidden rather than disabled for a role that may not export (§19.7.5):
          a control that refuses is a support call. An anchor rather than a
          fetch, so the browser saves the stream the server is already writing
          instead of the client holding five thousand rows in memory. */}
      {statement.canExport && (
        <UbActionLink
          href={statementCsvUrl(id, statement.filters)}
          download
          icon={<Download className="h-4 w-4" aria-hidden />}
          iconOnly="mobile"
        >
          {t('ledger.statement.export')}
        </UbActionLink>
      )}
    </>
  );
}

/** FR-1's summary strip. Net change is derived rather than fetched — see the selector. */
function StatementSummaryStrip({
  statement,
  t,
}: Readonly<{
  statement: ReturnType<typeof usePartyStatement>;
  t: TranslateFn;
}>): React.JSX.Element | null {
  const summary = statement.summary;
  if (!summary) return null;
  const closing = summary.closingBalance;

  return (
    <UbStatGrid>
      {/* `formatInr` on every figure, because `UbStatCard` takes a
          PREFORMATTED value — and §23.2.4's note applies here as it does on the
          party list: receivable is the ledger's debit family and uses `danger`,
          which is not the validation red, and what a shop is owed is `success`.
          The tone names are the design system's; the meaning is the ledger's. */}
      <UbStatCard
        label={t('ledger.statement.opening')}
        value={formatInr(unsigned(summary.openingBalance))}
        tone="default"
      />
      <UbStatCard
        label={t('ledger.statement.youGave')}
        value={formatInr(summary.totalDebit)}
        tone="danger"
      />
      <UbStatCard
        label={t('ledger.statement.youGot')}
        value={formatInr(summary.totalCredit)}
        tone="success"
      />
      {/* CR-2026-09-24-A — the period's write-offs, neither gave nor got, and
          only when there are any. With it the strip adds up on its face:
          brought forward + gave − got − written off = closing (a payable
          write-off is added back, and its tile says so). */}
      {writtenOffLines(summary.writtenOff).map((line) => (
        <UbStatCard
          key={line.side}
          label={t('ledger.statement.writtenOff', { side: line.side })}
          value={formatInr(line.amount)}
          tone="default"
        />
      ))}
      <UbStatCard
        label={t('ledger.statement.closing')}
        value={formatInr(unsigned(closing))}
        subtext={t(balanceLabelId(closing))}
        tone={balanceDirection(closing) === 'payable' ? 'success' : 'danger'}
      />
    </UbStatGrid>
  );
}

/**
 * One line of the statement.
 *
 * Two money columns and a balance on a laptop; on a phone the same three
 * figures stack, because 360 px cannot hold five columns and a statement with a
 * horizontal scrollbar is a statement nobody reads past column three.
 */
function StatementRowView({
  row,
  t,
  d,
}: Readonly<{
  row: StatementRow;
  t: TranslateFn;
  d: (value: string) => string;
}>): React.JSX.Element {
  const struck = isStruckThrough(row);
  const view = entryAmountView(row.direction, row.entryType);
  /* A write-off stores its reason as its note too (PTY-04 FR-3), so the title
     already says it — the timeline's `entryReason` drops the echo, and so does
     this row. */
  const reason = row.reason && row.reason.trim() !== row.note.trim() ? row.reason : null;

  /* One line on a laptop — date, particulars, amount, balance, the way a
     passbook is ruled — and stacked on a phone. It was stacked everywhere, so a
     three-entry statement filled a 1440 px screen with 94 px rows. */
  return (
    <UbStack
      direction="row"
      justify="between"
      align="start"
      className="gap-3 py-3 md:items-center md:gap-6"
    >
      <UbStack gap={1} className="min-w-0 flex-1 md:flex-row md:items-center md:gap-6">
        <UbText
          variant="caption"
          tone="tertiary"
          className="md:ds-body-base-regular md:w-24 md:shrink-0"
        >
          {d(row.entryDate)}
        </UbText>
        <UbStack gap={1} className="min-w-0 flex-1">
          <UbText
            variant="body"
            className={
              struck
                ? 'line-clamp-2 break-words line-through opacity-60'
                : 'line-clamp-2 break-words'
            }
          >
            {row.note.trim() || t(`ledger.entry.type.${row.entryType}`)}
          </UbText>
          {/* The badges and the reason sit under the title, on their own line —
            the rule LED-03 arrived at after the ⋯ squeezed a khata row's note
            to a sliver. */}
          {(struck || reason) && (
            <UbStack direction="row" align="center" className="flex-wrap gap-2">
              {struck && (
                <UbStatusBadge label={t('ledger.correction.badge.reversed')} tone="neutral" />
              )}
              {reason && (
                <UbText variant="caption" tone="tertiary" className="line-clamp-2 break-words">
                  {reason}
                </UbText>
              )}
            </UbStack>
          )}
        </UbStack>
      </UbStack>

      <UbStack align="end" className="gap-1 md:flex-row md:items-center md:gap-6">
        {/* `entryAmountView` rather than a ternary on the direction, and the
            screenshot sweep is why: an opening balance came out labelled "You
            gave ₹2,300.00" — nothing was given, the party already owed it when
            the book started. LED-02 fixed exactly that on the timeline and
            wrote down the words; a second decision here is how the two screens
            come to disagree about the same row, which is what that view-model
            exists to prevent. */}
        <UbAmount
          value={row.amount}
          tone={view.tone}
          sign="none"
          label={t(view.labelId)}
          size="sm"
        />
        {/* The running balance, which is the column a customer actually follows.
            Quieter than the amount on purpose: the amount is what happened, the
            balance is where it left them, and both shouting is neither.
 
            Through `formatInr`, because the raw decimal string printed
            "Balance ₹2300.00" — ungrouped, on the figure a customer reads out.
            That is the FIFTH time the formatter pair has met in this codebase. */}
        <UbText variant="caption" tone="tertiary" className="md:w-44 md:text-right">
          {t('ledger.statement.balanceAfter', { amount: formatInr(unsigned(row.runningBalance)) })}
        </UbText>
      </UbStack>
    </UbStack>
  );
}
