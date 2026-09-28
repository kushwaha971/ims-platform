import type { TranslateFn } from 'src/hooks/useTranslation';

import { entryTitle } from './entryDisplay';
import { rowTitleId } from './statementDisplay';

import type { LedgerEntry } from '../types/ledger.types';
import type { StatementRow } from '../types/statement.types';

/**
 * The server's own narration on a document-sourced row, in the app's language.
 *
 * Sprint 12 i18n sweep: a Hindi khata and statement read "Receipt
 * RCT/26-27/0001" and "Invoice INV/26-27/0001" in English on every row a
 * document posted — the defect the opening row had (LED-02 BR-1, D-L3), one
 * feature later. The server writes "<Word> <number>" (and "Void <Word>
 * <number>", and a purchase bill's "· <supplier ref>" after it) onto an
 * append-only row in English on purpose, so exports and support can find it:
 * that string is a record, not copy. So the record stays and the SCREEN words
 * it — but only a note that starts with exactly that narration AND the row's
 * own document number; anything a merchant typed is theirs and passes through.
 *
 * Its own module rather than a branch of `entryTitle`, because `entryDisplay`
 * is imported by twenty sales, payment and purchase chunks for its amount
 * helpers, and a `ledger.source.*` id reachable from it would make each of them
 * download the ledger catalogue for words they never show. The khata and the
 * statement — the two screens that print a ledger row's title — import this.
 */
const NARRATION: readonly (readonly [string, string])[] = [
  ['Purchase bill', 'ledger.source.purchase_bill'],
  ['Credit note', 'ledger.source.credit_note'],
  ['Invoice', 'ledger.source.invoice'],
  ['Receipt', 'ledger.source.receipt'],
  ['Payment', 'ledger.source.payment'],
];

const VOID = 'Void ';

export const localiseNarration = (
  note: string,
  number: string | null | undefined,
  t: TranslateFn
): string => {
  if (!number) return note;
  const voided = note.startsWith(VOID);
  const body = voided ? note.slice(VOID.length) : note;
  for (const [word, id] of NARRATION) {
    if (body.startsWith(`${word} ${number}`)) {
      return `${voided ? `${t('ledger.source.void')} ` : ''}${t(id)}${body.slice(word.length)}`;
    }
  }
  return note;
};

/** A statement row's Particulars as shown: its type's words, or its note with
 *  the server's narration worded in the app's language. */
export const statementRowTitle = (row: StatementRow, t: TranslateFn): string => {
  const id = rowTitleId(row);
  return id ? t(id) : localiseNarration(row.note.trim(), row.source?.number, t);
};

/** `entryTitle`, with a document row's narration in the app's language. */
export const khataEntryTitle = (entry: LedgerEntry, t: TranslateFn): string =>
  localiseNarration(entryTitle(entry, t), entry.source?.number, t);
