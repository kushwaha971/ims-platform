import { UbLink, UbStack, UbText } from 'src/design-system';
import type { UbDataGridColumn, UbGridTier } from 'src/design-system/UbDataGrid';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { itemPath } from 'src/routes';
import { formatInr } from 'src/utils/money';

import { onHandText } from '../view-model/itemDisplay';

import { StockBadge } from './StockBadge';

import type { ItemListRow } from '../types/item.types';

/**
 * INV-02 §7 — Item (name + SKU) · Category · Unit · Selling · Purchase · GST ·
 * On hand (badge + quantity). On a phone card: name, SKU and category as meta,
 * the badge and quantity trailing (FR-11).
 */
export const createItemColumns = ({
  t,
  tier,
  valuation = true,
}: {
  readonly t: TranslateFn;
  readonly tier: UbGridTier;
  /** INV-08 EC-4 — without `reports.financial.read` the Purchase column goes. */
  readonly valuation?: boolean;
}): readonly UbDataGridColumn<ItemListRow>[] => {
  const isCards = tier === 'cards';
  const columns: UbDataGridColumn<ItemListRow>[] = [
    {
      id: 'item',
      header: t('items.list.col.item'),
      priority: 1,
      cardSlot: 'title',
      sortField: 'name',
      widthShare: 28,
      cell: (row) =>
        isCards ? (
          row.name
        ) : (
          <UbStack gap={0} className="min-w-0">
            <UbLink href={itemPath(row.id)} variant="body-sm-medium" className="line-clamp-2">
              {row.name}
            </UbLink>
            <UbText as="span" variant="caption" tone="tertiary" className="ds-mono truncate">
              {row.sku}
            </UbText>
          </UbStack>
        ),
    },
    {
      id: 'category',
      header: t('items.list.col.category'),
      priority: 3,
      /* On a phone card this is the meta line: the SKU disambiguates two
         items of one name (EC-11), the category says which shelf. */
      cardSlot: 'meta',
      widthShare: 14,
      cell: (row) =>
        isCards
          ? [row.sku, row.category?.name].filter(Boolean).join(' · ')
          : (row.category?.name ?? '—'),
    },
    {
      id: 'unit',
      header: t('items.list.col.unit'),
      priority: 4,
      cardSlot: 'none',
      widthShare: 8,
      cell: (row) => row.unit.code,
    },
    {
      id: 'sellingPrice',
      header: t('items.list.col.selling'),
      priority: 2,
      align: 'end',
      cardSlot: 'none',
      sortField: 'selling_price',
      widthShare: 12,
      cell: (row) => (
        <UbText as="span" variant="body-sm" className="ds-num">
          {formatInr(row.sellingPrice)}
        </UbText>
      ),
    },
    {
      id: 'purchasePrice',
      header: t('items.list.col.purchase'),
      priority: 4,
      align: 'end',
      cardSlot: 'none',
      widthShare: 12,
      cell: (row) => (
        <UbText as="span" variant="body-sm" className="ds-num">
          {formatInr(row.purchasePrice)}
        </UbText>
      ),
    },
    {
      id: 'tax',
      header: t('items.list.col.gst'),
      priority: 4,
      cardSlot: 'none',
      widthShare: 8,
      cell: (row) => row.taxCode,
    },
    {
      id: 'onHand',
      header: t('items.list.col.onHand'),
      priority: 1,
      align: 'end',
      cardSlot: 'trailing',
      sortField: 'on_hand',
      widthShare: 18,
      cell: (row) => (
        <UbStack gap={1} align="end">
          <UbText
            as="span"
            variant="body-sm"
            tone={row.onHand === null ? 'muted' : row.onHand.startsWith('-') ? 'error' : 'primary'}
            className="ds-num whitespace-nowrap"
          >
            {onHandText(row)}
          </UbText>
          <StockBadge status={row.stockStatus} onHand={row.onHand} unitCode={row.unit.code} />
        </UbStack>
      ),
    },
  ];
  return valuation ? columns : columns.filter((column) => column.id !== 'purchasePrice');
};
