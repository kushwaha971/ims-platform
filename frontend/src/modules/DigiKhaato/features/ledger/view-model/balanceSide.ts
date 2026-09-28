/**
 * The sign of a running balance, said as a side — split out of
 * `statementDisplay.ts` so the khata timeline can say a row's balance the
 * statement's way without downloading the statement's period logic.
 *
 * It imports nothing, on purpose: module-level imports tree-shake between
 * modules, not within one, so `entryDisplay` importing these two from
 * `statementDisplay` carried that whole module (presets, range checks, query
 * parsing) into `/parties/[id]` — ~0.5 KB gz of a screen the merchant opened to
 * read a balance. `statementDisplay` re-exports all three, so it is still the
 * one place a statement caller has to look.
 */

/** BR-4 — the balance carries no sign; the LABEL carries the direction. */
export type BalanceDirection = 'receivable' | 'payable' | 'settled';

/**
 * Which way a running balance points.
 *
 * The one place in this feature that reads the sign of a money value, which is
 * why it is a named function rather than a ternary at four call sites. A
 * shopkeeper has no concept of a negative balance — "minus two thousand" is not
 * something anyone says across a counter — so the sign becomes a sentence here
 * and the figure is shown without it.
 *
 * String comparison rather than `Number()`: money is a decimal string all the
 * way through (R-TS-7), and the only question is which side of zero it is on,
 * which the leading character answers exactly.
 */
export const balanceDirection = (amount: string): BalanceDirection => {
  const value = amount.trim();
  if (!value || /^-?0*\.?0*$/.test(value)) return 'settled';
  return value.startsWith('-') ? 'payable' : 'receivable';
};

/** The magnitude, for a component that paints the sign itself (or not at all). */
export const unsigned = (amount: string): string =>
  amount.startsWith('-') ? amount.slice(1) : amount;
