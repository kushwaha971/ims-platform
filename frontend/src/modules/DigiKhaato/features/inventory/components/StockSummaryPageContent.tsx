'use client';

import { useMemo } from 'react';

import { useRouter } from 'next/navigation';

import { Package, TriangleAlert } from 'lucide-react';

import {
  UbActionLink,
  UbButton,
  UbCombobox,
  UbDateInput,
  UbEmptyState,
  UbLink,
  UbPageHeader,
  UbPageShell,
  UbSearchInput,
  UbSelect,
  UbStack,
  UbStatCard,
  UbStatGrid,
  UbStatusBanner,
  UbSwitch,
  UbText,
  isoToday,
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
import { ROUTES, itemPath } from 'src/routes';
import { formatBusinessDate, formatTimestamp } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';
import { formatQuantity } from 'src/utils/quantity';

import { ListExportButton } from 'modules/DigiKhaato/features/imports/components/ListHeaderActions';

import { stockSummaryExportPath } from '../api/stockService';
import { useInventoryMasters } from '../hooks/useInventoryMasters';
import { useStockSummary } from '../hooks/useStockReports';
import { inventoryGridLabels } from '../view-model/gridLabels';

import { StockBadge } from './StockBadge';

import type { StockSummaryFilters, StockSummaryRow } from '../types/item.types';

/** The phone card's disc: a package, not initials — an item is not a person. */
const goodsIcon = (): React.ReactNode => <Package className="h-4 w-4" aria-hidden />;

/** The summary's columns — a module-level factory, so no cell is a component
 * defined during render (react/no-unstable-nested-components). */
const createSummaryColumns = ({
  t,
  tier,
  valuation,
}: {
  readonly t: TranslateFn;
  readonly tier: UbGridTier;
  readonly valuation: boolean;
}): UbDataGridColumn<StockSummaryRow>[] => {
  const isCards = tier === 'cards';
  const base: UbDataGridColumn<StockSummaryRow>[] = [
    {
      id: 'item',
      header: t('items.list.col.item'),
      priority: 1,
      cardSlot: 'title',
      sortField: 'name',
      widthShare: 30,
      cell: (row) =>
        isCards ? (
          row.item.name
        ) : (
          <UbStack gap={0}>
            <UbLink href={itemPath(row.item.id)} variant="body-sm-medium">
              {row.item.name}
            </UbLink>
            <UbText as="span" variant="caption" tone="tertiary" className="ds-mono">
              {row.item.sku}
            </UbText>
          </UbStack>
        ),
    },
    {
      id: 'category',
      header: t('items.list.col.category'),
      priority: 3,
      cardSlot: 'meta',
      widthShare: 14,
      cell: (row) =>
        isCards
          ? [row.item.sku, row.category?.name].filter(Boolean).join(' · ')
          : (row.category?.name ?? '—'),
    },
    {
      id: 'onHand',
      header: t('items.list.col.onHand'),
      priority: 1,
      align: 'end',
      sortField: 'on_hand',
      cardSlot: valuation ? 'meta' : 'trailing',
      widthShare: 16,
      cell: (row) => (
        <UbStack gap={1} align="end">
          <UbText
            as="span"
            variant="body-sm"
            tone={row.onHand.startsWith('-') ? 'error' : 'primary'}
            className="ds-num whitespace-nowrap"
          >
            {formatQuantity(row.onHand, row.item.unitCode)}
          </UbText>
          {!isCards && (
            <StockBadge status={row.stockStatus} onHand={row.onHand} unitCode={row.item.unitCode} />
          )}
        </UbStack>
      ),
    },
  ];
  if (valuation) {
    base.push(
      {
        id: 'avgCost',
        header: t('stock.summary.col.avgCost'),
        priority: 3,
        align: 'end',
        cardSlot: 'none',
        widthShare: 12,
        cell: (row) => (
          <UbText as="span" variant="body-sm" className="ds-num">
            {formatInr(row.avgCost)}
          </UbText>
        ),
      },
      {
        id: 'value',
        header: t('stock.summary.col.value'),
        priority: 1,
        align: 'end',
        sortField: 'value',
        cardSlot: 'trailing',
        widthShare: 14,
        cell: (row) => (
          <UbText
            as="span"
            variant="body-sm-medium"
            tone={row.value?.startsWith('-') ? 'error' : 'primary'}
            className="ds-num whitespace-nowrap"
          >
            {formatInr(row.value)}
          </UbText>
        ),
      }
    );
  }
  base.push({
    id: 'lastMovement',
    header: t('stock.summary.col.lastMovement'),
    priority: 4,
    cardSlot: 'none',
    widthShare: 14,
    cell: (row) => (row.lastMovementAt ? formatTimestamp(row.lastMovementAt) : '—'),
  });
  return base;
};

/**
 * INV-08 — what the shop holds and what it is worth, at weighted-average cost,
 * with the total equal to the sum of the rows shown (FR-8). "As of" turns the
 * screen historical: quantities by movement date, the average as the book held
 * it (CR-2026-09-24-INV-A). Valuation columns are the SERVER's decision — a
 * role without `reports.financial.read` receives rows without them.
 */
export function StockSummaryPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const tier = useGridTier();
  const report = useStockSummary();
  const masters = useInventoryMasters();
  const { filters, update, summary } = report;
  const valuation = summary?.valuationVisible ?? false;
  /* RPT-06 — the report's file of exactly this view, under Reports' own
     permission (the button itself checks `reports.export`). */
  const { can, hasModule } = usePermissions();
  const canExport = hasModule('reports') && can('reports.basic.read');

  const columns = useMemo(() => createSummaryColumns({ t, tier, valuation }), [t, tier, valuation]);

  const labels = useMemo(
    () => inventoryGridLabels(t, 'stock.summary.loading', 'items.list.open'),
    [t]
  );
  const rows = summary?.rows ?? [];
  const filtered = Boolean(filters.q || filters.categoryId || filters.status);
  const gridState: UbGridState =
    report.status === 'loading' || (report.status === 'idle' && !summary)
      ? 'loading'
      : report.status === 'failed'
        ? 'error'
        : rows.length === 0
          ? filtered
            ? 'filtered-empty'
            : 'empty'
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

  const today = isoToday();
  const sortColumn = filters.ordering.replace(/^-/, '');

  return (
    <UbPageShell>
      <UbPageHeader
        title={t('stock.summary.title')}
        actions={
          <>
            <UbDateInput
              name="stock-as-of"
              appearance="inline"
              inlineLabel={t('stock.summary.asOf')}
              aria-label={t('stock.summary.asOf')}
              placeholder={t('items.form.date.placeholder')}
              value={filters.asOf ?? today}
              max={today}
              onChange={(value: string | null) =>
                update({ asOf: value && value !== today ? value : null })
              }
            />
            <UbActionLink
              href={ROUTES.STOCK_LOW}
              variant="secondary"
              icon={<TriangleAlert className="h-4 w-4" aria-hidden />}
              iconOnly="mobile"
            >
              {t('stock.low.title')}
            </UbActionLink>
            {canExport && (
              <ListExportButton
                listPath={stockSummaryExportPath(filters)}
                permission="reports.export"
                empty={summary ? summary.total === 0 : true}
              />
            )}
          </>
        }
      />
      <UbStack gap={4} data-testid="stock-summary-screen">
        {summary?.historical && summary.asOf && (
          <UbStatusBanner
            tone="info"
            title={t('stock.summary.historical', { date: formatBusinessDate(summary.asOf) })}
            action={
              <UbButton variant="secondary" size="sm" onClick={() => update({ asOf: null })}>
                {t('stock.summary.backToToday')}
              </UbButton>
            }
          />
        )}
        {summary && (
          <UbStatGrid>
            {valuation && summary.totals.value !== null && (
              <UbStatCard
                label={t('stock.summary.totalValue')}
                value={formatInr(summary.totals.value)}
                subtext={t('stock.summary.valueNote')}
              />
            )}
            <UbStatCard label={t('stock.summary.items')} value={String(summary.totals.items)} />
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
            firstUse: {
              title: t('stock.summary.empty.title'),
              description: t('stock.summary.empty.body'),
            },
            filtered: {
              title: t('items.list.filtered.title'),
              description: t('items.list.filtered.body'),
              action: (
                <UbButton
                  variant="secondary"
                  onClick={() => update({ q: '', categoryId: '', status: '' })}
                >
                  {t('common.action.clearFilters')}
                </UbButton>
              ),
            },
            error: {
              title: t('stock.summary.error.title'),
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
          caption={t('stock.summary.caption')}
          storageId="stock.summary"
          cardAvatarIcon={goodsIcon}
          page={{
            page: summary?.page ?? 1,
            pageSize: summary?.pageSize ?? 25,
            total: summary?.total ?? 0,
            totalPages: Math.max(Math.ceil((summary?.total ?? 0) / (summary?.pageSize ?? 25)), 1),
          }}
          onPageChange={(page) => update({ page })}
          sort={{
            columnId:
              sortColumn === 'on_hand' ? 'onHand' : sortColumn === 'value' ? 'value' : 'item',
            direction: filters.ordering.startsWith('-') ? 'desc' : 'asc',
          }}
          onSortChange={(next) => {
            const field =
              next.columnId === 'onHand' ? 'on_hand' : next.columnId === 'value' ? 'value' : 'name';
            update({ ordering: next.direction === 'desc' ? `-${field}` : field });
          }}
          onRowOpen={tier === 'cards' ? (row) => router.push(itemPath(row.item.id)) : undefined}
          search={
            <UbSearchInput
              value={filters.q}
              onChange={(q) => update({ q })}
              placeholder={t('items.list.searchPlaceholder')}
              aria-label={t('items.list.searchPlaceholder')}
            />
          }
          filters={
            <UbStack direction="row" gap={2} wrap align="center">
              <UbCombobox
                aria-label={t('items.list.filter.category')}
                value={filters.categoryId || null}
                onChange={(categoryId) => update({ categoryId })}
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
                aria-label={t('stock.summary.filter.status')}
                value={filters.status || 'any'}
                onChange={(value) =>
                  update({
                    status: (value === 'any' ? '' : value) as StockSummaryFilters['status'],
                  })
                }
                options={[
                  { value: 'any', label: t('stock.summary.filter.any') },
                  { value: 'in', label: t('items.stock.in') },
                  { value: 'low', label: t('items.stock.low') },
                  { value: 'out', label: t('items.stock.out') },
                  { value: 'negative', label: t('stock.summary.filter.negative') },
                ]}
                className="w-40"
              />
              <UbSwitch
                checked={filters.hideZero}
                onCheckedChange={(hideZero) => update({ hideZero })}
                label={t('stock.summary.hideZero')}
                className="min-h-10 w-auto"
              />
            </UbStack>
          }
        />
      </UbStack>
    </UbPageShell>
  );
}
