'use client';

import { memo } from 'react';

import { UbAmount, UbBox, UbStatusBadge, UbTagList, UbText } from 'src/design-system';

import { balanceView } from '../view-model/partyDisplay';
import { toTagListItems } from '../view-model/partyTagDisplay';

import type { PartyTag } from '../types/party.types';

/**
 * What a party row is MADE OF: the five cells, memoised, each taking exactly
 * the strings it paints and deriving nothing it was not given.
 *
 * ── Why this file changed shape ─────────────────────────────────────────────
 * It used to be one `<li>` that hard-coded the phone layout — avatar, two-line
 * text, amount — and the desktop table would have been a second, separate copy
 * of the same five facts. `UbDataGrid` renders one column model three ways, so
 * the row's LAYOUT now belongs to the grid and only its CELLS belong here.
 *
 * They stay components rather than inline JSX in the column factory for the
 * reason §19.9.4 gives: a cell is the thing that repeats 25 to 100 times, and
 * `memo` on it is the cheapest re-render insurance in the file.
 *
 * No cell calls `useTranslation`. Translated copy arrives as a prop, so a
 * memoised cell never has to subscribe to the intl context and a column array
 * memoised on `t` invalidates exactly when the locale changes.
 */

export interface PartyNameCellProps {
  readonly name: string;
  /** PTY-05. Empty for an untagged party, which is most of them. */
  readonly tags: readonly PartyTag[];
  /**
   * Reserve the chip lane even when THIS row has no tags.
   *
   * The screen decides, from whether the tenant uses tags at all. A book with
   * none looks exactly as it did before PTY-05 — no lane, no taller rows, no
   * cost for a feature that has not been adopted. A book with tags gets the
   * lane on EVERY row, so rows are a uniform height and the list does not step
   * up and down as it scrolls past the tagged ones. That stepping is what FRD
   * §5's "fixed 24 px chip lane" is really about: the chips arrive with the row
   * and never shift in, but rows of two different heights read as broken even
   * though nothing moved.
   */
  readonly reserveTagLane: boolean;
  /** Pre-translated, e.g. "Tags on Ramesh Traders". */
  readonly tagsLabel: string;
  /** `(count) => string`, e.g. "+3". */
  readonly overflowLabel: (count: number) => string;
  /** One on a phone card, two in a table — the screen knows which it is. */
  readonly maxTags: number;
}

function PartyNameCellBase({
  name,
  tags,
  reserveTagLane,
  tagsLabel,
  overflowLabel,
  maxTags,
}: Readonly<PartyNameCellProps>) {
  return (
    <UbBox as="span" className="flex min-w-0 flex-col gap-1">
      <UbText as="span" variant="body-sm-medium" truncate>
        {name}
      </UbText>
      {reserveTagLane || tags.length > 0 ? (
        <UbTagList
          tags={toTagListItems(tags)}
          label={tagsLabel}
          max={maxTags}
          overflowLabel={overflowLabel}
          reserveSpace={reserveTagLane}
        />
      ) : null}
    </UbBox>
  );
}
PartyNameCellBase.displayName = 'PartyNameCell';
export const PartyNameCell = memo(PartyNameCellBase);

export interface PartyBalanceCellProps {
  /** Decimal string; never a number, never preformatted (R-TS-7). */
  readonly balance: string;
  /** The three direction words, pre-translated by the screen. */
  readonly labels: Readonly<Record<string, string>>;
}

function PartyBalanceCellBase({ balance, labels }: Readonly<PartyBalanceCellProps>) {
  const view = balanceView(balance);
  return (
    <UbAmount
      value={balance}
      tone={view.tone}
      sign={view.sign}
      /* §23.2.6 rule 2 — the label sits beside the figure at every width. The
         colour repeats what the word already said; it never says it alone. */
      label={labels[view.labelId] ?? ''}
      size="sm"
    />
  );
}
PartyBalanceCellBase.displayName = 'PartyBalanceCell';
export const PartyBalanceCell = memo(PartyBalanceCellBase);

export interface PartyMetaCellProps {
  readonly text: string;
}

/** The supporting facts: how stale the party is, and how to reach them. */
function PartyMetaCellBase({ text }: Readonly<PartyMetaCellProps>) {
  return (
    <UbText as="span" variant="inherit" truncate>
      {text}
    </UbText>
  );
}
PartyMetaCellBase.displayName = 'PartyMetaCell';
export const PartyMetaCell = memo(PartyMetaCellBase);

export interface PartyStatusCellProps {
  readonly label: string;
  readonly archived: boolean;
}

function PartyStatusCellBase({ label, archived }: Readonly<PartyStatusCellProps>) {
  return <UbStatusBadge tone={archived ? 'neutral' : 'success'} label={label} />;
}
PartyStatusCellBase.displayName = 'PartyStatusCell';
export const PartyStatusCell = memo(PartyStatusCellBase);
