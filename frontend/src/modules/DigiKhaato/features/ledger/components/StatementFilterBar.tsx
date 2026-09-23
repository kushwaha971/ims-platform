'use client';

import { useCallback } from 'react';

import {
  UbDateInput,
  UbFilterBar,
  UbFilterChip,
  UbFilterChipGroup,
  UbStack,
  UbSwitch,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { STATEMENT_PRESETS } from '../view-model/statementDisplay';

import type { UsePartyStatementResult } from '../hooks/usePartyStatement';
import type { StatementPreset } from '../types/statement.types';

/**
 * LED-04 FR-1 — the period, and whether to show what was corrected.
 *
 * ── Why this is not `UbDateRangePicker` ───────────────────────────────────
 * The FRD names that component and the design system does not have it. §23's
 * rule is that a `Ub*` is added when the pattern recurs in two features, and
 * the second caller is RPT-04 and the reports that follow it — none of which
 * exist. So the control is composed here from the chips and the date inputs the
 * design system already has, in a shape that lifts to a component in one move:
 * six presets and two bounded dates, with the presets doing the work.
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

  /* `onToggle` is called with the state the chip WILL be in, and a period is a
     single choice rather than a set — so turning one OFF means nothing, and the
     handler ignores `false`. Re-tapping the applied preset leaves it applied,
     which is what a merchant expects of a period they have already chosen. */
  const choose = useCallback(
    (preset: StatementPreset) => (next: boolean) => {
      if (next) setPreset(preset);
    },
    [setPreset]
  );

  return (
    <UbFilterBar>
      <UbFilterChipGroup label={t('ledger.statement.period.label')}>
        {STATEMENT_PRESETS.map((preset) => (
          <UbFilterChip
            key={preset}
            label={t(`ledger.statement.period.${preset}`)}
            pressed={filters.preset === preset}
            onToggle={choose(preset)}
          />
        ))}
      </UbFilterChipGroup>

      {/* Shown only for Custom. A pair of date boxes beside six chips is two
          ways of answering one question, and on a 360 px phone it is also the
          two controls that push the chips off the screen. */}
      {filters.preset === 'custom' && (
        <UbStack direction="row" className="flex-wrap gap-3">
          <UbDateInput
            name="statement-from"
            aria-label={t('ledger.statement.period.from')}
            value={filters.dateFrom ?? ''}
            max={filters.dateTo ?? today}
            onChange={(value: string | null) => setCustomRange(value || null, filters.dateTo)}
          />
          <UbDateInput
            name="statement-to"
            aria-label={t('ledger.statement.period.to')}
            value={filters.dateTo ?? ''}
            min={filters.dateFrom ?? undefined}
            max={today}
            onChange={(value: string | null) => setCustomRange(filters.dateFrom, value || null)}
          />
        </UbStack>
      )}

      {/* AC-4. Off by default: a statement a customer reads should show what
          the book says now, not the history of somebody fixing a typo. An
          accountant auditing a dispute turns it on, and the closing balance
          does not move — which is the assertion that proves the ledger's
          arithmetic. */}
      <UbSwitch
        checked={filters.includeCorrections}
        onCheckedChange={setIncludeCorrections}
        label={t('ledger.statement.showCorrections')}
      />
    </UbFilterBar>
  );
}
