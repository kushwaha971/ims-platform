import { api, ubConfig } from 'src/api/AxiosInstances';

import { gstPath, registerPath } from '../view-model/registerDisplay';

import type {
  GstB2csRow,
  GstBox,
  GstDocsRow,
  GstException,
  GstHeads,
  GstHsnRow,
  GstNatureRow,
  GstQuery,
  GstRateRow,
  GstSummary,
  RegisterPage,
  RegisterQuery,
  RegisterRow,
  RegisterSplit,
  RegisterTotals,
} from '../types/taxReports.types';

/**
 * Part 19 §19.3.4 — RPT-03/04/07's endpoints: one async function each, the
 * snake ⇄ camel mapping and nothing else. Money stays a string.
 */

type Wire = Record<string, unknown>;
const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const sn = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : String(v);
const b = (v: unknown): boolean => v === true || v === 'true';
const n = (v: unknown): number => Number(v ?? 0) || 0;

const toRow = (row: Wire): RegisterRow => ({
  id: s(row.id),
  documentId: s(row.document_id),
  partyId: sn(row.party_id),
  isB2b: b(row.is_b2b),
  isWalkIn: b(row.is_walk_in),
  date: s(row.date),
  number: s(row.number),
  kind: s(row.kind),
  status: s(row.status),
  partyName: s(row.party_name ?? row.supplier_name),
  partyGstin: s(row.party_gstin ?? row.supplier_gstin),
  supplierInvoiceNumber: s(row.supplier_invoice_number),
  supplierInvoiceDate: sn(row.supplier_invoice_date),
  isInterState: b(row.is_inter_state),
  reverseCharge: b(row.reverse_charge),
  itcEligible: b(row.itc_eligible),
  taxableTotal: s(row.taxable_total),
  cgst: s(row.cgst),
  sgst: s(row.sgst),
  igst: s(row.igst),
  cess: s(row.cess),
  roundOff: s(row.round_off),
  grandTotal: s(row.grand_total ?? row.line_total),
  amountPaid: s(row.amount_paid),
  amountDue: s(row.amount_due),
  againstNumber: s(row.against_number),
  lineNo: row.line_no === undefined || row.line_no === null ? null : n(row.line_no),
  itemName: s(row.item_name),
  hsnSac: s(row.hsn_sac),
  qty: s(row.qty),
  unit: s(row.unit),
  taxRate: s(row.tax_rate),
  taxableValue: s(row.taxable_value ?? row.taxable_total),
  // Absent (not blank) for a member without `reports.financial.read` (RPT-08 BR-2).
  unitCost: sn(row.unit_cost),
});

const toSplit = (raw: unknown): RegisterSplit | null => {
  if (!raw || typeof raw !== 'object') return null;
  const split = raw as Wire;
  return { count: n(split.count), taxable: s(split.taxable), tax: s(split.tax) };
};

const toTotals = (raw: Wire): RegisterTotals => {
  const itc = raw.itc_eligible as Wire | undefined;
  return {
    count: n(raw.count),
    countByKind: (raw.count_by_kind ?? {}) as Record<string, number>,
    taxableTotal: s(raw.taxable_total),
    cgst: s(raw.cgst),
    sgst: s(raw.sgst),
    igst: s(raw.igst),
    cess: s(raw.cess),
    tax: s(raw.tax),
    roundOff: s(raw.round_off),
    grandTotal: s(raw.grand_total),
    amountPaid: s(raw.amount_paid),
    amountDue: s(raw.amount_due),
    b2b: toSplit(raw.b2b),
    b2c: toSplit(raw.b2c),
    itcEligible: itc
      ? {
          cgst: s(itc.cgst),
          sgst: s(itc.sgst),
          igst: s(itc.igst),
          cess: s(itc.cess),
          total: s(itc.total),
        }
      : null,
    rcmTax: sn(raw.rcm_tax),
    notClaimableTax: sn(raw.not_claimable_tax),
  };
};

/** GET /reports/sales-register | /reports/purchase-register — one page and the totals. */
export const getRegister = async (
  query: RegisterQuery,
  signal?: AbortSignal
): Promise<RegisterPage> => {
  const separator = registerPath(query).includes('?') ? '&' : '?';
  const response = await api.get<{ data: Wire[]; meta: Wire }>(
    `${registerPath(query)}${separator}page=${query.filters.page}`,
    ubConfig({ signal })
  );
  const { data, meta } = response.data;
  return {
    rows: data.map(toRow),
    totals: toTotals((meta.totals ?? {}) as Wire),
    page: n(meta.page),
    pageSize: n(meta.page_size),
    total: n(meta.total),
  };
};

// ── GST summary ────────────────────────────────────────────────────────────

const toHeads = (raw: Wire): GstHeads => ({
  taxableValue: s(raw.taxable_value),
  cgst: s(raw.cgst),
  sgst: s(raw.sgst),
  igst: s(raw.igst),
  cess: s(raw.cess),
});

const toRate = (row: Wire): GstRateRow => ({
  ...toHeads(row),
  taxCode: s(row.tax_code),
  taxRate: s(row.tax_rate),
  isInterState: b(row.is_inter_state),
  count: n(row.invoice_count ?? row.bill_count),
  box: sn(row.gstr3b_box),
  itcEligible: row.itc_eligible === undefined ? undefined : b(row.itc_eligible),
  reverseCharge: row.reverse_charge === undefined ? undefined : b(row.reverse_charge),
});

const toSection = <T>(
  raw: unknown,
  map: (row: Wire) => T
): { readonly rows: readonly T[]; readonly total: GstHeads } | null => {
  if (!raw || typeof raw !== 'object') return null;
  const section = raw as Wire;
  return {
    rows: ((section.rows ?? []) as Wire[]).map(map),
    total: toHeads((section.total ?? {}) as Wire),
  };
};

const toNature = (row: Wire): GstNatureRow => ({
  ...toHeads(row),
  nature: s(row.nature),
  table: s(row.gstr1_table),
  applicable: row.applicable !== false,
  documentCount: n(row.document_count),
  invoiceValue: sn(row.invoice_value),
});

const toB2cs = (row: Wire): GstB2csRow => ({
  ...toHeads(row),
  posState: s(row.pos_state),
  taxRate: s(row.tax_rate),
  isInterState: b(row.is_inter_state),
  table: s(row.gstr1_table),
});

const toHsn = (row: Wire): GstHsnRow => ({
  ...toHeads(row),
  hsnSac: s(row.hsn_sac),
  description: s(row.description),
  uqc: s(row.uqc),
  supplyType: s(row.supply_type),
  totalQty: s(row.total_qty),
  taxRate: s(row.tax_rate),
  totalValue: s(row.total_value),
});

const toDocs = (row: Wire): GstDocsRow => ({
  nature: s(row.nature),
  seriesPrefix: s(row.series_prefix),
  fromNumber: s(row.from_number),
  toNumber: s(row.to_number),
  totalCount: n(row.total_count),
  cancelledCount: n(row.cancelled_count),
  netIssued: n(row.net_issued),
});

const toBox = (raw: Wire): GstBox => ({
  taxable: s(raw.taxable),
  igst: s(raw.igst),
  cgst: s(raw.cgst),
  sgst: s(raw.sgst),
  cess: s(raw.cess),
  note: sn(raw.note),
});

/** FR-8 — the boxes in the order the form reads, top to bottom. */
const BOX_ORDER = ['3.1(a)', '3.1(b)', '3.1(c)', '3.1(d)', '3.1(e)', '4(A)(3)', '4(A)(5)', '4(B)'];

const toGstr3b = (raw: unknown): GstSummary['gstr3b'] => {
  if (!raw || typeof raw !== 'object') return null;
  const boxes = raw as Wire;
  const five = (boxes['5'] ?? {}) as Wire;
  const net = (boxes.net_payable ?? {}) as Wire;
  return {
    boxes: BOX_ORDER.filter((box) => box in boxes).map((box) => ({
      box,
      figures: toBox(boxes[box] as Wire),
    })),
    stateWise: ((boxes['3.2'] ?? []) as Wire[]).map((row) => ({
      posState: s(row.pos_state),
      taxable: s(row.taxable),
      igst: s(row.igst),
    })),
    exemptInward: { inter: s(five.inter), intra: s(five.intra) },
    net: {
      igst: s(net.igst),
      cgst: s(net.cgst),
      sgst: s(net.sgst),
      cess: s(net.cess),
      total: s(net.total),
      outputTax: s(net.output_tax),
      itc: s(net.itc),
    },
  };
};

const toException = (row: Wire): GstException => ({
  documentId: s(row.document_id),
  documentKind: s(row.document_kind),
  number: s(row.number),
  documentDate: s(row.document_date),
  partyName: s(row.party_name),
  issueCode: s(row.issue_code),
  message: s(row.message),
});

/** GET /reports/gst-summary — every section for the period. */
export const getGstSummary = async (query: GstQuery, signal?: AbortSignal): Promise<GstSummary> => {
  const response = await api.get<{ data: Wire; meta: Wire }>(
    gstPath(query),
    // The 409 for an unregistered business is a SCREEN (an empty state), not a toast.
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  const { data, meta } = response.data;
  const outward = (data.outward ?? {}) as Wire;
  const inward = (data.inward ?? {}) as Wire;
  const itc = inward.itc as Wire | undefined;
  const composition = data.composition as Wire | undefined;
  const dues = (meta.filing_due_dates ?? {}) as Wire;
  return {
    outwardByRate: toSection(outward.by_rate, toRate),
    byNature: (((outward.by_nature as Wire | undefined)?.rows ?? []) as Wire[]).map(toNature),
    b2cs: ((outward.b2cs ?? []) as Wire[]).map(toB2cs),
    hsn: toSection(data.hsn, toHsn),
    docs: ((data.docs ?? []) as Wire[]).map(toDocs),
    inwardByRate: toSection(inward.by_rate, toRate),
    itc: itc
      ? {
          eligibleTotal: s((itc.eligible as Wire | undefined)?.total),
          rcmTax: s(itc.rcm_tax),
          notClaimable: s(itc.not_claimable),
        }
      : null,
    gstr3b: toGstr3b(data.gstr3b),
    composition: composition
      ? { turnover: s(composition.turnover), rate: s(composition.rate), tax: s(composition.tax) }
      : null,
    exceptions: ((data.exceptions ?? []) as Wire[]).map(toException),
    meta: {
      dateFrom: s(meta.date_from),
      dateTo: s(meta.date_to),
      gstType: s(meta.gst_type),
      documentCount: n(meta.document_count),
      exceptionCount: n(meta.exception_count),
      gstr1Due: s(dues.gstr1),
      gstr3bDue: s(dues.gstr3b),
      yearToDate: b(meta.year_to_date),
    },
  };
};
