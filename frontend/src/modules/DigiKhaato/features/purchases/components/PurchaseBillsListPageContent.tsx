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
  type UbDataGridLabels,
  type UbGridState,
} from 'src/design-system/UbDataGrid';
import { useDebounce } from 'src/hooks/useDebounce';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';

import {
  PURCHASE_BILL_PRESETS,
  PURCHASE_BILL_SEARCH_DEBOUNCE_MS,
  PURCHASE_BILL_TABS_ORDER,
  type PurchaseBillPreset,
} from '../constants/purchaseConstants';
import { usePurchaseBillList } from '../hooks/usePurchaseBillList';
import { isPurchaseListNarrowed } from '../view-model/purchaseBillDisplay';

import { createPurchaseBillColumns } from './PurchaseBillColumns';
import { PurchaseBillListStats } from './PurchaseBillListStats';

import type { PurchaseBillListRow, PurchaseBillTab } from '../types/purchase.types';

const NEW_BILL = `${ROUTES.PURCHASE_BILLS}/new`;

/**
 * PUR-03 — `/purchases/bills`: every purchase bill by status tab (counts over
 * the range and search, FR-3), with bought / to pay / count over the filtered
 * set. Rows open the bill; a draft opens in the editor.
 *
 * Not here, deliberately: the row ⋯ menu's Pay and bulk pay (PUR-02, the
 * payments track), and Export (RPT-04's purchase register) — a control for an
 * unbuilt feature is not rendered (docs/DESIGN-SYSTEM.md §5).
 */
export function PurchaseBillsListPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const tier = useGridTier();
  const list = usePurchaseBillList();

  const [search, setSearch] = useState(list.filters.q);
  const debounced = useDebounce(search, PURCHASE_BILL_SEARCH_DEBOUNCE_MS);
  const { setQuery, filters, canWrite } = list;
  useEffect(() => {
    if (debounced.trim() !== filters.q.trim()) setQuery(debounced);
  }, [debounced, filters.q, setQuery]);

  const columns = useMemo(
    () => createPurchaseBillColumns({ t, today: list.today, isCards: tier === 'cards' }),
    [t, list.today, tier]
  );
  const labels = useMemo<UbDataGridLabels>(
    () => ({
      loading: t('purchases.list.loading'),
      pageOf: t('common.grid.pageOf', { page: '{page}', pages: '{pages}' }),
      previousPage: t('common.grid.previousPage'),
      nextPage: t('common.grid.nextPage'),
      pageSize: t('common.grid.pageSize'),
      goToPage: t('common.grid.goToPage', { page: '{page}' }),
      ofTotal: t('common.grid.ofTotal', { total: '{total}' }),
      selectedCount: t('common.grid.selectedCount', { count: 0 }),
      selectAll: t('purchases.list.selectAll'),
      selectRow: t('purchases.list.selectRow', { name: '{name}' }),
      showing: t('common.grid.showing'),
      columns: t('common.grid.columns'),
      showAllColumns: t('common.grid.showAllColumns'),
      sortBy: t('common.grid.sortBy', { column: '{column}' }),
      sortedAscending: t('common.grid.sortedAscending'),
      sortedDescending: t('common.grid.sortedDescending'),
      openRow: t('purchases.list.open', { name: '{name}' }),
    }),
    [t]
  );

  const { refetch, clearFilters, error } = list;
  const newBill = useCallback(() => router.push(NEW_BILL), [router]);
  const emptyStates = useMemo<UbDataGridEmptyStates>(
    () => ({
      firstUse: {
        title: t('purchases.empty.first'),
        description: t('purchases.empty.firstBody'),
        action: canWrite ? (
          <UbButton icon={<Plus className="h-4 w-4" aria-hidden />} onClick={newBill}>
            {t('purchases.newBill')}
          </UbButton>
        ) : undefined,
      },
      filtered: {
        title: t('purchases.empty.filtered'),
        description: t('purchases.empty.filteredBody'),
        action: (
          <UbButton variant="secondary" onClick={clearFilters}>
            {t('common.action.clearFilters')}
          </UbButton>
        ),
      },
      error: {
        title: t('purchases.list.error.title'),
        description: error?.message ?? t('purchases.list.error.body'),
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
          ? isPurchaseListNarrowed(filters)
            ? 'filtered-empty'
            : 'empty'
          : 'rows';

  const presets = useMemo(
    () => PURCHASE_BILL_PRESETS.map((value) => ({ value, label: t(`purchases.period.${value}`) })),
    [t]
  );
  const tabs = useMemo(
    () =>
      PURCHASE_BILL_TABS_ORDER.map((value) => {
        const count = list.counts?.[value];
        const label = t(`purchases.tab.${value}`);
        return { value, label: count ? `${label} · ${count}` : label };
      }),
    [t, list.counts]
  );
  const rowId = useCallback((row: PurchaseBillListRow) => row.id, []);
  const rowName = useCallback(
    (row: PurchaseBillListRow) => `${row.number ?? ''} ${row.party?.name ?? ''}`.trim(),
    []
  );
  const openRow = useCallback(
    (row: PurchaseBillListRow) =>
      router.push(
        row.status === 'draft'
          ? `${ROUTES.PURCHASE_BILLS}/${row.id}/edit`
          : `${ROUTES.PURCHASE_BILLS}/${row.id}`
      ),
    [router]
  );

  if (!list.canRead) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('purchases.noAccess.title')}
          description={t('purchases.noAccess.body')}
        />
      </UbPageShell>
    );
  }

  return (
    <UbPageShell>
      <UbPageHeader
        title={t('purchases.list.title')}
        actions={
          canWrite ? (
            <UbActionLink
              href={NEW_BILL}
              variant="primary"
              icon={<Plus className="h-4 w-4" aria-hidden />}
              iconOnly="mobile"
              data-testid="purchase-bill-new"
            >
              {t('purchases.newBill')}
            </UbActionLink>
          ) : undefined
        }
      />
      <UbStack gap={4} data-testid="purchase-bills-screen">
        <UbDateRangePicker<PurchaseBillPreset>
          presets={presets}
          preset={filters.preset}
          onPresetChange={list.setPreset}
          customPreset="custom"
          from={filters.dateFrom}
          to={filters.dateTo}
          onRangeChange={list.setRange}
          max={list.today}
          name="purchase-period"
          labels={{
            presets: t('purchases.period.label'),
            from: t('purchases.period.from'),
            to: t('purchases.period.to'),
          }}
        />
        {list.totals && <PurchaseBillListStats totals={list.totals} />}
        <UbTabs<PurchaseBillTab>
          value={filters.tab}
          onValueChange={list.setTab}
          tabs={tabs}
          ariaLabel={t('purchases.tab.label')}
          layout="fit"
          trailing={
            <UbSearchInput
              value={search}
              onChange={setSearch}
              placeholder={t('purchases.search.placeholder')}
              aria-label={t('purchases.search.label')}
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
            caption={t('purchases.list.caption')}
            storageId="purchases.columns"
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
