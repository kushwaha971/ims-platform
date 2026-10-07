'use client';

import { useCallback, useMemo } from 'react';

import { useRouter } from 'next/navigation';

import { UbFilterSelect, UbSearchInput } from 'src/design-system';
import {
  UbDataGrid,
  useGridTier,
  type UbDataGridEmptyStates,
  type UbGridState,
} from 'src/design-system/UbDataGrid';
import { useCommittedSearch } from 'src/hooks/useCommittedSearch';
import { useTranslation } from 'src/hooks/useTranslation';

import { PROFIT_GROUPS } from '../constants/profitReportConstants';
import { TAX_PERIOD_PRESETS } from '../constants/taxReportConstants';
import { useProfitReport } from '../hooks/useProfitReport';
import { useReportGridLabels } from '../hooks/useReportGridLabels';
import { orderingOf, profitRowHref, sortOf } from '../view-model/profitDisplay';

import { createProfitColumns, profitRowName } from './ProfitColumns';
import { ProfitSummary } from './ProfitSummary';
import { ReportPageShell } from './ReportPageShell';

import type { ProfitGroup, ProfitRow } from '../types/profitReport.types';
import type { TaxPeriodPreset } from '../types/taxReports.types';

/** Matches the other lists' search: a keystroke is not a request. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Shop item 1 — `/reports/profit`: what the shop made, by item, customer,
 * category or bill, with the period's P&L on top.
 *
 * The approved filter pattern (owner, 6 Oct 2026): the period presets, then ONE
 * dropdown for the view, because it is one choice from four; the grid's own
 * header sorts, and one tap on Profit puts the loss-makers on top. A row opens
 * the item, the customer's khata or the bill.
 */
export function ProfitReportPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const tier = useGridTier();
  const labels = useReportGridLabels();
  const report = useProfitReport();
  const { filters, update, refetch, error } = report;
  const { group } = filters;

  const commitSearch = useCallback((q: string) => update({ q }), [update]);
  const [search, setSearch] = useCommittedSearch(filters.q, commitSearch, SEARCH_DEBOUNCE_MS);

  const columns = useMemo(
    () => createProfitColumns({ t, group, isCards: tier === 'cards' }),
    [t, group, tier]
  );
  const emptyStates = useMemo<UbDataGridEmptyStates>(
    () => ({
      firstUse: {
        title: t('reports.profit.empty.title'),
        description: t('reports.profit.empty.body'),
      },
      filtered: {
        title: t('reports.profit.filtered.title'),
        description: t('reports.profit.filtered.body'),
      },
      error: {
        title: t('reports.profit.error.title'),
        description: error?.message ?? t('reports.profit.error.body'),
        requestId: error?.requestId ?? null,
        requestIdLabel: t('common.error.reference'),
      },
    }),
    [t, error]
  );

  const rows = report.data?.rows ?? [];
  const gridState: UbGridState =
    report.status === 'failed'
      ? 'error'
      : !report.data
        ? 'loading'
        : rows.length === 0
          ? filters.q
            ? 'filtered-empty'
            : 'empty'
          : 'rows';

  const rowId = useCallback((row: ProfitRow) => row.id ?? `none-${group}`, [group]);
  const rowName = useCallback((row: ProfitRow) => profitRowName(t, group, row), [t, group]);
  const openRow = useCallback(
    (row: ProfitRow) => {
      const href = profitRowHref(group, row);
      if (href) router.push(href);
    },
    [router, group]
  );

  return (
    <ReportPageShell<TaxPeriodPreset>
      title={t('reports.profit.title')}
      testId="profit-report"
      noAccess={
        report.canRead
          ? null
          : {
              title: t('reports.profit.noAccess.title'),
              description: t('reports.profit.noAccess.body'),
            }
      }
      period={{
        presets: TAX_PERIOD_PRESETS.map((value) => ({
          value,
          label: t(`reports.period.${value}`),
        })),
        preset: filters.preset,
        onPresetChange: report.setPreset,
        customPreset: 'custom',
        from: filters.dateFrom,
        to: filters.dateTo,
        onRangeChange: report.setRange,
        max: report.today,
        name: 'profit-period',
        labels: {
          presets: t('reports.period.label'),
          from: t('reports.period.from'),
          to: t('reports.period.to'),
          apply: t('common.action.apply'),
          close: t('common.action.close'),
        },
      }}
      filters={
        <UbFilterSelect
          spec={{
            kind: 'single',
            key: 'by',
            label: t('reports.profit.by.label'),
            options: PROFIT_GROUPS.map((value) => ({
              value,
              label: t(`reports.profit.by.${value}`),
            })),
          }}
          value={group}
          onChange={(next) => {
            const value = PROFIT_GROUPS.find((candidate) => candidate === next);
            if (value) update({ group: value as ProfitGroup, q: '' });
          }}
          closeLabel={t('common.action.close')}
        />
      }
      exportAction={{
        path: report.exportPath,
        empty: report.data !== null && report.data.total === 0,
      }}
      /* The grid draws its own loading, error and empty states; the shell's body is always ready. */
      state="ready"
      onRetry={refetch}
      loadingLabel={t('reports.grid.loading')}
    >
      {report.data && report.data.totals.bills > 0 && <ProfitSummary totals={report.data.totals} />}
      <UbDataGrid
        rows={rows}
        columns={columns}
        rowId={rowId}
        rowName={rowName}
        state={gridState}
        labels={labels}
        emptyStates={emptyStates}
        caption={t(`reports.profit.caption.${group}`)}
        storageId={`reports.profit.${group}`}
        page={{
          page: report.data?.page ?? filters.page,
          pageSize: report.data?.pageSize ?? 50,
          total: report.data?.total ?? 0,
          totalPages: Math.max(
            Math.ceil((report.data?.total ?? 0) / Math.max(report.data?.pageSize ?? 50, 1)),
            1
          ),
        }}
        onPageChange={report.setPage}
        sort={sortOf(filters.ordering)}
        onSortChange={(next) => update({ ordering: orderingOf(next.columnId, next.direction) })}
        onRowOpen={group === 'category' ? undefined : openRow}
        search={
          <UbSearchInput
            value={search}
            onChange={setSearch}
            placeholder={t(`reports.profit.search.${group}`)}
            aria-label={t(`reports.profit.search.${group}`)}
          />
        }
        cardAvatar={false}
      />
    </ReportPageShell>
  );
}
