import type { UbAmountTone } from 'src/design-system';
import { absMoney, compareMoney, isZeroAmount, sumMoney } from 'src/utils/money';
import { formatPhoneForDisplay } from 'src/utils/share';

import type { PartyListTotals } from '../constants/partyListDefaults';
import type { Party } from '../types/party.types';

/**
 * Part 19 §19.1.1 layer 3 — pure functions. Row → display strings, tone
 * classes, derived flags. No React, no Redux, no I/O, no `react-intl`: the
 * caller passes translated copy in and gets a decision out, which is what makes
 * this layer unit-testable and locale-independent.
 *
 * Part 23 §23.2.6: a BALANCE is never signed. Its direction is the label's job,
 * because a negative balance is a concept the merchant does not have — they
 * have "you will get" and "you will give".
 */
export interface PartyBalanceView {
  readonly tone: UbAmountTone;
  /** i18n key, resolved by the component. */
  readonly labelId: string;
  /** A balance carries no sign (§23.2.6 rule 3). */
  readonly sign: 'none';
}

export const balanceView = (balance: string): PartyBalanceView => {
  // Zero is neutral, forced: a settled party is not a red party (rule 4).
  if (isZeroAmount(balance)) {
    return { tone: 'neutral', labelId: 'parties.list.balance.settled', sign: 'none' };
  }
  // Positive: they owe the merchant — the receivable red family.
  return compareMoney(balance, '0.00') > 0
    ? { tone: 'receivable', labelId: 'parties.list.balance.receivable', sign: 'none' }
    : { tone: 'payable', labelId: 'parties.list.balance.payable', sign: 'none' };
};

/**
 * The avatar's initials used to be computed here AND, byte for byte, in
 * `tenant-switcher/view-model/tenantDisplay.ts`. Both are gone: `UbAvatar`
 * derives them from `src/utils/text.ts`, which is the one copy.
 */

/** The second line of a row: the code, the mobile, or nothing. */
export const secondaryLine = (party: Party): string | null =>
  party.displayCode ?? party.mobile ?? null;

/**
 * ── The responsive-list wave ────────────────────────────────────────────────
 *
 * The parties list answers one question: **who do I chase today?** Everything
 * below exists to serve that question and nothing else. A field that does not
 * move the merchant towards an answer — GSTIN, address, tags — is not a weak
 * column here; it is a detail-page field that would cost a strong one its room.
 */

/**
 * How stale a party is, as a bucket rather than a timestamp.
 *
 * "18/09/2026" makes the reader do subtraction. "12 days ago" is the fact they
 * were after. The bucket is an i18n key plus its values; the component
 * resolves both, because this layer is locale-independent by contract.
 */
export interface PartyActivityView {
  readonly labelId: string;
  readonly values?: Readonly<Record<string, number>>;
}

const DAY_MS = 86_400_000;

/** Whole calendar days between two instants, floored to the day boundary. */
const daysBetween = (fromIso: string, nowMs: number): number => {
  const then = new Date(fromIso).getTime();
  if (Number.isNaN(then)) return Number.NaN;
  const startOfDay = (ms: number): number => Math.floor(ms / DAY_MS);
  return startOfDay(nowMs) - startOfDay(then);
};

export const activityView = (lastActivityAt: string | null, nowMs: number): PartyActivityView => {
  if (!lastActivityAt) return { labelId: 'parties.list.activity.never' };

  const days = daysBetween(lastActivityAt, nowMs);
  if (Number.isNaN(days)) return { labelId: 'parties.list.activity.never' };
  if (days <= 0) return { labelId: 'parties.list.activity.today' };
  if (days === 1) return { labelId: 'parties.list.activity.yesterday' };
  if (days < 31) return { labelId: 'parties.list.activity.days', values: { count: days } };

  return {
    labelId: 'parties.list.activity.months',
    values: { count: Math.max(1, Math.round(days / 30)) },
  };
};

/**
 * The two figures the header exists to show.
 *
 * They are two SUMS and never one net figure: "₹85,400 net" is a number the
 * merchant has no use for, because the money they will collect and the money
 * they owe are two different jobs on two different days.
 */
/* Defined in `constants/partyListDefaults` and re-exported here so the existing
 * call sites are unchanged. The slice must import them from THERE, not from
 * this module, or it drags `decimal.js-light` into the app shell — see that
 * file for the measurement. */
export { ZERO_TOTALS, type PartyListTotals } from '../constants/partyListDefaults';

export const partyTotals = (rows: readonly Party[]): PartyListTotals => {
  const receivable = rows.filter((row) => compareMoney(row.balance, '0.00') > 0);
  const payable = rows.filter((row) => compareMoney(row.balance, '0.00') < 0);
  return {
    receivable: sumMoney(receivable.map((row) => row.balance)),
    // A balance carries no sign on screen (§23.2.6 rule 3): the label is the
    // direction, so the payable total is a magnitude.
    payable: absMoney(sumMoney(payable.map((row) => row.balance))),
  };
};

/**
 * `C-001 · +91 98765 43210`, or whichever of the two the party has. The mobile
 * is shown as the khata header and the reminder sheet show it — not as stored
 * ("+919876543210", "09812345678"), which is three spellings for one number.
 */
export const contactLine = (party: Party): string =>
  [party.displayCode, formatPhoneForDisplay(party.mobile)].filter(Boolean).join(' · ');
