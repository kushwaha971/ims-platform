'use client';

import { useCallback, useMemo } from 'react';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { Package, SlidersHorizontal } from 'lucide-react';

import {
  UbButton,
  UbEmptyState,
  UbLink,
  UbPageHeader,
  UbPageShell,
  UbStack,
  UbStatCard,
  UbStatGrid,
  UbText,
} from 'src/design-system';
import {
  UbDataGrid,
  useGridTier,
  type UbDataGridColumn,
  type UbGridState,
  type UbGridTier,
} from 'src/design-system/UbDataGrid';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation, type TranslateFn } from 'src/hooks/useTranslation';
import { itemPath } from 'src/routes';
import { formatInr } from 'src/utils/money';
import { formatQuantity } from 'src/utils/quantity';

import { useStockAdjustment } from '../hooks/useStockAdjustment';
import { useLowStock } from '../hooks/useStockReports';
import { inventoryGridLabels } from '../view-model/gridLabels';

import { StockBadge } from './StockBadge';

import type { LowStockRow } from '../types/item.types';

const StockAdjustmentDrawer = dynamic(
  () => import('./StockAdjustmentDrawer').then((m) => m.StockAdjustmentDrawer),
  { ssr: false }
);

/** The phone card's disc: a package, not initials — an item is not a person. */
const goodsIcon = (): React.ReactNode => <Package className="h-4 w-4" aria-hidden />;

/** Module-level, so no cell is a component defined during render. */
const createLowStockColumns = ({
  t,
  tier,
  canAdjust,
  valuation,
  onAdjust,
}: {
  readonly t: TranslateFn;
  readonly tier: UbGridTier;
  readonly canAdjust: boolean;
  /** INV-08 EC-4 — the server omits costs without `reports.financial.read`. */
  readonly valuation: boolean;
  readonly onAdjust: (row: LowStockRow) => void;
}): UbDataGridColumn<LowStockRow>[] => [
  {
    id: 'item',
    header: t('items.list.col.item'),
    priority: 1,
    cardSlot: 'title',
    widthShare: 26,
    /* A phone card with an Adjust button is not itself a button (a button
       inside a button), so the name is the link to the item there too. */
    cell: (row) =>
      tier === 'cards' && !canAdjust ? (
        row.item.name
      ) : (
        <UbLink
          href={itemPath(row.item.id)}
          variant="body-sm-medium"
          className={tier === 'cards' ? 'block truncate' : undefined}
        >
          {row.item.name}
        </UbLink>
      ),
  },
  {
    id: 'onHand',
    header: t('items.list.col.onHand'),
    priority: 1,
    align: 'end',
    cardSlot: 'trailing',
    widthShare: 18,
    cell: (row) => {
      const figure = (
        <UbStack gap={1} align="end">
          <UbText
            as="span"
            variant="body-sm"
            className="ds-num whitespace-nowrap"
            tone={row.stockStatus === 'out' ? 'error' : 'primary'}
          >
            {formatQuantity(row.onHand, row.item.unitCode)}
          </UbText>
          <StockBadge status={row.stockStatus} onHand={row.onHand} unitCode={row.item.unitCode} />
        </UbStack>
      );
      /* QA: the phone had no per-row "Adjust stock" — the desktop column is
         dropped on cards, so the action rides beside the figure, icon-only. */
      if (tier !== 'cards' || !canAdjust) return figure;
      return (
        <UbStack direction="row" gap={2} align="center">
          {figure}
          <UbButton
            variant="outlineNeutral"
            size="sm"
            iconOnly
            icon={<SlidersHorizontal className="h-4 w-4" aria-hidden />}
            onClick={() => onAdjust(row)}
            aria-label={t('stock.low.adjustItem', { name: row.item.name })}
          >
            {t('items.detail.adjust')}
          </UbButton>
        </UbStack>
      );
    },
  },
  {
    id: 'reorder',
    header: t('items.detail.reorderPoint'),
    priority: 2,
    align: 'end',
    cardSlot: 'meta',
    widthShare: 14,
    cell: (row) =>
      tier === 'cards'
        ? t('stock.low.reorderAt', { qty: formatQuantity(row.reorderPoint, row.item.unitCode) })
        : formatQuantity(row.reorderPoint, row.item.unitCode),
  },
  {
    id: 'suggested',
    header: t('stock.low.col.suggested'),
    priority: 3,
    align: 'end',
    cardSlot: 'none',
    widthShare: 14,
    cell: (row) => formatQuantity(row.suggestedQty, row.item.unitCode),
  },
  ...(valuation
    ? [
        {
          id: 'lastCost',
          header: t('stock.low.col.lastCost'),
          priority: 4 as const,
          align: 'end' as const,
          cardSlot: 'none' as const,
          widthShare: 12,
          /* Never purchased comes back null and reads "—", not "₹0.00" —
             zero would claim the item was bought for nothing. */
          cell: (row: LowStockRow) => formatInr(row.lastPurchaseCost),
        },
      ]
    : []),
  ...(canAdjust && tier !== 'cards'
    ? [
        {
          id: 'actions',
          header: t('stock.low.col.actions'),
          headerHidden: true,
          priority: 2 as const,
          align: 'end' as const,
          cardSlot: 'none' as const,
          widthShare: 16,
          cell: (row: LowStockRow) => (
            <UbButton variant="secondary" size="sm" onClick={() => onAdjust(row)}>
              {t('items.detail.adjust')}
            </UbButton>
          ),
        },
      ]
    : []),
];

/**
 * INV-07 FR-6 — everything at or below its reorder point, out of stock first,
 * with a display-only suggested quantity (`reorder point × 2 − on hand`) and
 * "Adjust stock" per row. "Add purchase" arrives with PUR-01; it is not shown
 * until it opens something.
 */
export function LowStockPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const tier = useGridTier();
  const report = useLowStock();
  const adjustment = useStockAdjustment();
  const { can } = usePermissions();
  const canAdjust = can('inventory.stock.adjust');
  const valuation = can('reports.financial.read');
  const rows = report.low?.rows ?? [];

  const { openFor } = adjustment;
  const onAdjust = useCallback(
    (row: LowStockRow) =>
      openFor([
        {
          id: row.item.id,
          name: row.item.name,
          unit: { id: '', code: row.item.unitCode, allowDecimal: row.item.allowDecimal },
          onHand: row.onHand,
          avgCost: row.avgCost,
          trackStock: true,
        },
      ]),
    [openFor]
  );
  const columns = useMemo(
    () => createLowStockColumns({ t, tier, canAdjust, valuation, onAdjust }),
    [t, tier, canAdjust, valuation, onAdjust]
  );

  const labels = useMemo(() => inventoryGridLabels(t, 'stock.low.loading', 'items.list.open'), [t]);
  const gridState: UbGridState =
    report.status === 'loading' || (report.status === 'idle' && !report.low)
      ? 'loading'
      : report.status === 'failed'
        ? 'error'
        : rows.length === 0
          ? 'empty'
          : 'rows';

  if (!report.canRead) {
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

  return (
    <UbPageShell>
      <UbPageHeader title={t('stock.low.title')} />
      <UbStack gap={4} data-testid="low-stock-screen">
        {report.low && (
          <UbStatGrid>
            <UbStatCard
              label={t('items.stock.out')}
              value={String(report.low.totals.out)}
              tone={report.low.totals.out > 0 ? 'danger' : 'default'}
            />
            <UbStatCard
              label={t('items.stock.low')}
              value={String(report.low.totals.low)}
              tone={report.low.totals.low > 0 ? 'warning' : 'default'}
            />
          </UbStatGrid>
        )}
        <UbDataGrid
          rows={rows}
          columns={columns}
          rowId={(row) => row.item.id}
          rowName={(row) => row.item.name}
          state={gridState}
          labels={labels}
          emptyStates={{
            firstUse: { title: t('stock.low.empty.title'), description: t('stock.low.empty.body') },
            filtered: { title: t('stock.low.empty.title'), description: t('stock.low.empty.body') },
            error: {
              title: t('stock.low.error.title'),
              description: report.error?.message ?? '',
              requestId: report.error?.requestId ?? null,
              requestIdLabel: t('common.error.reference'),
              action: (
                <UbButton variant="secondary" onClick={report.refetch}>
                  {t('common.action.retry')}
                </UbButton>
              ),
            },
          }}
          caption={t('stock.low.caption')}
          storageId="stock.low"
          cardAvatarIcon={goodsIcon}
          page={{
            page: report.low?.page ?? 1,
            pageSize: report.low?.pageSize ?? 25,
            total: report.low?.total ?? 0,
            totalPages: Math.max(
              Math.ceil((report.low?.total ?? 0) / (report.low?.pageSize ?? 25)),
              1
            ),
          }}
          onPageChange={report.setPage}
          onRowOpen={
            tier === 'cards' && !canAdjust ? (row) => router.push(itemPath(row.item.id)) : undefined
          }
        />
      </UbStack>
      {adjustment.open && <StockAdjustmentDrawer adjustment={adjustment} />}
    </UbPageShell>
  );
}
