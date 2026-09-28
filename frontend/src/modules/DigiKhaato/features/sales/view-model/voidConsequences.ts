import { formatInr } from 'src/utils/money';

import type { SalesDocument } from '../types/sales.types';

/**
 * SAL-05 FR-5 / SAL-04 FR-10 — what a void will do, computed from the document
 * the page already holds, so the merchant reads the consequence BEFORE the tap:
 * "Stock: +2 Basmati Rice · Ramesh −₹1,772.00 · ₹500 becomes advance".
 *
 * Stock is listed for item lines; the server skips services and untracked
 * goods (FR-4), which the list cannot tell apart, so it says "items back"
 * rather than promising a movement per line.
 */
export interface VoidConsequence {
  readonly key: 'stock' | 'ledger' | 'payment';
  readonly id: string;
  readonly values: Readonly<Record<string, string>>;
}

const trimQty = (qty: string): string => String(Number(qty));

export const voidConsequences = (doc: SalesDocument): VoidConsequence[] => {
  const out: VoidConsequence[] = [];
  const items = doc.lines.filter((line) => line.itemId);
  const credit = doc.kind === 'credit_note';
  const restocked = !credit || doc.links.restock;
  if (items.length && restocked) {
    const sign = credit ? '−' : '+';
    out.push({
      key: 'stock',
      id: 'sales.void.consequence.stock',
      values: {
        items: items.map((line) => `${sign}${trimQty(line.qty)} ${line.description}`).join(', '),
      },
    });
  }
  const party = doc.partySnapshot?.name ?? doc.party?.name ?? null;
  if (party && doc.grandTotal !== '0.00') {
    out.push({
      key: 'ledger',
      id: credit ? 'sales.void.consequence.ledgerUp' : 'sales.void.consequence.ledgerDown',
      values: { party, amount: formatInr(doc.grandTotal) },
    });
  }
  if (!credit && doc.amountPaid !== '0.00') {
    out.push({
      key: 'payment',
      id: party ? 'sales.void.consequence.advance' : 'sales.void.consequence.walkInPaid',
      values: { party: party ?? '', amount: formatInr(doc.amountPaid) },
    });
  }
  return out;
};
