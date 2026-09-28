'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';

import { Plus } from 'lucide-react';

import {
  UbActionLink,
  UbButton,
  UbDateRangePicker,
  UbEmptyState,
  UbPageHeader,
  UbPageShell,
  UbSearchInput,
  UbStack,
  UbTabs,
} from 'src/design-system';
import {
  UbDataGrid,
  useGridTier,
  type UbDataGridEmptyStates,
  type UbGridState,
} from 'src/design-system/UbDataGrid';
import { useDebounce } from 'src/hooks/useDebounce';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';

import {
  INVOICE_PRESETS,
  INVOICE_SEARCH_DEBOUNCE_MS,
  INVOICE_TABS_ORDER,
  type InvoicePreset,
} from '../constants/salesConstants';
import { useInvoiceList } from '../hooks/useInvoiceList';
import { useSalesGridLabels } from '../hooks/useSalesGridLabels';
import { isNarrowed } from '../view-model/invoiceDisplay';

import { createInvoiceColumns } from './InvoiceColumns';
import { InvoiceListStats } from './InvoiceListStats';
import { SalesSectionLinks } from './SalesSectionLinks';

import type { InvoiceListRow, InvoiceTab } from '../types/sales.types';

const NEW_BILL = `${ROUTES.SALES_INVOICES}/new`;

/**
 * SAL-08 — `/sales/invoices`: every bill, by status tab (counts over the date
 * and search filters, FR-2), with count / total / due over the filtered set
 * (FR-5). Rows open the bill; `N` starts a new one (FR-12).
 */
export function InvoicesListPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const tier = useGridTier();
  const list = useInvoiceList();

  const [search, setSearch] = useState(list.filters.q);
  const debounced = useDebounce(search, INVOICE_SEARCH_DEBOUNCE_MS);
  const { setQuery, filters } = list;
  useEffect(() => {
    if (debounced.trim() !== filters.q.trim()) setQuery(debounced);
  }, [debounced, filters.q, setQuery]);

  // FR-12 — `N` opens a new bill, unless the merchant is typing somewhere.
  const { canWrite } = list;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.closest('input, textarea, select, [contenteditable="true"]');
      if (
        canWrite &&
        !typing &&
        event.key.toLowerCase() === 'n' &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        event.preventDefault();
        router.push(NEW_BILL);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canWrite, router]);

  const columns = useMemo(
    () => createInvoiceColumns({ t, today: list.today, isCards: tier === 'cards' }),
    [t, list.today, tier]
  );
  const labels = useSalesGridLabels();

  const { refetch, clearFilters, error } = list;
  const newBill = useCallback(() => router.push(NEW_BILL), [router]);
  const emptyStates = useMemo<UbDataGridEmptyStates>(
    () => ({
      firstUse: {
        title: t('sales.empty.first'),
        description: t('sales.empty.firstBody'),
        action: canWrite ? (
          <UbButton icon={<Plus className="h-4 w-4" aria-hidden />} onClick={newBill}>
            {t('sales.newBill')}
          </UbButton>
        ) : undefined,
      },
      filtered: {
        title: t('sales.empty.filtered'),
        description: t('sales.empty.filteredBody'),
        action: (
          <UbButton variant="secondary" onClick={clearFilters}>
            {t('common.action.clearFilters')}
          </UbButton>
        ),
      },
      error: {
        title: t('sales.list.error.title'),
        description: error?.message ?? t('sales.list.error.body'),
        requestId: error?.requestId ?? null,
        requestIdLabel: t('common.error.reference'),
        action: (
          <UbButton variant="secondary" onClick={refetch}>
            {t('common.action.retry')}
          </UbButton>
        ),
      },
    }),
    [t, canWrite, newBill, clearFilters, error, refetch]
  );

  const gridState: UbGridState =
    list.status === 'loading' || (list.status === 'idle' && list.canRead)
      ? 'loading'
      : list.status === 'failed'
        ? 'error'
        : list.rows.length === 0
          ? isNarrowed(filters)
            ? 'filtered-empty'
            : 'empty'
          : 'rows';

  const presets = useMemo(
    () => INVOICE_PRESETS.map((value) => ({ value, label: t(`sales.period.${value}`) })),
    [t]
  );
  const tabs = useMemo(
    () =>
      INVOICE_TABS_ORDER.map((value) => {
        const count = list.tabs?.[value];
        const label = t(`sales.tab.${value}`);
        return { value, label: count ? `${label} · ${count}` : label };
      }),
    [t, list.tabs]
  );
  const rowId = useCallback((row: InvoiceListRow) => row.id, []);
  const rowName = useCallback(
    (row: InvoiceListRow) =>
      `${row.number ?? ''} ${row.party?.name ?? row.walkInName ?? ''}`.trim(),
    []
  );
  const openRow = useCallback(
    (row: InvoiceListRow) =>
      router.push(
        row.status === 'draft'
          ? `${ROUTES.SALES_INVOICES}/${row.id}/edit`
          : `${ROUTES.SALES_INVOICES}/${row.id}`
      ),
    [router]
  );

  if (!list.canRead) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('sales.noAccess.title')}
          description={t('sales.noAccess.body')}
        />
      </UbPageShell>
    );
  }

  const totals = list.totals;
  return (
    <UbPageShell>
      <UbPageHeader
        title={t('sales.list.title')}
        actions={
          <>
            <SalesSectionLinks current="invoice" />
            {canWrite && (
              <UbActionLink
                href={NEW_BILL}
                variant="primary"
                icon={<Plus className="h-4 w-4" aria-hidden />}
                iconOnly="mobile"
                data-testid="invoice-new"
              >
                {t('sales.newBill')}
              </UbActionLink>
            )}
          </>
        }
      />
      <UbStack gap={4} data-testid="invoices-screen">
        <UbDateRangePicker<InvoicePreset>
          presets={presets}
          preset={filters.preset}
          onPresetChange={list.setPreset}
          customPreset="custom"
          from={filters.dateFrom}
          to={filters.dateTo}
          onRangeChange={list.setRange}
          max={list.today}
          name="invoice-period"
          labels={{
            presets: t('sales.period.label'),
            from: t('sales.period.from'),
            to: t('sales.period.to'),
          }}
        />
        {totals && <InvoiceListStats totals={totals} />}
        <UbTabs<InvoiceTab>
          value={filters.tab}
          onValueChange={list.setTab}
          tabs={tabs}
          ariaLabel={t('sales.tab.label')}
          layout="fit"
          trailing={
            <UbSearchInput
              value={search}
              onChange={setSearch}
              placeholder={t('sales.search.placeholder')}
              aria-label={t('sales.search.label')}
              className="w-56"
            />
          }
        >
          <UbDataGrid
            rows={list.rows}
            columns={columns}
            rowId={rowId}
            rowName={rowName}
            state={gridState}
            labels={labels}
            emptyStates={emptyStates}
            caption={t('sales.list.caption')}
            storageId="sales.columns"
            page={{
              page: list.page,
              pageSize: list.pageSize,
              total: list.total,
              totalPages: Math.max(Math.ceil(list.total / Math.max(list.pageSize, 1)), 1),
            }}
            onPageChange={list.setPage}
            onRowOpen={openRow}
            cardAvatar={false}
          />
        </UbTabs>
      </UbStack>
    </UbPageShell>
  );
}
