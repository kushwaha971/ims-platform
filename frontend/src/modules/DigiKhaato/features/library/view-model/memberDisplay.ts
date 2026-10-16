import type { UbStatusBadgeTone } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { daysBetweenIso, formatBusinessDate } from 'src/utils/dates';
import { addMoney, formatInr, moneyOrZero } from 'src/utils/money';

import { toModeBreakup } from 'modules/DigiKhaato/features/payments/view-model/modeBreakup';

import type {
  EnrolFormValues,
  EffectiveStatus,
  FeeState,
  MemberBlock,
  MemberDetail,
  MemberSummary,
  MembershipType,
} from '../types/member.types';

/**
 * F04 (LIB-04 §8) — what a member row and the member page say, decided once so
 * the list, the page and the khata panel cannot disagree.
 */
export const STATUS_TONE: Readonly<Record<EffectiveStatus, UbStatusBadgeTone>> = {
  active: 'success',
  expired: 'error',
  suspended: 'warning',
  closed: 'neutral',
};

/** W02 — the fee in one word, and its colour; never the colour alone. */
export const FEE_TONE: Readonly<Record<FeeState, UbStatusBadgeTone>> = {
  overdue: 'error',
  unpaid: 'warning',
  part_paid: 'warning',
  due_soon: 'warning',
  paid: 'success',
  no_fee: 'neutral',
  on_hold: 'neutral',
  left: 'neutral',
};

/** QA B26 — whether the badge is a fee to chase: never for a free plan or a full payment. */
export const owesFee = (state: FeeState): boolean =>
  state === 'overdue' || state === 'unpaid' || state === 'part_paid' || state === 'due_soon';

/** The badge's words: "Paid till 30/11/2026" when the plan has an end, else the state's. */
export const feeLabel = (t: TranslateFn, state: FeeState, validUntil: string | null): string =>
  state === 'paid' && validUntil
    ? t('library.fee.paidTill', { date: formatBusinessDate(validUntil) })
    : t(`library.fee.${state}`);

/** "A12 · Morning", "A12", "Morning" or '' — where and when a student sits. */
export const placeLine = (member: Pick<MemberSummary, 'seat' | 'shift'>): string =>
  [member.seat?.label, member.shift?.name].filter(Boolean).join(' · ');

/** "06:00–12:00". */
export const shiftHours = (shift: { readonly startsAt: string; readonly endsAt: string }): string =>
  `${shift.startsAt}–${shift.endsAt}`;

/** Whole days from `today` to `date` (both `YYYY-MM-DD`); negative in the past. */
export const daysBetween = (today: string, date: string): number => daysBetweenIso(today, date);

/**
 * The validity line: "Valid until 31/03/2027", "Expires in 3 days",
 * "Expired 3 days ago", or "No expiry" — as a message id and its params.
 */
export const validityLine = (
  member: Pick<MemberSummary, 'validUntil' | 'effectiveStatus'>,
  today: string
): { readonly id: string; readonly params?: Record<string, string | number> } => {
  if (!member.validUntil) return { id: 'library.member.noExpiry' };
  const days = daysBetween(today, member.validUntil);
  if (days < 0) return { id: 'library.member.expiredAgo', params: { count: -days } };
  if (days <= 7) return { id: 'library.member.expiresIn', params: { count: days } };
  return { id: 'library.member.validUntilOn', params: { date: member.validUntil } };
};

/** A block's params as words: its amounts grouped with ₹ (the `formatInr` lesson in CLAUDE.md). */
const MONEY_PARAMS = new Set(['dues', 'limit', 'expected']);
export const blockParams = (block: MemberBlock): Record<string, string> =>
  Object.fromEntries(
    Object.entries(block.params).map(([key, value]) => [
      key,
      MONEY_PARAMS.has(key) || (key === 'held' && block.code === 'deposit_not_received')
        ? formatInr(String(value))
        : String(value),
    ])
  );

export const isNonZero = (amount: string | null | undefined): boolean =>
  !!amount && Number(amount) !== 0;

/** What enrolling on `type` will ask for: fees (income) and the deposit (never income). */
export const enrolCost = (
  type: MembershipType | undefined
): { readonly fees: string; readonly deposit: string } => {
  if (!type) return { fees: '0.00', deposit: '0.00' };
  return {
    fees: addMoney(moneyOrZero(type.feeAmount), moneyOrZero(type.admissionFee)),
    deposit: moneyOrZero(type.depositAmount),
  };
};

/**
 * The resolver hands an optional field over as `null` when it is empty (the
 * central mobile and text validators do), so every string is read through
 * this — QA-F04-1, the same defect as F02's empty amounts.
 */
const clean = (value: string | null | undefined): string => (value ?? '').trim();

/** The enrol request (LIB-04 §6) from the drawer's values. */
export const toEnrolBody = (
  values: EnrolFormValues,
  type: MembershipType | undefined,
  today: string
): Record<string, unknown> => {
  const cost = enrolCost(type);
  /* QA F2 — the deposit is taken in full with the first line's mode (it is not part
     of the fee and cannot be part-paid here); the fee is whatever the lines add up to. */
  const first = values.lines[0];
  const deposit = (amount: string) => ({
    mode_breakup: toModeBreakup([
      { mode: first?.mode || 'cash', upiApp: first?.upiApp ?? '', amount, reference: '' },
    ]),
    payment_date: today,
  });
  const linesPaid = values.lines.some((line) => isNonZero(line.amount));
  const guardian = clean(values.guardianName)
    ? { name: clean(values.guardianName), mobile: clean(values.guardianMobile) || undefined }
    : undefined;
  return {
    ...(values.partyMode === 'existing'
      ? { party_id: values.partyId }
      : { party: { name: clean(values.name), mobile: clean(values.mobile) || undefined } }),
    membership_type_id: values.membershipTypeId,
    member_number: clean(values.memberNumber) || undefined,
    group_label: clean(values.groupLabel) || undefined,
    shift_id: values.shiftId || undefined,
    seat_id: values.seatId || undefined,
    locker_label: clean(values.lockerLabel) || undefined,
    guardian,
    ...(values.existingStudent
      ? {
          // QA F1 — already paid till `valid_until`: no fee today, no money today.
          existing_student: true,
          starts_on: values.startsOn || undefined,
          valid_until: values.validUntil || undefined,
          deposit_held: isNonZero(values.depositHeld) ? values.depositHeld : undefined,
          old_dues: isNonZero(values.oldDuesAmount)
            ? { amount: values.oldDuesAmount, on: values.oldDuesOn || today }
            : undefined,
        }
      : {
          collect_fees:
            values.collectNow && isNonZero(cost.fees) && linesPaid
              ? { mode_breakup: toModeBreakup(values.lines), payment_date: today }
              : undefined,
          collect_deposit:
            values.collectNow && isNonZero(cost.deposit) ? deposit(cost.deposit) : undefined,
        }),
  };
};

/** `2026-01-31` plus `months`, the day clamped to the month's end — the server's
 *  `add_months`, so the date the dialog promises is the date the renewal writes. */
const addMonthsIso = (iso: string, months: number): Date => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const index = m - 1 + months;
  const year = y + Math.floor(index / 12);
  const month = index % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d, last)));
};

const shiftDays = (iso: string, days: number): string => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/**
 * QA B5 — what Renew will do, said before it is pressed: the new end date (from the
 * old end when renewed on or before it, else from today — LIB-04 BR-3) and the fee.
 * A student with no end date on a plan that has one (moved from a free plan) starts
 * their first term today. `null` for a plan with no end: nothing to renew, and the page offers
 * Change plan instead of a Renew that can only be refused.
 */
export const renewalPreview = (
  member: Pick<MemberDetail, 'validUntil' | 'validityMonths' | 'planFee'>,
  today: string
): { readonly until: string; readonly fee: string } | null => {
  if (!member.validityMonths) return null;
  // Moved here from a plan with no end date: the first term starts today.
  const start =
    member.validUntil && today <= member.validUntil ? shiftDays(member.validUntil, 1) : today;
  const end = addMonthsIso(start, member.validityMonths);
  end.setUTCDate(end.getUTCDate() - 1);
  return { until: end.toISOString().slice(0, 10), fee: member.planFee };
};
