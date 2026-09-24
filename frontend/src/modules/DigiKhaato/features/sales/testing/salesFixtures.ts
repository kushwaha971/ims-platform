import { toDocument } from '../api/salesService';

import type { SalesDocument } from '../types/sales.types';

/**
 * Test fixtures, built from the WIRE shape and passed through `toDocument`, so
 * every component test also exercises the mapping the real screens depend on.
 * The default is SAL-02 BR-10's shape at one line: Basmati 5 kg @ 5 %, intra-
 * state Maharashtra, a regular supplier with a UPI VPA.
 */
type Wire = Record<string, unknown>;

export const wireLine = (over: Wire = {}): Wire => ({
  id: 'l1',
  line_no: 1,
  item_id: 'i1',
  description: 'Basmati Rice 5kg',
  hsn_sac: '1006',
  qty: '1.000',
  unit_code: 'NOS',
  unit_price: '450.0000',
  tax_inclusive: false,
  discount_type: null,
  discount_value: null,
  gross_amount: '450.00',
  discount_amount: '0.00',
  taxable_value: '450.00',
  tax_code: 'GST5',
  tax_rate: '5.000',
  cess_rate: '0.000',
  cgst: '11.25',
  sgst: '11.25',
  igst: '0.00',
  cess: '0.00',
  line_total: '472.50',
  ...over,
});

export const wireDocument = (over: Wire = {}): Wire => ({
  id: 'd1',
  kind: 'invoice',
  number: 'INV/26-27/0001',
  fy_label: '26-27',
  status: 'issued',
  version: 2,
  party: null,
  party_snapshot: null,
  walk_in_name: null,
  walk_in_mobile: null,
  supplier: {
    name: 'Sharma General Store',
    legal_name: null,
    gstin: '27AAPFU0939F1ZV',
    gst_type: 'regular',
    state_code: '27',
    phone: null,
    email: null,
    address: { line1: '12 Market Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' },
    upi_vpa: 'sharma@okhdfc',
    bank_details: {},
  },
  document_date: '2026-09-24',
  due_on: '2026-10-09',
  place_of_supply_state: '27',
  is_inter_state: false,
  reverse_charge: false,
  discount_type: null,
  discount_value: null,
  round_off_enabled: true,
  subtotal: '450.00',
  discount_amount: '0.00',
  taxable_total: '450.00',
  cgst_total: '11.25',
  sgst_total: '11.25',
  igst_total: '0.00',
  cess_total: '0.00',
  round_off: '0.50',
  grand_total: '473.00',
  amount_paid: '0.00',
  amount_due: '473.00',
  payment: null,
  lines: [wireLine()],
  notes: '',
  terms: '',
  doc_discount_allocation: {},
  created_by: { id: 'u1', name: 'Owner' },
  issued_at: '2026-09-24T06:00:00Z',
  created_at: '2026-09-24T05:59:00Z',
  updated_at: '2026-09-24T06:00:00Z',
  ...over,
});

export const makeDocument = (over: Wire = {}): SalesDocument => toDocument(wireDocument(over));

/** The same bill, inter-state (Gujarat), tax as IGST. */
export const interStateDocument = (): SalesDocument =>
  makeDocument({
    place_of_supply_state: '24',
    is_inter_state: true,
    cgst_total: '0.00',
    sgst_total: '0.00',
    igst_total: '22.50',
    lines: [wireLine({ cgst: '0.00', sgst: '0.00', igst: '22.50' })],
  });

/** A composition supplier's Bill of Supply — no tax anywhere. */
export const billOfSupply = (): SalesDocument =>
  makeDocument({
    kind: 'bill_of_supply',
    supplier: { ...(wireDocument().supplier as Wire), gst_type: 'composition' },
    cgst_total: '0.00',
    sgst_total: '0.00',
    taxable_total: '450.00',
    round_off: '0.00',
    grand_total: '450.00',
    amount_due: '450.00',
    lines: [
      wireLine({
        tax_code: 'GST0',
        tax_rate: '0.000',
        cgst: '0.00',
        sgst: '0.00',
        line_total: '450.00',
      }),
    ],
  });
