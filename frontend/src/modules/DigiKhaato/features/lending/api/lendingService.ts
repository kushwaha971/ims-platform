import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import { LENDING_PATHS } from './lendingPaths';

import type {
  BorrowerRow,
  CollectFormValues,
  CollectionPreview,
  CollectionRow,
  LateFeeKind,
  LendingRoute,
  LoanDetail,
  LoanDueFigures,
  LoanFigures,
  LoanFormValues,
  LoanMessageRow,
  LoanPreview,
  LoanRow,
  TodayRound,
  VisitOutcome,
  VisitRow,
} from '../types/lending.types';

/** Lending (FRD lending.md): one async function per endpoint, and the mapping. */
type Wire = Readonly<Record<string, unknown>>;

const str = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value);
const strOrNull = (value: unknown): string | null =>
  value === null || value === undefined || value === '' ? null : String(value);
const num = (value: unknown): number => Number(value ?? 0);

const toFigures = (row: Wire): LoanFigures => ({
  dueToday: str(row.due_today || '0.00'),
  arrears: str(row.arrears || '0.00'),
  remaining: str(row.remaining || '0.00'),
  collected: str(row.collected || '0.00'),
  daysPastDue: num(row.days_past_due),
  nextDueOn: strOrNull(row.next_due_on),
  nextDueAmount: strOrNull(row.next_due_amount),
});

export const toLoanRow = (row: Wire): LoanRow => {
  const b = (row.borrower ?? {}) as Wire;
  const route = row.route as Wire | null;
  return {
    ...toFigures(row),
    id: str(row.id),
    number: str(row.number),
    status: str(row.status) as LoanRow['status'],
    closeReason: str(row.close_reason),
    borrower: {
      id: str(b.id),
      number: str(b.number),
      partyId: str(b.party_id),
      name: str(b.name),
      mobile: strOrNull(b.mobile),
      area: str(b.area),
    },
    route: route ? { id: str(route.id), name: str(route.name) } : null,
    planType: str(row.plan_type) as LoanRow['planType'],
    frequency: str(row.frequency) as LoanRow['frequency'],
    principal: str(row.principal),
    rate: str(row.rate),
    rateUnit: str(row.rate_unit) as LoanRow['rateUnit'],
    instalmentCount: num(row.instalment_count),
    instalmentAmount: str(row.instalment_amount),
    totalInterest: str(row.total_interest),
    totalPayable: str(row.total_payable),
    cashHandedOver: str(row.cash_handed_over),
    effectiveAnnualRate: str(row.effective_annual_rate),
    disbursedOn: str(row.disbursed_on),
    maturityOn: str(row.maturity_on),
    notes: str(row.notes),
  };
};

const toLender = (raw: unknown): LoanDetail['lender'] => {
  if (!raw || typeof raw !== 'object') return null;
  const l = raw as Wire;
  return {
    name: str(l.name),
    legalName: str(l.legal_name),
    address: ((l.address as unknown[] | undefined) ?? []).map(str),
    phone: str(l.phone),
    gstin: str(l.gstin),
  };
};

export const toLoanDetail = (row: Wire): LoanDetail => ({
  ...toLoanRow(row),
  lender: toLender(row.lender),
  lateFee: (() => {
    const rule = (row.late_fee ?? {}) as Wire;
    return {
      kind: (str(rule.kind) || 'none') as LoanDetail['lateFee']['kind'],
      value: strOrNull(rule.value),
      cap: strOrNull(rule.cap),
      graceDays: num(rule.grace_days),
    };
  })(),
  closedOn: strOrNull(row.closed_on),
  statusReason: str(row.status_reason),
  writeOffAmount: strOrNull(row.write_off_amount),
  hasCollections: Boolean(row.has_collections),
  deductions: ((row.deductions as Wire[] | undefined) ?? []).map((d) => ({
    kind: str(d.kind),
    label: str(d.label),
    amount: str(d.amount),
  })),
  schedule: ((row.schedule as Wire[] | undefined) ?? []).map((d) => ({
    id: str(d.id),
    seq: num(d.seq),
    dueOn: str(d.due_on),
    amount: str(d.amount),
    settled: str(d.settled),
    outstanding: str(d.outstanding),
    lateFee: str(d.late_fee ?? '0.00'),
    waived: str(d.waived ?? '0.00'),
    status: str(d.status),
  })),
});

/** The form's values as the API's terms (FRD LEN-03 §6). */
export const toTermsBody = (values: LoanFormValues): Record<string, unknown> => {
  const fileCharge = Number(values.fileCharge || 0);
  return {
    plan_type: values.planType,
    principal: values.principal,
    rate: values.planType === 'fixed_daily' ? undefined : values.rate || '0',
    rate_unit: values.rateUnit,
    frequency: values.frequency,
    instalment_count: values.planType === 'flexible' ? 1 : Number(values.instalmentCount || 0),
    per_instalment_amount:
      values.planType === 'fixed_daily' ? values.perInstalmentAmount : undefined,
    collection_weekdays: values.frequency === 'daily' ? values.collectionWeekdays : undefined,
    disbursed_on: values.disbursedOn,
    first_due_on: values.firstDueOn,
    deductions:
      fileCharge > 0
        ? [{ kind: 'processing_fee', label: 'File charge', amount: values.fileCharge }]
        : [],
  };
};

export const toLoanBody = (values: LoanFormValues): Record<string, unknown> => ({
  ...toTermsBody(values),
  ...(values.borrowerMode === 'existing'
    ? { borrower_id: values.borrowerId }
    : {
        party: { name: values.name.trim(), mobile: (values.mobile ?? '').trim() || undefined },
        area: (values.area ?? '').trim() || undefined,
      }),
  route_id: values.routeId || undefined,
  payment_mode: values.paymentMode,
  notes: (values.notes ?? '').trim() || undefined,
  ...(values.lateFeeKind && values.lateFeeKind !== 'none'
    ? {
        late_fee_kind: values.lateFeeKind,
        late_fee_value: values.lateFeeValue,
        late_fee_cap: values.lateFeeKind === 'flat_once' ? undefined : values.lateFeeCap,
        late_fee_grace_days: Number(values.lateFeeGraceDays || 0),
      }
    : {}),
});

const quiet = ubConfig({ suppressErrorSnackbar: true });

export const previewLoan = async (
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<LoanPreview> => {
  const response = await api.post<{ data: Wire; meta: { warnings: Wire[] } }>(
    LENDING_PATHS.PREVIEW,
    body,
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  const d = response.data.data;
  return {
    cashHandedOver: str(d.cash_handed_over),
    deductionsTotal: str(d.deductions_total),
    instalmentAmount: str(d.instalment_amount),
    totalInterest: str(d.total_interest),
    totalPayable: str(d.total_payable),
    maturityOn: str(d.maturity_on),
    effectiveAnnualRate: str(d.effective_annual_rate),
    effectiveAnnualRateDisplay: str(d.effective_annual_rate_display),
    schedule: ((d.schedule as Wire[] | undefined) ?? []).map((r) => ({
      seq: num(r.seq),
      dueOn: str(r.due_on),
      amount: str(r.amount),
      principal: str(r.principal),
      interest: str(r.interest),
    })),
    warnings: (response.data.meta?.warnings ?? []).map((w) => str(w.code)),
  };
};

export const createLoan = async (values: LoanFormValues, key: string): Promise<LoanDetail> => {
  const response = await api.post<{ data: Wire }>(
    LENDING_PATHS.LOANS,
    toLoanBody(values),
    ubConfig({ headers: { 'Idempotency-Key': key }, suppressErrorSnackbar: true })
  );
  return toLoanDetail(response.data.data);
};

export interface LoanPage {
  readonly rows: LoanRow[];
  readonly total: number;
  readonly page: number;
  readonly totalPages: number;
}

export const listLoans = async (
  params: { status?: string; q?: string; route?: string; page?: string },
  signal?: AbortSignal
): Promise<LoanPage> => {
  const response = await api.get<{
    data: Wire[];
    meta: { page: number; total: number; total_pages: number };
  }>(`${LENDING_PATHS.LOANS}${toQueryString(params)}`, { signal });
  return {
    rows: response.data.data.map(toLoanRow),
    total: response.data.meta.total,
    page: response.data.meta.page,
    totalPages: response.data.meta.total_pages,
  };
};

export const getLoan = async (id: string, signal?: AbortSignal): Promise<LoanDetail> => {
  const response = await api.get<{ data: Wire }>(LENDING_PATHS.LOAN(id), { signal });
  return toLoanDetail(response.data.data);
};

export const getLoanActivity = async (
  id: string,
  signal?: AbortSignal
): Promise<{ collections: CollectionRow[]; visits: VisitRow[]; messages: LoanMessageRow[] }> => {
  const response = await api.get<{ data: Wire[]; meta: { visits: Wire[]; messages?: Wire[] } }>(
    LENDING_PATHS.COLLECTIONS(id),
    { signal }
  );
  return {
    collections: response.data.data.map((c) => ({
      id: str(c.id),
      collectedOn: str(c.collected_on),
      amount: str(c.amount),
      mode: str(c.mode),
      reference: str(c.reference),
      note: str(c.note),
      receiptNumber: str(c.receipt_number),
      voided: Boolean(c.voided),
    })),
    visits: (response.data.meta?.visits ?? []).map((v) => ({
      onDate: str(v.on_date),
      outcome: str(v.outcome) as VisitOutcome,
      reason: str(v.reason),
      promisedOn: strOrNull(v.promised_on),
    })),
    messages: (response.data.meta?.messages ?? []).map((m) => ({
      id: str(m.id),
      kind: str(m.kind) as LoanMessageRow['kind'],
      subject: str(m.subject),
      channel: str(m.channel) as LoanMessageRow['channel'],
      at: strOrNull(m.at),
    })),
  };
};

export const previewCollection = async (
  loanId: string,
  amount: string,
  signal?: AbortSignal
): Promise<CollectionPreview> => {
  const response = await api.post<{ data: Wire }>(
    LENDING_PATHS.COLLECTION_PREVIEW(loanId),
    { amount },
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  const d = response.data.data;
  return {
    amount: str(d.amount),
    remainingAfter: str(d.remaining_after),
    clears: ((d.clears as Wire[] | undefined) ?? []).map((c) => ({
      seq: num(c.seq),
      dueOn: str(c.due_on),
      amount: str(c.amount),
      when: str(c.when) as 'missed' | 'today' | 'ahead',
    })),
  };
};

export interface CollectResult {
  readonly receiptNumber: string;
  readonly amount: string;
  readonly loanStatus: string;
  readonly figures: LoanFigures;
}

export const collect = async (
  loanId: string,
  values: CollectFormValues,
  key: string
): Promise<CollectResult> => {
  const response = await api.post<{ data: Wire }>(
    LENDING_PATHS.COLLECTIONS(loanId),
    {
      amount: values.amount,
      mode: values.mode,
      reference: (values.reference ?? '').trim() || undefined,
      note: (values.note ?? '').trim() || undefined,
    },
    ubConfig({ headers: { 'Idempotency-Key': key }, suppressErrorSnackbar: true })
  );
  const d = response.data.data;
  return {
    receiptNumber: str(d.receipt_number),
    amount: str(d.amount),
    loanStatus: str(d.loan_status),
    figures: toFigures((d.figures ?? {}) as Wire),
  };
};

export const recordVisit = async (
  loanId: string,
  body: { outcome: VisitOutcome; reason: string; promisedOn?: string }
): Promise<void> => {
  await api.post(
    LENDING_PATHS.VISITS(loanId),
    { outcome: body.outcome, reason: body.reason, promised_on: body.promisedOn || undefined },
    quiet
  );
};

export const getToday = async (route: string, signal?: AbortSignal): Promise<TodayRound> => {
  const response = await api.get<{
    data: Wire[];
    meta: {
      on: string;
      due: string;
      collected: string;
      short: string;
      stops: number;
      done: number;
    };
  }>(`${LENDING_PATHS.TODAY}${toQueryString({ route: route || undefined })}`, { signal });
  const meta = response.data.meta;
  return {
    on: meta.on,
    due: meta.due,
    collected: meta.collected,
    short: meta.short,
    stopsCount: meta.stops,
    done: meta.done,
    stops: response.data.data.map((s) => {
      const visit = s.visit as Wire | null;
      return {
        loanId: str(s.loan_id),
        number: str(s.number),
        name: str(s.name),
        mobile: strOrNull(s.mobile),
        area: str(s.area),
        route: strOrNull(s.route),
        seq: num(s.seq),
        frequency: str(s.frequency) as TodayRound['stops'][number]['frequency'],
        instalmentAmount: str(s.instalment_amount),
        dueToday: str(s.due_today),
        arrears: str(s.arrears),
        daysPastDue: num(s.days_past_due),
        collectedToday: str(s.collected_today),
        remaining: str(s.remaining),
        remindedToday: Boolean(s.reminded_today),
        visit: visit
          ? {
              outcome: str(visit.outcome) as VisitOutcome,
              reason: str(visit.reason),
              promisedOn: strOrNull(visit.promised_on),
            }
          : null,
      };
    }),
  };
};

export const listRoutes = async (signal?: AbortSignal): Promise<LendingRoute[]> => {
  const response = await api.get<{ data: Wire[] }>(LENDING_PATHS.ROUTES, { signal });
  return response.data.data.map((r) => {
    const agent = r.agent as Wire | null;
    return {
      id: str(r.id),
      name: str(r.name),
      agent: agent ? { id: str(agent.id), name: str(agent.name) } : null,
      isActive: Boolean(r.is_active),
      loans: r.loans === null || r.loans === undefined ? null : num(r.loans),
      version: num(r.version),
    };
  });
};

export const saveRoute = async (name: string): Promise<void> => {
  await api.post(LENDING_PATHS.ROUTES, { name }, quiet);
};

export const listBorrowers = async (q: string, signal?: AbortSignal): Promise<BorrowerRow[]> => {
  const response = await api.get<{ data: Wire[] }>(
    `${LENDING_PATHS.BORROWERS}${toQueryString({ q: q || undefined })}`,
    { signal }
  );
  return response.data.data.map((b) => {
    const route = b.route as Wire | null;
    return {
      id: str(b.id),
      number: str(b.number),
      partyId: str(b.party_id),
      name: str(b.name),
      mobile: strOrNull(b.mobile),
      area: str(b.area),
      route: route ? { id: str(route.id), name: str(route.name) } : null,
    };
  });
};

// ── LEN-09 — late fees and waivers ──────────────────────────────────────────

export const getLoanDue = async (
  loanId: string,
  dueId: string,
  signal?: AbortSignal
): Promise<LoanDueFigures> => {
  const response = await api.get<{ data: Wire }>(
    LENDING_PATHS.DUE(loanId, dueId),
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  const d = response.data.data;
  const fee = d.late_fee as Wire | null;
  const left = (d.waivable ?? {}) as Wire;
  return {
    dueId: str(d.due_id),
    seq: num(d.seq),
    status: str(d.status),
    lateFee: fee
      ? {
          rule: str(fee.rule) as LateFeeKind,
          daysLate: num(fee.days_late),
          ruleAmount: str(fee.rule_amount),
          alreadyCharged: str(fee.already_charged),
          suggested: str(fee.suggested),
        }
      : null,
    waivable: {
      interest: str(left.interest),
      fee: str(left.fee),
      principal: str(left.principal),
    },
  };
};

/** `kind` "fee" adds a late fee; "waive" forgives `component` of the instalment. */
export const adjustLoanDue = async (
  loanId: string,
  body: {
    kind: 'fee' | 'waive';
    dueId: string;
    amount: string;
    reason: string;
    component?: 'interest' | 'fee' | 'principal';
  },
  key: string
): Promise<LoanDetail> => {
  const response = await api.post<{ data: Wire }>(
    body.kind === 'fee' ? LENDING_PATHS.LATE_FEES(loanId) : LENDING_PATHS.WAIVERS(loanId),
    {
      due_id: body.dueId,
      amount: body.amount,
      reason: body.reason.trim(),
      ...(body.kind === 'waive' ? { component: body.component } : {}),
    },
    ubConfig({ headers: { 'Idempotency-Key': key }, suppressErrorSnackbar: true })
  );
  return toLoanDetail(response.data.data.loan as Wire);
};

// ── LEN-10 — write-off and cancel ───────────────────────────────────────────

export const endLoan = async (
  loanId: string,
  body:
    | { kind: 'write_off'; amount: string; reasonCode: string; reason: string }
    | { kind: 'cancel'; reason: string }
): Promise<LoanDetail> => {
  const response = await api.post<{ data: Wire }>(
    body.kind === 'write_off' ? LENDING_PATHS.WRITE_OFF(loanId) : LENDING_PATHS.CANCEL(loanId),
    body.kind === 'write_off'
      ? { amount: body.amount, reason_code: body.reasonCode, reason: body.reason.trim() }
      : { reason: body.reason.trim() },
    quiet
  );
  return toLoanDetail(response.data.data.loan as Wire);
};
