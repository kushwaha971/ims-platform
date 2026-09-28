/**
 * Domain types for INV-01…INV-08 (camelCase; the service maps the wire).
 *
 * Money, quantities and costs are STRINGS — "450.00", "38.000", "380.0000" —
 * and are only ever parsed by `utils/money` / `utils/quantity` (R-TS-7).
 * `null` on a stock field means "not tracked", never zero.
 */

export type ItemType = 'goods' | 'service';
export type ItemStatus = 'active' | 'archived';
export type StockStatus = 'ok' | 'low' | 'out';
export type StockTab = 'all' | 'in' | 'low' | 'out';
export type MatchField = 'name' | 'sku' | 'barcode' | null;

export type MovementType =
  | 'opening'
  | 'purchase_in'
  | 'sale_out'
  | 'sale_return_in'
  | 'purchase_return_out'
  | 'adjust_in'
  | 'adjust_out'
  | 'transfer_in'
  | 'transfer_out'
  | 'stocktake_in'
  | 'stocktake_out'
  | 'reversal';

export type AdjustmentReason = 'damage' | 'theft' | 'count' | 'personal_use' | 'other';

export interface UnitRef {
  readonly id: string;
  readonly code: string;
  readonly allowDecimal: boolean;
}

export interface Unit extends UnitRef {
  readonly name: string;
  readonly isSystem: boolean;
  readonly isUqc: boolean;
}

export interface CategoryRef {
  readonly id: string;
  readonly name: string;
}

export interface Category extends CategoryRef {
  readonly parentId: string | null;
  readonly itemCount: number;
  readonly children: readonly Category[];
}

export interface TaxRate {
  readonly code: string;
  readonly name: string;
  readonly rate: string;
  readonly cessRate: string;
  readonly effectiveFrom?: string;
  readonly effectiveTo: string | null;
  readonly isCurrent: boolean;
}

export interface HsnCode {
  readonly code: string;
  readonly description: string;
  readonly defaultTaxCode: string | null;
  readonly isService: boolean;
}

export interface ItemListRow {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly barcode: string | null;
  readonly itemType: ItemType;
  readonly category: CategoryRef | null;
  readonly unit: UnitRef;
  readonly sellingPrice: string;
  /** Null when the server withheld it: no `reports.financial.read` (INV-08 EC-4). */
  readonly purchasePrice: string | null;
  readonly taxCode: string;
  /** SAL-02 FR-2 — the invoice line's HSN and inclusive-price defaults. */
  readonly hsnSac?: string | null;
  readonly taxInclusiveSelling?: boolean;
  readonly trackStock: boolean;
  readonly onHand: string | null;
  readonly avgCost: string | null;
  readonly reorderPoint: string | null;
  readonly stockStatus: StockStatus | null;
  readonly stockValue: string | null;
  readonly status: ItemStatus;
  readonly matchField: MatchField;
  readonly updatedAt: string;
}

export interface StockMovement {
  readonly id: string;
  readonly sequenceNo: number;
  readonly movementDate: string;
  readonly movementType: MovementType;
  readonly qty: string;
  readonly unitCost: string | null;
  readonly value: string | null;
  readonly onHandAfter: string;
  readonly avgCostAfter: string | null;
  readonly reason: string | null;
  readonly source: {
    readonly type: string;
    readonly id: string | null;
    readonly number: string | null;
  };
  readonly reversesId: string | null;
  readonly isBackdated: boolean;
  readonly createdBy: { readonly id: string; readonly name: string } | null;
  readonly createdAt: string;
}

export interface ItemStockRow {
  readonly location: { readonly id: string; readonly code: string; readonly name: string };
  readonly onHand: string;
  /** Null when valuation is withheld (no `reports.financial.read`). */
  readonly avgCost: string | null;
  readonly value: string | null;
  readonly lastMovementAt: string | null;
}

export interface Item extends Omit<ItemListRow, 'category' | 'unit' | 'matchField'> {
  readonly category: (CategoryRef & { readonly parentId: string | null }) | null;
  readonly unit: UnitRef & { readonly name: string };
  readonly hsnSac: string | null;
  readonly taxRate: TaxRate | null;
  readonly taxInclusiveSelling: boolean;
  readonly mrp: string | null;
  readonly description: string;
  readonly version: number;
  readonly createdAt: string;
  readonly stock: readonly ItemStockRow[];
  readonly opening: {
    readonly qty: string;
    readonly unitCost: string | null;
    readonly movementDate: string;
  } | null;
  readonly hasMovements: boolean;
  readonly movementsRecent: readonly StockMovement[];
}

export interface ItemWarning {
  readonly code: string;
  readonly field?: string;
  readonly message: string;
}

export interface ItemSaveResult {
  readonly item: Item;
  readonly warnings: readonly ItemWarning[];
}

export interface ItemListFilters {
  readonly q: string;
  readonly tab: StockTab;
  readonly type: ItemType | '';
  readonly categoryId: string;
  readonly status: ItemStatus;
  readonly ordering: string;
  readonly page: number;
}

export interface ItemListResult {
  readonly rows: readonly ItemListRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
  readonly totals: { readonly items: number; readonly stockValue: string | null };
  readonly counts: {
    readonly all: number;
    readonly in: number;
    readonly low: number;
    readonly out: number;
  };
}

export interface MovementPage {
  readonly rows: readonly StockMovement[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export interface MovementFilters {
  readonly type: readonly MovementType[];
  readonly dateFrom: string | null;
  readonly dateTo: string | null;
}

/** The item form's values — all strings, as the controls hold them. */
export interface ItemFormValues {
  name: string;
  itemType: ItemType;
  categoryId: string;
  unitId: string;
  sku: string;
  barcode: string;
  hsnSac: string;
  taxCode: string;
  taxInclusiveSelling: boolean;
  sellingPrice: string | null;
  purchasePrice: string | null;
  mrp: string | null;
  trackStock: boolean;
  reorderPoint: string;
  description: string;
  openingQty: string;
  openingCost: string;
  openingAsOf: string;
}

export interface AdjustmentLine {
  readonly index: number;
  readonly movementId: string;
  readonly item: {
    readonly id: string;
    readonly name: string;
    readonly sku: string;
    readonly unitCode: string;
  };
  readonly movementType: MovementType;
  readonly qty: string;
  readonly unitCost: string | null;
  readonly onHandBefore: string;
  readonly onHandAfter: string;
  readonly avgCostAfter: string;
  readonly valueImpact: string;
}

export interface StockAdjustment {
  readonly id: string;
  readonly number: string;
  readonly adjustmentDate: string;
  readonly reason: AdjustmentReason;
  readonly note: string;
  readonly status: 'posted';
  readonly lines: readonly AdjustmentLine[];
  readonly valueImpactTotal: string;
  readonly createdBy: { readonly id: string; readonly name: string } | null;
  readonly createdAt: string;
}

/** One line in the adjustment editor — strings as the controls hold them. */
export interface AdjustmentFormLine {
  itemId: string;
  itemName: string;
  unitCode: string;
  allowDecimal: boolean;
  onHand: string;
  avgCost: string;
  mode: 'by' | 'to';
  qty: string;
  unitCost: string;
}

export interface AdjustmentFormValues {
  adjustmentDate: string;
  reason: AdjustmentReason | '';
  note: string;
  lines: AdjustmentFormLine[];
}

export interface InsufficientLine {
  readonly index: number;
  readonly itemId: string;
  readonly itemName: string;
  readonly requested: string;
  readonly available: string;
  readonly unitCode: string;
}

export interface StockSummaryRow {
  readonly item: {
    readonly id: string;
    readonly name: string;
    readonly sku: string;
    readonly unitCode: string;
  };
  readonly category: CategoryRef | null;
  readonly onHand: string;
  readonly avgCost: string | null;
  readonly value: string | null;
  readonly reorderPoint: string | null;
  readonly stockStatus: StockStatus;
  readonly lastMovementAt: string | null;
}

export interface StockSummaryFilters {
  readonly q: string;
  readonly categoryId: string;
  readonly status: '' | 'in' | 'low' | 'out' | 'negative';
  readonly hideZero: boolean;
  readonly asOf: string | null;
  readonly ordering: string;
  readonly page: number;
}

export interface StockSummaryResult {
  readonly rows: readonly StockSummaryRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totals: { readonly items: number; readonly value: string | null };
  readonly asOf: string | null;
  readonly historical: boolean;
  readonly valuationVisible: boolean;
}

export interface LowStockRow {
  readonly item: {
    readonly id: string;
    readonly name: string;
    readonly sku: string;
    readonly unitCode: string;
    readonly allowDecimal: boolean;
  };
  readonly onHand: string;
  readonly reorderPoint: string | null;
  readonly stockStatus: 'low' | 'out';
  readonly avgCost: string | null;
  readonly lastPurchaseCost: string | null;
  readonly suggestedQty: string;
}

export interface LowStockResult {
  readonly rows: readonly LowStockRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totals: { readonly low: number; readonly out: number };
}
