import type { BorrowerSplit } from '../types/lending.types';

type Wire = Readonly<Record<string, unknown>>;
const str = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value);

/**
 * The server's split of one amount across a borrower's loans (review L5), from
 * a preview or from the `balance_changed` refusal that carries a fresh one.
 * Here rather than in the service so the lazy sheet can read a refusal without
 * pulling the whole service into its chunk.
 */
export const toSplit = (d: Wire): BorrowerSplit => ({
  borrowerId: str(d.borrower_id),
  name: str(d.name),
  amount: str(d.amount),
  leftAfter: str(d.left_after),
  loans: ((d.loans as Wire[] | undefined) ?? []).map((l) => ({
    loanId: str(l.loan_id),
    number: str(l.number),
    amount: str(l.amount),
    dueNow: str(l.due_now),
    late: Boolean(l.late),
    leftAfter: str(l.left_after),
  })),
});

/** The fresh split a `balance_changed` refusal carries, if it carries one. */
export const splitFromRefusal = (details: unknown): BorrowerSplit | null => {
  const split = (details as { split?: unknown } | null | undefined)?.split;
  return split && typeof split === 'object' ? toSplit(split as Wire) : null;
};
