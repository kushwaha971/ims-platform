'use client';

import type { ReactNode } from 'react';

import { UbDateRangePicker, UbPageHeader, UbPageShell, UbStack } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { TAX_PERIOD_PRESETS } from '../constants/taxReportConstants';

import type { TaxPeriodPreset } from '../types/taxReports.types';

/**
 * The thin local frame the three tax reports share: a one-row header (title
 * left, actions right — icon-only 32 px squares on a phone), the period on
 * the filter bar with the GST presets, and the report under it.
 *
 * Deliberately thin, and named apart from the shared `ReportPageShell` the
 * dashboard/day-book track is building (RPT-common): the props are the same
 * four things that shell takes — title, actions, period, children — so after
 * both merge this file is replaced by the shell at three call sites.
 */
export interface TaxReportLayoutProps {
  readonly title: string;
  readonly actions?: ReactNode;
  readonly preset: TaxPeriodPreset;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly today: string;
  readonly onPresetChange: (preset: TaxPeriodPreset) => void;
  readonly onRangeChange: (from: string | null, to: string | null) => void;
  /** More chip groups on the filter bar's track, after the presets. */
  readonly filters?: ReactNode;
  /** The screen's other scope, in the filter bar's right-hand cluster. */
  readonly scope?: ReactNode;
  readonly testId: string;
  readonly children: ReactNode;
}

export function TaxReportLayout({
  title,
  actions,
  preset,
  dateFrom,
  dateTo,
  today,
  onPresetChange,
  onRangeChange,
  filters,
  scope,
  testId,
  children,
}: Readonly<TaxReportLayoutProps>): React.JSX.Element {
  const { t } = useTranslation();
  const presets = TAX_PERIOD_PRESETS.map((value) => ({
    value,
    label: t(`reports.period.${value}`),
  }));
  return (
    <UbPageShell>
      <UbPageHeader title={title} actions={actions} />
      <UbStack gap={4} data-testid={testId}>
        <UbDateRangePicker<TaxPeriodPreset>
          presets={presets}
          preset={preset}
          onPresetChange={onPresetChange}
          customPreset="custom"
          from={dateFrom}
          to={dateTo}
          onRangeChange={onRangeChange}
          max={today}
          name={`${testId}-period`}
          labels={{
            presets: t('reports.period.label'),
            from: t('reports.period.from'),
            to: t('reports.period.to'),
          }}
          end={scope}
        >
          {filters}
        </UbDateRangePicker>
        {children}
      </UbStack>
    </UbPageShell>
  );
}
