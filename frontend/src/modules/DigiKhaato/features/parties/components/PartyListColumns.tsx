import type { UbDataGridColumn } from 'src/design-system/UbDataGrid';

import { activityView, contactLine } from '../view-model/partyDisplay';
import { PARTY_SORT_FIELDS } from '../view-model/partyListSort';

import {
  PartyBalanceCell,
  PartyMetaCell,
  PartyNameCell,
  PartyStatusCell,
} from './PartyListRow';

import type { Party } from '../types/party.types';

/**
 * Part 19 §19.9.4 — a MODULE-LEVEL column factory, memoised by the screen on
 * its real dependencies. Building this array inside the component is the single
 * biggest `UbDataGrid` performance mistake there is: a new array every render
 * invalidates every cell.
 *
 * ── The priority order, and the reasoning ───────────────────────────────────
 *
 * A merchant scanning this list is deciding **who to chase today**. Every
 * column below is scored against that sentence and nothing else, because the
 * approved rule is that columns are chosen by the decision they support rather
 * than by what the table has.
 *
 * | # | Column | Priority | Why |
 * |---|---|---|---|
 * | 1 | Customer  | 1 | Who. Without it there is no row. |
 * | 2 | Balance   | 1 | How much, and in which direction. The question itself. |
 * | 3 | Last entry| 2 | How stale. ₹8,000 from last week and ₹8,000 from March are different problems, and the second is the one you call about. |
 * | 4 | Code and mobile | 3 | How to REACH them — needed to act, not to decide. It drops first. |
 * | 5 | Status    | 4 | Only ever varies when the merchant has changed the filter off `active`; on the default view it is the same word 25 times. |
 *
 * So the drop order is `status` → `contact`, and the md–lg table is exactly
 * name / balance / last entry: three columns, none of them below 13 px, and
 * nothing to drag sideways to read.
 *
 * **GSTIN, address, tags and the customer/supplier flags are not here at all.**
 * They are real fields the API returns or soon will, and none of them changes
 * who gets a phone call this afternoon. They belong on the party's detail page,
 * where the decision they support — "is this invoice's tax right", "where do I
 * deliver" — is actually being made.
 */
export interface PartyColumnDeps {
  /** Already-bound `t` from the screen; a column never calls `useTranslation`. */
  readonly t: (id: string, values?: Record<string, string | number | Date>) => string;
  /**
   * "Now", captured once by the screen. Passing it makes `activityView` pure
   * and this array stable: a factory that read the clock itself would produce a
   * different memo key on every render.
   */
  readonly nowMs: number;
  /** The three balance direction words, resolved once by the screen. */
  readonly balanceLabels: Readonly<Record<string, string>>;
}

export const createPartyColumns = ({
  t,
  nowMs,
  balanceLabels,
}: PartyColumnDeps): readonly UbDataGridColumn<Party>[] => [
  {
    id: 'name',
    header: t('parties.list.column.name'),
    priority: 1,
    sortField: PARTY_SORT_FIELDS.name,
    cardSlot: 'title',
    widthClassName: 'w-[38%]',
    cell: (party) => <PartyNameCell name={party.name} />,
  },
  {
    id: 'balance',
    header: t('parties.list.column.balance'),
    priority: 1,
    align: 'end',
    sortField: PARTY_SORT_FIELDS.balance,
    cardSlot: 'trailing',
    widthClassName: 'w-[22%]',
    cell: (party) => <PartyBalanceCell balance={party.balance} labels={balanceLabels} />,
  },
  {
    id: 'activity',
    header: t('parties.list.column.activity'),
    priority: 2,
    sortField: PARTY_SORT_FIELDS.activity,
    cardSlot: 'meta',
    widthClassName: 'w-[20%]',
    cell: (party) => {
      const view = activityView(party.lastActivityAt, nowMs);
      return <PartyMetaCell text={t(view.labelId, view.values)} />;
    },
  },
  {
    id: 'contact',
    header: t('parties.list.column.contact'),
    priority: 3,
    cardSlot: 'meta',
    cell: (party) => <PartyMetaCell text={contactLine(party)} />,
  },
  {
    id: 'status',
    header: t('parties.list.column.status'),
    priority: 4,
    // The card does not carry it: a phone shows the active list, and a word
    // that is the same on every row is furniture, not information.
    cardSlot: 'none',
    widthClassName: 'w-[12%]',
    cell: (party) => (
      <PartyStatusCell
        archived={party.status === 'archived'}
        label={t(`parties.list.status.${party.status}`)}
      />
    ),
  },
];
