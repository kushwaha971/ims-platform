import { partyBucketRows } from './partyBuckets';

import type { PartyDetail } from '../types/party.types';

/**
 * A2 (FRD 00 PLT-X01 §2, §8) — which loan and deposit lines the khata's info panel draws.
 *
 * The rule that matters most is the first: a party without the figures gets NO rows,
 * so a shop's khata page is exactly what it was. The server omits the keys unless they
 * mean something; this layer must not turn an absent figure into a "₹0.00" line.
 */
const party = (over: Partial<PartyDetail> = {}): PartyDetail =>
  ({ id: 'p1', name: 'Ramesh', balance: '2300.00', ...over }) as PartyDetail;

describe('partyBucketRows', () => {
  it('draws nothing for a party the server sent no figures for', () => {
    expect(partyBucketRows(party())).toEqual([]);
  });

  it('shows the loan outstanding in the receivable tone and the shop balance beside it', () => {
    const rows = partyBucketRows(party({ loanBalance: '46625.00', tradeBalance: '2300.00' }));

    expect(rows).toEqual([
      {
        key: 'loan',
        labelId: 'parties.detail.loanOutstanding',
        amount: '46625.00',
        tone: 'receivable',
      },
      {
        key: 'trade',
        labelId: 'parties.detail.tradeBalance',
        amount: '2300.00',
        tone: 'receivable',
      },
    ]);
  });

  it('says "Loan in advance", unsigned, when more was collected than lent (EC-2)', () => {
    const [loan] = partyBucketRows(party({ loanBalance: '-500.00', tradeBalance: '800.00' }));

    expect(loan).toEqual({
      key: 'loan',
      labelId: 'parties.detail.loanInAdvance',
      amount: '500.00',
      tone: 'payable',
    });
  });

  it('keeps a deposit neutral — it is neither owed nor paid', () => {
    expect(partyBucketRows(party({ depositHeld: '1000.00' }))).toEqual([
      { key: 'deposit', labelId: 'parties.detail.depositHeld', amount: '1000.00', tone: 'neutral' },
    ]);
  });

  it('paints a zero figure neutral (§23.2.6 rule 4)', () => {
    const rows = partyBucketRows(party({ loanBalance: '0.00', tradeBalance: '0.00' }));

    expect(rows.map((row) => row.tone)).toEqual(['neutral', 'neutral']);
  });
});
