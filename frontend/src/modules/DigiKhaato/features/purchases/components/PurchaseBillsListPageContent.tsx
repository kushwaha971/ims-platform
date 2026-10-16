'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';

import { Plus, X } from 'lucide-react';

import {
  UbActionLink,
  UbButton,
  UbDateRangePicker,
  UbEmptyState,
  UbFilterChip,
  UbFilterSheet,
  UbPageHeader,
  UbPageHeaderMobileActions,
  UbPageShell,
  UbSearchInput,
  UbStack,
  UbTabs,
} from 'src/design-system';
import type { UbFilterSpec, UbFilterValues } from 'src/design-system';
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
import { formatBusinessDate } from 'src/utils/dates';

import {
  DEFAULT_PURCHASE_BILL_PRESET,
  PURCHASE_BILL_PRESETS,
  PURCHASE_BILL_SEARCH_DEBOUNCE_MS,
  PURCHASE_BILL_TABS_ORDER,
  type PurchaseBillPreset,
} from '../constants/purchaseConstants';
import { usePurchaseBillList } from '../hooks/usePurchaseBillList';
import {
  DEBIT_NOTE_TABS,
  PURCHASE_ORDER_TABS,
  type PurchaseBillListRow,
  type PurchaseBillTab,
  type PurchaseKind,
} from '../types/purchase.types';
import { isPurchaseListNarrowed } from '../view-model/purchaseBillDisplay';

import { createPurchaseBillColumns } from './PurchaseBillColumns';
import { PurchaseBillListStats } from './PurchaseBillListStats';

/** Shop item 3 — the same list for orders: its words, its tabs, its routes. */
const LIST_COPY = {
  purchase_bill: {
    home: ROUTES.PURCHASE_BILLS,
    tabs: PURCHASE_BILL_TABS_ORDER,
    title: 'purchases.list.title',
    newLabel: 'purchases.newBill',
    emptyFirst: 'purchases.empty.first',
    emptyFirstBody: 'purchases.empty.firstBody',
    tab: 'purchases.tab',
  },
  purchase_order: {
    home: ROUTES.PURCHASE_ORDERS,
    tabs: PURCHASE_ORDER_TABS,
    title: 'purchases.order.listTitle',
    newLabel: 'purchases.order.new',
    emptyFirst: 'purchases.order.empty.first',
    emptyFirstBody: 'purchases.order.empty.firstBody',
    tab: 'purchases.order.tab',
  },
  // Shop P0 — a debit note starts from its bill, so this list has no "New".
  debit_note: {
    home: ROUTES.DEBIT_NOTES,
    tabs: DEBIT_NOTE_TABS,
    title: 'purchases.debitNote.listTitle',
    newLabel: null,
    emptyFirst: 'purchases.debitNote.empty.first',
    emptyFirstBody: 'purchases.debitNote.empty.firstBody',
    tab: 'purchases.debitNote.tab',
  },
} as const;

/**
 * PUR-03 — `/purchases/bills`: every purchase bill by status tab (counts over
 * the range and search, FR-3), with bought / to pay / count over the filtered
 * set. Rows open the bill; a draft opens in the editor.
 *
 * Not here, deliberately: the row ⋯ menu's Pay and bulk pay (PUR-02, the
 * payments track), and Export (RPT-04's purchase register) — a control for an
 * unbuilt feature is not rendered (docs/DESIGN-SYSTEM.md §5).
 */
export function PurchaseBillsListPageContent({
  kind = 'purchase_bill',
}: Readonly<{ kind?: PurchaseKind }>): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const tier = useGridTier();
  const list = usePurchaseBillList(kind);
  const copy = LIST_COPY[kind];
  const order = kind === 'purchase_order';
  const NEW_BILL = `${copy.home}/new`;

  const [search, setSearch] = useState(list.filters.q);
  const debounced = useDebounce(search, PURCHASE_BILL_SEARCH_DEBOUNCE_MS);
  const { setQuery, filters, canWrite } = list;
  useEffect(() => {
    if (debounced.trim() !== filters.q.trim()) setQuery(debounced);
  }, [debounced, filters.q, setQuery]);

  const columns = useMemo(
    () =>
      createPurchaseBillColumns({
        t,
        today: list.today,
        isCards: tier === 'cards',
        order,
        note: kind === 'debit_note',
      }),
    [t, list.today, tier, order, kind]
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
  const newBill = useCallback(() => router.push(NEW_BILL), [router, NEW_BILL]);
  const emptyStates = useMemo<UbDataGridEmptyStates>(
    () => ({
      firstUse: {
        title: t(copy.emptyFirst),
        description: t(copy.emptyFirstBody),
        action:
          canWrite && copy.newLabel ? (
            <UbButton icon={<Plus className="h-4 w-4" aria-hidden />} onClick={newBill}>
              {t(copy.newLabel)}
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
    [t, copy, canWrite, newBill, clearFilters, error, refetch]
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
      copy.tabs.map((value: PurchaseBillTab) => {
        const count = list.counts?.[value];
        const label = t(`${copy.tab}.${value}`);
        return { value, label: count ? `${label} · ${count}` : label };
      }),
    [t, list.counts, copy]
  );
  const rowId = useCallback((row: PurchaseBillListRow) => row.id, []);
  const rowName = useCallback(
    (row: PurchaseBillListRow) => `${row.number ?? ''} ${row.party?.name ?? ''}`.trim(),
    []
  );
  const openRow = useCallback(
    (row: PurchaseBillListRow) =>
      router.push(
        row.status === 'draft' ? `${copy.home}/${row.id}/edit` : `${copy.home}/${row.id}`
      ),
    [router, copy]
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

  /* Approved designs (12 Oct 2026): `hasAny` is the server's, so a period or
     search that found nothing keeps its controls; only a book with none of
     this kind at all is reduced to the empty card. */
  const emptyBook = list.status === 'succeeded' && list.rows.length === 0 && list.hasAny === false;
  const phone = tier === 'cards';
  /* On a phone: the search and ONE Filters button holding the tabs and the
     period; each default reads as "no filter". */
  const phoneSpecs: UbFilterSpec[] = [
    {
      kind: 'single',
      key: 'tab',
      label: t('purchases.tab.label'),
      anyLabel: t(`${copy.tab}.all`),
      options: copy.tabs
        .filter((tab: PurchaseBillTab) => tab !== 'all')
        .map((value: PurchaseBillTab) => ({
          value,
          label: t(`${copy.tab}.${value}`),
          hint: list.counts?.[value] ? String(list.counts[value]) : undefined,
        })),
    },
    {
      kind: 'single',
      key: 'preset',
      label: t('purchases.period.label'),
      anyLabel: t(`purchases.period.${DEFAULT_PURCHASE_BILL_PRESET}`),
      options: PURCHASE_BILL_PRESETS.filter(
        (p) => p !== DEFAULT_PURCHASE_BILL_PRESET && p !== 'custom'
      ).map((value) => ({ value, label: t(`purchases.period.${value}`) })),
    },
    {
      kind: 'dateRange',
      key: 'range',
      label: t('purchases.period.between'),
      fromKey: 'dateFrom',
      toKey: 'dateTo',
      fromLabel: t('purchases.period.from'),
      toLabel: t('purchases.period.to'),
      max: list.today,
    },
  ];
  const custom = filters.preset === 'custom';
  const phoneValues: UbFilterValues = {
    tab: filters.tab === 'all' ? '' : filters.tab,
    preset: filters.preset === DEFAULT_PURCHASE_BILL_PRESET || custom ? '' : filters.preset,
    dateFrom: custom ? filters.dateFrom : '',
    dateTo: custom ? filters.dateTo : '',
  };
  const applyPhone = (next: UbFilterValues) => {
    const ranged = Boolean(next.dateFrom || next.dateTo);
    list.applyFilters({
      tab: (next.tab || 'all') as PurchaseBillTab,
      preset: ranged
        ? 'custom'
        : ((next.preset || DEFAULT_PURCHASE_BILL_PRESET) as PurchaseBillPreset),
      dateFrom: next.dateFrom || filters.dateFrom,
      dateTo: next.dateTo || filters.dateTo,
    });
  };
  const searchBox = (
    <UbSearchInput
      value={search}
      onChange={setSearch}
      placeholder={t('purchases.search.placeholder')}
      aria-label={t('purchases.search.label')}
      className={phone ? 'min-w-0 flex-1' : 'w-56'}
    />
  );
  // WP-06 — a due-date window a dashboard link brought; shown so the list does
  // not read as every unpaid bill, and one tap drops it.
  const dueChip =
    filters.dueFrom && filters.dueTo ? (
      <UbFilterChip
        label={t('purchases.list.dueWindow', {
          from: formatBusinessDate(filters.dueFrom),
          to: formatBusinessDate(filters.dueTo),
        })}
        pressed
        onToggle={list.clearDue}
        adornment={<X className="h-3.5 w-3.5" aria-hidden />}
        className="self-start"
      />
    ) : null;
  const stats = list.totals ? (
    <PurchaseBillListStats totals={list.totals} order={order} kind={kind} />
  ) : null;
  const grid = (
    <UbDataGrid
      rows={list.rows}
      columns={columns}
      rowId={rowId}
      rowName={rowName}
      state={gridState}
      labels={labels}
      emptyStates={emptyStates}
      caption={t('purchases.list.caption')}
      storageId={order ? 'purchaseOrders.columns' : 'purchases.columns'}
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
  );
  return (
    <UbPageShell>
      <UbPageHeader
        title={t(copy.title)}
        primaryAction={
          canWrite && copy.newLabel && !emptyBook ? (
            <UbActionLink
              href={NEW_BILL}
              variant="primary"
              icon={<Plus className="h-4 w-4" aria-hidden />}
              iconOnly="mobile"
              data-testid="purchase-bill-new"
            >
              {t(copy.newLabel)}
            </UbActionLink>
          ) : undefined
        }
        /* docs/mobile-redesign (A3) — on a phone: a worded ⋯ sheet and the
           primary action as the floating button. Desktop is unchanged. */
        renderMobileActions={(actions) => (
          <UbPageHeaderMobileActions
            actions={actions}
            mobile={{
              menuLabel: t('common.action.moreActions'),
              closeLabel: t('common.action.close'),
              // The empty book's one button is in the middle of the screen.
              primary:
                canWrite && copy.newLabel && !emptyBook
                  ? {
                      label: t(copy.newLabel ?? ''),
                      icon: <Plus className="h-6 w-6" aria-hidden />,
                      href: NEW_BILL,
                    }
                  : undefined,
            }}
          />
        )}
      />
      <UbStack gap={4} data-testid="purchase-bills-screen">
        {emptyBook ? (
          /* Owner, 12 Oct 2026: an empty book is one sentence and one button —
             no period, ₹0 totals, tabs or search over nothing. */
          <UbEmptyState
            variant="firstUse"
            title={emptyStates.firstUse.title}
            description={emptyStates.firstUse.description}
            action={emptyStates.firstUse.action}
          />
        ) : phone ? (
          <>
            <UbStack direction="row" gap={2} align="center">
              {searchBox}
              <UbFilterSheet
                compact
                specs={phoneSpecs}
                values={phoneValues}
                onApply={applyPhone}
                labels={{
                  title: t('common.filters.title'),
                  apply: t('common.action.apply'),
                  reset: t('common.action.reset'),
                  close: t('common.action.close'),
                }}
              />
            </UbStack>
            {dueChip}
            {stats}
            {grid}
          </>
        ) : (
          <>
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
                apply: t('common.action.apply'),
                close: t('common.action.close'),
              }}
            />
            {dueChip}
            {stats}
            <UbTabs<PurchaseBillTab>
              value={filters.tab}
              onValueChange={list.setTab}
              tabs={tabs}
              ariaLabel={t('purchases.tab.label')}
              layout="fit"
              trailing={searchBox}
            >
              {grid}
            </UbTabs>
          </>
        )}
      </UbStack>
    </UbPageShell>
  );
}
