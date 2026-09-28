'use client';

import { useMemo } from 'react';

import { UbDateRangePicker, UbSwitch } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { STATEMENT_PRESETS } from '../view-model/statementDisplay';

import type { UsePartyStatementResult } from '../hooks/usePartyStatement';

/**
 * LED-04 FR-1 — the period, and whether to show what was corrected.
 *
 * ── Now `UbDateRangePicker`, as the FRD names it ─────────────────────────
 * This was composed here from chips and two date inputs, with a note that it
 * would lift into the design system "in one move" once a second caller
 * appeared. Sprint 3's design-system wave built the component (§32.6.4), so
 * the move is made and the behaviour is unchanged: six presets, the two dates
 * only for Custom, `from` bounded by `to` and both by today, and the
 * corrections switch after the dates in the filter bar's right-hand cluster.
 *
 * The presets are what a merchant actually uses. "This FY" is the default
 * because a shopkeeper asking for "the year" means the financial one, which
 * starts on 1 April; Custom exists for the argument about one month.
 */
export function StatementFilterBar({
  statement,
  today,
}: Readonly<{ statement: UsePartyStatementResult; today: string }>): React.JSX.Element {
  const { t } = useTranslation();
  const { filters, setPreset, setCustomRange, setIncludeCorrections } = statement;

  const presets = useMemo(
    () =>
      STATEMENT_PRESETS.map((preset) => ({
        value: preset,
        label: t(`ledger.statement.period.${preset}`),
      })),
    [t]
  );

  return (
    <UbDateRangePicker
      name="statement"
      presets={presets}
      preset={filters.preset}
      onPresetChange={setPreset}
      customPreset="custom"
      from={filters.dateFrom}
      to={filters.dateTo}
      onRangeChange={setCustomRange}
      max={today}
      labels={{
        presets: t('ledger.statement.period.label'),
        from: t('ledger.statement.period.from'),
        to: t('ledger.statement.period.to'),
      }}
      end={
        /* AC-4. Off by default: a statement a customer reads should show what
           the book says now, not the history of somebody fixing a typo. An
           accountant auditing a dispute turns it on, and the closing balance
           does not move — which is the assertion that proves the ledger's
           arithmetic. */
        <UbSwitch
          checked={filters.includeCorrections}
          onCheckedChange={setIncludeCorrections}
          label={t('ledger.statement.showCorrections')}
          className="min-h-10 w-auto"
        />
      }
    />
  );
}
