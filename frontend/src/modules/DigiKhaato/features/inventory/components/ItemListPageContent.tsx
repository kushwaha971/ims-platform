'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import {
  BarChart3,
  Boxes,
  Package,
  PackageMinus,
  Plus,
  Tags,
  TriangleAlert,
  Wrench,
} from 'lucide-react';

import { SummaryStatGrid } from 'src/components/stats/SummaryStatGrid';
import {
  UbActionLink,
  UbButton,
  UbEmptyState,
  UbPageHeader,
  UbPageHeaderMobileActions,
  UbPageShell,
  UbSearchInput,
  UbStack,
  UbStatCard,
  UbStatusBanner,
  UbTabs,
  UbActiveFilters,
  UbFilterSheet,
  type UbFilterSpec,
  type UbFilterValues,
} from 'src/design-system';
import {
  UbDataGrid,
  useGridTier,
  type UbDataGridEmptyStates,
  type UbGridSort,
  type UbGridState,
} from 'src/design-system/UbDataGrid';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useDebounce } from 'src/hooks/useDebounce';
import { usePermissions } from 'src/hooks/usePermissions';
import { useScannerListener } from 'src/hooks/useScannerListener';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { ROUTES, itemPath } from 'src/routes';
import { formatInr } from 'src/utils/money';

import {
  ImportActionLink,
  ListExportButton,
} from 'modules/DigiKhaato/features/imports/components/ListHeaderActions';

import { itemExportPath, lookupItemByBarcode } from '../api/itemService';
import { useInventoryMasters } from '../hooks/useInventoryMasters';
import { useItemForm } from '../hooks/useItemForm';
import { useItemList } from '../hooks/useItemList';
import { useStockAdjustment } from '../hooks/useStockAdjustment';
import { inventoryGridLabels } from '../view-model/gridLabels';

import { createItemColumns } from './ItemListColumns';

import type { ItemListRow, StockTab } from '../types/item.types';

/* The form and the adjustment drawer belong to the chunk that OPENS them. */
const ItemFormDrawer = dynamic(() => import('./ItemFormDrawer').then((m) => m.ItemFormDrawer), {
  ssr: false,
});
const StockAdjustmentDrawer = dynamic(
  () => import('./StockAdjustmentDrawer').then((m) => m.StockAdjustmentDrawer),
  { ssr: false }
);

/** The phone card's disc: what KIND of item this is, not initials — an item
 *  is not a person (the tag list learned this in PTY-05). */
const itemIcon = (row: ItemListRow): React.ReactNode =>
  row.itemType === 'service' ? (
    <Wrench className="h-4 w-4" aria-hidden />
  ) : (
    <Package className="h-4 w-4" aria-hidden />
  );

/**
 * INV-02 — Items: find anything by name, SKU or scanned barcode, see stock
 * health at a glance, and reach the stock screens. The list doubles as the
 * stock register, which is why the tabs are the stock states.
 */
export function ItemListPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const tier = useGridTier();
  const list = useItemList();
  const itemForm = useItemForm();
  const adjustment = useStockAdjustment();
  const { can } = usePermissions();
  const masters = useInventoryMasters();
  const [unknownCode, setUnknownCode] = useState<string | null>(null);

  const { filters, update } = list;
  const phone = tier === 'cards';
  const sheetSpecs: UbFilterSpec[] = [
    /* On a phone the stock tabs move into the one Filters sheet as well
       (approved design, 12 Oct 2026): four tabs and a sheet button were two
       rows of controls above the first item. */
    ...(phone
      ? [
          {
            kind: 'single' as const,
            key: 'tab',
            label: t('items.list.tabs'),
            anyLabel: t('items.list.tab.all'),
            options: (['in', 'low', 'out'] as const).map((tab) => ({
              value: tab,
              label: t(`items.list.tab.${tab}`),
              hint: list.counts ? String(list.counts[tab]) : undefined,
            })),
          },
        ]
      : []),
    {
      kind: 'single',
      key: 'type',
      label: t('items.list.filter.type'),
      anyLabel: t('items.list.filter.typeAny'),
      options: [
        { value: 'goods', label: t('items.form.type.goods') },
        { value: 'service', label: t('items.form.type.service') },
      ],
    },
    {
      kind: 'single',
      key: 'categoryId',
      label: t('items.list.filter.category'),
      anyLabel: t('items.list.filter.categoryAny'),
      options: masters.categoryOptions,
    },
    {
      kind: 'single',
      key: 'status',
      label: t('items.list.filter.status'),
      anyLabel: t('items.list.filter.active'),
      options: [{ value: 'archived', label: t('items.list.filter.archived') }],
    },
  ];
  // "Active" is the list's default, so to the sheet it is "no filter".
  const sheetValues: UbFilterValues = {
    tab: phone && filters.tab !== 'all' ? filters.tab : '',
    type: filters.type,
    categoryId: filters.categoryId ?? '',
    status: filters.status === 'archived' ? 'archived' : '',
  };
  const applySheet = (next: UbFilterValues) =>
    update({
      // Only a CHANGED tab: `update` resets the sort for a new tab.
      ...(phone && (next.tab || 'all') !== filters.tab
        ? { tab: (next.tab || 'all') as StockTab }
        : {}),
      type: (next.type ?? '') as '' | 'goods' | 'service',
      categoryId: next.categoryId ?? '',
      status: next.status === 'archived' ? 'archived' : 'active',
    });
  const [draft, setDraft] = useState(filters.q);
  const settled = useDebounce(draft, 300);
  /* The typed text reaches the URL once it has settled (300 ms, INV-02 FR-2).
     The latest `update`/`q` are read through a ref so that ONLY a settled
     change fires this — a "Clear filters" that empties the URL must not be
     answered by the old text being pushed straight back. */
  const latest = useRef({ update, q: filters.q });
  useEffect(() => {
    latest.current = { update, q: filters.q };
  });
  useEffect(() => {
    if (settled !== latest.current.q) latest.current.update({ q: settled.slice(0, 80) });
  }, [settled]);
  /* The URL's q changed from outside the box (Clear filters, Back): the box
     follows. Adjusted during render rather than in an effect, React's
     recommended way to derive state from a changing prop. */
  const [syncedQ, setSyncedQ] = useState(filters.q);
  if (syncedQ !== filters.q) {
    setSyncedQ(filters.q);
    if (draft.trim() !== filters.q) setDraft(filters.q);
  }

  const openScan = useCallback(
    async (code: string) => {
      const hit = await lookupItemByBarcode(code).catch(() => null);
      if (hit) {
        router.push(itemPath(hit.id));
        return true;
      }
      setUnknownCode(code);
      dispatch(showSnackbar({ severity: 'warning', id: 'items.scan.notFound', params: { code } }));
      return false;
    },
    [router, dispatch]
  );

  /* FR-6 — a scan anywhere on the page (focus outside a text field) opens the item. */
  useScannerListener((code) => void openScan(code), {
    enabled: !itemForm.open && !adjustment.open,
  });

  const columns = useMemo(
    () => createItemColumns({ t, tier, valuation: can('reports.financial.read') }),
    [t, tier, can]
  );
  const labels = useMemo(
    () => inventoryGridLabels(t, 'items.list.loading', 'items.list.open'),
    [t]
  );

  const canWrite = can('inventory.item.write');
  const canAdjust = can('inventory.stock.adjust');
  const canReadStock = can('inventory.stock.read');
  /* INV-08 EC-4 — the server omits valuation without this; the tile is not
     rendered at all rather than reading "—". */
  const canSeeValuation = can('reports.financial.read');

  const emptyStates = useMemo<UbDataGridEmptyStates>(
    () => ({
      firstUse: {
        title: t('items.list.empty.title'),
        description: t('items.list.empty.body'),
        action: canWrite ? (
          <UbButton onClick={() => itemForm.openCreate()}>{t('items.list.add')}</UbButton>
        ) : undefined,
      },
      filtered: {
        title: t('items.list.filtered.title'),
        description:
          filters.type === 'service' && filters.tab !== 'all'
            ? t('items.list.filtered.services')
            : t('items.list.filtered.body'),
        action: (
          <UbButton variant="secondary" onClick={list.clearFilters}>
            {t('common.action.clearFilters')}
          </UbButton>
        ),
      },
      error: {
        title: t('items.list.error.title'),
        description: list.error?.message ?? t('items.list.error.body'),
        requestId: list.error?.requestId ?? null,
        requestIdLabel: t('common.error.reference'),
        action: (
          <UbButton variant="secondary" onClick={list.refetch}>
            {t('common.action.retry')}
          </UbButton>
        ),
      },
    }),
    [t, canWrite, itemForm, filters.type, filters.tab, list.clearFilters, list.error, list.refetch]
  );

  const gridState: UbGridState =
    list.status === 'loading' || (list.status === 'idle' && list.rows.length === 0)
      ? 'loading'
      : list.status === 'failed'
        ? 'error'
        : list.rows.length === 0
          ? list.isFiltered
            ? 'filtered-empty'
            : 'empty'
          : 'rows';

  const sort = useMemo<UbGridSort>(() => {
    const direction = filters.ordering.startsWith('-') ? 'desc' : 'asc';
    const field = filters.ordering.replace(/^-/, '');
    const columnId =
      field === 'selling_price' ? 'sellingPrice' : field === 'on_hand' ? 'onHand' : 'item';
    return { columnId, direction };
  }, [filters.ordering]);

  const handleSort = useCallback(
    (next: UbGridSort) => {
      const field =
        next.columnId === 'sellingPrice'
          ? 'selling_price'
          : next.columnId === 'onHand'
            ? 'on_hand'
            : 'name';
      update({ ordering: next.direction === 'desc' ? `-${field}` : field });
    },
    [update]
  );

  const counts = list.counts;
  const tabs = useMemo(
    () =>
      (['all', 'in', 'low', 'out'] as const).map((tab) => ({
        value: tab,
        label: counts
          ? t('items.list.tab.withCount', { label: t(`items.list.tab.${tab}`), count: counts[tab] })
          : t(`items.list.tab.${tab}`),
      })),
    [counts, t]
  );

  const handleOpen = useCallback((row: ItemListRow) => router.push(itemPath(row.id)), [router]);
  const rowId = useCallback((row: ItemListRow) => row.id, []);
  const rowName = useCallback((row: ItemListRow) => row.name, []);

  if (!list.canRead) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('items.noAccess.title')}
          description={t('items.noAccess.body')}
        />
      </UbPageShell>
    );
  }

  const lowOut = counts ? counts.low + counts.out : null;

  /** No item at all, archived included (the server's `hasAny`). */
  const emptyBook = list.status === 'succeeded' && list.rows.length === 0 && list.hasAny === false;
  const grid = (
    <UbDataGrid
      rows={list.rows}
      columns={columns}
      rowId={rowId}
      rowName={rowName}
      state={gridState}
      labels={labels}
      emptyStates={emptyStates}
      caption={t('items.list.caption')}
      storageId="items.list"
      cardAvatarIcon={itemIcon}
      page={{
        page: list.page,
        pageSize: list.pageSize,
        total: list.total,
        totalPages: Math.max(list.totalPages, 1),
      }}
      onPageChange={(page) => update({ page })}
      sort={sort}
      onSortChange={handleSort}
      onRowOpen={tier === 'cards' ? handleOpen : undefined}
      search={
        <UbSearchInput
          value={draft}
          onChange={setDraft}
          placeholder={t('items.list.searchPlaceholder')}
          aria-label={t('items.list.searchPlaceholder')}
          onKeyDown={(event) => {
            /* FR-7 — a code typed or scanned into the search box plus
               Enter tries the exact lookup first. */
            if (event.key === 'Enter' && draft.trim().length >= 4) {
              event.preventDefault();
              void openScan(draft.trim()).then((found) => {
                if (!found) update({ q: draft.trim() });
              });
            }
          }}
        />
      }
      filters={
        /* Owner, 6 Oct 2026: type, category and status behind ONE Filters
           button (they took three selects, and three rows on a phone);
           what is on shows beside it as pills. */
        <>
          <UbFilterSheet
            compact
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
        </>
      }
    />
  );

  return (
    <UbPageShell>
      <UbPageHeader
        title={t('items.list.title')}
        actions={
          <>
            {canReadStock && (
              <UbActionLink
                href={ROUTES.STOCK_SUMMARY}
                variant="secondary"
                icon={<BarChart3 className="h-4 w-4" aria-hidden />}
                iconOnly="mobile"
              >
                {t('items.list.stockSummary')}
              </UbActionLink>
            )}
            <UbActionLink
              href={ROUTES.ITEM_MASTERS}
              variant="secondary"
              icon={<Tags className="h-4 w-4" aria-hidden />}
              iconOnly="mobile"
            >
              {t('items.list.masters')}
            </UbActionLink>
            {/* IMP-01 FR-14 / IMP-02 FR-13 — see the party list's header. */}
            <ImportActionLink kind="items" />
            <ListExportButton
              listPath={itemExportPath(filters)}
              permission="reports.export"
              empty={list.status === 'succeeded' && list.total === 0}
            />
            {canAdjust && (
              <UbButton
                variant="secondary"
                icon={<PackageMinus className="h-4 w-4" aria-hidden />}
                iconOnly="mobile"
                onClick={() => adjustment.openFor()}
              >
                {t('items.list.adjust')}
              </UbButton>
            )}
          </>
        }
        primaryAction={
          canWrite && !emptyBook ? (
            <UbButton
              icon={<Plus className="h-4 w-4" aria-hidden />}
              iconOnly="mobile"
              onClick={() => itemForm.openCreate()}
              data-testid="item-add"
            >
              {t('items.list.add')}
            </UbButton>
          ) : undefined
        }
        /* docs/mobile-redesign (A3) — six icon squares became a worded ⋯
           sheet on a phone, and Add item the floating button. */
        renderMobileActions={(actions) => (
          <UbPageHeaderMobileActions
            actions={actions}
            mobile={{
              menuLabel: t('common.action.moreActions'),
              closeLabel: t('common.action.close'),
              // The empty catalogue's one button is in the middle of the screen.
              primary:
                canWrite && !emptyBook
                  ? {
                      label: t('items.list.add'),
                      icon: <Plus className="h-6 w-6" aria-hidden />,
                      onClick: () => itemForm.openCreate(),
                    }
                  : undefined,
            }}
          />
        )}
      />

      <UbStack gap={4} data-testid="item-list-screen">
        {unknownCode && (
          <UbStatusBanner
            tone="warning"
            title={t('items.scan.notFound', { code: unknownCode })}
            action={
              canWrite ? (
                <UbButton
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    itemForm.openCreate({ barcode: unknownCode });
                    setUnknownCode(null);
                  }}
                >
                  {t('items.scan.create')}
                </UbButton>
              ) : undefined
            }
          />
        )}

        {list.totals && !emptyBook && (
          <SummaryStatGrid storageKey="items">
            <UbStatCard
              icon={<Boxes className="h-4 w-4" aria-hidden />}
              label={t('items.list.stat.items')}
              value={String(list.totals.items)}
              /* The phone fold (CR-130): the count is already on the "All"
                 tab, and a third tile would sit alone on its own row. */
              className="max-md:hidden"
            />
            {canSeeValuation && list.totals.stockValue !== null && (
              <UbStatCard
                label={t('items.list.stat.value')}
                value={formatInr(list.totals.stockValue)}
                subtext={t('items.list.stat.valueHint')}
              />
            )}
            {lowOut !== null && (
              <UbStatCard
                icon={<TriangleAlert className="h-4 w-4" aria-hidden />}
                label={t('items.list.stat.lowOut')}
                value={String(lowOut)}
                tone={lowOut > 0 ? 'warning' : 'default'}
                onClick={() => update({ tab: 'low' })}
                pressed={filters.tab === 'low'}
              />
            )}
          </SummaryStatGrid>
        )}

        {emptyBook ? (
          /* Owner, 12 Oct 2026: "I don't want that type of screen in case of
             empty" — one sentence and one button on the page; no ₹0 totals,
             tabs, search or Filters over an empty catalogue. */
          <UbEmptyState
            variant="firstUse"
            title={emptyStates.firstUse.title}
            description={emptyStates.firstUse.description}
            action={emptyStates.firstUse.action}
          />
        ) : phone ? (
          grid
        ) : (
          <UbTabs<StockTab>
            value={filters.tab}
            onValueChange={(tab) => update({ tab })}
            tabs={tabs}
            ariaLabel={t('items.list.tabs')}
            layout="fit"
          >
            {grid}
          </UbTabs>
        )}
      </UbStack>

      {itemForm.open && <ItemFormDrawer form={itemForm} />}
      {adjustment.open && <StockAdjustmentDrawer adjustment={adjustment} />}
    </UbPageShell>
  );
}
