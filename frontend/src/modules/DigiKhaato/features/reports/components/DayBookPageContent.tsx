'use client';

import { useCallback, useMemo } from 'react';

import { ArrowDownLeft, ArrowUpRight, Landmark, Wallet } from 'lucide-react';

import {
  UbButton,
  UbCard,
  UbFilterChip,
  UbFilterChipGroup,
  UbInfoRow,
  UbInputHint,
  UbStack,
  UbStatCard,
  UbStatGrid,
  UbSwitch,
  UbText,
} from 'src/design-system';
import {
  UbDataGrid,
  useGridTier,
  type UbDataGridEmptyStates,
  type UbDataGridLabels,
} from 'src/design-system/UbDataGrid';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import { dayBookExportPath } from '../api/dayBookService';
import { useDayBook } from '../hooks/useDayBook';
import { DAY_BOOK_TYPE_FILTERS, type DayBookRow, type ReportPreset } from '../types/reports.types';
import { DAY_BOOK_PRESETS } from '../view-model/dayBookDisplay';
import { spansDays } from '../view-model/reportPeriod';

import { createDayBookColumns } from './DayBookColumns';
import { DayBookDayGroups } from './DayBookDayGroups';
import { ReportPageShell } from './ReportPageShell';

/**
 * RPT-02 — `/reports/day-book`: everything that happened on a day or a range,
 * in order, with the cash and bank position after every line (the paper
 * roznamcha), for the owner tallying the drawer and the accountant posting a
 * month.
 *
 * Built on `ReportPageShell`: the period (Today by default, FR-5), the type
 * chips (FR-4) and "Show voided" (FR-7) are the scope bar; Export is the same
 * query as a CSV (FR-6, RPT-08). A table from `md` up, and on a phone the
 * rows as cards under a band per date (§5).
 *
 * The drawer — opening, closing, and the running columns — shows only for a
 * reader the server sent it to (`balancesVisible`); anyone else gets the rows
 * and the day's money in and out, with a hint saying who sees the rest.
 */
export function DayBookPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const tier = useGridTier();
  const book = useDayBook();
  const { data, filters } = book;
  const balances = data?.balancesVisible ?? false;
  const multiDay = spansDays(filters.dateFrom, filters.dateTo) > 1;

  const columns = useMemo(
    () => createDayBookColumns({ t, balances, multiDay }),
    [t, balances, multiDay]
  );
  const presets = useMemo(
    () => DAY_BOOK_PRESETS.map((value) => ({ value, label: t(`reports.shell.period.${value}`) })),
    [t]
  );
  const labels = useMemo<UbDataGridLabels>(
    () => ({
      loading: t('reports.daybook.loading'),
      pageOf: t('common.grid.pageOf', { page: '{page}', pages: '{pages}' }),
      previousPage: t('common.grid.previousPage'),
      nextPage: t('common.grid.nextPage'),
      pageSize: t('common.grid.pageSize'),
      goToPage: t('common.grid.goToPage', { page: '{page}' }),
      ofTotal: t('common.grid.ofTotal', { total: '{total}' }),
      selectedCount: t('common.grid.selectedCount', { count: 0 }),
      selectAll: t('reports.daybook.select.all'),
      selectRow: t('reports.daybook.select.row', { name: '{name}' }),
      showing: t('common.grid.showing'),
      columns: t('common.grid.columns'),
      showAllColumns: t('common.grid.showAllColumns'),
      sortBy: t('common.grid.sortBy', { column: '{column}' }),
      sortedAscending: t('common.grid.sortedAscending'),
      sortedDescending: t('common.grid.sortedDescending'),
      openRow: t('reports.daybook.open', { name: '{name}' }),
    }),
    [t]
  );
  const emptyStates = useMemo<UbDataGridEmptyStates>(
    () => ({
      firstUse: {
        title: t('reports.daybook.empty.title'),
        description: t('reports.daybook.empty.body'),
      },
      filtered: {
        title: t('reports.daybook.empty.title'),
        description: t('reports.daybook.empty.filtered'),
      },
      error: { title: t('reports.shell.error.title') },
    }),
    [t]
  );
  const rowId = useCallback((row: DayBookRow) => row.id, []);
  const rowName = useCallback(
    (row: DayBookRow) =>
      [row.number, row.party?.name ?? row.walkInName].filter(Boolean).join(' · ') || row.type,
    []
  );

  const narrowed = filters.types.length > 0;
  const state = !data
    ? book.status === 'failed'
      ? 'error'
      : 'loading'
    : data.rows.length === 0 && !balances
      ? 'empty'
      : 'ready';

  return (
    <ReportPageShell<ReportPreset>
      title={t('reports.daybook.title')}
      description={t('reports.daybook.description')}
      testId="day-book-screen"
      noAccess={
        book.canRead
          ? null
          : {
              title: t('reports.shell.noAccess.title'),
              description: t('reports.shell.noAccess.body'),
            }
      }
      period={{
        presets,
        preset: filters.preset,
        onPresetChange: book.setPreset,
        customPreset: 'custom',
        from: filters.dateFrom,
        to: filters.dateTo,
        onRangeChange: book.setRange,
        max: book.today,
        name: 'day-book-period',
        labels: {
          presets: t('reports.shell.period.label'),
          from: t('reports.shell.period.from'),
          to: t('reports.shell.period.to'),
        },
      }}
      filters={
        <UbFilterChipGroup label={t('reports.daybook.filter.type')}>
          {DAY_BOOK_TYPE_FILTERS.map((group) => (
            <UbFilterChip
              key={group}
              label={t(`reports.daybook.filter.${group}`)}
              pressed={filters.types.includes(group)}
              onToggle={(next) => book.toggleType(group, next)}
            />
          ))}
        </UbFilterChipGroup>
      }
      filterEnd={
        <UbSwitch
          checked={filters.includeVoid}
          onCheckedChange={book.setIncludeVoid}
          label={t('reports.daybook.filter.void')}
        />
      }
      exportAction={
        book.canExport
          ? { path: dayBookExportPath(filters), empty: data ? data.total === 0 : true }
          : undefined
      }
      state={state}
      error={book.error}
      onRetry={book.refetch}
      loadingLabel={t('reports.daybook.loading')}
      empty={{
        title: t('reports.daybook.empty.title'),
        description: narrowed
          ? t('reports.daybook.empty.filtered')
          : t('reports.daybook.empty.body'),
        variant: narrowed ? 'filtered' : 'firstUse',
        action: narrowed ? (
          <UbButton variant="secondary" onClick={book.clearTypes}>
            {t('common.action.clearFilters')}
          </UbButton>
        ) : undefined,
      }}
    >
      {data && (
        <UbStack gap={4}>
          <UbStatGrid>
            {balances && data.opening && (
              <UbStatCard
                icon={<Wallet className="h-4 w-4" aria-hidden />}
                label={t('reports.daybook.opening')}
                value={formatInr(data.opening.cash)}
                subtext={t('reports.daybook.bankFigure', { amount: formatInr(data.opening.bank) })}
              />
            )}
            <UbStatCard
              icon={<ArrowDownLeft className="h-4 w-4" aria-hidden />}
              label={t('reports.daybook.moneyIn')}
              value={formatInr(data.totals.moneyIn)}
              subtext={t('reports.daybook.inRange')}
              tone="success"
            />
            <UbStatCard
              icon={<ArrowUpRight className="h-4 w-4" aria-hidden />}
              label={t('reports.daybook.moneyOut')}
              value={formatInr(data.totals.moneyOut)}
              subtext={t('reports.daybook.inRange')}
              tone="danger"
            />
            {balances && data.closing && (
              <>
                <UbStatCard
                  icon={<Wallet className="h-4 w-4" aria-hidden />}
                  label={t('reports.daybook.closingCash')}
                  value={formatInr(data.closing.cash)}
                  subtext={t('reports.daybook.asOn', { date: formatBusinessDate(filters.dateTo) })}
                />
                <UbStatCard
                  icon={<Landmark className="h-4 w-4" aria-hidden />}
                  label={t('reports.daybook.closingBank')}
                  value={formatInr(data.closing.bank)}
                  subtext={t('reports.daybook.asOn', { date: formatBusinessDate(filters.dateTo) })}
                />
              </>
            )}
          </UbStatGrid>
          {!balances && <UbInputHint>{t('reports.daybook.balancesHidden')}</UbInputHint>}

          {tier === 'cards' ? (
            <>
              {data.rows.length === 0 ? (
                <UbText variant="body-sm" tone="tertiary">
                  {narrowed ? t('reports.daybook.empty.filtered') : t('reports.daybook.empty.body')}
                </UbText>
              ) : (
                <DayBookDayGroups rows={data.rows} balances={balances} t={t} />
              )}
              {data.totalPages > 1 && (
                <UbStack direction="row" justify="between" align="center" className="gap-2">
                  <UbButton
                    variant="secondary"
                    size="sm"
                    disabled={filters.page <= 1}
                    onClick={() => book.setPage(filters.page - 1)}
                  >
                    {t('common.grid.previousPage')}
                  </UbButton>
                  <UbText variant="caption" tone="tertiary">
                    {t('reports.daybook.pageOf', { page: filters.page, pages: data.totalPages })}
                  </UbText>
                  <UbButton
                    variant="secondary"
                    size="sm"
                    disabled={filters.page >= data.totalPages}
                    onClick={() => book.setPage(filters.page + 1)}
                  >
                    {t('common.grid.nextPage')}
                  </UbButton>
                </UbStack>
              )}
            </>
          ) : (
            <UbDataGrid
              rows={data.rows}
              columns={columns}
              rowId={rowId}
              rowName={rowName}
              state={data.rows.length === 0 ? (narrowed ? 'filtered-empty' : 'empty') : 'rows'}
              labels={labels}
              emptyStates={emptyStates}
              caption={t('reports.daybook.caption')}
              storageId="reports.daybook"
              tier={tier}
              page={{
                page: data.page,
                pageSize: data.pageSize,
                total: data.total,
                totalPages: data.totalPages,
              }}
              onPageChange={book.setPage}
              busy={book.status === 'refreshing'}
            />
          )}

          <UbCard title={t('reports.daybook.totals.title')} padded>
            <UbStack gap={1}>
              {(
                [
                  ['sales', data.totals.sales],
                  ['creditNotes', data.totals.creditNotes],
                  ['purchases', data.totals.purchases],
                  ['paymentsIn', data.totals.paymentsIn],
                  ['paymentsOut', data.totals.paymentsOut],
                  ['expenses', data.totals.expenses],
                ] as const
              ).map(([key, value]) => (
                <UbInfoRow
                  key={key}
                  label={t(`reports.daybook.totals.${key}`)}
                  value={formatInr(value)}
                />
              ))}
              {balances && data.closing && (
                <>
                  <UbInfoRow
                    variant="total"
                    label={t('reports.daybook.closingCash')}
                    value={formatInr(data.closing.cash)}
                  />
                  <UbInfoRow
                    variant="total"
                    label={t('reports.daybook.closingBank')}
                    value={formatInr(data.closing.bank)}
                  />
                </>
              )}
              <UbText variant="caption" tone="tertiary">
                {t('reports.daybook.totals.rows', { count: data.total })}
              </UbText>
            </UbStack>
          </UbCard>
        </UbStack>
      )}
    </ReportPageShell>
  );
}
