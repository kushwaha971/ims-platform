import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import type {
  Item,
  ItemFormValues,
  ItemListFilters,
  ItemListResult,
  ItemListRow,
  ItemSaveResult,
  MovementFilters,
  MovementPage,
  StockMovement,
  StockTab,
} from '../types/item.types';

/**
 * Part 19 §19.3.4 — one async function per endpoint of `/items`, owning the
 * snake_case ⇄ camelCase mapping. No React, no Redux, no `Ub*`.
 */

// ── Wire shapes (Part 22 §22.6 plus the INV FRD deltas) ─────────────────────

export interface ItemRowWire {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly barcode: string | null;
  readonly item_type: 'goods' | 'service';
  readonly category: { readonly id: string; readonly name: string } | null;
  readonly unit: { readonly id: string; readonly code: string; readonly allow_decimal: boolean };
  readonly selling_price: string;
  readonly purchase_price: string;
  readonly tax_code: string;
  readonly track_stock: boolean;
  readonly on_hand: string | null;
  readonly avg_cost: string | null;
  readonly reorder_point: string | null;
  readonly stock_status: 'ok' | 'low' | 'out' | null;
  readonly stock_value: string | null;
  readonly status: 'active' | 'archived';
  readonly match_field?: 'name' | 'sku' | 'barcode' | null;
  readonly updated_at: string;
}

export interface MovementWire {
  readonly id: string;
  readonly sequence_no: number;
  readonly movement_date: string;
  readonly movement_type: StockMovement['movementType'];
  readonly qty: string;
  readonly unit_cost: string | null;
  readonly value: string | null;
  readonly on_hand_after: string;
  readonly avg_cost_after: string;
  readonly reason: string | null;
  readonly source: {
    readonly type: string;
    readonly id: string | null;
    readonly number: string | null;
  };
  readonly reverses_id: string | null;
  readonly is_backdated: boolean;
  readonly created_by: { readonly id: string; readonly name: string } | null;
  readonly created_at: string;
}

interface ItemDetailWire extends Omit<ItemRowWire, 'category' | 'unit'> {
  readonly category: {
    readonly id: string;
    readonly name: string;
    readonly parent_id: string | null;
  } | null;
  readonly unit: {
    readonly id: string;
    readonly code: string;
    readonly name: string;
    readonly allow_decimal: boolean;
  };
  readonly hsn_sac: string | null;
  readonly tax_rate: {
    readonly code: string;
    readonly name: string;
    readonly rate: string;
    readonly cess_rate: string;
    readonly effective_to: string | null;
    readonly is_current: boolean;
  } | null;
  readonly tax_inclusive_selling: boolean;
  readonly mrp: string | null;
  readonly description: string;
  readonly version: number;
  readonly created_at: string;
  readonly stock: readonly {
    readonly location: { readonly id: string; readonly code: string; readonly name: string };
    readonly on_hand: string;
    readonly avg_cost: string;
    readonly value: string;
    readonly last_movement_at: string | null;
  }[];
  readonly opening: {
    readonly qty: string;
    readonly unit_cost: string | null;
    readonly movement_date: string;
  } | null;
  readonly has_movements: boolean;
  readonly movements_recent: readonly MovementWire[];
}

// ── Mappers ─────────────────────────────────────────────────────────────────

export const toItemRow = (row: ItemRowWire): ItemListRow => ({
  id: row.id,
  name: row.name,
  sku: row.sku,
  barcode: row.barcode,
  itemType: row.item_type,
  category: row.category ? { id: row.category.id, name: row.category.name } : null,
  unit: { id: row.unit.id, code: row.unit.code, allowDecimal: row.unit.allow_decimal },
  sellingPrice: row.selling_price,
  purchasePrice: row.purchase_price,
  taxCode: row.tax_code,
  trackStock: row.track_stock,
  onHand: row.on_hand,
  avgCost: row.avg_cost,
  reorderPoint: row.reorder_point,
  stockStatus: row.stock_status,
  stockValue: row.stock_value,
  status: row.status,
  matchField: row.match_field ?? null,
  updatedAt: row.updated_at,
});

export const toMovement = (row: MovementWire): StockMovement => ({
  id: row.id,
  sequenceNo: row.sequence_no,
  movementDate: row.movement_date,
  movementType: row.movement_type,
  qty: row.qty,
  unitCost: row.unit_cost,
  value: row.value,
  onHandAfter: row.on_hand_after,
  avgCostAfter: row.avg_cost_after,
  reason: row.reason,
  source: row.source,
  reversesId: row.reverses_id,
  isBackdated: row.is_backdated,
  createdBy: row.created_by,
  createdAt: row.created_at,
});

export const toItem = (row: ItemDetailWire): Item => ({
  ...toItemRow({ ...row, category: row.category, unit: row.unit }),
  category: row.category
    ? { id: row.category.id, name: row.category.name, parentId: row.category.parent_id }
    : null,
  unit: {
    id: row.unit.id,
    code: row.unit.code,
    name: row.unit.name,
    allowDecimal: row.unit.allow_decimal,
  },
  hsnSac: row.hsn_sac,
  taxRate: row.tax_rate
    ? {
        code: row.tax_rate.code,
        name: row.tax_rate.name,
        rate: row.tax_rate.rate,
        cessRate: row.tax_rate.cess_rate,
        effectiveTo: row.tax_rate.effective_to,
        isCurrent: row.tax_rate.is_current,
      }
    : null,
  taxInclusiveSelling: row.tax_inclusive_selling,
  mrp: row.mrp,
  description: row.description,
  version: row.version,
  createdAt: row.created_at,
  stock: row.stock.map((s) => ({
    location: s.location,
    onHand: s.on_hand,
    avgCost: s.avg_cost,
    value: s.value,
    lastMovementAt: s.last_movement_at,
  })),
  opening: row.opening
    ? {
        qty: row.opening.qty,
        unitCost: row.opening.unit_cost,
        movementDate: row.opening.movement_date,
      }
    : null,
  hasMovements: row.has_movements,
  movementsRecent: row.movements_recent.map(toMovement),
});

const STOCK_PARAM: Readonly<Record<StockTab, string | undefined>> = {
  all: undefined,
  in: 'in',
  low: 'low',
  out: 'out',
};

// ── Endpoints ───────────────────────────────────────────────────────────────

/**
 * GET /items. A whole-page read: a failure is rendered in place with its
 * request id (CR-2026-09-19-E), so the snackbar is suppressed.
 */
export const listItems = async (
  filters: ItemListFilters,
  signal?: AbortSignal,
  pageSize = 25
): Promise<ItemListResult> => {
  const query = toQueryString({
    q: filters.q || undefined,
    stock: STOCK_PARAM[filters.tab],
    type: filters.type || undefined,
    category_id: filters.categoryId || undefined,
    status: filters.status,
    ordering: filters.ordering,
    page: filters.page,
    page_size: pageSize,
  });
  const response = await api.get<{
    data: readonly ItemRowWire[];
    meta: {
      page: number;
      page_size: number;
      total: number;
      total_pages: number;
      totals: { items: number; stock_value: string };
      counts: { all: number; in: number; low: number; out: number };
    };
  }>(`${API_PATHS.ITEMS}${query}`, ubConfig({ signal, suppressErrorSnackbar: true }));
  const { meta } = response.data;
  return {
    rows: response.data.data.map(toItemRow),
    page: meta.page,
    pageSize: meta.page_size,
    total: meta.total,
    totalPages: meta.total_pages,
    totals: { items: meta.totals.items, stockValue: meta.totals.stock_value },
    counts: meta.counts,
  };
};

/**
 * The picker's search (`useItemSearch`): active items matching `q`, 20 at most.
 * A picker's failure is not a page's: it toasts like any other request.
 */
export const searchItems = async (
  q: string,
  signal?: AbortSignal,
  options: { readonly trackedOnly?: boolean } = {}
): Promise<readonly ItemListRow[]> => {
  const query = toQueryString({
    q,
    status: 'active',
    type: options.trackedOnly ? 'goods' : undefined,
    page_size: 20,
    ordering: 'name',
  });
  const response = await api.get<{ data: readonly ItemRowWire[] }>(
    `${API_PATHS.ITEMS}${query}`,
    ubConfig({ signal })
  );
  const rows = response.data.data.map(toItemRow);
  return options.trackedOnly ? rows.filter((row) => row.trackStock) : rows;
};

/** GET /items/lookup — the scanner's exact path. `null` for a 404, never a throw. */
export const lookupItemByBarcode = async (
  barcode: string,
  signal?: AbortSignal
): Promise<ItemListRow | null> => {
  try {
    const response = await api.get<{ data: ItemRowWire }>(
      `${API_PATHS.ITEM_LOOKUP}${toQueryString({ barcode })}`,
      ubConfig({ signal, suppressErrorSnackbar: true })
    );
    return toItemRow(response.data.data);
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    if (status === 404 || status === 400) return null;
    throw error;
  }
};

export const getItem = async (id: string, signal?: AbortSignal): Promise<Item> => {
  const response = await api.get<{ data: ItemDetailWire }>(
    API_PATHS.ITEM(id),
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  return toItem(response.data.data);
};

/** The form's values → the POST/PATCH body. Blank optional fields travel as null. */
export interface ItemBody {
  readonly name: string;
  readonly item_type: ItemFormValues['itemType'];
  readonly category_id: string | null;
  readonly unit_id: string;
  readonly sku: string | null;
  readonly barcode: string | null;
  readonly hsn_sac: string | null;
  readonly tax_code: string;
  readonly tax_inclusive_selling: boolean;
  readonly selling_price: string;
  readonly purchase_price: string;
  readonly mrp: string | null;
  readonly track_stock: boolean;
  readonly reorder_point: string | null;
  readonly description: string;
  readonly opening_stock?: {
    readonly qty: string;
    readonly unit_cost: string | null;
    readonly as_of: string | undefined;
  };
}

export const toItemBody = (
  values: ItemFormValues,
  { withOpening }: { withOpening: boolean }
): ItemBody => {
  const isService = values.itemType === 'service';
  const track = !isService && values.trackStock;
  return {
    name: values.name.trim(),
    item_type: values.itemType,
    category_id: values.categoryId || null,
    unit_id: values.unitId,
    sku: values.sku.trim() || null,
    barcode: isService ? null : values.barcode.trim() || null,
    hsn_sac: values.hsnSac.trim() || null,
    tax_code: values.taxCode,
    tax_inclusive_selling: values.taxInclusiveSelling,
    selling_price: values.sellingPrice || '0',
    purchase_price: values.purchasePrice || '0',
    mrp: isService ? null : values.mrp || null,
    track_stock: track,
    reorder_point: track ? values.reorderPoint || null : null,
    description: values.description,
    ...(withOpening && track && values.openingQty
      ? {
          opening_stock: {
            qty: values.openingQty,
            unit_cost: values.openingCost || null,
            as_of: values.openingAsOf || undefined,
          },
        }
      : {}),
  };
};

interface SaveWire {
  readonly data: ItemDetailWire;
  readonly meta?: {
    readonly warnings?: readonly { code: string; field?: string; message: string }[];
  };
}

const toSaveResult = (body: SaveWire): ItemSaveResult => ({
  item: toItem(body.data),
  warnings: body.meta?.warnings ?? [],
});

/** POST /items. The caller mints the idempotency key once per logical save. */
export const createItem = async (
  values: ItemFormValues,
  idempotencyKey: string
): Promise<ItemSaveResult> => {
  const response = await api.post<SaveWire>(
    API_PATHS.ITEMS,
    toItemBody(values, { withOpening: true }),
    ubConfig({ headers: { 'Idempotency-Key': idempotencyKey } })
  );
  return toSaveResult(response.data);
};

/** PATCH /items/{id} with the version the form was opened at (409 `stale_version`). */
export const updateItem = async (
  id: string,
  values: ItemFormValues,
  version: number,
  { withOpening }: { withOpening: boolean }
): Promise<ItemSaveResult> => {
  const response = await api.patch<SaveWire>(API_PATHS.ITEM(id), {
    ...toItemBody(values, { withOpening }),
    version,
  });
  return toSaveResult(response.data);
};

export const archiveItem = async (id: string): Promise<Item> => {
  const response = await api.post<{ data: ItemDetailWire }>(API_PATHS.ITEM_ARCHIVE(id), {});
  return toItem(response.data.data);
};

export const restoreItem = async (id: string): Promise<Item> => {
  const response = await api.post<{ data: ItemDetailWire }>(API_PATHS.ITEM_RESTORE(id), {});
  return toItem(response.data.data);
};

/** GET /items/{id}/movements — newest arrival first, cursor-paged. */
export const listMovements = async (
  id: string,
  filters: MovementFilters,
  cursor: string | null,
  signal?: AbortSignal
): Promise<MovementPage> => {
  const query = toQueryString({
    cursor: cursor ?? undefined,
    limit: 50,
    type: filters.type.length ? filters.type.join(',') : undefined,
    date_from: filters.dateFrom ?? undefined,
    date_to: filters.dateTo ?? undefined,
  });
  const response = await api.get<{
    data: readonly MovementWire[];
    meta: { next_cursor: string | null; has_more: boolean };
  }>(`${API_PATHS.ITEM_MOVEMENTS(id)}${query}`, ubConfig({ signal, suppressErrorSnackbar: true }));
  return {
    rows: response.data.data.map(toMovement),
    nextCursor: response.data.meta.next_cursor,
    hasMore: response.data.meta.has_more,
  };
};
