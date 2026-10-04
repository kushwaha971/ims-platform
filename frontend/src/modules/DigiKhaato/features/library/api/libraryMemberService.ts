import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import { LIBRARY_PATHS } from './libraryPaths';

import type { CataloguePage } from '../types/catalogue.types';
import type {
  MemberCharge,
  MemberDetail,
  MemberFilters,
  MemberSummary,
  MemberTotals,
  MembershipType,
} from '../types/member.types';

/**
 * F04 (LIB-04 §6) — the members' endpoints: one async function each and the
 * mapping, nothing else (Part 19 §19.3.4).
 */
type Wire = Readonly<Record<string, unknown>>;

const str = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value);
const strOrNull = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

export const toMemberSummary = (row: Wire): MemberSummary => {
  const type = (row.type ?? {}) as Wire;
  const deposit = row.deposit as Wire | null;
  return {
    membershipId: str(row.membership_id),
    partyId: str(row.party_id),
    name: str(row.name),
    memberNumber: str(row.member_number),
    type: { id: str(type.id), name: str(type.name), maxCopies: Number(type.max_copies ?? 0) },
    status: str(row.status),
    effectiveStatus: str(row.effective_status) as MemberSummary['effectiveStatus'],
    startsOn: str(row.starts_on),
    validUntil: strOrNull(row.valid_until),
    groupLabel: str(row.group_label),
    loansOpen: Number(row.loans_open ?? 0),
    loansOverdue: Number(row.loans_overdue ?? 0),
    holdsReady: Number(row.holds_ready ?? 0),
    duesAmount: str(row.dues_amount || '0.00'),
    deposit: deposit
      ? { id: str(deposit.id), expected: str(deposit.expected), held: str(deposit.held) }
      : null,
    blocks: ((row.blocks as Wire[] | undefined) ?? []).map((block) => ({
      code: str(block.code),
      overridable: Boolean(block.overridable),
      params: (block.params ?? {}) as Readonly<Record<string, string>>,
    })),
  };
};

const toCharge = (row: Wire): MemberCharge => ({
  id: str(row.id),
  number: str(row.number),
  kind: str(row.kind),
  amount: str(row.amount),
  amountDue: str(row.amount_due),
  chargeDate: str(row.charge_date),
  description: str(row.description),
});

export const toMemberDetail = (row: Wire): MemberDetail => {
  const party = (row.party ?? {}) as Wire;
  const guardian = row.guardian as Wire | null;
  return {
    ...toMemberSummary(row),
    party: { id: str(party.id), name: str(party.name), mobile: strOrNull(party.mobile) },
    guardian: guardian ? { partyId: str(guardian.party_id), name: str(guardian.name) } : null,
    suspendedUntil: strOrNull(row.suspended_until),
    suspensionReason: str(row.suspension_reason),
    closedOn: strOrNull(row.closed_on),
    closedReason: str(row.closed_reason),
    notes: str(row.notes),
    periods: ((row.periods as Wire[] | undefined) ?? []).map((p) => ({
      kind: str(p.kind),
      startsOn: str(p.starts_on),
      validUntil: strOrNull(p.valid_until),
      reason: str(p.reason),
      onDate: str(p.on_date),
    })),
    chargesOpen: ((row.charges_open as Wire[] | undefined) ?? []).map(toCharge),
    version: Number(row.version ?? 1),
  };
};

export const toMembershipType = (row: Wire): MembershipType => ({
  id: str(row.id),
  name: str(row.name),
  maxCopies: Number(row.max_copies ?? 0),
  loanDays: Number(row.loan_days ?? 0),
  feeAmount: str(row.fee_amount || '0.00'),
  admissionFee: str(row.admission_fee || '0.00'),
  depositAmount: str(row.deposit_amount || '0.00'),
  validityMonths: row.validity_months === null ? null : Number(row.validity_months),
  isActive: Boolean(row.is_active),
});

export const memberListQuery = (filters: MemberFilters): string =>
  toQueryString({
    q: filters.q || undefined,
    status: filters.status || undefined,
    type: filters.type || undefined,
    group: filters.group || undefined,
    has_dues: filters.hasDues || undefined,
    ordering: filters.ordering || undefined,
    page: filters.page,
  });

interface PageApi {
  readonly data: readonly Wire[];
  readonly meta: {
    readonly page: number;
    readonly page_size: number;
    readonly total: number;
    readonly total_pages: number;
    readonly totals?: { members: number; dues: string; deposits_held: string };
  };
}

export type MemberPage = CataloguePage<MemberSummary> & { readonly totals: MemberTotals };

export const listMembers = async (
  filters: MemberFilters,
  signal?: AbortSignal
): Promise<MemberPage> => {
  const response = await api.get<PageApi>(`${LIBRARY_PATHS.MEMBERS}${memberListQuery(filters)}`, {
    signal,
  });
  const { data, meta } = response.data;
  return {
    rows: data.map(toMemberSummary),
    page: meta.page,
    pageSize: meta.page_size,
    total: meta.total,
    totalPages: meta.total_pages,
    totals: {
      members: meta.totals?.members ?? meta.total,
      dues: meta.totals?.dues ?? '0.00',
      depositsHeld: meta.totals?.deposits_held ?? '0.00',
    },
  };
};

/** F04 — the member a party is, for the khata's library panel; null when none. */
export const findMemberByParty = async (
  partyId: string,
  signal?: AbortSignal
): Promise<MemberSummary | null> => {
  const response = await api.get<PageApi>(
    `${LIBRARY_PATHS.MEMBERS}${toQueryString({ party: partyId })}`,
    { signal }
  );
  const row = response.data.data[0];
  return row ? toMemberSummary(row) : null;
};

export const getMember = async (id: string, signal?: AbortSignal): Promise<MemberDetail> => {
  const response = await api.get<{ data: Wire }>(LIBRARY_PATHS.MEMBER(id), { signal });
  return toMemberDetail(response.data.data);
};

export const listMembershipTypes = async (signal?: AbortSignal): Promise<MembershipType[]> => {
  const response = await api.get<{ data: readonly Wire[] }>(LIBRARY_PATHS.MEMBERSHIP_TYPES, {
    signal,
  });
  return response.data.data.map(toMembershipType);
};

export const enrolMember = async (body: Wire, key: string): Promise<MemberDetail> => {
  const response = await api.post<{ data: Wire }>(
    LIBRARY_PATHS.MEMBERS,
    body,
    ubConfig({ headers: { 'Idempotency-Key': key } })
  );
  return toMemberDetail(response.data.data);
};

export type MemberAction = 'renew' | 'suspend' | 'reactivate' | 'close' | 'rejoin';

export const actOnMember = async (
  id: string,
  action: MemberAction,
  body: Wire,
  key?: string
): Promise<MemberDetail> => {
  const response = await api.post<{ data: Wire }>(
    LIBRARY_PATHS.MEMBER_ACTION(id, action),
    body,
    key ? ubConfig({ headers: { 'Idempotency-Key': key } }) : undefined
  );
  return toMemberDetail(response.data.data);
};
