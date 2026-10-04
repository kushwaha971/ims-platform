import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import { LIBRARY_PATHS } from './libraryPaths';

import type { ChargeRow, ChargeTotals, ManualChargeKind } from '../types/charge.types';

/**
 * F06 (LIB-07 §6) — charges, waivers, reversals, and the lost and found
 * acts. Every write is quiet: its dialog says the refusal where it was asked
 * (the ceiling refusal must leave the typed reason in place, §8).
 */
type Wire = Readonly<Record<string, unknown>>;

const str = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value);
const quiet = (extra: Parameters<typeof ubConfig>[0] = {}) =>
  ubConfig({ ...extra, suppressErrorSnackbar: true });

export const toChargeRow = (row: Wire): ChargeRow => ({
  id: str(row.id),
  membershipId: str(row.membership_id),
  partyId: str(row.party_id),
  number: str(row.number),
  kind: str(row.kind),
  amount: str(row.amount),
  chargeDate: str(row.charge_date),
  description: str(row.description),
  fineDays: row.fine_days === null || row.fine_days === undefined ? null : Number(row.fine_days),
  amountPaid: str(row.amount_paid || '0.00'),
  waivedAmount: str(row.waived_amount || '0.00'),
  refundedAmount: str(row.refunded_amount || '0.00'),
  amountDue: str(row.amount_due || '0.00'),
  status: str(row.status),
  reversedAt: row.reversed_at ? str(row.reversed_at) : null,
});

export const listMemberCharges = async (
  membershipId: string,
  signal?: AbortSignal
): Promise<{ rows: ChargeRow[]; totals: ChargeTotals }> => {
  const response = await api.get<{ data: Wire[]; meta: { totals: ChargeTotals } }>(
    `${LIBRARY_PATHS.CHARGES}${toQueryString({ membership: membershipId, page_size: 100 })}`,
    { signal }
  );
  return { rows: response.data.data.map(toChargeRow), totals: response.data.meta.totals };
};

export const waiveCharge = async (
  id: string,
  body: { amount: string; reason: string }
): Promise<ChargeRow> => {
  const response = await api.post<{ data: Wire }>(
    LIBRARY_PATHS.CHARGE_ACTION(id, 'waive'),
    body,
    quiet()
  );
  return toChargeRow(response.data.data);
};

export const reverseCharge = async (id: string, reason: string): Promise<ChargeRow> => {
  const response = await api.post<{ data: Wire }>(
    LIBRARY_PATHS.CHARGE_ACTION(id, 'reverse'),
    { reason },
    quiet()
  );
  return toChargeRow(response.data.data);
};

export const createManualCharge = async (
  body: { membership_id: string; kind: ManualChargeKind; amount: string; description: string },
  key: string
): Promise<ChargeRow> => {
  const response = await api.post<{ data: Wire }>(
    LIBRARY_PATHS.CHARGES,
    body,
    quiet({ headers: { 'Idempotency-Key': key } })
  );
  return toChargeRow(response.data.data);
};

/** The fine to `on` (today by default) — the calculation the server would charge, never recomputed. */
export const finePreview = async (
  loanId: string,
  signal?: AbortSignal
): Promise<{ amount: string; daysLate: number }> => {
  const response = await api.get<{ data: Wire }>(
    `${LIBRARY_PATHS.LOAN_ACTION(loanId, 'fine-preview')}`,
    quiet({ signal })
  );
  return {
    amount: str(response.data.data.amount || '0.00'),
    daysLate: Number(response.data.data.days_late ?? 0),
  };
};

export const markLost = async (
  loanId: string,
  body: { price?: string; reason?: string }
): Promise<ChargeRow[]> => {
  const response = await api.post<{ data: Wire; meta: { charges: Wire[] } }>(
    LIBRARY_PATHS.LOAN_ACTION(loanId, 'lost'),
    body,
    quiet()
  );
  return response.data.meta.charges.map(toChargeRow);
};

export const markFound = async (copyId: string): Promise<{ refunded: string | null }> => {
  const response = await api.post<{ data: Wire; meta: Wire }>(
    `${LIBRARY_PATHS.COPY(copyId)}/found`,
    {},
    quiet()
  );
  const refund = response.data.meta.refund_payment as Wire | null | undefined;
  return { refunded: refund ? str(refund.amount) : null };
};
