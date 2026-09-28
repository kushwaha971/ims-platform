'use client';

import { useCallback, useMemo } from 'react';

import { useRouter } from 'next/navigation';

import {
  UbButton,
  UbEmptyState,
  UbFilterChip,
  UbFilterChipGroup,
  UbPageShell,
  UbSwitch,
} from 'src/design-system';
import {
  UbDataGrid,
  useGridTier,
  type UbDataGridEmptyStates,
  type UbGridState,
} from 'src/design-system/UbDataGrid';
import { useTranslation } from 'src/hooks/useTranslation';

import { ListExportButton } from '../../imports/components/ListHeaderActions';
import {
  ITC_FILTERS,
  REGISTER_PARTY_FILTERS,
  REGISTER_STATUS_FILTERS,
  SALES_KIND_FILTERS,
} from '../constants/taxReportConstants';
import { useRegisterReport } from '../hooks/useRegisterReport';
import { useReportGridLabels } from '../hooks/useReportGridLabels';
import { documentHref, isRegisterNarrowed } from '../view-model/registerDisplay';

import { createRegisterColumns } from './RegisterColumns';
import { RegisterTotals } from './RegisterTotals';
import { TaxReportLayout } from './TaxReportLayout';

import type {
  RegisterBook,
  RegisterFilters,
  RegisterLevel,
  RegisterRow,
} from '../types/taxReports.types';

/**
 * RPT-03 / RPT-04 — one register screen, for either book.
 *
 * The filter bar carries the period presets, then the view (documents or
 * lines), status, and — per book — kind and B2B/B2C (sales) or ITC
 * (purchases); "Show void" sits on the right with the dates, because it
 * changes what is COUNTED rather than which documents are asked for (FR-5).
 * A drill-down from the GST summary arrives with a tax code in the URL and is
 * shown as a pressed chip that clears it.
 */
export function RegisterReport({ book }: Readonly<{ book: RegisterBook }>): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const tier = useGridTier();
  const report = useRegisterReport(book);
  const labels = useReportGridLabels();
  const { filters, update, refetch, clearFilters, error } = report;
  const ns = book === 'sales' ? 'reports.salesRegister' : 'reports.purchaseRegister';

  const columns = useMemo(
    () => createRegisterColumns({ t, book, level: filters.level, isCards: tier === 'cards' }),
    [t, book, filters.level, tier]
  );
  const emptyStates = useMemo<UbDataGridEmptyStates>(
    () => ({
      firstUse: { title: t(`${ns}.empty.title`), description: t('reports.register.empty.body') },
      filtered: {
        title: t('reports.register.filtered.title'),
        description: t('reports.register.filtered.body'),
        action: (
          <UbButton variant="secondary" onClick={clearFilters}>
            {t('common.action.clearFilters')}
          </UbButton>
        ),
      },
      error: {
        title: t('reports.register.error.title'),
        description: error?.message ?? t('reports.register.error.body'),
        requestId: error?.requestId ?? null,
        requestIdLabel: t('common.error.reference'),
        action: (
          <UbButton variant="secondary" onClick={refetch}>
            {t('common.action.retry')}
          </UbButton>
        ),
      },
    }),
    [t, ns, clearFilters, error, refetch]
  );

  const rows = report.data?.rows ?? [];
  const gridState: UbGridState =
    report.status === 'failed'
      ? 'error'
      : !report.data
        ? 'loading'
        : rows.length === 0
          ? isRegisterNarrowed(filters)
            ? 'filtered-empty'
            : 'empty'
          : 'rows';

  const rowId = useCallback((row: RegisterRow) => row.id, []);
  const rowName = useCallback((row: RegisterRow) => `${row.number} ${row.partyName}`.trim(), []);
  const openRow = useCallback(
    (row: RegisterRow) => router.push(documentHref(book, row)),
    [router, book]
  );

  if (!report.canRead) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('reports.register.noAccess.title')}
          description={t('reports.register.noAccess.body')}
        />
      </UbPageShell>
    );
  }

  const chips = <K extends keyof RegisterFilters>(
    key: K,
    values: readonly RegisterFilters[K][],
    label: string,
    labelFor: (value: RegisterFilters[K]) => string
  ) => (
    <UbFilterChipGroup label={label}>
      {values.map((value) => (
        <UbFilterChip
          key={String(value)}
          label={labelFor(value)}
          pressed={filters[key] === value}
          onToggle={(next) => {
            if (next) update({ [key]: value } as Partial<RegisterFilters>);
          }}
        />
      ))}
    </UbFilterChipGroup>
  );
  const levels: readonly RegisterLevel[] = ['document', 'line'];

  return (
    <TaxReportLayout
      title={t(`${ns}.title`)}
      testId={`${book}-register`}
      preset={filters.preset}
      dateFrom={filters.dateFrom}
      dateTo={filters.dateTo}
      today={report.today}
      onPresetChange={report.setPreset}
      onRangeChange={report.setRange}
      actions={
        <ListExportButton
          listPath={report.exportPath}
          permission="reports.export"
          empty={report.data !== null && report.data.total === 0}
        />
      }
      filters={
        <>
          {chips('level', levels, t('reports.register.level.label'), (v) =>
            t(`reports.register.level.${v}`)
          )}
          {chips('status', REGISTER_STATUS_FILTERS, t('reports.register.status.label'), (v) =>
            t(`reports.register.status.${v}`)
          )}
          {book === 'sales' &&
            chips('kind', SALES_KIND_FILTERS, t('reports.salesRegister.kind.label'), (v) =>
              t(`reports.salesRegister.kind.${v}`)
            )}
          {book === 'sales' &&
            chips('party', REGISTER_PARTY_FILTERS, t('reports.salesRegister.party.label'), (v) =>
              t(`reports.salesRegister.party.${v}`)
            )}
          {book === 'purchase' &&
            chips('itc', ITC_FILTERS, t('reports.purchaseRegister.itc.label'), (v) =>
              t(`reports.purchaseRegister.itc.${v}`)
            )}
          {(filters.taxCode || filters.interState !== null) && (
            <UbFilterChipGroup label={t('reports.register.drill.label')}>
              <UbFilterChip
                label={t('reports.register.drill.chip', {
                  code: filters.taxCode ?? '—',
                  supply: t(
                    filters.interState === null
                      ? 'reports.register.drill.any'
                      : filters.interState
                        ? 'reports.register.drill.inter'
                        : 'reports.register.drill.intra'
                  ),
                })}
                pressed
                onToggle={() => update({ taxCode: null, interState: null })}
              />
            </UbFilterChipGroup>
          )}
        </>
      }
      scope={
        <UbSwitch
          checked={filters.includeVoid}
          onCheckedChange={(checked) => update({ includeVoid: checked })}
          label={t('reports.register.showVoid')}
        />
      }
    >
      {report.data && report.data.total > 0 && (
        <RegisterTotals book={book} totals={report.data.totals} />
      )}
      <UbDataGrid
        rows={rows}
        columns={columns}
        rowId={rowId}
        rowName={rowName}
        state={gridState}
        labels={labels}
        emptyStates={emptyStates}
        caption={t(`${ns}.caption`)}
        storageId={`reports.${book}Register.${filters.level}`}
        page={{
          page: report.data?.page ?? filters.page,
          pageSize: report.data?.pageSize ?? 100,
          total: report.data?.total ?? 0,
          totalPages: Math.max(
            Math.ceil((report.data?.total ?? 0) / Math.max(report.data?.pageSize ?? 100, 1)),
            1
          ),
        }}
        onPageChange={report.setPage}
        onRowOpen={openRow}
        cardAvatar={false}
        allowHorizontalScroll
      />
    </TaxReportLayout>
  );
}
