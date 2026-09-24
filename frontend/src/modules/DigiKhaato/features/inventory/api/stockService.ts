import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import type {
  AdjustmentFormValues,
  LowStockResult,
  StockAdjustment,
  StockSummaryFilters,
  StockSummaryResult,
} from '../types/item.types';

/** INV-06 adjustments, INV-07 low stock and INV-08 the stock summary. */

interface AdjustmentWire {
  readonly id: string;
  readonly number: string;
  readonly adjustment_date: string;
  readonly reason: StockAdjustment['reason'];
  readonly note: string;
  readonly status: 'posted';
  readonly lines: readonly {
    readonly index: number;
    readonly movement_id: string;
    readonly item: {
      readonly id: string;
      readonly name: string;
      readonly sku: string;
      readonly unit_code: string;
    };
    readonly movement_type: StockAdjustment['lines'][number]['movementType'];
    readonly qty: string;
    readonly unit_cost: string | null;
    readonly on_hand_before: string;
    readonly on_hand_after: string;
    readonly avg_cost_after: string;
    readonly value_impact: string;
  }[];
  readonly value_impact_total: string;
  readonly created_by: { readonly id: string; readonly name: string } | null;
  readonly created_at: string;
}

const toAdjustment = (row: AdjustmentWire): StockAdjustment => ({
  id: row.id,
  number: row.number,
  adjustmentDate: row.adjustment_date,
  reason: row.reason,
  note: row.note,
  status: row.status,
  lines: row.lines.map((line) => ({
    index: line.index,
    movementId: line.movement_id,
    item: {
      id: line.item.id,
      name: line.item.name,
      sku: line.item.sku,
      unitCode: line.item.unit_code,
    },
    movementType: line.movement_type,
    qty: line.qty,
    unitCost: line.unit_cost,
    onHandBefore: line.on_hand_before,
    onHandAfter: line.on_hand_after,
    avgCostAfter: line.avg_cost_after,
    valueImpact: line.value_impact,
  })),
  valueImpactTotal: row.value_impact_total,
  createdBy: row.created_by,
  createdAt: row.created_at,
});

/**
 * POST /stock-adjustments. The lines carry the SIGNED quantity the editor
 * computed ("Set to" is resolved client-side, FR-5); a cost only for stock in.
 */
export interface AdjustmentBody {
  readonly adjustment_date: string;
  readonly location_id: string | null;
  readonly reason: string;
  readonly note: string;
  readonly lines: readonly {
    readonly item_id: string;
    readonly qty: string;
    readonly unit_cost: string | null;
  }[];
}

export const toAdjustmentBody = (
  values: AdjustmentFormValues,
  signedQty: (index: number) => string
): AdjustmentBody => ({
  adjustment_date: values.adjustmentDate,
  location_id: null,
  reason: values.reason,
  note: values.note.trim(),
  lines: values.lines.map((line, index) => {
    const qty = signedQty(index);
    return {
      item_id: line.itemId,
      qty,
      unit_cost: qty.startsWith('-') ? null : line.unitCost || null,
    };
  }),
});

export const postAdjustment = async (
  body: AdjustmentBody,
  idempotencyKey: string
): Promise<StockAdjustment> => {
  /* The 409 `insufficient_stock` is drawn on the lines themselves, so it is
     `LOCALLY_PRESENTED` and never toasts; everything else does. */
  const response = await api.post<{ data: AdjustmentWire }>(
    API_PATHS.STOCK_ADJUSTMENTS,
    body,
    ubConfig({ headers: { 'Idempotency-Key': idempotencyKey } })
  );
  return toAdjustment(response.data.data);
};

export const getAdjustment = async (id: string, signal?: AbortSignal): Promise<StockAdjustment> => {
  const response = await api.get<{ data: AdjustmentWire }>(
    API_PATHS.STOCK_ADJUSTMENT(id),
    ubConfig({ signal })
  );
  return toAdjustment(response.data.data);
};

export const getStockSummary = async (
  filters: StockSummaryFilters,
  signal?: AbortSignal
): Promise<StockSummaryResult> => {
  const query = toQueryString({
    q: filters.q || undefined,
    category_id: filters.categoryId || undefined,
    status: filters.status || undefined,
    hide_zero: filters.hideZero ? undefined : 'false',
    as_of: filters.asOf ?? undefined,
    ordering: filters.ordering,
    page: filters.page,
    page_size: 25,
  });
  const response = await api.get<{
    data: readonly {
      item: { id: string; name: string; sku: string; unit_code: string };
      category: { id: string; name: string } | null;
      on_hand: string;
      avg_cost?: string;
      value?: string;
      reorder_point: string | null;
      stock_status: 'ok' | 'low' | 'out';
      last_movement_at: string | null;
    }[];
    meta: {
      page: number;
      page_size: number;
      total: number;
      totals: { items: number; value: string | null };
      as_of: string | null;
      historical: boolean;
      valuation_visible: boolean;
    };
  }>(`${API_PATHS.STOCK_SUMMARY}${query}`, ubConfig({ signal, suppressErrorSnackbar: true }));
  const { meta } = response.data;
  return {
    rows: response.data.data.map((row) => ({
      item: {
        id: row.item.id,
        name: row.item.name,
        sku: row.item.sku,
        unitCode: row.item.unit_code,
      },
      category: row.category,
      onHand: row.on_hand,
      avgCost: row.avg_cost ?? null,
      value: row.value ?? null,
      reorderPoint: row.reorder_point,
      stockStatus: row.stock_status,
      lastMovementAt: row.last_movement_at,
    })),
    page: meta.page,
    pageSize: meta.page_size,
    total: meta.total,
    totals: meta.totals,
    asOf: meta.as_of,
    historical: meta.historical,
    valuationVisible: meta.valuation_visible,
  };
};

export const getLowStock = async (page: number, signal?: AbortSignal): Promise<LowStockResult> => {
  const response = await api.get<{
    data: readonly {
      item: { id: string; name: string; sku: string; unit_code: string; allow_decimal: boolean };
      on_hand: string;
      reorder_point: string | null;
      stock_status: 'low' | 'out';
      avg_cost: string;
      last_purchase_cost: string;
      suggested_qty: string;
    }[];
    meta: { page: number; page_size: number; total: number; totals: { low: number; out: number } };
  }>(
    `${API_PATHS.STOCK_LOW}${toQueryString({ page, page_size: 25 })}`,
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  const { meta } = response.data;
  return {
    rows: response.data.data.map((row) => ({
      item: {
        id: row.item.id,
        name: row.item.name,
        sku: row.item.sku,
        unitCode: row.item.unit_code,
        allowDecimal: row.item.allow_decimal,
      },
      onHand: row.on_hand,
      reorderPoint: row.reorder_point,
      stockStatus: row.stock_status,
      avgCost: row.avg_cost,
      lastPurchaseCost: row.last_purchase_cost,
      suggestedQty: row.suggested_qty,
    })),
    page: meta.page,
    pageSize: meta.page_size,
    total: meta.total,
    totals: meta.totals,
  };
};
