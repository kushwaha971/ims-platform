import type { EngineDocumentInput, EngineResult } from '../../sales/view-model/taxEngine';
import type { PurchaseBill, PurchaseDiscountType } from '../types/purchase.types';

/**
 * The purchase bill editor's form ⇄ the wire (PUR-01 §14) ⇄ the tax preview.
 *
 * The form owns every editable value; the server owns every figure. A line is
 * SENT only once it is a line — it names an item or a description and has a
 * quantity above zero — so an autosave in the middle of typing a row never
 * trips the server's `qty > 0` check (FR-8: a half-entered bill is kept; a
 * half-typed ROW is simply not part of the draft yet). The same rule as the
 * invoice editor's `invoiceForm.ts`, for the same reason.
 */

export interface PurchaseLineForm {
  itemId: string | null;
  description: string;
  qty: string;
  unitCode: string;
  allowDecimal: boolean;
  unitCost: string;
  /** FR-12 / Alternate E — the item's last cost when it was picked, for the hint. */
  lastCost: string;
  /** §8 — the item's own code, for "differs from item (GST5)". */
  itemTaxCode: string;
  discountType: '' | PurchaseDiscountType;
  discountValue: string;
  taxCode: string;
}

export interface PurchaseBillFormValues {
  partyId: string | null;
  partyName: string;
  partyStateCode: string | null;
  partyCreditDays: number | null;
  supplierInvoiceNumber: string;
  supplierInvoiceDate: string;
  documentDate: string;
  dueOn: string;
  reverseCharge: boolean;
  itcEligible: boolean;
  roundOffEnabled: boolean;
  discountType: '' | PurchaseDiscountType;
  discountValue: string;
  notes: string;
  lines: PurchaseLineForm[];
}

export const emptyPurchaseLine = (): PurchaseLineForm => ({
  itemId: null,
  description: '',
  qty: '1',
  unitCode: 'NOS',
  allowDecimal: false,
  unitCost: '',
  lastCost: '',
  itemTaxCode: '',
  discountType: '',
  discountValue: '',
  taxCode: 'GST0',
});

export const emptyPurchaseForm = (today: string, itcDefault: boolean): PurchaseBillFormValues => ({
  partyId: null,
  partyName: '',
  partyStateCode: null,
  partyCreditDays: null,
  supplierInvoiceNumber: '',
  supplierInvoiceDate: '',
  documentDate: today,
  dueOn: '',
  reverseCharge: false,
  itcEligible: itcDefault,
  roundOffEnabled: true,
  discountType: '',
  discountValue: '',
  notes: '',
  lines: [emptyPurchaseLine()],
});

const isNumber = (value: string): boolean => /^\d+(\.\d+)?$/.test(value.trim());

/** Is this row part of the draft yet? (see the module note) */
export const isCompletePurchaseLine = (line: PurchaseLineForm): boolean =>
  (!!line.itemId || line.description.trim() !== '') &&
  isNumber(line.qty) &&
  Number(line.qty) > 0 &&
  (line.unitCost.trim() === '' || isNumber(line.unitCost));

export const toPurchaseWireBody = (values: PurchaseBillFormValues): Record<string, unknown> => ({
  party_id: values.partyId,
  supplier_invoice_number: values.supplierInvoiceNumber.trim() || null,
  supplier_invoice_date: values.supplierInvoiceDate || null,
  document_date: values.documentDate || null,
  due_on: values.dueOn || null,
  reverse_charge: values.reverseCharge,
  itc_eligible: values.itcEligible,
  round_off_enabled: values.roundOffEnabled,
  discount_type: values.discountType || null,
  discount_value:
    values.discountType && isNumber(values.discountValue) ? values.discountValue : null,
  notes: values.notes,
  lines: values.lines.filter(isCompletePurchaseLine).map((line) => ({
    item_id: line.itemId,
    description: line.description.trim() || null,
    qty: line.qty.trim(),
    unit_code: line.unitCode || null,
    unit_cost: line.unitCost.trim() || null,
    discount_type: line.discountType || null,
    discount_value: line.discountType && isNumber(line.discountValue) ? line.discountValue : null,
    tax_code: line.taxCode || null,
  })),
});

/** The server's draft back into the form — for "edit" and a reload. */
export const fromPurchaseBill = (bill: PurchaseBill): PurchaseBillFormValues => ({
  partyId: bill.party?.id ?? null,
  partyName: bill.party?.name ?? '',
  partyStateCode: bill.party?.stateCode ?? null,
  partyCreditDays: bill.party?.creditDays ?? null,
  supplierInvoiceNumber: bill.supplierInvoiceNumber ?? '',
  supplierInvoiceDate: bill.supplierInvoiceDate ?? '',
  documentDate: bill.documentDate,
  dueOn: bill.dueOn ?? '',
  reverseCharge: bill.reverseCharge,
  itcEligible: bill.itcEligible,
  roundOffEnabled: bill.roundOffEnabled,
  discountType: bill.discountType ?? '',
  discountValue: bill.discountValue ?? '',
  notes: bill.notes,
  lines: bill.lines.length
    ? bill.lines.map((line) => ({
        itemId: line.itemId,
        description: line.description,
        qty: line.qty,
        unitCode: line.unitCode,
        allowDecimal: !/^(NOS|PCS)$/.test(line.unitCode),
        unitCost: line.unitCost,
        lastCost: '',
        itemTaxCode: '',
        discountType: line.discountType ?? '',
        discountValue: line.discountValue ?? '',
        taxCode: line.taxCode,
      }))
    : [emptyPurchaseLine()],
});

export interface PurchaseRateLookup {
  readonly rate: string;
  readonly cessRate: string;
}

/**
 * The preview's input. `gstType: 'regular'` ALWAYS — a supplier charges GST to
 * a composition or unregistered shop too (FR-11), and the sales engine would
 * zero every rate for those. `placeOfSupply` is the SUPPLIER's state: a
 * purchase is inter-state when the goods come from elsewhere (§17.7.0), and an
 * unknown state previews as intra-state, as the server assumes (EC-13).
 */
export const purchasePreviewInput = (
  values: PurchaseBillFormValues,
  rates: Readonly<Record<string, PurchaseRateLookup>>,
  tenantState: string
): EngineDocumentInput => ({
  lines: values.lines.map((line) => ({
    qty: line.qty,
    unitPrice: line.unitCost,
    taxInclusive: false,
    discountType: line.discountType || null,
    discountValue: line.discountValue || null,
    rate: rates[line.taxCode]?.rate ?? '0',
    cessRate: rates[line.taxCode]?.cessRate ?? '0',
  })),
  gstType: 'regular',
  tenantState,
  placeOfSupply: values.partyStateCode || tenantState,
  roundOffEnabled: values.roundOffEnabled,
  discountType: values.discountType || null,
  discountValue: values.discountValue || null,
});

/** "To supplier khata ₹X" and the Record button's readiness, from the preview. */
export const hasRecordableLines = (
  values: PurchaseBillFormValues,
  preview: EngineResult
): boolean => preview.lines.length > 0 && values.lines.some(isCompletePurchaseLine);

/**
 * Alternate E — "Last cost ₹46.00 (+13 %)". Null when there is no last cost to
 * compare with, or the cost has not moved.
 */
export const lastCostChange = (
  unitCost: string,
  lastCost: string
): { readonly percent: number } | null => {
  if (!isNumber(unitCost) || !isNumber(lastCost)) return null;
  const last = Number(lastCost);
  const now = Number(unitCost);
  if (last <= 0 || now === last) return null;
  return { percent: Math.round(((now - last) / last) * 100) };
};

/** FR-2 — due date = bill date + the supplier's credit days (the bill date itself when none). */
export const defaultDueOn = (documentDate: string, creditDays: number | null): string => {
  if (!documentDate) return '';
  const date = new Date(`${documentDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + (creditDays ?? 0));
  return date.toISOString().slice(0, 10);
};
