import Decimal from 'decimal.js-light';

/**
 * SAL-02 BR-1…BR-12 — the client MIRROR of `backend/apps/tax/services/
 * tax_engine.py`, for the totals a merchant watches change as they type.
 *
 * It is a PREVIEW. The server recomputes every figure at save and at issue
 * (FR-3) and only the server's is stored or printed. The two engines are held
 * together by one file, `taxEngine.cases.json`, which both test suites run in
 * full: a divergence fails CI on both sides rather than surfacing as a paisa
 * of difference at a counter.
 *
 * The order is the rule, and it is the backend's order exactly:
 * gross (rounded once) → line discount (capped) → taxable_line (inclusive
 * backs out rate + cess) → document discount apportioned (residual to the
 * LARGEST line, ties to the LOWEST index) → CGST = q2(t·r/200), SGST = q2(t·r/100)
 * − CGST, or IGST → cess → totals as SUMS of line figures → round-off half-up.
 */

const HALF_UP = Decimal.ROUND_HALF_UP;
const ZERO = new Decimal(0);
const HUNDRED = new Decimal(100);

export type EngineGstType = 'regular' | 'composition' | 'unregistered';
export type EngineDiscountType = 'percent' | 'amount' | null;

export interface EngineLineInput {
  readonly qty: string;
  readonly unitPrice: string;
  readonly taxInclusive: boolean;
  readonly discountType: EngineDiscountType;
  readonly discountValue: string | null;
  readonly rate: string;
  readonly cessRate: string;
}

export interface EngineDocumentInput {
  readonly lines: readonly EngineLineInput[];
  readonly gstType: EngineGstType;
  readonly tenantState: string;
  readonly placeOfSupply: string;
  readonly roundOffEnabled: boolean;
  readonly discountType: EngineDiscountType;
  readonly discountValue: string | null;
}

export interface EngineLineResult {
  readonly gross: string;
  readonly discountAmount: string;
  readonly taxableLine: string;
  readonly docDiscountShare: string;
  readonly taxableValue: string;
  readonly taxRate: string;
  readonly cgst: string;
  readonly sgst: string;
  readonly igst: string;
  readonly cess: string;
  readonly lineTotal: string;
}

export interface EngineResult {
  readonly isInterState: boolean;
  readonly subtotal: string;
  readonly discountAmount: string;
  readonly taxableTotal: string;
  readonly cgstTotal: string;
  readonly sgstTotal: string;
  readonly igstTotal: string;
  readonly cessTotal: string;
  readonly grandRaw: string;
  readonly roundOff: string;
  readonly grandTotal: string;
  readonly lines: readonly EngineLineResult[];
}

const q2 = (value: Decimal): Decimal => value.toDecimalPlaces(2, HALF_UP);

/** Tolerant parse: an empty or half-typed cell counts as zero in a preview. */
const dec = (raw: string | null | undefined): Decimal => {
  if (raw === null || raw === undefined) return ZERO;
  const text = String(raw).trim();
  if (!/^-?\d*\.?\d*$/.test(text) || text === '' || text === '-' || text === '.') return ZERO;
  return new Decimal(text);
};

const money = (value: Decimal): string => value.toFixed(2);

const discountOf = (base: Decimal, type: EngineDiscountType, raw: string | null): Decimal => {
  if (!type || raw === null || raw === undefined || raw === '') return ZERO;
  const value = dec(raw);
  const amount = type === 'percent' ? q2(base.times(value).dividedBy(HUNDRED)) : q2(value);
  if (amount.greaterThan(base)) return base;
  return amount.lessThan(ZERO) ? ZERO : amount;
};

const allocate = (discount: Decimal, weights: readonly Decimal[]): Decimal[] => {
  const subtotal = weights.reduce((acc, w) => acc.plus(w), ZERO);
  if (discount.isZero() || subtotal.isZero()) return weights.map(() => ZERO);
  const shares = weights.map((w) => q2(discount.times(w).dividedBy(subtotal)));
  const residual = discount.minus(shares.reduce((acc, s) => acc.plus(s), ZERO));
  if (!residual.isZero()) {
    let target = 0;
    weights.forEach((w, i) => {
      if (w.greaterThan(weights[target] as Decimal)) target = i;
    });
    shares[target] = q2((shares[target] as Decimal).plus(residual));
  }
  return shares;
};

export const computeDocumentTotals = (doc: EngineDocumentInput): EngineResult => {
  const taxFree = doc.gstType !== 'regular';
  const inter = doc.placeOfSupply !== '' && doc.placeOfSupply !== doc.tenantState;

  const staged = doc.lines.map((line) => {
    const rate = taxFree ? ZERO : dec(line.rate);
    const cess = taxFree ? ZERO : dec(line.cessRate);
    const gross = q2(dec(line.qty).times(dec(line.unitPrice)));
    const discount = discountOf(gross, line.discountType, line.discountValue);
    const net = gross.minus(discount);
    const divisor = rate.plus(cess);
    const taxableLine =
      line.taxInclusive && !divisor.isZero()
        ? q2(net.dividedBy(new Decimal(1).plus(divisor.dividedBy(HUNDRED))))
        : net;
    return { gross, discount, taxableLine, rate, cess };
  });

  const subtotal = staged.reduce((acc, s) => acc.plus(s.taxableLine), ZERO);
  const docDiscount = discountOf(subtotal, doc.discountType, doc.discountValue);
  const shares = allocate(
    docDiscount,
    staged.map((s) => s.taxableLine)
  );

  const lines = staged.map((s, i) => {
    const share = shares[i] as Decimal;
    const taxable = s.taxableLine.minus(share);
    let cgst = ZERO;
    let sgst = ZERO;
    let igst = ZERO;
    if (inter) {
      igst = q2(taxable.times(s.rate).dividedBy(HUNDRED));
    } else {
      const tax = q2(taxable.times(s.rate).dividedBy(HUNDRED));
      cgst = q2(taxable.times(s.rate).dividedBy(200));
      sgst = tax.minus(cgst);
    }
    const cess = q2(taxable.times(s.cess).dividedBy(HUNDRED));
    return {
      gross: s.gross,
      discount: s.discount,
      taxableLine: s.taxableLine,
      share,
      taxable,
      rate: s.rate,
      cgst,
      sgst,
      igst,
      cess,
      total: taxable.plus(cgst).plus(sgst).plus(igst).plus(cess),
    };
  });

  const sum = (pick: (line: (typeof lines)[number]) => Decimal): Decimal =>
    lines.reduce((acc, line) => acc.plus(pick(line)), ZERO);
  const grandRaw = sum((l) => l.total);
  const grandTotal = doc.roundOffEnabled ? grandRaw.toDecimalPlaces(0, HALF_UP) : grandRaw;

  return {
    isInterState: inter,
    subtotal: money(subtotal),
    discountAmount: money(docDiscount),
    taxableTotal: money(sum((l) => l.taxable)),
    cgstTotal: money(sum((l) => l.cgst)),
    sgstTotal: money(sum((l) => l.sgst)),
    igstTotal: money(sum((l) => l.igst)),
    cessTotal: money(sum((l) => l.cess)),
    grandRaw: money(grandRaw),
    roundOff: money(grandTotal.minus(grandRaw)),
    grandTotal: money(grandTotal),
    lines: lines.map((l) => ({
      gross: money(l.gross),
      discountAmount: money(l.discount),
      taxableLine: money(l.taxableLine),
      docDiscountShare: money(l.share),
      taxableValue: money(l.taxable),
      taxRate: l.rate.toFixed(3),
      cgst: money(l.cgst),
      sgst: money(l.sgst),
      igst: money(l.igst),
      cess: money(l.cess),
      lineTotal: money(l.total),
    })),
  };
};

export interface EngineRateRow {
  readonly code: string;
  readonly rate: string;
  readonly cess_rate: string;
  readonly effective_from: string;
  readonly effective_to: string | null;
}

/** BR-1 — the row a code resolves to on a date; `effective_to` is inclusive. */
export const resolveRate = (
  rates: readonly EngineRateRow[],
  code: string,
  onDate: string
): EngineRateRow | null =>
  rates.find(
    (row) =>
      row.code === code &&
      row.effective_from <= onDate &&
      (row.effective_to === null || row.effective_to >= onDate)
  ) ?? null;
