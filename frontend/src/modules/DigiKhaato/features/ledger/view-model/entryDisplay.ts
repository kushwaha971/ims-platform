import type { UbAmountSign, UbAmountTone } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { formatInr, isZeroAmount } from 'src/utils/money';

import { balanceDirection, unsigned } from './balanceSide';

import type { LedgerDirection, LedgerEntry, WrittenOffTotals } from '../types/ledger.types';

/**
 * Part 19 §19.2.5 — pure presentation decisions, shared by every surface that
 * draws an entry so that two of them can never disagree.
 *
 * No React, no Redux, no `Ub*` imports beyond types. Everything here is a
 * function of an entry and returns ids and tokens, never rendered strings —
 * except where a `TranslateFn` is passed in, which is how the timeline row and
 * a future statement line get the same words.
 */

/** How an entry's amount is painted. `debit`: they owe more, so red. */
export interface EntryAmountView {
  readonly tone: UbAmountTone;
  readonly sign: UbAmountSign;
  readonly labelId: string;
}

/**
 * The tone/label pair for one entry, and the rule it encodes.
 *
 * `receivable` is the red tone and `payable` the green one — named for what the
 * money IS rather than for the colour, which is why the same two names work on
 * the party header where the roles are reversed by the sign of a balance.
 *
 * There is no `sign`. `UbAmount`'s discriminated union would accept one, and a
 * signed entry amount would be wrong twice over: the amount column carries no
 * sign because direction is a separate column, and §23.2.6 rule 3 says the
 * balance carries no sign and the label carries the direction. An entry is the
 * same rule one row down — "You gave ₹500", never "+₹500".
 */
export const entryAmountView = (
  direction: LedgerDirection,
  entryType?: LedgerEntry['entryType']
): EntryAmountView => {
  /* An opening balance is not something that happened today, so "You gave" is
     the wrong tense and the wrong claim: nothing was given, the party already
     owed it when the book started. The opening FORM asks the question in the
     right words — "They owe me" / "I owe them" — and the row answers in the
     same ones, so a merchant checking a migration reads back exactly what they
     were asked.
 
     The tone does not change. Red is still money standing out with this party
     and green still money owed to them, whatever put it there. */
  if (entryType === 'opening') {
    return direction === 'debit'
      ? { tone: 'receivable', sign: 'none', labelId: 'ledger.opening.theyOwe' }
      : { tone: 'payable', sign: 'none', labelId: 'ledger.opening.iOwe' };
  }
  /* A write-off (PTY-04 FR-3) is money that did NOT move: "You got ₹2,300" on
     it, which the first sweep printed, tells a merchant they were paid. It is
     neutral in tone — it is neither money standing out nor money owed — and
     it says what it is. */
  if (entryType === 'write_off') {
    return { tone: 'neutral', sign: 'none', labelId: 'ledger.entry.writtenOff' };
  }
  /* An unpaid expense (EXP-01 FR-4) posts a credit: the shop owes the landlord
     ₹12,000 more. "You got ₹12,000" under it would tell the merchant they
     were paid, which is the write-off's defect again. Same tone as any credit
     — money owed to the party — and words that say why. */
  if (entryType === 'expense' && direction === 'credit') {
    return { tone: 'payable', sign: 'none', labelId: 'ledger.entry.expenseOwed' };
  }
  return direction === 'debit'
    ? { tone: 'receivable', sign: 'none', labelId: 'ledger.entry.gave' }
    : { tone: 'payable', sign: 'none', labelId: 'ledger.entry.got' };
};

/**
 * What the row says on its first line.
 *
 * The merchant's note when there is one, and the direction's own words when
 * there is not — "You gave" is a better line than an empty one, and it is what
 * a paper khata would have said. A future invoice-sourced entry gets its own
 * branch here rather than at the call site.
 */
export const entryTitle = (entry: LedgerEntry, t: TranslateFn): string => {
  /* The TYPE is checked before the note, and the order is LED-02 BR-1.
 
     An opening entry always carries the note "Opening balance", stored in
     English on purpose — a row whose note is in the merchant's own locale is a
     row no report, export or support query can find. So the note is never the
     thing to render for one, and checking it first put a hard-coded English
     string on a Hindi khata, on the first row of every book migrated from
     paper. The server sets that note and the client never sends it. */
  if (entry.entryType === 'opening') return t('ledger.entry.type.opening');
  /* A reversal is titled by its REASON, and the screenshot sweep is what made
     the case. A reversal carries no note, so this used to fall through to the
     direction's own words and the row read **"You got ₹500.00"** in the middle
     of a khata with corrections shown — an entry the merchant has no memory of
     making, sitting under the date of the one it undid.
 
     The reason is the merchant's own sentence, collected by the dialog that did
     the reversing, and it is the only thing about that row worth reading:
     "Duplicate entry" says everything "You got" does not. It is the one place
     the reason a correction was made is on the timeline at all. */
  if (entry.entryType === 'reversal') {
    /* And when there is no reason — LED-10's document void will write reversals
       this feature did not — the row says "Reversal" rather than falling
       through to "You gave". Falling through is the defect, not the absence of
       a reason: a generic word that is true beats a specific one that is
       misleading. */
    return entry.reason?.trim() || t('ledger.entry.type.reversal');
  }
  if (entry.note.trim()) return entry.note.trim();
  return t(entryAmountView(entry.direction, entry.entryType).labelId);
};

/**
 * Does the row's title already say what the amount's label would say?
 *
 * It does whenever there is no note: `entryTitle` falls back to "You gave", and
 * `UbAmount` prints the same two words under the figure — so the row read
 * "You gave" on the left and "You gave ₹500.00" on the right, twice, on most of
 * the entries a merchant actually writes. A screenshot found it; every
 * assertion on an accessible name passed straight through, because both strings
 * are correct in isolation.
 *
 * The answer is `labelHidden` rather than dropping the label: §23 forbids
 * colour as the only signal, and the words have to stay in the accessible name
 * whatever the pixels show. So the label is still there for a screen reader —
 * "You gave ₹500.00" — and shown once on screen.
 */
export const amountLabelRepeatsTitle = (entry: LedgerEntry): boolean =>
  !entry.note.trim() &&
  entry.entryType !== 'opening' &&
  // A reversal is titled by its reason or by the word "Reversal", neither of
  // which repeats the label — and hiding "You got" there would leave the row's
  // only statement of direction to the colour, which §23 does not allow to
  // stand on its own.
  entry.entryType !== 'reversal';

/**
 * LED-02 §7 — an opening row wears a badge, and no other row does.
 *
 * It is the one line in a khata that is not a transaction: nothing changed
 * hands on that date, it is the position the book started from. A merchant
 * scrolling to the bottom of three years of entries should be able to tell that
 * last line apart from a sale at a glance, and the words "Opening balance"
 * alone do not do it — a merchant can type those words into a note.
 */
export const isOpeningEntry = (entry: LedgerEntry): boolean => entry.entryType === 'opening';

/**
 * LED-03 BR-6 — may this row be reversed or corrected from the khata?
 *
 * Two conditions, and both are the SERVER's rules restated: the row must still
 * be standing, and it must have been typed by hand. Everything else came from a
 * document, and undoing the ledger line without touching the document would
 * leave the invoice saying one thing and the khata another.
 *
 * Restating them here is a deliberate duplication, unlike the validation rules
 * this codebase keeps insisting on having one copy of — and the difference is
 * what happens when the two disagree. A client that is WRONGLY permissive shows
 * a menu item that answers 409, which is a bad screen; a client that is wrongly
 * restrictive hides an action the merchant is entitled to, which is a missing
 * feature they cannot report. So this decides what to DRAW and the server
 * decides what to DO, and the server's answer is the one that counts.
 */
export const isCorrectable = (entry: LedgerEntry): boolean =>
  entry.status === 'posted' && entry.sourceType === 'manual';

/** A reversal row — the line that undid something, rather than the line undone. */
export const isReversalRow = (entry: LedgerEntry): boolean => entry.entryType === 'reversal';

/**
 * Has this row been superseded by a correction, rather than simply reversed?
 *
 * Both are `status: 'reversed'` and both are struck through, but they are not
 * the same event and the row should not claim they are: "Corrected" says a
 * replacement exists and is standing somewhere in this khata, "Reversed" says
 * the money simply came back out. A merchant reading their own history at a
 * dispute needs to be able to tell which.
 *
 * The client cannot see the replacement from the reversed row — `supersedes_id`
 * points forwards from the replacement, not backwards from the original — so
 * this reads the REASON's presence alongside the status. Every LED-03 write
 * carries one; a row reversed by a future document void will not, and will read
 * "Reversed", which is exactly right for it.
 */
export const wasCorrected = (entry: LedgerEntry, replacements: ReadonlySet<string>): boolean =>
  entry.status === 'reversed' && replacements.has(entry.id);

/**
 * Which rows in a page are the ORIGINALS that some other row replaced.
 *
 * Computed over the loaded rows once rather than per row, because the answer is
 * a property of the list: a replacement names what it supersedes, so the set of
 * superseded ids is one pass over the page. With "Show corrections" off the set
 * is usually empty and every struck-through row is absent anyway.
 */
export const supersededIds = (entries: readonly LedgerEntry[]): ReadonlySet<string> => {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (entry.supersedesId) ids.add(entry.supersedesId);
  }
  return ids;
};

/**
 * The caption under the title: how it arrived, its reference, and who wrote it.
 *
 * Assembled here rather than in JSX so the separator is decided once and the
 * empty pieces cannot leave a stray "·" behind — which is what happens when
 * three optional fragments are joined in a template literal.
 *
 * `viewerId` decides whether the author is worth naming (FR-8): a merchant who
 * wrote the entry themselves does not need to be told so, and a khata where
 * every line says "by Sunita" is a khata where the one line Ramesh wrote does
 * not stand out.
 */
export const entryCaption = (
  entry: LedgerEntry,
  t: TranslateFn,
  viewerId: string | null
): string => {
  const parts: string[] = [];
  /* "PhonePe" rather than "UPI" when the app is known: it is the word the
     merchant heard at the counter, and the one they will look for. */
  if (entry.paymentMode === 'upi' && entry.upiApp) parts.push(t(`ledger.upiApp.${entry.upiApp}`));
  else if (entry.paymentMode) parts.push(t(`ledger.mode.${entry.paymentMode}`));
  if (entry.reference.trim()) parts.push(entry.reference.trim());
  if (entry.createdBy && entry.createdBy.id !== viewerId && entry.createdBy.name) {
    parts.push(t('ledger.entry.by', { name: entry.createdBy.name }));
  }
  return parts.join(' · ');
};

/**
 * The reason a line was changed, for the row that should show it.
 *
 * It is the whole point of LED-03 and it was nowhere on the timeline: a
 * merchant could see that a line had been corrected and not why, which is the
 * question they open the history for and the reason the field is mandatory.
 *
 * Its OWN line rather than a fragment of `entryCaption`, and the sweep decided
 * that: a caption is three terse tokens — how the money arrived, its reference,
 * who wrote it — joined with "·" and truncated to one line, and a reason is
 * prose up to 160 characters. Folded in, "Read the paper book wrong" rendered
 * as **"Read the paper …"** on a 360 px phone, which tells the merchant
 * nothing. On a line of its own it wraps and can be read.
 *
 * Empty for a reversal, which is titled by its reason already (`entryTitle`).
 */
export const entryReason = (entry: LedgerEntry): string => {
  if (entry.entryType === 'reversal') return '';
  const reason = entry.reason?.trim() ?? '';
  /* A write-off stores its reason as the note too (FR-3), so the row's title
     already says it; printing it again underneath read as an echo. */
  return reason && reason === entry.note.trim() ? '' : reason;
};

/**
 * Was this entry written down well after it happened (EC-2)?
 *
 * The tag exists because a backdated line appears in the middle of the timeline
 * rather than at the top, and a merchant who just saved one and cannot find it
 * needs to know it went where its date says. One day of slack, because an entry
 * made just after midnight for the evening that has only formally ended is not
 * backdated in any sense the merchant would recognise.
 */
export const isBackdated = (entry: LedgerEntry): boolean => {
  const written = entry.createdAt.slice(0, 10);
  if (!written || !entry.entryDate) return false;
  const gapDays =
    (Date.parse(`${written}T00:00:00Z`) - Date.parse(`${entry.entryDate}T00:00:00Z`)) / 86_400_000;
  return gapDays > 1;
};

/**
 * Group consecutive entries by their business date, preserving the order.
 *
 * The timeline shows one date header per day, and the rows are already sorted
 * by `-entry_date` — so this walks the list once rather than sorting it again.
 * Re-sorting would be worse than redundant: the server's ordering also breaks
 * ties by `created_at`, which a client-side sort on the date alone would
 * scramble.
 */
export interface EntryDayGroup {
  readonly date: string;
  readonly entries: readonly LedgerEntry[];
}

export const groupByDay = (entries: readonly LedgerEntry[]): readonly EntryDayGroup[] => {
  const groups: { date: string; entries: LedgerEntry[] }[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.date === entry.entryDate) {
      last.entries.push(entry);
    } else {
      groups.push({ date: entry.entryDate, entries: [entry] });
    }
  }
  return groups;
};

/**
 * One "Written off" figure beside "You gave" / "You got" (CR-2026-09-24-A).
 *
 * `side` feeds the copy's ICU `select`: `other` is plain "Written off", used
 * whenever only one direction has been written off — which is every party but
 * one that is both customer and supplier. Only when BOTH are non-zero does each
 * figure say which it is ("to get" / "to give"), because two cells both reading
 * "Written off" over different numbers is a riddle.
 */
export interface WrittenOffLine {
  readonly side: 'receivable' | 'payable' | 'other';
  readonly amount: string;
}

/**
 * The written-off figures to draw — none at all when nothing was written off.
 *
 * Absent rather than "₹0.00", as "You gave in all ₹0.00" is absent on an empty
 * khata: a third zero on every party would teach the merchant to read past the
 * line on the one party where it matters. A receivable write-off (a credit)
 * comes first; it is the common case and it sits beside "You got".
 */
export const writtenOffLines = (
  writtenOff: WrittenOffTotals | null | undefined
): readonly WrittenOffLine[] => {
  if (!writtenOff) return [];
  const receivable = !isZeroAmount(writtenOff.credit);
  const payable = !isZeroAmount(writtenOff.debit);
  const both = receivable && payable;
  const lines: WrittenOffLine[] = [];
  if (receivable) lines.push({ side: both ? 'receivable' : 'other', amount: writtenOff.credit });
  if (payable) lines.push({ side: both ? 'payable' : 'other', amount: writtenOff.debit });
  return lines;
};

/**
 * CR-027 — the words under a timeline row's amount: "Bal ₹2,800.00".
 *
 * The figure is the server's `running_balance` (PTY-03 FR-6), never summed
 * here. What this decides is how it is SAID, and it says it the statement's
 * way so the two screens cannot disagree about one row: the magnitude through
 * `formatInr` (the copy string carries no ₹ of its own — the ungrouped
 * "₹2800.00" defect has shipped five times here), and the side as a word via
 * `balanceDirection`, because a shopkeeper has no negative balance — a khata
 * in advance reads "(to give)", never "−₹300".
 *
 * `null` when the row carries no figure, which is a row spliced in from a 201
 * before the refetch lands; rendering "₹0.00" there would claim a settled khata.
 * A struck-through row DOES carry one — the balance as it stood, since neither
 * half of a reversal pair counts (canon §0.2) — and shows it like any other.
 */
export const entryBalanceCaption = (entry: LedgerEntry, t: TranslateFn): string | null => {
  const balance = entry.runningBalance;
  if (balance == null || balance.trim() === '') return null;
  return t('ledger.timeline.balanceAfter', {
    amount: formatInr(unsigned(balance)),
    side: balanceDirection(balance),
  });
};
