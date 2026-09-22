'use client';

import { memo } from 'react';

import { ArrowDownLeft, ArrowUpRight, Users } from 'lucide-react';

import { UbStatCard, UbStatGrid } from 'src/design-system';
import { formatInr } from 'src/utils/money';

import type { PartyListTotals } from '../view-model/partyDisplay';

/**
 * **The numbers the screen exists to answer**, as BrandHub's stat cards.
 *
 * ── What this replaces, and why it moved ────────────────────────────────────
 * Two bare figures stacked in the sticky page header with a grey line under
 * them. Part 17 §17.0.2 put them there so a total could never scroll away, and
 * that rule was right about the PROBLEM; the header just was not a good place
 * to solve it. Three numbers, two labels and a scope note crammed into a
 * header's `controls` slot read as a caption rather than as the answer to the
 * question the page is asking, and there was nowhere to put a third figure at
 * all — the customer count sat on its own line below, in grey label type,
 * doing the same job in a different voice.
 *
 * As cards in the body they are what BrandHub's payments and stock pages do:
 * a row of bordered tiles under the title, each with a glyph, a label, a figure
 * and the qualifier that makes the figure mean something. The cost is real and
 * was taken deliberately — they scroll away with the page — and the sticky
 * header keeps the title, so a merchant twenty rows down still knows which
 * list they are in.
 *
 * ── Two sums, never one net figure ──────────────────────────────────────────
 * Unchanged from the old header and worth restating, because a three-card row
 * invites a fourth: money to collect and money owed are two different jobs on
 * two different days, and "₹35,725 net" is a number nobody acts on.
 */
export interface PartyListStatsProps {
  readonly totals: PartyListTotals;
  /** Every party the current filter matches — not the page's row count. */
  readonly total: number;
  readonly receivableLabel: string;
  readonly payableLabel: string;
  readonly countLabel: string;
  /** Formatted count; the caller owns the plural and the numerals. */
  readonly countValue: string;
  /** Says which set the money figures describe; never left to be guessed. */
  readonly scopeNote: string;
  /** The same for the count, which always covers the whole filtered list. */
  readonly countNote: string;
}

function PartyListStatsBase({
  totals,
  receivableLabel,
  payableLabel,
  countLabel,
  countValue,
  scopeNote,
  countNote,
}: Readonly<PartyListStatsProps>) {
  return (
    <UbStatGrid>
      <UbStatCard
        icon={<ArrowDownLeft className="h-3.5 w-3.5" />}
        label={receivableLabel}
        value={formatInr(totals.receivable)}
        subtext={scopeNote}
        // §23.2.4 — receivable is the ledger debit family, never the
        // validation red.
        tone="danger"
      />
      <UbStatCard
        icon={<ArrowUpRight className="h-3.5 w-3.5" />}
        label={payableLabel}
        value={formatInr(totals.payable)}
        subtext={scopeNote}
        tone="success"
      />
      {/* Neutral on purpose. A count is not money and must not wear a ledger
          colour — a green "30" beside a green "₹293.00" reads as a figure the
          merchant is owed. */}
      {/* Full width on a phone, a third of the row from `md`. Three cards in a
          two-column grid leaves the last one orphaned beside a gap; the count
          is the one that reads fine wide, and the two money figures are the
          pair a merchant compares, so they keep the top row to themselves. */}
      <UbStatCard
        icon={<Users className="h-3.5 w-3.5" />}
        label={countLabel}
        value={countValue}
        subtext={countNote}
        className="col-span-2 md:col-span-1"
      />
    </UbStatGrid>
  );
}

PartyListStatsBase.displayName = 'PartyListStats';
export const PartyListStats = memo(PartyListStatsBase);
