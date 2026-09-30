import {
  amountLabelRepeatsTitle,
  bucketBadgeId,
  entryAmountView,
  entryBalanceCaption,
  entryCaption,
  entryReason,
  entryTitle,
  groupByDay,
  isBackdated,
  isCorrectable,
  isOpeningEntry,
  isReversalRow,
  supersededIds,
  writtenOffLines,
} from './entryDisplay';

import type { LedgerEntry } from '../types/ledger.types';

/**
 * The presentation rules, tested where they live.
 *
 * Every one of these is shared by the timeline and — when LED-04 arrives — by
 * the statement, which is the whole reason they are pure functions in a
 * view-model rather than branches inside a component: two screens that made the
 * same decision twice would eventually disagree about which way round a debit
 * reads.
 */

const t = ((id: string, values?: Record<string, string>) =>
  values ? `${id}:${Object.values(values).join(',')}` : id) as never;

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: 'e1',
  partyId: 'p1',
  direction: 'debit',
  amount: '500.00',
  entryDate: '2026-09-17',
  entryType: 'manual_gave',
  sourceType: 'manual',
  sourceId: null,
  note: '',
  paymentMode: null,
  upiApp: null,
  reference: '',
  status: 'posted',
  reversedById: null,
  reversesId: null,
  supersedesId: null,
  reason: null,
  createdBy: null,
  createdAt: '2026-09-17T10:00:00Z',
  ...over,
});

describe('which way an entry reads', () => {
  it('paints a debit as money owed and a credit as money returned', () => {
    expect(entryAmountView('debit')).toEqual({
      tone: 'receivable',
      sign: 'none',
      labelId: 'ledger.entry.gave',
    });
    expect(entryAmountView('credit')).toEqual({
      tone: 'payable',
      sign: 'none',
      labelId: 'ledger.entry.got',
    });
  });

  it('never asks for a sign', () => {
    /**
     * §23.2.6 rule 3, one row down from the balance it was written for. The
     * amount column carries no sign because direction is a column, and a
     * negative amount is not a concept a shopkeeper has.
     */
    expect(entryAmountView('debit').sign).toBe('none');
    expect(entryAmountView('credit').sign).toBe('none');
  });
});

describe('what the row says', () => {
  it('prefers the merchant’s own words', () => {
    expect(entryTitle(entry({ note: '  Sugar 10 kg  ' }), t)).toBe('Sugar 10 kg');
  });

  it('falls back to the direction rather than leaving the row blank', () => {
    expect(entryTitle(entry(), t)).toBe('ledger.entry.gave');
  });

  it('names an opening balance as what it is', () => {
    expect(entryTitle(entry({ entryType: 'opening' }), t)).toBe('ledger.entry.type.opening');
  });

  it('knows when the amount’s label would be the same two words', () => {
    /**
     * Prevents: the row reading "You gave" on the left and "You gave ₹500.00"
     * on the right, on every entry without a note — which is most of them.
     *
     * Both strings are correct in isolation, which is why every assertion on an
     * accessible name passed through it and a screenshot is what found it.
     */
    expect(amountLabelRepeatsTitle(entry())).toBe(true);
    expect(amountLabelRepeatsTitle(entry({ note: 'Sugar' }))).toBe(false);
    expect(amountLabelRepeatsTitle(entry({ entryType: 'opening' }))).toBe(false);
  });
});

describe('the caption', () => {
  it('reads mode, then reference, then who wrote it', () => {
    expect(
      entryCaption(
        entry({ paymentMode: 'upi', reference: 'UTR1', createdBy: { id: 'u2', name: 'Sunita' } }),
        t,
        'u1'
      )
    ).toBe('ledger.mode.upi · UTR1 · ledger.entry.by:Sunita');
  });

  it('leaves no stray separator when a piece is missing', () => {
    /**
     * Three optional fragments in a template literal is how a row ends up
     * reading "· · by Sunita". The list is assembled first and what is left is
     * joined.
     */
    expect(entryCaption(entry({ paymentMode: 'cash' }), t, 'u1')).toBe('ledger.mode.cash');
    // The app, when known, is the word the merchant heard: "PhonePe", not "UPI".
    expect(entryCaption(entry({ paymentMode: 'upi', upiApp: 'phonepe' }), t, 'u1')).toBe(
      'ledger.upiApp.phonepe'
    );
    expect(entryCaption(entry({ paymentMode: 'upi', upiApp: null }), t, 'u1')).toBe(
      'ledger.mode.upi'
    );
    expect(entryCaption(entry(), t, 'u1')).toBe('');
  });

  it('does not tell a merchant they wrote their own entry', () => {
    /**
     * FR-8. A khata where every line says "by Sunita" is a khata where the one
     * line somebody else wrote does not stand out, which is the only reason to
     * print an author at all.
     */
    expect(entryCaption(entry({ createdBy: { id: 'u1', name: 'Owner' } }), t, 'u1')).toBe('');
    expect(entryCaption(entry({ createdBy: { id: 'u2', name: 'Sunita' } }), t, 'u1')).toBe(
      'ledger.entry.by:Sunita'
    );
  });

  it('says nothing about an author the entry does not have', () => {
    /** A job posted it. "by " with nothing after it is worse than silence. */
    expect(entryCaption(entry({ createdBy: { id: 'u2', name: '' } }), t, 'u1')).toBe('');
  });
});

describe('backdating', () => {
  it('tags an entry written well after it happened', () => {
    expect(isBackdated(entry({ entryDate: '2026-09-10', createdAt: '2026-09-17T09:00:00Z' }))).toBe(
      true
    );
  });

  it('does not tag one written the next morning', () => {
    /**
     * One day of slack. An entry made just after midnight for the evening that
     * has only formally ended is not backdated in any sense a merchant would
     * recognise, and a tag on all of those is a tag that means nothing.
     */
    expect(isBackdated(entry({ entryDate: '2026-09-17', createdAt: '2026-09-18T06:00:00Z' }))).toBe(
      false
    );
  });

  it('does not tag one written the same day', () => {
    expect(isBackdated(entry())).toBe(false);
  });
});

describe('grouping by day', () => {
  it('makes one group per date, in the order the rows arrived', () => {
    const rows = [
      entry({ id: 'a', entryDate: '2026-09-17' }),
      entry({ id: 'b', entryDate: '2026-09-17' }),
      entry({ id: 'c', entryDate: '2026-09-16' }),
    ];

    expect(groupByDay(rows).map((group) => [group.date, group.entries.length])).toEqual([
      ['2026-09-17', 2],
      ['2026-09-16', 1],
    ]);
  });

  it('does not re-sort what the server already ordered', () => {
    /**
     * The server orders by `-entry_date` and then by `-created_at`, and the
     * cursor pages by exactly that tuple. A client-side sort on the date alone
     * would scramble the tie-break and the next page would skip or repeat rows.
     *
     * So a list that arrives out of order comes out in the same wrong order —
     * which is the honest behaviour: the bug would be in the request, and
     * hiding it here would make it invisible.
     */
    const rows = [
      entry({ id: 'a', entryDate: '2026-09-16' }),
      entry({ id: 'b', entryDate: '2026-09-17' }),
      entry({ id: 'c', entryDate: '2026-09-16' }),
    ];

    expect(groupByDay(rows).map((group) => group.date)).toEqual([
      '2026-09-16',
      '2026-09-17',
      '2026-09-16',
    ]);
  });

  it('handles an empty khata without inventing a group', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('the opening balance', () => {
  it('shows the translated label, never the English note the server stored', () => {
    /**
     * Prevents: a hard-coded "Opening balance" in English on a Hindi khata —
     * on the FIRST row of every book migrated from paper, which is the row the
     * merchant looks at to check the migration worked.
     *
     * LED-02 BR-1 stores that note in English deliberately, so that a report,
     * an export or a support query can find the row. The client knows an
     * opening by its `entry_type` and prints its own label; checking the note
     * first was checking the one field that is guaranteed not to be the
     * merchant's language.
     */
    const opening = entry({ entryType: 'opening', note: 'Opening balance' });

    expect(entryTitle(opening, t)).toBe('ledger.entry.type.opening');
    expect(isOpeningEntry(opening)).toBe(true);
    expect(isOpeningEntry(entry())).toBe(false);
  });

  it('still shows its own words on an ordinary entry that happens to say the same thing', () => {
    /** A merchant may legitimately type "Opening balance" as a note. It is
     *  their text, on their row, and it is shown. */
    expect(entryTitle(entry({ note: 'Opening balance' }), t)).toBe('Opening balance');
  });

  it('keeps the amount label visible beside it', () => {
    /** The row's title is "Opening balance", which is not what the amount's
     *  label says, so both belong on the screen. */
    expect(amountLabelRepeatsTitle(entry({ entryType: 'opening' }))).toBe(false);
  });
});

describe('what an opening row calls its own direction', () => {
  it('answers in the words the form asked the question in', () => {
    /**
     * "You gave" is the wrong tense and the wrong claim on an opening balance:
     * nothing was given, the party already owed it when the book started. The
     * drawer asks "They owe me" / "I owe them", so the row answers in the same
     * words — a merchant checking a migration reads back exactly what they
     * were asked.
     */
    expect(entryAmountView('debit', 'opening').labelId).toBe('ledger.opening.theyOwe');
    expect(entryAmountView('credit', 'opening').labelId).toBe('ledger.opening.iOwe');
  });

  it('keeps the same tones, because the money means the same thing', () => {
    /** Red is money standing out with this party and green is money owed to
     *  them, whatever put it there. */
    expect(entryAmountView('debit', 'opening').tone).toBe('receivable');
    expect(entryAmountView('credit', 'opening').tone).toBe('payable');
  });

  it('leaves every other entry alone', () => {
    expect(entryAmountView('debit', 'manual_gave').labelId).toBe('ledger.entry.gave');
    expect(entryAmountView('credit').labelId).toBe('ledger.entry.got');
  });
});

/**
 * LED-03's presentation rules.
 *
 * `isCorrectable` is the one place the client restates a server rule on
 * purpose, and the test says which way the duplication is allowed to fail: a
 * client that is wrongly permissive shows a menu item that answers 409, which
 * is a bad screen; one that is wrongly restrictive hides an action a merchant
 * is entitled to, which is a missing feature they cannot report.
 */
describe('which rows may be corrected', () => {
  it('offers the actions on a standing manual entry', () => {
    expect(isCorrectable(entry())).toBe(true);
  });

  it('refuses a row that has already been reversed', () => {
    /* EC-2. Correcting the row that has ALREADY been undone would ask the
       server to write a second reversal, and the second one moves the balance
       again. What is still allowed is correcting the REPLACEMENT, which is a
       different row — see the backend's chain test. */
    expect(isCorrectable(entry({ status: 'reversed' }))).toBe(false);
  });

  it('refuses a row an invoice posted, whatever its status', () => {
    /* BR-6. Reversing the ledger line without touching the document would leave
       the invoice saying one thing and the khata another, and once INV exists
       the stock behind it a third. */
    expect(isCorrectable(entry({ sourceType: 'sales_document', entryType: 'invoice' }))).toBe(
      false
    );
  });

  it('offers them on an opening balance, which is manual and standing', () => {
    // BR-9, and the case LED-02 could not carry: a merchant copying forty
    // openings off a paper book will mistype one.
    expect(isCorrectable(entry({ entryType: 'opening' }))).toBe(true);
  });
});

describe('telling a reversal apart from what it reversed', () => {
  it('knows the row that did the undoing', () => {
    /* With "Show corrections" on, the reversal row is on screen beside the
       original — and without a badge it reads as an ordinary "You got ₹500" in
       the middle of the timeline, an entry the merchant has no memory of
       making. */
    expect(isReversalRow(entry({ entryType: 'reversal' }))).toBe(true);
    expect(isReversalRow(entry())).toBe(false);
  });

  it('finds the originals a loaded replacement superseded', () => {
    /* "Corrected" and "Reversed" are different events and the row has to say
       which — a merchant at a dispute needs to know whether a replacement is
       standing somewhere in this khata or the money simply came back out. The
       reversed row cannot answer that itself: `supersedesId` points FORWARDS
       from the replacement, so the answer is a property of the page. */
    const ids = supersededIds([
      entry({ id: 'original', status: 'reversed' }),
      entry({ id: 'reversal', entryType: 'reversal', reversesId: 'original' }),
      entry({ id: 'replacement', supersedesId: 'original' }),
    ]);

    expect(ids.has('original')).toBe(true);
    expect(ids.has('reversal')).toBe(false);
  });

  it('is empty when nothing was corrected', () => {
    expect(supersededIds([entry(), entry({ id: 'e2' })]).size).toBe(0);
  });
});

describe('what a reversal row says for itself', () => {
  it('is titled by the reason the merchant gave, not by its direction', () => {
    /* The screenshot sweep found this, and no assertion could have: a reversal
       carries no note, so the title fell through to the direction's own words
       and the row read "You got ₹500.00" in the middle of a khata — an entry
       the merchant has no memory of making, sitting under the date of the one
       it undid. "Duplicate entry" says everything "You got" does not. */
    const reversal = entry({
      entryType: 'reversal',
      direction: 'credit',
      reason: 'Duplicate entry',
      note: '',
    });

    expect(entryTitle(reversal, t)).toBe('Duplicate entry');
  });

  it('still shows the direction beside the amount', () => {
    /* §23 does not let colour carry the direction on its own. The label is
       hidden only when the TITLE already says the same two words, which a
       reason does not. */
    const reversal = entry({ entryType: 'reversal', reason: 'Duplicate entry', note: '' });

    expect(amountLabelRepeatsTitle(reversal)).toBe(false);
  });

  it('says "Reversal" rather than "You gave" when no reason was recorded', () => {
    /* LED-10's document void will write reversals this feature did not. Falling
       through to the direction is the defect, not the absence of a reason: a
       generic word that is true beats a specific one that is misleading. */
    const reversal = entry({ entryType: 'reversal', reason: null, note: '' });

    expect(entryTitle(reversal, t)).toBe('ledger.entry.type.reversal');
  });
});

describe('where the reason shows on a corrected line', () => {
  it('is offered for the replacement row', () => {
    /* It was nowhere on the timeline: a merchant could see that a line had been
       corrected and not why — which is the question they open the history for,
       and the whole point of making the reason mandatory. */
    const replacement = entry({ supersedesId: 'original', reason: 'Recounted the bags' });

    expect(entryReason(replacement)).toBe('Recounted the bags');
  });

  it('is kept OUT of the caption, which is terse tokens and truncates', () => {
    /* Folded in, "Read the paper book wrong" rendered as "Read the paper …" on
       a 360 px phone — the same defect as the title it was written to explain.
       It gets a wrapping line of its own instead. */
    const replacement = entry({ supersedesId: 'original', reason: 'Read the paper book wrong' });

    expect(entryCaption(replacement, t, null)).not.toContain('Read the paper');
  });

  it('does not repeat it under a reversal that is already titled by it', () => {
    const reversal = entry({ entryType: 'reversal', reason: 'Duplicate entry', note: '' });

    expect(entryReason(reversal)).toBe('');
  });
});

describe("an unpaid expense's row (EXP-01 FR-4)", () => {
  it('says the money is owed for an expense, not that it came in', () => {
    /** An unpaid rent posts a credit on the landlord's khata. Labelled by
     *  direction alone it read "You got ₹12,000" — a payment nobody made,
     *  the write-off's defect one feature later. */
    expect(entryAmountView('credit', 'expense')).toEqual({
      tone: 'payable',
      sign: 'none',
      labelId: 'ledger.entry.expenseOwed',
    });
  });
});

describe('a write-off row', () => {
  it('says it was written off, not that money came in', () => {
    /** The first write-off sweep printed "You got ₹2,300" on a balance that
     *  was abandoned — the one sentence that row must never say. */
    expect(entryAmountView('credit', 'write_off')).toEqual({
      tone: 'neutral',
      sign: 'none',
      labelId: 'ledger.entry.writtenOff',
    });
  });

  it('does not echo a reason that is already the title', () => {
    expect(
      entryReason(entry({ entryType: 'write_off', note: 'Shop closed', reason: 'Shop closed' }))
    ).toBe('');
    expect(entryReason(entry({ note: 'Cement', reason: 'Typed 5000 for 500' }))).toBe(
      'Typed 5000 for 500'
    );
  });
});

describe('writtenOffLines (CR-2026-09-24-A)', () => {
  it('draws nothing when nothing was written off, or the server did not say', () => {
    expect(writtenOffLines(undefined)).toEqual([]);
    expect(writtenOffLines(null)).toEqual([]);
    expect(writtenOffLines({ debit: '0.00', credit: '0.00' })).toEqual([]);
  });

  it('is plain "Written off" when only one side was forgiven', () => {
    expect(writtenOffLines({ debit: '0.00', credit: '2500.00' })).toEqual([
      { side: 'other', amount: '2500.00' },
    ]);
    expect(writtenOffLines({ debit: '35.00', credit: '0.00' })).toEqual([
      { side: 'other', amount: '35.00' },
    ]);
  });

  it('names each side, receivable first, when both were', () => {
    expect(writtenOffLines({ debit: '35.00', credit: '20.00' })).toEqual([
      { side: 'receivable', amount: '20.00' },
      { side: 'payable', amount: '35.00' },
    ]);
  });
});

describe('the running balance under an amount (CR-027)', () => {
  /**
   * PTY-03 FR-5: "the running balance after that row in `ds-caption` grey".
   * The figure is the server's; this decides only the WORDS — no sign ever
   * reaches a shopkeeper, the side becomes words, and the ₹ comes from the
   * formatter rather than the copy string (the ungrouped "₹2800.00" defect
   * this codebase has shipped five times).
   */
  const captionT = ((id: string, values?: Record<string, string>) =>
    `${id}|${values?.amount}|${values?.side}`) as never;

  it('formats the figure with Indian grouping and names the side', () => {
    expect(entryBalanceCaption(entry({ runningBalance: '2800.00' }), captionT)).toBe(
      'ledger.timeline.balanceAfter|₹2,800.00|receivable'
    );
  });

  it('turns a negative balance into words, never a minus', () => {
    expect(entryBalanceCaption(entry({ runningBalance: '-1234567.50' }), captionT)).toBe(
      'ledger.timeline.balanceAfter|₹12,34,567.50|payable'
    );
  });

  it('calls a zero balance settled', () => {
    expect(entryBalanceCaption(entry({ runningBalance: '0.00' }), captionT)).toBe(
      'ledger.timeline.balanceAfter|₹0.00|settled'
    );
  });

  it('shows nothing when the row carries no balance, rather than ₹0.00', () => {
    /** A row spliced in from a 201 has none until the refetch lands. */
    expect(entryBalanceCaption(entry(), captionT)).toBeNull();
    expect(entryBalanceCaption(entry({ runningBalance: null }), captionT)).toBeNull();
  });
});

describe('A2 — the two new entry types and the buckets', () => {
  /* The LED-04 sweep's first finding was a statement row printing the raw id
     `ledger.entry.type.manual_got`: every entry type needs a label. A charge is owed
     (not "given"), a credit reduces what is owed (not "got"). */
  it('labels a charge as a charge, in the receivable tone', () => {
    expect(entryAmountView('debit', 'charge')).toEqual({
      tone: 'receivable',
      sign: 'none',
      labelId: 'ledger.entry.type.charge',
    });
  });

  it('labels an adjustment credit as a credit, in the payable tone', () => {
    expect(entryAmountView('credit', 'adjustment_credit')).toEqual({
      tone: 'payable',
      sign: 'none',
      labelId: 'ledger.entry.type.adjustment_credit',
    });
  });

  it('keeps a deposit neutral, received or returned, whatever its entry type', () => {
    /* PLT-X01 §8 — a deposit is neither "you gave" nor "you got": painting a deposit
       receipt green tells the merchant the party paid. */
    expect(entryAmountView('credit', 'payment_in', 'deposit')).toEqual({
      tone: 'neutral',
      sign: 'none',
      labelId: 'ledger.entry.depositIn',
    });
    expect(entryAmountView('debit', 'payment_out', 'deposit').labelId).toBe(
      'ledger.entry.depositOut'
    );
    // Wave A gate: out of the deposit by ADJUSTMENT is not a return.
    expect(entryAmountView('debit', 'payment_out', 'deposit', true)).toEqual({
      tone: 'neutral',
      sign: 'none',
      labelId: 'ledger.entry.depositAdjusted',
    });
  });

  it('reads a loan line like any line, and badges it', () => {
    expect(entryAmountView('debit', 'payment_out', 'loan').labelId).toBe('ledger.entry.gave');
    expect(bucketBadgeId('loan')).toBe('ledger.bucket.loan');
    expect(bucketBadgeId('deposit')).toBe('ledger.bucket.deposit');
  });

  it('badges nothing on the shop khata — every line a shop has ever written', () => {
    expect(bucketBadgeId('main')).toBeNull();
    expect(bucketBadgeId(undefined)).toBeNull();
  });
});
