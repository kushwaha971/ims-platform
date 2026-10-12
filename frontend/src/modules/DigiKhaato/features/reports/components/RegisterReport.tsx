'use client';

import { useCallback, useMemo } from 'react';

import { useRouter } from 'next/navigation';

import {
  UbActionLink,
  UbButton,
  UbEmptyState,
  UbFilterChip,
  UbActiveFilters,
  UbFilterChipGroup,
  UbFilterSelect,
  UbFilterSheet,
  UbPageShell,
  UbSwitch,
  type UbFilterSpec,
  type UbFilterValues,
} from 'src/design-system';
import {
  UbDataGrid,
  useGridTier,
  type UbDataGridEmptyStates,
  type UbGridState,
} from 'src/design-system/UbDataGrid';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';

import {
  ITC_FILTERS,
  REGISTER_PARTY_FILTERS,
  REGISTER_STATUS_FILTERS,
  SALES_KIND_FILTERS,
  TAX_PERIOD_PRESETS,
} from '../constants/taxReportConstants';
import { useRegisterReport } from '../hooks/useRegisterReport';
import { useReportGridLabels } from '../hooks/useReportGridLabels';
import { documentHref, isRegisterNarrowed } from '../view-model/registerDisplay';

import { createRegisterColumns } from './RegisterColumns';
import { RegisterTotals } from './RegisterTotals';
import { ReportPageShell } from './ReportPageShell';

import type {
  RegisterBook,
  RegisterFilters,
  RegisterLevel,
  RegisterRow,
  TaxPeriodPreset,
} from '../types/taxReports.types';

/** Where each book's documents are made — the empty book's one action. */
const NEW_DOCUMENT: Readonly<
  Record<RegisterBook, { href: string; label: string; module: 'sales' | 'purchases' }>
> = {
  sales: {
    href: `${ROUTES.SALES_INVOICES}/new`,
    label: 'reports.emptyBook.newSale',
    module: 'sales',
  },
  purchase: {
    href: `${ROUTES.PURCHASE_BILLS}/new`,
    label: 'reports.emptyBook.newPurchase',
    module: 'purchases',
  },
};

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
  const { can, hasModule } = usePermissions();
  const newDocument = NEW_DOCUMENT[book];
  const canCreate =
    hasModule(newDocument.module) &&
    can(book === 'sales' ? 'sales.invoice.write' : 'purchases.bill.write');

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

  /* Approved designs (12 Oct 2026): `hasAny` is the server's, over the whole
     book. A period or filter that found nothing keeps every control — they are
     how the merchant finds the rows; only a business that has never issued (or
     recorded) a document gets the single empty state. `undefined` (an older
     server) never hides anything. */
  const emptyBook =
    report.status === 'succeeded' && rows.length === 0 && report.data?.hasAny === false;

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

  /* The sheet's filters. Each has an "all" value on the wire; to the sheet
     that is "no filter" (''), so the count and the pills say only what is on. */
  const sheetKeys: readonly ('status' | 'kind' | 'party' | 'itc')[] =
    book === 'sales' ? ['status', 'kind', 'party'] : ['status', 'itc'];
  const sheetSource = {
    status: {
      values: REGISTER_STATUS_FILTERS,
      label: t('reports.register.status.label'),
      id: 'reports.register.status',
    },
    kind: {
      values: SALES_KIND_FILTERS,
      label: t('reports.salesRegister.kind.label'),
      id: 'reports.salesRegister.kind',
    },
    party: {
      values: REGISTER_PARTY_FILTERS,
      label: t('reports.salesRegister.party.label'),
      id: 'reports.salesRegister.party',
    },
    itc: {
      values: ITC_FILTERS,
      label: t('reports.purchaseRegister.itc.label'),
      id: 'reports.purchaseRegister.itc',
    },
  } as const;
  /* On a phone "Show void" is a choice inside the Filters sheet, not a switch
     that runs off the end of the one toolbar row (owner, 12 Oct 2026). */
  const phone = tier === 'cards';
  const voidSpec: UbFilterSpec = {
    kind: 'single',
    key: 'includeVoid',
    label: t('reports.register.void.label'),
    anyLabel: t('reports.register.void.leaveOut'),
    options: [{ value: 'yes', label: t('reports.register.void.include') }],
  };
  const baseSpecs: UbFilterSpec[] = sheetKeys.map((key) => {
    const source = sheetSource[key];
    return {
      kind: 'single',
      key,
      label: source.label,
      anyLabel: t(`${source.id}.all`),
      options: (source.values as readonly string[])
        .filter((value) => value !== 'all')
        .map((value) => ({ value, label: t(`${source.id}.${value}`) })),
    };
  });
  const sheetSpecs: UbFilterSpec[] = phone ? [...baseSpecs, voidSpec] : baseSpecs;
  const sheetValues: UbFilterValues = {
    ...Object.fromEntries(
      sheetKeys.map((key) => {
        const value = String((filters as unknown as Record<string, unknown>)[key] ?? 'all');
        return [key, value === 'all' ? '' : value];
      })
    ),
    ...(phone ? { includeVoid: filters.includeVoid ? 'yes' : '' } : {}),
  };
  const applySheet = (next: UbFilterValues) =>
    update({
      ...(Object.fromEntries(
        sheetKeys.map((key) => [key, next[key] || 'all'])
      ) as Partial<RegisterFilters>),
      ...(phone ? { includeVoid: next.includeVoid === 'yes' } : {}),
    });

  // Owner, 6 Oct 2026: each single-choice filter is a dropdown, not a chip row.
  const chips = <K extends keyof RegisterFilters>(
    key: K,
    values: readonly RegisterFilters[K][],
    label: string,
    labelFor: (value: RegisterFilters[K]) => string
  ) => (
    <UbFilterSelect
      spec={{
        kind: 'single',
        key: String(key),
        label,
        options: values.map((value) => ({ value: String(value), label: labelFor(value) })),
      }}
      value={String(filters[key])}
      onChange={(next) => {
        const value = values.find((candidate) => String(candidate) === next);
        if (value !== undefined) update({ [key]: value } as Partial<RegisterFilters>);
      }}
      closeLabel={t('common.action.close')}
    />
  );
  const levels: readonly RegisterLevel[] = ['document', 'line'];

  return (
    <ReportPageShell<TaxPeriodPreset>
      title={t(`${ns}.title`)}
      testId={`${book}-register`}
      emptyBook={
        emptyBook
          ? {
              title: t(`${ns}.emptyBook.title`),
              description: t(`${ns}.emptyBook.body`),
              action: canCreate ? (
                <UbActionLink href={newDocument.href} variant="secondary">
                  {t(newDocument.label)}
                </UbActionLink>
              ) : undefined,
            }
          : null
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
        name: `${book}-register-period`,
        labels: {
          presets: t('reports.period.label'),
          from: t('reports.period.from'),
          to: t('reports.period.to'),
          apply: t('common.action.apply'),
          close: t('common.action.close'),
        },
      }}
      exportAction={{
        path: report.exportPath,
        empty: report.data !== null && report.data.total === 0,
      }}
      /* The grid draws its own loading, error and empty states (it keeps the
         columns and the pager steady across a refetch), so the shell's body
         is always `ready` here. */
      state="ready"
      loadingLabel={t('reports.grid.loading')}
      filters={
        <>
          {chips('level', levels, t('reports.register.level.label'), (v) =>
            t(`reports.register.level.${v}`)
          )}
          {/* Owner, 6 Oct 2026: three or more filters live behind ONE button. */}
          <UbFilterSheet
            specs={sheetSpecs}
            values={sheetValues}
            onApply={applySheet}
            labels={{
              title: t('common.filters.title'),
              apply: t('common.action.apply'),
              reset: t('common.action.reset'),
              close: t('common.action.close'),
            }}
          />
          <UbActiveFilters
            specs={sheetSpecs}
            values={sheetValues}
            onChange={applySheet}
            labels={{
              remove: (pill) => t('common.filters.remove', { filter: pill }),
              clearAll: t('common.filters.clearAll'),
            }}
          />
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
      filterEnd={
        phone ? undefined : (
          <UbSwitch
            checked={filters.includeVoid}
            onCheckedChange={(checked) => update({ includeVoid: checked })}
            label={t('reports.register.showVoid')}
          />
        )
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
    </ReportPageShell>
  );
}
