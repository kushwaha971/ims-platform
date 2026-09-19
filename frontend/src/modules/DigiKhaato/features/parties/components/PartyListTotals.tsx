'use client';

import { memo } from 'react';

import { UbAmount, UbStack, UbText } from 'src/design-system';

import type { PartyListTotals as PartyListTotalsShape } from '../view-model/partyDisplay';

/**
 * **The number the screen exists to answer**, and therefore the one thing that
 * survives every breakpoint.
 *
 * It sits in `UbPageHeader`'s `controls` slot rather than in the grid's toolbar
 * for a reason that is the whole point of the approved rule: the page header is
 * `sticky top-0`, so the two figures stay on screen while the merchant scrolls
 * a hundred rows. A total that scrolls away is a total the merchant has to
 * scroll back for, on a phone, in a shop, with a customer waiting.
 *
 * Two sums, never one net figure: the money to collect and the money owed are
 * two different jobs, and "₹85,400 net" is a number nobody acts on.
 */
export interface PartyListTotalsProps {
  readonly totals: PartyListTotalsShape;
  readonly receivableLabel: string;
  readonly payableLabel: string;
  /** Says which set the two figures describe; never left to be guessed. */
  readonly scopeNote: string;
}

function PartyListTotalsBase({
  totals,
  receivableLabel,
  payableLabel,
  scopeNote,
}: Readonly<PartyListTotalsProps>) {
  return (
    <UbStack gap={1} data-testid="party-list-totals">
      <UbStack direction="row" gap={6} wrap align="start">
        <UbAmount
          value={totals.receivable}
          tone="receivable"
          sign="none"
          label={receivableLabel}
          size="lg"
          className="items-start"
        />
        <UbAmount
          value={totals.payable}
          tone="payable"
          sign="none"
          label={payableLabel}
          size="lg"
          className="items-start"
        />
      </UbStack>
      <UbText variant="caption" tone="tertiary">
        {scopeNote}
      </UbText>
    </UbStack>
  );
}

PartyListTotalsBase.displayName = 'PartyListTotals';
export const PartyListTotals = memo(PartyListTotalsBase);
