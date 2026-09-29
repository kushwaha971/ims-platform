import type { UbAmountTone } from 'src/design-system';
import { absMoney, compareMoney, isZeroAmount } from 'src/utils/money';

import type { PartyDetail } from '../types/party.types';

/*
 * A module of its own rather than more of `partyDisplay.ts`, which the app shell
 * imports: every message id a shell-imported module names is pinned to the shell's
 * catalogue and downloaded on every route (`scripts/split-locales.mjs`). These lines
 * are only ever drawn by the khata page's info panel.
 */
/**
 * A2 (FRD 00 PLT-X01 §2, §8) — the info panel's loan and deposit lines.
 *
 * One row per figure the server SENT, and none for a party without them, so a
 * shop's khata page is unchanged (the component does not branch on a module; this
 * decides). The amount is the magnitude and the words carry the direction
 * (§23.2.6 rule 3):
 *
 * · "Loan outstanding" in the receivable tone — or "Loan in advance" when more was
 *   collected than lent (EC-2), in the payable tone;
 * · "Shop balance" beside it, the trade figure, toned by its own sign;
 * · "Deposit held", neutral: it is neither owed nor paid, it is held.
 */
export interface PartyBucketRow {
  readonly key: 'loan' | 'trade' | 'deposit';
  /** i18n key, resolved by the component. */
  readonly labelId: string;
  /** Decimal string, unsigned. */
  readonly amount: string;
  readonly tone: UbAmountTone;
}

const sideTone = (amount: string): UbAmountTone => {
  if (isZeroAmount(amount)) return 'neutral';
  return compareMoney(amount, '0.00') > 0 ? 'receivable' : 'payable';
};

export const partyBucketRows = (party: PartyDetail): readonly PartyBucketRow[] => {
  const rows: PartyBucketRow[] = [];
  if (party.loanBalance != null) {
    const inAdvance = compareMoney(party.loanBalance, '0.00') < 0;
    rows.push({
      key: 'loan',
      labelId: inAdvance ? 'parties.detail.loanInAdvance' : 'parties.detail.loanOutstanding',
      amount: absMoney(party.loanBalance),
      tone: sideTone(party.loanBalance),
    });
  }
  if (party.tradeBalance != null) {
    rows.push({
      key: 'trade',
      labelId: 'parties.detail.tradeBalance',
      amount: absMoney(party.tradeBalance),
      tone: sideTone(party.tradeBalance),
    });
  }
  if (party.depositHeld != null) {
    rows.push({
      key: 'deposit',
      labelId: 'parties.detail.depositHeld',
      amount: absMoney(party.depositHeld),
      tone: 'neutral',
    });
  }
  return rows;
};
