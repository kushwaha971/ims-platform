import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import { isZeroAmount } from 'src/utils/money';

import type {
  Deposit,
  DepositApplicationRow,
  DepositDetail,
  DepositMoneyFormValues,
  DepositPaymentRow,
  DepositWriteResult,
  ApplyDepositFormValues,
} from '../types/deposit.types';

/**
 * A4b — `/deposits` (FRD 00 PLT-X02 §6). There is no create: a deposit is
 * opened by the vertical that asks for it, from its own endpoint.
 */
type Wire = Record<string, unknown>;

const s = (value: unknown): string => (typeof value === 'string' ? value : '');
const sn = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const ref = (value: unknown): { readonly id: string; readonly number: string } => {
  const row = (value ?? {}) as Wire;
  return { id: s(row.id), number: s(row.number) };
};

export const toDeposit = (row: Wire): Deposit => {
  const party = (row.party ?? {}) as Wire;
  return {
    id: s(row.id),
    party: { id: s(party.id), name: s(party.name) },
    module: s(row.module),
    subjectType: s(row.subject_type),
    subjectId: s(row.subject_id),
    purpose: s(row.purpose),
    expectedAmount: s(row.expected_amount),
    receivedAmount: s(row.received_amount),
    appliedAmount: s(row.applied_amount),
    refundedAmount: s(row.refunded_amount),
    heldAmount: s(row.held_amount),
    status: s(row.status) as Deposit['status'],
    note: s(row.note),
    version: typeof row.version === 'number' ? row.version : 0,
    createdAt: s(row.created_at),
  };
};

const toPaymentRow = (row: Wire): DepositPaymentRow => ({
  id: s(row.id),
  number: s(row.number),
  paymentDate: s(row.payment_date),
  amount: s(row.amount),
  primaryMode: s(row.primary_mode),
  status: s(row.status) === 'void' ? 'void' : 'recorded',
  opening: row.opening === true,
});

const toApplication = (row: Wire): DepositApplicationRow => ({
  id: s(row.id),
  amount: s(row.amount),
  reason: s(row.reason),
  createdAt: s(row.created_at),
  voidedAt: sn(row.voided_at),
  refundPayment: ref(row.refund_payment),
  settlePayment: ref(row.settle_payment),
});

export const toDepositDetail = (row: Wire): DepositDetail => ({
  ...toDeposit(row),
  receipts: ((row.receipts as Wire[] | undefined) ?? []).map(toPaymentRow),
  applications: ((row.applications as Wire[] | undefined) ?? []).map(toApplication),
  refunds: ((row.refunds as Wire[] | undefined) ?? []).map(toPaymentRow),
});

export interface PartyDeposits {
  readonly rows: readonly Deposit[];
  readonly heldTotal: string;
}

export const listPartyDeposits = async (
  partyId: string,
  signal?: AbortSignal
): Promise<PartyDeposits> => {
  const response = await api.get<{ data: Wire[]; meta?: { totals?: { held?: string } } }>(
    `${API_PATHS.DEPOSITS}?party_id=${encodeURIComponent(partyId)}`,
    ubConfig({ signal })
  );
  return {
    rows: response.data.data.map(toDeposit),
    heldTotal: response.data.meta?.totals?.held ?? '0.00',
  };
};

export const getDeposit = async (id: string, signal?: AbortSignal): Promise<DepositDetail> => {
  const response = await api.get<{ data: Wire }>(API_PATHS.DEPOSIT(id), ubConfig({ signal }));
  return toDepositDetail(response.data.data);
};

/** One mode line, as `mode_breakup` wants it. A deposit is taken or returned one way at a time. */
export const toModeBreakup = (values: DepositMoneyFormValues): readonly Wire[] => [
  {
    mode: values.mode,
    amount: values.amount,
    ...(values.mode !== 'cash' && values.reference.trim()
      ? { reference: values.reference.trim() }
      : {}),
    ...(values.mode === 'upi' && values.upiApp ? { upi_app: values.upiApp } : {}),
  },
];

const writeResult = (data: Wire, paymentKey: 'payment' | 'settle_payment'): DepositWriteResult => ({
  deposit: toDepositDetail((data.deposit ?? {}) as Wire),
  paymentNumber: s(((data[paymentKey] ?? {}) as Wire).number),
});

const headers = (idempotencyKey: string) =>
  ubConfig({ headers: { 'Idempotency-Key': idempotencyKey } });

export const receiveDeposit = async (
  deposit: Pick<Deposit, 'id' | 'version'>,
  values: DepositMoneyFormValues,
  idempotencyKey: string
): Promise<DepositWriteResult> => {
  const response = await api.post<{ data: Wire }>(
    API_PATHS.DEPOSIT_RECEIVE(deposit.id),
    { amount: values.amount, mode_breakup: toModeBreakup(values), version: deposit.version },
    headers(idempotencyKey)
  );
  return writeResult(response.data.data, 'payment');
};

export const refundDeposit = async (
  deposit: Pick<Deposit, 'id' | 'version'>,
  values: DepositMoneyFormValues,
  idempotencyKey: string
): Promise<DepositWriteResult> => {
  const response = await api.post<{ data: Wire }>(
    API_PATHS.DEPOSIT_REFUND(deposit.id),
    {
      amount: values.amount,
      mode_breakup: toModeBreakup(values),
      reason: values.reason.trim(),
      version: deposit.version,
    },
    headers(idempotencyKey)
  );
  return writeResult(response.data.data, 'payment');
};

export const applyDeposit = async (
  deposit: Pick<Deposit, 'id' | 'version'>,
  values: ApplyDepositFormValues,
  idempotencyKey: string
): Promise<DepositWriteResult> => {
  const response = await api.post<{ data: Wire }>(
    API_PATHS.DEPOSIT_APPLY(deposit.id),
    {
      allocations: values.rows
        .filter((row) => !!row.amount && !isZeroAmount(row.amount))
        .map((row) => ({
          document_type: row.documentType,
          document_id: row.documentId,
          amount: row.amount,
        })),
      reason: values.reason.trim(),
      version: deposit.version,
    },
    headers(idempotencyKey)
  );
  return writeResult(response.data.data, 'settle_payment');
};
