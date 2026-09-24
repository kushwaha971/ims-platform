'use client';

import { useMemo, useState } from 'react';

import dynamic from 'next/dynamic';

import { Archive, ArchiveRestore, PackageMinus, Pencil } from 'lucide-react';

import {
  UbButton,
  UbConfirmDialog,
  UbEmptyState,
  UbGrid,
  UbInfoRow,
  UbPageHeader,
  UbPageShell,
  UbPageSkeleton,
  UbPanel,
  UbPanelSection,
  UbSectionHeading,
  UbSelect,
  UbStack,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';
import { formatQuantity } from 'src/utils/quantity';

import { useItemDetail } from '../hooks/useItemDetail';
import { useItemForm } from '../hooks/useItemForm';
import { useStockAdjustment } from '../hooks/useStockAdjustment';

import { ItemMovementList } from './ItemMovementList';
import { StockBadge } from './StockBadge';

import type { MovementType } from '../types/item.types';

const ItemFormDrawer = dynamic(() => import('./ItemFormDrawer').then((m) => m.ItemFormDrawer), {
  ssr: false,
});
const StockAdjustmentDrawer = dynamic(
  () => import('./StockAdjustmentDrawer').then((m) => m.StockAdjustmentDrawer),
  { ssr: false }
);
const AdjustmentDetailDialog = dynamic(
  () => import('./AdjustmentDetailDialog').then((m) => m.AdjustmentDetailDialog),
  { ssr: false }
);

const TYPE_FILTERS: readonly (MovementType | 'all')[] = [
  'all',
  'opening',
  'adjust_in',
  'adjust_out',
  'purchase_in',
  'sale_out',
  'reversal',
];

/**
 * INV-03 — "how much do I have, what is it worth, and where did it go?" for
 * one item: the stock card (on hand, average, value = qty × average), the
 * pricing card, and the movement ledger with its source links, newest arrival
 * first. Actions: Edit, Adjust stock, Archive / Restore.
 */
export function ItemDetailPageContent({ id }: Readonly<{ id: string }>): React.JSX.Element {
  const { t } = useTranslation();
  const detail = useItemDetail(id);
  const itemForm = useItemForm();
  const adjustment = useStockAdjustment();
  const [confirm, setConfirm] = useState<'archive' | 'restore' | null>(null);
  const [busy, setBusy] = useState(false);
  const { item, can } = detail;

  const typeOptions = useMemo(
    () =>
      TYPE_FILTERS.map((value) => ({
        value,
        label:
          value === 'all' ? t('items.movements.filter.all') : t(`inventory.movement.type.${value}`),
      })),
    [t]
  );

  if (!item && detail.status === 'failed') {
    const missing = detail.error?.code === 'not_found';
    return (
      <UbPageShell>
        <UbEmptyState
          variant={missing ? 'firstUse' : 'error'}
          title={t(missing ? 'items.detail.notFound.title' : 'items.detail.error.title')}
          description={missing ? t('items.detail.notFound.body') : (detail.error?.message ?? '')}
          action={
            missing ? undefined : (
              <UbButton variant="secondary" onClick={detail.refetch}>
                {t('common.action.retry')}
              </UbButton>
            )
          }
        />
      </UbPageShell>
    );
  }
  if (!item) {
    return <UbPageSkeleton variant="card" />;
  }

  const archived = item.status === 'archived';
  const tracked = item.trackStock && item.itemType === 'goods';
  const stock = item.stock[0];
  const unit = item.unit.code;

  const doConfirm = async () => {
    setBusy(true);
    const ok = confirm === 'archive' ? await detail.archive() : await detail.restore();
    setBusy(false);
    if (ok) setConfirm(null);
  };

  return (
    <UbPageShell>
      <UbPageHeader
        title={item.name}
        subtitle={[item.sku, item.category?.name].filter(Boolean).join(' · ')}
        actions={
          <>
            {!archived && can.write && (
              <UbButton
                variant="secondary"
                icon={<Pencil className="h-4 w-4" aria-hidden />}
                iconOnly="mobile"
                onClick={() => itemForm.openEdit(item)}
              >
                {t('items.detail.edit')}
              </UbButton>
            )}
            {!archived && tracked && can.adjust && (
              <UbButton
                icon={<PackageMinus className="h-4 w-4" aria-hidden />}
                iconOnly="mobile"
                onClick={() => adjustment.openFor([item])}
                data-testid="item-adjust"
              >
                {t('items.detail.adjust')}
              </UbButton>
            )}
            {can.archive && (
              <UbButton
                variant="secondary"
                icon={
                  archived ? (
                    <ArchiveRestore className="h-4 w-4" aria-hidden />
                  ) : (
                    <Archive className="h-4 w-4" aria-hidden />
                  )
                }
                iconOnly="mobile"
                onClick={() => setConfirm(archived ? 'restore' : 'archive')}
              >
                {archived ? t('items.detail.restore') : t('items.detail.archive')}
              </UbButton>
            )}
          </>
        }
      />

      <UbStack gap={4} data-testid="item-detail-screen">
        <UbStack direction="row" gap={2} wrap>
          {archived && <UbStatusBadge tone="neutral" label={t('items.status.archived')} />}
          <UbStatusBadge tone="info" label={t(`items.form.type.${item.itemType}`)} />
          <StockBadge status={item.stockStatus} onHand={item.onHand} unitCode={unit} />
        </UbStack>

        <UbGrid columns={{ base: 1, lg: 2 }} gap={4}>
          <UbPanel>
            <UbPanelSection title={t('items.detail.stock.title')}>
              {tracked && stock ? (
                <UbStack gap={2}>
                  <UbText
                    variant="metric-xl"
                    className="ds-num"
                    tone={stock.onHand.startsWith('-') ? 'error' : 'primary'}
                  >
                    {formatQuantity(stock.onHand, unit)}
                  </UbText>
                  {can.stock && (
                    <>
                      <UbInfoRow
                        label={t('items.detail.avgCost')}
                        value={formatInr(stock.avgCost)}
                      />
                      <UbInfoRow
                        variant="total"
                        label={t('items.detail.value')}
                        value={formatInr(stock.value)}
                      />
                      <UbText variant="caption" tone="tertiary" className="ds-num">
                        {t('items.detail.valueHint', {
                          qty: formatQuantity(stock.onHand, unit),
                          cost: formatInr(stock.avgCost),
                        })}
                      </UbText>
                    </>
                  )}
                  <UbInfoRow
                    label={t('items.detail.reorderPoint')}
                    value={item.reorderPoint ? formatQuantity(item.reorderPoint, unit) : '—'}
                  />
                  {item.opening && (
                    <UbText variant="caption" tone="tertiary">
                      {t('items.detail.opening', {
                        qty: formatQuantity(item.opening.qty, unit),
                        cost: formatInr(item.opening.unitCost ?? '0'),
                        date: formatBusinessDate(item.opening.movementDate),
                      })}
                    </UbText>
                  )}
                </UbStack>
              ) : (
                <UbStack gap={2}>
                  <UbText variant="body-sm" tone="muted">
                    {t('items.detail.notTracked')}
                  </UbText>
                  {item.itemType === 'goods' && can.write && can.adjust && !archived && (
                    <UbButton variant="secondary" size="sm" onClick={() => itemForm.openEdit(item)}>
                      {t('items.detail.enableTracking')}
                    </UbButton>
                  )}
                </UbStack>
              )}
            </UbPanelSection>
          </UbPanel>

          <UbPanel>
            <UbPanelSection title={t('items.detail.pricing.title')}>
              <UbStack gap={2}>
                <UbInfoRow
                  label={t('items.form.sellingPrice.label')}
                  value={formatInr(item.sellingPrice)}
                />
                <UbInfoRow
                  label={t('items.form.purchasePrice.label')}
                  value={formatInr(item.purchasePrice)}
                />
                {item.mrp && (
                  <UbInfoRow label={t('items.form.mrp.label')} value={formatInr(item.mrp)} />
                )}
                <UbInfoRow
                  label={t('items.form.tax.label')}
                  value={
                    item.taxRate
                      ? t('items.detail.taxLine', {
                          name: item.taxRate.name,
                          hsn: item.hsnSac ?? '—',
                        })
                      : item.taxCode
                  }
                />
                {item.taxRate && !item.taxRate.isCurrent && (
                  <UbText variant="caption" tone="warning">
                    {t('items.form.tax.legacy', {
                      date: formatBusinessDate(item.taxRate.effectiveTo ?? ''),
                    })}
                  </UbText>
                )}
                {item.barcode && (
                  <UbInfoRow label={t('items.form.barcode.label')} value={item.barcode} />
                )}
                <UbInfoRow
                  label={t('items.form.unit.label')}
                  value={`${item.unit.code} — ${item.unit.name}`}
                />
              </UbStack>
            </UbPanelSection>
          </UbPanel>
        </UbGrid>

        {tracked && can.stock && (
          <UbStack gap={3}>
            <UbSectionHeading
              title={t('items.detail.movements')}
              aside={
                <UbSelect
                  aria-label={t('items.movements.filter.type')}
                  value={detail.filters.type[0] ?? 'all'}
                  onChange={(value) =>
                    detail.setFilters({
                      ...detail.filters,
                      type: value === 'all' ? [] : [value as MovementType],
                    })
                  }
                  options={typeOptions}
                  className="w-44"
                />
              }
            />
            <ItemMovementList
              movements={detail.movements}
              unitCode={unit}
              status={detail.movementsStatus}
              hasMore={detail.hasMore}
              onLoadMore={detail.loadMore}
              onOpenSource={(sourceId) => adjustment.view(sourceId)}
              emptyAction={
                can.adjust && !archived ? (
                  <UbButton variant="secondary" onClick={() => adjustment.openFor([item])}>
                    {t('items.detail.adjust')}
                  </UbButton>
                ) : undefined
              }
            />
          </UbStack>
        )}
      </UbStack>

      <UbConfirmDialog
        open={confirm !== null}
        onOpenChange={(next) => (next ? undefined : setConfirm(null))}
        title={confirm === 'restore' ? t('items.restore.title') : t('items.archive.title')}
        description={confirm === 'restore' ? t('items.restore.body') : t('items.archive.body')}
        confirmLabel={confirm === 'restore' ? t('items.detail.restore') : t('items.detail.archive')}
        cancelLabel={t('common.action.cancel')}
        closeLabel={t('common.action.close')}
        onConfirm={() => void doConfirm()}
        busy={busy}
        destructive={confirm === 'archive'}
      />
      {itemForm.open && <ItemFormDrawer form={itemForm} />}
      {adjustment.open && <StockAdjustmentDrawer adjustment={adjustment} />}
      {adjustment.viewingId && <AdjustmentDetailDialog canAdjust={can.adjust} />}
    </UbPageShell>
  );
}
