import type { UbAmountTone } from 'src/design-system';
import { compareMoney, isZeroAmount } from 'src/utils/money';

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

/** Up to two initials for the avatar, script-agnostic (works for Devanagari). */
export const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => [...word][0] ?? '')
    .join('');

/** The second line of a row: the code, the mobile, or nothing. */
export const secondaryLine = (party: Party): string | null =>
  party.displayCode ?? party.mobile ?? null;
