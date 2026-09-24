import type { UbStatusBadgeTone } from 'src/design-system';
import { formatQuantity } from 'src/utils/quantity';

import { MOVEMENT_TYPE_LABEL_ID } from '../constants/inventoryConstants';

import type { ItemListRow, MovementType, StockStatus } from '../types/item.types';

/**
 * §17.6.0 "Stock badge tones" — out (danger), low (warning), in stock
 * (success); untracked goods and services carry no badge at all. The label is
 * always a WORD (INV-02 UX: "badges carry text labels"); a negative on-hand is
 * said with its signed quantity, "Out of stock · −3 NOS".
 */
export interface StockBadgeView {
  readonly tone: UbStatusBadgeTone;
  readonly labelId: string;
  readonly params: Record<string, string>;
}

export const stockBadge = (
  status: StockStatus | null,
  onHand: string | null,
  unitCode: string
): StockBadgeView | null => {
  if (status === null || onHand === null) return null;
  if (status === 'out') {
    const negative = onHand.trim().startsWith('-');
    return negative
      ? {
          tone: 'error',
          labelId: 'items.stock.outNegative',
          params: { qty: formatSignedQuantity(onHand, unitCode) },
        }
      : { tone: 'error', labelId: 'items.stock.out', params: {} };
  }
  if (status === 'low') return { tone: 'warning', labelId: 'items.stock.low', params: {} };
  return { tone: 'success', labelId: 'items.stock.in', params: {} };
};

/** "−3 NOS" / "+12 NOS" — a true minus sign, never a hyphen. */
export const formatSignedQuantity = (qty: string, unitCode?: string): string => {
  const negative = qty.trim().startsWith('-');
  const magnitude = formatQuantity(negative ? qty.trim().slice(1) : qty, unitCode);
  return negative ? `−${magnitude}` : `+${magnitude}`;
};

export const movementLabelId = (type: MovementType): string =>
  MOVEMENT_TYPE_LABEL_ID[type] ?? 'inventory.movement.type.unknown';

export const isInbound = (qty: string): boolean => !qty.trim().startsWith('-');

/** The row's on-hand cell: a quantity for tracked goods, "—" for the rest. */
export const onHandText = (row: Pick<ItemListRow, 'onHand' | 'unit'>): string =>
  row.onHand === null ? '—' : formatQuantity(row.onHand, row.unit.code);

/**
 * INV-01 FR-2 / BR-2 steps (a)–(c): the SKU prefix the server will use, so the
 * placeholder previews it. The number after it is the server's to allocate.
 */
export const skuPrefix = (name: string): string => {
  const ascii = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const cut = ascii.slice(0, 12).replace(/-+$/g, '');
  return cut || 'ITEM';
};

/** INV-01 EC-3 — digits only and barcode-length: probably scanned into the wrong field. */
export const looksLikeBarcode = (text: string): boolean => /^\d{8,14}$/.test(text.trim());
