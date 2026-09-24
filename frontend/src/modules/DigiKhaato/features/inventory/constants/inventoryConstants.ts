/**
 * Inventory constants. This module imports NOTHING, deliberately: the hooks
 * that read the field lists sit in route chunks, and a constant that lived
 * beside the Yup schema would drag Yup into the list route (PTY-01 measured
 * that at 17 KB).
 */

/** The item form's fields, for anchoring server errors (`applyServerErrors`). */
export const ITEM_FORM_FIELDS = [
  'name',
  'itemType',
  'categoryId',
  'unitId',
  'sku',
  'barcode',
  'hsnSac',
  'taxCode',
  'taxInclusiveSelling',
  'sellingPrice',
  'purchasePrice',
  'mrp',
  'trackStock',
  'reorderPoint',
  'description',
  'openingQty',
  'openingCost',
  'openingAsOf',
] as const;

/** Server field paths → form fields, where the two differ. */
export const SERVER_FIELD_TO_ITEM_FORM: Readonly<Record<string, string>> = {
  'opening_stock.qty': 'openingQty',
  'opening_stock.unit_cost': 'openingCost',
  'opening_stock.as_of': 'openingAsOf',
  opening_stock: 'openingQty',
};

export const ADJUSTMENT_FORM_FIELDS = ['adjustmentDate', 'reason', 'note', 'lines'] as const;

export const ADJUSTMENT_REASONS = ['damage', 'theft', 'count', 'personal_use', 'other'] as const;

/** INV-06 EC-6 — the client caps a draft at the server's limit. */
export const ADJUSTMENT_MAX_LINES = 100;

/** INV-02 FR-1 — the sort whitelist the server accepts. */
export const ITEM_ORDERINGS = [
  'name',
  '-name',
  '-updated_at',
  'on_hand',
  '-on_hand',
  'selling_price',
  '-selling_price',
] as const;

export const ITEM_LIST_PAGE_SIZE = 25;

/**
 * INV-02 BR-5 — a HID scanner "types" a burst: at least four characters, each
 * within 50 ms of the last, ended by Enter or Tab. A person does not type that
 * fast, so a burst is a scan.
 */
export const SCANNER_MIN_LENGTH = 4;
export const SCANNER_MAX_GAP_MS = 50;

/** The picker's debounce and minimum query (as `usePartySearch`). */
export const ITEM_SEARCH_DEBOUNCE_MS = 250;
export const ITEM_SEARCH_MIN_CHARS = 1;

/** Movement type → locale key (INV-03 §7 "label map in constants/movementTypes"). */
export const MOVEMENT_TYPE_LABEL_ID: Readonly<Record<string, string>> = {
  opening: 'inventory.movement.type.opening',
  purchase_in: 'inventory.movement.type.purchase_in',
  sale_out: 'inventory.movement.type.sale_out',
  sale_return_in: 'inventory.movement.type.sale_return_in',
  purchase_return_out: 'inventory.movement.type.purchase_return_out',
  adjust_in: 'inventory.movement.type.adjust_in',
  adjust_out: 'inventory.movement.type.adjust_out',
  transfer_in: 'inventory.movement.type.transfer_in',
  transfer_out: 'inventory.movement.type.transfer_out',
  stocktake_in: 'inventory.movement.type.stocktake_in',
  stocktake_out: 'inventory.movement.type.stocktake_out',
  reversal: 'inventory.movement.type.reversal',
};

/** The GST codes a merchant sells under; used when the rate list is still loading. */
export const DEFAULT_TAX_CODE = 'GST0';
export const DEFAULT_UNIT_CODE = 'NOS';
