import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import { toMemberSummary } from './libraryMemberService';
import { LIBRARY_PATHS } from './libraryPaths';

import type { CounterMember, LoanRow } from '../types/counter.types';
import type { MemberSummary } from '../types/member.types';

/**
 * F05 (LIB-06 §6) — circulation: the counter's lookup, the member panel, and
 * issue, return, renew and undo. One async function each and the mapping.
 */
type Wire = Readonly<Record<string, unknown>>;

const str = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value);

export const toLoanRow = (row: Wire): LoanRow => {
  const copy = (row.copy ?? {}) as Wire;
  const membership = (row.membership ?? {}) as Wire;
  return {
    id: str(row.id),
    copy: {
      id: str(copy.id),
      accessionNumber: str(copy.accession_number),
      title: str(copy.title),
      authors: str(copy.authors),
    },
    membership: {
      id: str(membership.id),
      memberNumber: str(membership.member_number),
      name: str(membership.name),
      groupLabel: str(membership.group_label),
    },
    issuedOn: str(row.issued_on),
    dueOn: str(row.due_on),
    returnedOn: row.returned_on ? str(row.returned_on) : null,
    status: str(row.status),
    renewCount: Number(row.renew_count ?? 0),
    maxRenewals: Number(row.max_renewals ?? 0),
    daysOverdue: Number(row.days_overdue ?? 0),
    fineSoFar: str(row.fine_so_far || '0.00'),
    overrideReason: str(row.override_reason),
  };
};

/**
 * The counter says every outcome in its own session list — a refusal as a red
 * row, a network failure as "Not sent · Retry" — so its requests do not also
 * raise the global error snackbar (the AxiosInstances `suppressErrorSnackbar`
 * contract: a caller that shows the error in its own UI).
 */
const quiet = (extra: Parameters<typeof ubConfig>[0] = {}) =>
  ubConfig({ ...extra, suppressErrorSnackbar: true });
const withKey = (key: string) => quiet({ headers: { 'Idempotency-Key': key } });

export type Lookup =
  | { readonly kind: 'copy'; readonly copyId: string; readonly title: string }
  | { readonly kind: 'member'; readonly member: MemberSummary }
  | { readonly kind: 'isbn'; readonly titles: readonly { id: string; title: string }[] }
  | { readonly kind: 'none' };

export const lookup = async (code: string, signal?: AbortSignal): Promise<Lookup> => {
  const response = await api.get<{ data: Wire }>(
    `${LIBRARY_PATHS.LOOKUP}${toQueryString({ code })}`,
    quiet({ signal })
  );
  const body = response.data.data;
  if (body.kind === 'copy') {
    const copy = body.copy as Wire;
    const title = (copy.title ?? {}) as Wire;
    return { kind: 'copy', copyId: str(copy.id), title: str(title.title) };
  }
  if (body.kind === 'member')
    return { kind: 'member', member: toMemberSummary(body.member as Wire) };
  if (body.kind === 'isbn') {
    return {
      kind: 'isbn',
      titles: ((body.titles as Wire[]) ?? []).map((t) => ({ id: str(t.id), title: str(t.title) })),
    };
  }
  return { kind: 'none' };
};

export const getCounterMember = async (
  membershipId: string,
  signal?: AbortSignal
): Promise<CounterMember> => {
  const response = await api.get<{ data: Wire }>(
    `${LIBRARY_PATHS.MEMBER(membershipId)}/summary`,
    quiet({ signal })
  );
  const body = response.data.data;
  return {
    ...toMemberSummary(body),
    loans: ((body.loans as Wire[]) ?? []).map(toLoanRow),
  };
};

export const searchMembers = async (q: string, signal?: AbortSignal): Promise<MemberSummary[]> => {
  const response = await api.get<{ data: Wire[] }>(
    `${LIBRARY_PATHS.MEMBERS}${toQueryString({ q, page_size: 8 })}`,
    quiet({ signal })
  );
  return response.data.data.map(toMemberSummary);
};

export interface IssueResult {
  readonly loan: LoanRow;
}

export const issueCopy = async (
  body: { membership_id: string; copy_id: string; override_reason?: string },
  key: string
): Promise<IssueResult> => {
  const response = await api.post<{ data: Wire }>(LIBRARY_PATHS.LOANS, body, withKey(key));
  return { loan: toLoanRow(response.data.data) };
};

export interface ReturnResult {
  readonly loan: LoanRow;
  readonly fine: string | null;
  readonly daysLate: number;
  readonly holdReady: { memberName: string; memberNumber: string; collectBy: string | null } | null;
  readonly fineCharge: { id: string; number: string; partyId: string; amountDue: string } | null;
}

export const returnCopy = async (copyId: string, key: string): Promise<ReturnResult> => {
  const response = await api.post<{ data: Wire; meta: Wire }>(
    LIBRARY_PATHS.RETURNS,
    { copy_id: copyId },
    withKey(key)
  );
  const { data, meta } = response.data;
  const fine = meta.fine as Wire | null;
  const hold = meta.hold_ready as Wire | null;
  const holdMember = (hold?.membership ?? {}) as Wire;
  const fineCharge = ((meta.charges as Wire[] | undefined) ?? []).find(
    (charge) => charge.kind === 'overdue_fine'
  );
  return {
    loan: toLoanRow(data),
    fineCharge: fineCharge
      ? {
          id: str(fineCharge.id),
          number: str(fineCharge.number),
          partyId: str(fineCharge.party_id),
          amountDue: str(fineCharge.amount_due),
        }
      : null,
    fine: fine && Number(fine.amount) > 0 ? str(fine.amount) : null,
    daysLate: Number(fine?.days_late ?? 0),
    holdReady: hold
      ? {
          memberName: str(holdMember.name),
          memberNumber: str(holdMember.member_number),
          collectBy: hold.collect_by ? str(hold.collect_by) : null,
        }
      : null,
  };
};

export const openLoanOfCopy = async (
  copyId: string,
  signal?: AbortSignal
): Promise<LoanRow | null> => {
  const response = await api.get<{ data: Wire[] }>(
    `${LIBRARY_PATHS.LOANS}${toQueryString({ copy: copyId, status: 'open' })}`,
    quiet({ signal })
  );
  const row = response.data.data[0];
  return row ? toLoanRow(row) : null;
};

export const renewLoan = async (
  loanId: string,
  key: string,
  overrideReason?: string
): Promise<LoanRow> => {
  const response = await api.post<{ data: Wire }>(
    LIBRARY_PATHS.LOAN_ACTION(loanId, 'renew'),
    overrideReason ? { override_reason: overrideReason } : {},
    withKey(key)
  );
  return toLoanRow(response.data.data);
};

export const renewAll = async (
  membershipId: string
): Promise<{ renewed: LoanRow[]; refused: { loanId: string; reason: string }[] }> => {
  const response = await api.post<{ data: { renewed: Wire[]; refused: Wire[] } }>(
    `${LIBRARY_PATHS.MEMBER(membershipId)}/renew-all`,
    {},
    quiet()
  );
  return {
    renewed: response.data.data.renewed.map(toLoanRow),
    refused: response.data.data.refused.map((r) => ({
      loanId: str(r.loan_id),
      reason: str(r.reason),
    })),
  };
};

export const cancelLoan = async (loanId: string, reason: string): Promise<LoanRow> => {
  const response = await api.post<{ data: Wire }>(
    LIBRARY_PATHS.LOAN_ACTION(loanId, 'cancel'),
    { reason },
    quiet()
  );
  return toLoanRow(response.data.data);
};

export const issueSlip = async (
  membershipId: string
): Promise<{ text: string; waUrl: string; hasMobile: boolean }> => {
  const response = await api.post<{ data: Wire }>(`${LIBRARY_PATHS.MEMBER(membershipId)}/slip`, {});
  const body = response.data.data;
  const recipient = (body.recipient ?? {}) as Wire;
  return {
    text: str(body.text),
    waUrl: str(body.wa_url),
    hasMobile: Boolean(recipient.has_mobile),
  };
};
