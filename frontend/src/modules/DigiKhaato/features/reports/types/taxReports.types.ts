import type { RequestStatus, ApiErrorShape } from 'src/types/api.types';

/**
 * RPT-03 / RPT-04 / RPT-07 on the client. Money is a signed decimal STRING
 * from the server and is never re-added here (RPT-07 NFR: "the client never
 * re-adds") — every total on screen is a total the server computed over the
 * filtered set.
 */

export type RegisterBook = 'sales' | 'purchase';
export type RegisterLevel = 'document' | 'line';
export type TaxPeriodPreset =
  'thisMonth' | 'lastMonth' | 'thisQuarter' | 'lastQuarter' | 'thisFy' | 'custom';

/** RPT-03 FR-6 — the status chips, each a set of server statuses. */
export type RegisterStatusFilter = 'all' | 'unpaid' | 'paid';
/** RPT-03 FR-4 — B2B is "a GSTIN on the frozen snapshot". */
export type RegisterPartyFilter = 'all' | 'b2b' | 'b2c';
export type SalesKindFilter = 'all' | 'invoice' | 'credit_note';
export type ItcFilter = 'all' | 'eligible' | 'blocked';

export interface RegisterFilters {
  readonly preset: TaxPeriodPreset;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly level: RegisterLevel;
  readonly status: RegisterStatusFilter;
  readonly party: RegisterPartyFilter;
  readonly kind: SalesKindFilter;
  readonly itc: ItcFilter;
  readonly includeVoid: boolean;
  /** CR-RPT-2 — the GST summary's drill-down keys. */
  readonly taxCode: string | null;
  readonly interState: boolean | null;
  readonly page: number;
}

/** One register row, document or line level — the server's column keys, camelCased. */
export interface RegisterRow {
  readonly id: string;
  readonly documentId: string;
  readonly partyId: string | null;
  readonly isB2b: boolean;
  readonly isWalkIn: boolean;
  readonly date: string;
  readonly number: string;
  readonly kind: string;
  readonly status: string;
  readonly partyName: string;
  readonly partyGstin: string;
  readonly supplierInvoiceNumber: string;
  readonly supplierInvoiceDate: string | null;
  readonly isInterState: boolean;
  readonly reverseCharge: boolean;
  readonly itcEligible: boolean;
  readonly taxableTotal: string;
  readonly cgst: string;
  readonly sgst: string;
  readonly igst: string;
  readonly cess: string;
  readonly roundOff: string;
  readonly grandTotal: string;
  readonly amountPaid: string;
  readonly amountDue: string;
  readonly againstNumber: string;
  // line level
  readonly lineNo: number | null;
  readonly itemName: string;
  readonly hsnSac: string;
  readonly qty: string;
  readonly unit: string;
  readonly taxRate: string;
  readonly taxableValue: string;
  readonly unitCost: string | null;
}

export interface RegisterSplit {
  readonly count: number;
  readonly taxable: string;
  readonly tax: string;
}

export interface RegisterTotals {
  readonly count: number;
  readonly countByKind: Readonly<Record<string, number>>;
  readonly taxableTotal: string;
  readonly cgst: string;
  readonly sgst: string;
  readonly igst: string;
  readonly cess: string;
  /** Σ of the four heads, computed by the server (the client never re-adds). */
  readonly tax: string;
  readonly roundOff: string;
  readonly grandTotal: string;
  readonly amountPaid: string;
  readonly amountDue: string;
  readonly b2b: RegisterSplit | null;
  readonly b2c: RegisterSplit | null;
  readonly itcEligible: {
    readonly cgst: string;
    readonly sgst: string;
    readonly igst: string;
    readonly cess: string;
    readonly total: string;
  } | null;
  readonly rcmTax: string | null;
  readonly notClaimableTax: string | null;
}

export interface RegisterPage {
  readonly rows: readonly RegisterRow[];
  readonly totals: RegisterTotals;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface RegisterQuery {
  readonly book: RegisterBook;
  readonly filters: RegisterFilters;
}

// ── GST summary ────────────────────────────────────────────────────────────

export type GstView = 'gstr1' | 'gstr3b' | 'details';
export type GstRounding = 'paise' | 'rupee';

export interface GstHeads {
  readonly taxableValue: string;
  readonly cgst: string;
  readonly sgst: string;
  readonly igst: string;
  readonly cess: string;
}

export interface GstRateRow extends GstHeads {
  readonly taxCode: string;
  readonly taxRate: string;
  readonly isInterState: boolean;
  readonly count: number;
  readonly box: string | null;
  /** Inward only. */
  readonly itcEligible?: boolean;
  readonly reverseCharge?: boolean;
}

export interface GstNatureRow extends GstHeads {
  readonly nature: string;
  readonly table: string;
  readonly applicable: boolean;
  readonly documentCount: number;
  readonly invoiceValue: string | null;
}

export interface GstB2csRow extends GstHeads {
  readonly posState: string;
  readonly taxRate: string;
  readonly isInterState: boolean;
  readonly table: string;
}

export interface GstHsnRow extends GstHeads {
  readonly hsnSac: string;
  readonly description: string;
  readonly uqc: string;
  readonly supplyType: string;
  readonly totalQty: string;
  readonly taxRate: string;
  readonly totalValue: string;
}

export interface GstDocsRow {
  readonly nature: string;
  readonly seriesPrefix: string;
  readonly fromNumber: string;
  readonly toNumber: string;
  readonly totalCount: number;
  readonly cancelledCount: number;
  readonly netIssued: number;
}

export interface GstBox {
  readonly taxable: string;
  readonly igst: string;
  readonly cgst: string;
  readonly sgst: string;
  readonly cess: string;
  readonly note: string | null;
}

export interface Gstr3b {
  readonly boxes: readonly { readonly box: string; readonly figures: GstBox }[];
  readonly stateWise: readonly {
    readonly posState: string;
    readonly taxable: string;
    readonly igst: string;
  }[];
  readonly exemptInward: { readonly inter: string; readonly intra: string };
  readonly net: {
    readonly igst: string;
    readonly cgst: string;
    readonly sgst: string;
    readonly cess: string;
    readonly total: string;
    readonly outputTax: string;
    readonly itc: string;
  };
}

export interface GstException {
  readonly documentId: string;
  readonly documentKind: string;
  readonly number: string;
  readonly documentDate: string;
  readonly partyName: string;
  readonly issueCode: string;
  readonly message: string;
}

export interface GstItc {
  readonly eligibleTotal: string;
  readonly rcmTax: string;
  readonly notClaimable: string;
}

export interface GstSummary {
  readonly outwardByRate: { readonly rows: readonly GstRateRow[]; readonly total: GstHeads } | null;
  readonly byNature: readonly GstNatureRow[];
  readonly b2cs: readonly GstB2csRow[];
  readonly hsn: { readonly rows: readonly GstHsnRow[]; readonly total: GstHeads } | null;
  readonly docs: readonly GstDocsRow[];
  readonly inwardByRate: { readonly rows: readonly GstRateRow[]; readonly total: GstHeads } | null;
  readonly itc: GstItc | null;
  readonly gstr3b: Gstr3b | null;
  readonly composition: {
    readonly turnover: string;
    readonly rate: string;
    readonly tax: string;
  } | null;
  readonly exceptions: readonly GstException[];
  readonly meta: {
    readonly dateFrom: string;
    readonly dateTo: string;
    readonly gstType: string;
    readonly documentCount: number;
    readonly exceptionCount: number;
    readonly gstr1Due: string;
    readonly gstr3bDue: string;
    readonly yearToDate: boolean;
  };
}

export interface GstQuery {
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly rounding: GstRounding;
}

export interface ReportSliceState<TData, TQuery> {
  readonly data: TData | null;
  readonly query: TQuery | null;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
}
