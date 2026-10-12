import { api } from 'src/api/AxiosInstances';

import { LIBRARY_PATHS } from './libraryPaths';

import type { FeesBoard, LibraryHome } from '../types/home.types';
import type { FeeState } from '../types/member.types';

/** W04 — the library's home: one call and its mapping. */
type Wire = Readonly<Record<string, unknown>>;

const str = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value);
const strOrNull = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

export const toLibraryHome = (row: Wire): LibraryHome => {
  const study = row.study as Wire | undefined;
  const fees = (study?.fees ?? {}) as Wire;
  return {
    quickActions: ((row.quick_actions as Wire[] | undefined) ?? []).map((a) => str(a.key)),
    study: study
      ? {
          seats: Number(study.seats ?? 0),
          students: Number(study.students ?? 0),
          shifts: ((study.shifts as Wire[] | undefined) ?? []).map((s) => ({
            id: str(s.id),
            name: str(s.name),
            startsAt: str(s.starts_at),
            endsAt: str(s.ends_at),
            filled: Number(s.filled ?? 0),
          })),
          fees: {
            dueThisWeek: Number(fees.due_this_week ?? 0),
            overdue: Number(fees.overdue ?? 0),
            unpaid: Number(fees.unpaid ?? 0),
            collectedThisMonth: str(fees.collected_this_month || '0.00'),
          },
          toPay: ((study.to_pay as Wire[] | undefined) ?? []).map((p) => ({
            membershipId: str(p.membership_id),
            name: str(p.name),
            memberNumber: str(p.member_number),
            seat: strOrNull(p.seat),
            shift: strOrNull(p.shift),
            plan: str(p.plan),
            planFee: str(p.plan_fee || '0.00'),
            validUntil: strOrNull(p.valid_until),
            duesAmount: str(p.dues_amount || '0.00'),
            feeState: str(p.fee_state) as FeeState,
          })),
        }
      : null,
  };
};

export const getLibraryHome = async (signal?: AbortSignal): Promise<LibraryHome> => {
  const response = await api.get<{ data: Wire }>(LIBRARY_PATHS.HOME, { signal });
  return toLibraryHome(response.data.data);
};

/** The Fees board: Not paid, then Paid this month (approved designs, 12 Oct 2026). */
export const getFeesBoard = async (signal?: AbortSignal): Promise<FeesBoard> => {
  const response = await api.get<{ data: Wire }>(LIBRARY_PATHS.FEES_BOARD, { signal });
  const d = response.data.data;
  return {
    students: Number(d.students ?? 0),
    toCollect: str(d.to_collect),
    collectedThisMonth: str(d.collected_this_month),
    notPaid: ((d.not_paid as Wire[] | undefined) ?? []).map((r) => {
      const charge = (r.charge ?? {}) as Wire;
      return {
        membershipId: str(r.membership_id),
        partyId: str(r.party_id),
        name: str(r.name),
        plan: str(r.plan),
        since: str(r.since),
        owes: str(r.owes),
        charge: {
          id: str(charge.id),
          number: str(charge.number),
          amountDue: str(charge.amount_due),
        },
      };
    }),
    paid: ((d.paid as Wire[] | undefined) ?? []).map((r) => ({
      paymentId: str(r.payment_id),
      on: str(r.on),
      mode: str(r.mode),
      amount: str(r.amount),
      name: str(r.name),
      membershipId: str(r.membership_id),
    })),
  };
};
