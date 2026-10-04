import type { UbStatusBadgeTone } from 'src/design-system';
import { formatInr } from 'src/utils/money';

import type {
  EnrolFormValues,
  EffectiveStatus,
  MemberBlock,
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

const DAY_MS = 86_400_000;

/** Whole days from `today` to `date` (both `YYYY-MM-DD`); negative in the past. */
export const daysBetween = (today: string, date: string): number =>
  Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);

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
  const fees = Number(type.feeAmount) + Number(type.admissionFee);
  return { fees: fees.toFixed(2), deposit: Number(type.depositAmount).toFixed(2) };
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
  const cash = (amount: string) => ({
    mode_breakup: [{ mode: 'cash', amount }],
    payment_date: today,
  });
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
    guardian,
    collect_fees: values.collectNow && isNonZero(cost.fees) ? cash(cost.fees) : undefined,
    collect_deposit: values.collectNow && isNonZero(cost.deposit) ? cash(cost.deposit) : undefined,
  };
};
