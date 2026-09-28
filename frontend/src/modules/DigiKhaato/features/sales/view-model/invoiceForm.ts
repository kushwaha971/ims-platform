import type { PaymentMode } from 'src/types/domain.types';

import type { EngineDocumentInput, EngineGstType } from './taxEngine';
import type { DiscountType, SalesDocument } from '../types/sales.types';

/**
 * The invoice editor's form ⇄ the wire (SAL-02 §14) ⇄ the tax preview.
 *
 * The form owns every editable value; the server owns every figure. A line
 * is SENT only once it is a line — it names an item or a description and has
 * a quantity above zero — so an autosave in the middle of typing a row never
 * trips the server's `qty > 0` check (SAL-06 §10: drafts are saved even when
 * incomplete; an incomplete ROW is simply not part of the draft yet).
 */

export type BillingMode = 'walkIn' | 'party';

export interface InvoiceLineForm {
  itemId: string | null;
  description: string;
  hsnSac: string;
  qty: string;
  unitCode: string;
  allowDecimal: boolean;
  unitPrice: string;
  taxInclusive: boolean;
  discountType: '' | DiscountType;
  discountValue: string;
  taxCode: string;
}

export interface InvoiceFormValues {
  mode: BillingMode;
  partyId: string | null;
  partyName: string;
  partyStateCode: string | null;
  walkInName: string;
  walkInMobile: string;
  documentDate: string;
  dueOn: string;
  /** SAL-01 FR-4 — estimates only; empty means "the default, counted by the server". */
  validUntil: string;
  placeOfSupplyState: string;
  reverseCharge: boolean;
  roundOffEnabled: boolean;
  discountType: '' | DiscountType;
  discountValue: string;
  notes: string;
  terms: string;
  lines: InvoiceLineForm[];
}

/** SAL-07 FR-1 — counters bill walk-ins; everybody else bills a party. */
export const WALK_IN_BUSINESS_TYPES: readonly string[] = ['retail', 'food'];

export const defaultBillingMode = (businessType: string | null | undefined): BillingMode =>
  businessType && WALK_IN_BUSINESS_TYPES.includes(businessType) ? 'walkIn' : 'party';

export const emptyLine = (): InvoiceLineForm => ({
  itemId: null,
  description: '',
  hsnSac: '',
  qty: '1',
  unitCode: 'NOS',
  allowDecimal: false,
  unitPrice: '',
  taxInclusive: false,
  discountType: '',
  discountValue: '',
  taxCode: 'GST0',
});

export const emptyInvoiceForm = (
  today: string,
  mode: BillingMode,
  tenantState: string
): InvoiceFormValues => ({
  mode,
  partyId: null,
  partyName: '',
  partyStateCode: null,
  walkInName: '',
  walkInMobile: '',
  documentDate: today,
  dueOn: '',
  validUntil: '',
  placeOfSupplyState: tenantState,
  reverseCharge: false,
  roundOffEnabled: true,
  discountType: '',
  discountValue: '',
  notes: '',
  terms: '',
  lines: [emptyLine()],
});

const isNumber = (value: string): boolean => /^\d+(\.\d+)?$/.test(value.trim());

/**
 * How many decimals a rate shows: two, unless it genuinely carries paise
 * fractions. The server stores rates at four places, and "450.0000" at a
 * counter reads as a typo; "12.3450" keeps its precision (SAL-02 §4.4).
 */
export const ratePlaces = (value: string): 2 | 4 => {
  const fraction = value.split('.')[1] ?? '';
  return fraction.replace(/0+$/, '').length > 2 ? 4 : 2;
};

/** Is this row part of the draft yet? (see the module note) */
export const isCompleteLine = (line: InvoiceLineForm): boolean =>
  (!!line.itemId || line.description.trim() !== '') &&
  isNumber(line.qty) &&
  Number(line.qty) > 0 &&
  (line.unitPrice.trim() === '' || isNumber(line.unitPrice));

export const toWireBody = (values: InvoiceFormValues): Record<string, unknown> => ({
  party_id: values.mode === 'party' ? values.partyId : null,
  walk_in_name: values.mode === 'walkIn' ? values.walkInName.trim() || null : null,
  walk_in_mobile: values.mode === 'walkIn' ? values.walkInMobile.trim() || null : null,
  document_date: values.documentDate || null,
  due_on: values.mode === 'party' && values.dueOn ? values.dueOn : null,
  place_of_supply_state: values.placeOfSupplyState || null,
  reverse_charge: values.reverseCharge,
  round_off_enabled: values.roundOffEnabled,
  discount_type: values.discountType || null,
  discount_value:
    values.discountType && isNumber(values.discountValue) ? values.discountValue : null,
  notes: values.notes,
  terms: values.terms,
  lines: values.lines.filter(isCompleteLine).map((line) => ({
    item_id: line.itemId,
    description: line.description.trim() || null,
    hsn_sac: line.hsnSac.trim() || null,
    qty: line.qty.trim(),
    unit_code: line.unitCode || null,
    unit_price: line.unitPrice.trim() || null,
    tax_inclusive: line.taxInclusive,
    discount_type: line.discountType || null,
    discount_value: line.discountType && isNumber(line.discountValue) ? line.discountValue : null,
    tax_code: line.taxCode || null,
  })),
});

/** The server's draft back into the form — for "edit", "restore" and a reload. */
export const fromDocument = (doc: SalesDocument): InvoiceFormValues => ({
  mode: doc.party ? 'party' : 'walkIn',
  partyId: doc.party?.id ?? null,
  partyName: doc.party?.name ?? '',
  partyStateCode: doc.party?.stateCode ?? null,
  walkInName: doc.walkInName ?? '',
  walkInMobile: doc.walkInMobile ?? '',
  documentDate: doc.documentDate,
  dueOn: doc.dueOn ?? '',
  validUntil: doc.validUntil ?? '',
  placeOfSupplyState: doc.placeOfSupplyState,
  reverseCharge: doc.reverseCharge,
  roundOffEnabled: doc.roundOffEnabled,
  discountType: doc.discountType ?? '',
  discountValue: doc.discountValue ?? '',
  notes: doc.notes,
  terms: doc.terms,
  lines: doc.lines.length
    ? doc.lines.map((line) => ({
        itemId: line.itemId,
        description: line.description,
        hsnSac: line.hsnSac ?? '',
        qty: line.qty,
        unitCode: line.unitCode,
        allowDecimal: !/^(NOS|PCS)$/.test(line.unitCode),
        unitPrice: line.unitPrice,
        taxInclusive: line.taxInclusive,
        discountType: line.discountType ?? '',
        discountValue: line.discountValue ?? '',
        taxCode: line.taxCode,
      }))
    : [emptyLine()],
});

export interface RateLookup {
  readonly rate: string;
  readonly cessRate: string;
}

/**
 * SAL-02 FR-5 — the place of supply a freshly picked party defaults to, in the
 * SAME order the server's `default_pos` resolves it: the party's state, then
 * its billing-address state, then the shop's own. The preview must never
 * guess the shop's state for a party in another one (QA S-D1: the editor
 * showed CGST + SGST for a Karnataka party of a Maharashtra shop while the
 * issued bill, resolved on the server, correctly carried IGST).
 */
export const defaultPlaceOfSupply = (
  party: Readonly<{
    stateCode: string | null;
    billingAddress: Readonly<Record<string, string>>;
  }> | null,
  tenantState: string
): string => {
  if (party) {
    if (party.stateCode) return party.stateCode;
    const billing = party.billingAddress?.state_code;
    if (billing) return billing;
  }
  return tenantState;
};

/** The preview's input; an unknown code previews at 0 until the rates arrive. */
export const previewInput = (
  values: InvoiceFormValues,
  rates: Readonly<Record<string, RateLookup>>,
  gstType: EngineGstType,
  tenantState: string
): EngineDocumentInput => ({
  lines: values.lines.map((line) => ({
    qty: line.qty,
    unitPrice: line.unitPrice,
    taxInclusive: line.taxInclusive,
    discountType: line.discountType || null,
    discountValue: line.discountValue || null,
    rate: rates[line.taxCode]?.rate ?? '0',
    cessRate: rates[line.taxCode]?.cessRate ?? '0',
  })),
  gstType,
  tenantState,
  placeOfSupply: values.placeOfSupplyState || tenantState,
  roundOffEnabled: values.roundOffEnabled,
  discountType: values.discountType || null,
  discountValue: values.discountValue || null,
});

/** SAL-07 FR-3 — the walk-in payment sheet's rows, defaulting to the full amount in cash. */
export interface PaymentRowForm {
  mode: PaymentMode;
  amount: string;
  reference: string;
}

export const fullCashPayment = (grandTotal: string): PaymentRowForm[] => [
  { mode: 'cash', amount: grandTotal, reference: '' },
];

export interface PaymentWireBody {
  readonly payment_date: string;
  readonly mode_breakup: readonly { mode: PaymentMode; amount: string; reference: string }[];
}

export const paymentWireBody = (
  rows: readonly PaymentRowForm[],
  date: string
): PaymentWireBody => ({
  payment_date: date,
  mode_breakup: rows
    .filter((row) => isNumber(row.amount) && Number(row.amount) > 0)
    .map((row) => ({ mode: row.mode, amount: row.amount, reference: row.reference.trim() })),
});
