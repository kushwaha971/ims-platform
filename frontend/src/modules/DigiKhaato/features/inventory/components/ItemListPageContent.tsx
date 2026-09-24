'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { BarChart3, Boxes, PackageMinus, Plus, Tags, TriangleAlert } from 'lucide-react';

import {
  UbActionLink,
  UbButton,
  UbCombobox,
  UbEmptyState,
  UbPageHeader,
  UbPageShell,
  UbSearchInput,
  UbSelect,
  UbStack,
  UbStatCard,
  UbStatGrid,
  UbStatusBanner,
  UbTabs,
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

import { lookupItemByBarcode } from '../api/itemService';
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

  const columns = useMemo(() => createItemColumns({ t, tier }), [t, tier]);
  const labels = useMemo(
    () => inventoryGridLabels(t, 'items.list.loading', 'items.list.open'),
    [t]
  );

  const canWrite = can('inventory.item.write');
  const canAdjust = can('inventory.stock.adjust');
  const canReadStock = can('inventory.stock.read');

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
            {canWrite && (
              <UbButton
                icon={<Plus className="h-4 w-4" aria-hidden />}
                iconOnly="mobile"
                onClick={() => itemForm.openCreate()}
                data-testid="item-add"
              >
                {t('items.list.add')}
              </UbButton>
            )}
          </>
        }
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

        {list.totals && (
          <UbStatGrid>
            <UbStatCard
              icon={<Boxes className="h-4 w-4" aria-hidden />}
              label={t('items.list.stat.items')}
              value={String(list.totals.items)}
            />
            <UbStatCard
              label={t('items.list.stat.value')}
              value={formatInr(list.totals.stockValue)}
              subtext={t('items.list.stat.valueHint')}
            />
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
          </UbStatGrid>
        )}

        <UbTabs<StockTab>
          value={filters.tab}
          onValueChange={(tab) => update({ tab })}
          tabs={tabs}
          ariaLabel={t('items.list.tabs')}
          layout="fit"
        >
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
              <UbStack direction="row" gap={2} wrap>
                <UbSelect
                  aria-label={t('items.list.filter.type')}
                  value={filters.type || 'any'}
                  onChange={(value) =>
                    update({ type: value === 'any' ? '' : (value as 'goods' | 'service') })
                  }
                  options={[
                    { value: 'any', label: t('items.list.filter.typeAny') },
                    { value: 'goods', label: t('items.form.type.goods') },
                    { value: 'service', label: t('items.form.type.service') },
                  ]}
                  className="w-36"
                />
                <UbCombobox
                  aria-label={t('items.list.filter.category')}
                  value={filters.categoryId || null}
                  onChange={(value) => update({ categoryId: value })}
                  options={[
                    { value: '', label: t('items.list.filter.categoryAny') },
                    ...masters.categoryOptions,
                  ]}
                  placeholder={t('items.list.filter.categoryAny')}
                  searchPlaceholder={t('items.form.category.search')}
                  emptyLabel={t('items.form.category.empty')}
                  className="w-44"
                />
                <UbSelect
                  aria-label={t('items.list.filter.status')}
                  value={filters.status}
                  onChange={(value) => update({ status: value as 'active' | 'archived' })}
                  options={[
                    { value: 'active', label: t('items.list.filter.active') },
                    { value: 'archived', label: t('items.list.filter.archived') },
                  ]}
                  className="w-36"
                />
              </UbStack>
            }
          />
        </UbTabs>
      </UbStack>

      {itemForm.open && <ItemFormDrawer form={itemForm} />}
      {adjustment.open && <StockAdjustmentDrawer adjustment={adjustment} />}
    </UbPageShell>
  );
}
