'use client';

import { memo, useCallback } from 'react';

import dynamic from 'next/dynamic';

import { UbButton, UbFilterBar, UbFilterChip, UbFilterChipGroup } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';

import {
  BALANCE_FILTERS,
  COLLECTION_FILTERS,
  CREDIT_FILTERS,
  TYPE_FILTERS,
  type PartyBalanceFilter,
  type PartyCollectionFilter,
  type PartyCreditFilter,
  type PartyTypeFilter,
} from '../constants/partyFilters';

/**
 * Split out of the route chunk, and the split is unusually well aimed.
 *
 * The picker carries a popover and a command palette — 6 KB gz of controls —
 * and it renders only when `tags.length > 0`. Most tenants have no tags at all,
 * especially on the day they install, so in the route chunk this was bytes paid
 * by everybody for a control shown to the few. As a dynamic import the chunk is
 * fetched by exactly the books that adopted the feature, on the render that
 * first needs it.
 *
 * `ssr: false` because the decision to show it depends on a client fetch: the
 * server pass never has the tag list, so it would render nothing either way.
 */
const PartyTagFilterLazy = dynamic(
  () => import('./PartyTagFilter').then((m) => m.PartyTagFilter),
  { ssr: false }
);

import type { PartyTagWithCount } from '../types/party.types';


/**
 * PTY-02 §7's chips row: the three questions a merchant narrows the book by,
 * between the totals and the list.
 *
 * ── Why it is here and not in the grid's toolbar ────────────────────────────
 * `UbDataGridToolbar` puts its filter slot in a `shrink-0` group that
 * deliberately does not wrap, because a search field and a status select beside
 * it need the search to give way rather than the controls to drop a line. Seven
 * chips in that slot would push the search box to nothing. The FRD's own
 * ordering — totals, search, chips, list — puts them in their own row anyway,
 * and that is what the merchant's eye does: how much, then who.
 *
 * ── Each axis is single-select, and the chips say so by behaving that way ───
 * Tapping "I owe them" while "Owes me" is applied REPLACES it, because the
 * server's `balance` is one value. Tapping the applied one clears it. Chips
 * that looked multi-select and silently dropped one of two choices would be
 * worse than a control that never offered it.
 */
export interface PartyListFiltersProps {
  readonly t: TranslateFn;
  readonly type: PartyTypeFilter;
  readonly balance: PartyBalanceFilter;
  readonly collection: PartyCollectionFilter;
  readonly onTypeChange: (value: PartyTypeFilter) => void;
  readonly onBalanceChange: (value: PartyBalanceFilter) => void;
  readonly onCollectionChange: (value: PartyCollectionFilter) => void;
  /** PTY-06 FR-12 — over, near, or within the credit limit. */
  readonly credit: PartyCreditFilter;
  readonly onCreditChange: (value: PartyCreditFilter) => void;
  /**
   * How many parties are over their limit right now, or null when nothing has
   * counted yet. The chip appears only when there is somebody behind it (FR-12)
   * — a permanently visible "Over limit (0)" is a control whose only outcome is
   * an empty list, on a screen that already has seven.
   */
  readonly overLimitCount: number | null;
  /** PTY-05 — a comma list of tag names, OR'd within the group (BR-4). */
  readonly tag: string;
  readonly onTagChange: (value: string) => void;
  readonly tags: readonly PartyTagWithCount[];
  readonly activeFilterCount: number;
  readonly onClear: () => void;
}

function PartyListFiltersBase({
  t,
  type,
  balance,
  collection,
  onTypeChange,
  onBalanceChange,
  onCollectionChange,
  credit,
  onCreditChange,
  overLimitCount,
  tag,
  onTagChange,
  tags,
  activeFilterCount,
  onClear,
}: Readonly<PartyListFiltersProps>) {
  /* One handler shape for all three axes: a chip reports the state it is
     moving TO, so applying is "this value" and un-applying is "nothing". */
  const handleType = useCallback(
    (value: Exclude<PartyTypeFilter, ''>, next: boolean) => onTypeChange(next ? value : ''),
    [onTypeChange]
  );
  const handleBalance = useCallback(
    (value: Exclude<PartyBalanceFilter, ''>, next: boolean) => onBalanceChange(next ? value : ''),
    [onBalanceChange]
  );
  const handleCollection = useCallback(
    (value: Exclude<PartyCollectionFilter, ''>, next: boolean) =>
      onCollectionChange(next ? value : ''),
    [onCollectionChange]
  );
  const handleCredit = useCallback(
    (value: Exclude<PartyCreditFilter, ''>, next: boolean) => onCreditChange(next ? value : ''),
    [onCreditChange]
  );

  return (
    <UbFilterBar
      trailing={
        /* Present only when there is something to clear. A permanently visible
           "Clear filters" on an unfiltered list is a control that does nothing,
           and it takes the width the chips need on a phone. The count is in the
           label because the chips can be scrolled out of sight in this very
           row — a merchant who cannot see an applied chip can still see that
           two things are applied. */
        activeFilterCount > 0 ? (
          <UbButton variant="ghost" size="sm" onClick={onClear} className="shrink-0">
            {t('parties.list.filter.clear', { count: activeFilterCount })}
          </UbButton>
        ) : undefined
      }
    >
      {/* PTY-06 FR-12. FIRST in the bar, and that is the point of it.

          The track scrolls sideways on a phone, so whatever is last is off the
          screen — and this is the one group a merchant should see before they
          see anything else, because it is the only one that says somebody's
          money is at risk right now. The three fixed axes are always available
          and always answerable; this one appears only when there is something
          to act on.

          The whole group appears when somebody is over, OR when one of its own
          bands is already applied. A merchant who has set no limits, or whose
          customers are all well inside theirs, gets no chips here at all,
          because three controls whose every outcome is an empty list are three
          controls in the way.

          The second half of that condition is not a refinement, it is the bug.
          `overLimitCount` describes the FILTERED set — it rides in the same
          aggregate as the money totals so that it costs nothing — so narrowing
          to "Near limit" leaves nobody over, the count comes back zero, and the
          first half of this condition then took away the three chips the
          merchant had just used, pressed one and all. The band stayed applied
          with no control left to change it; only Clear filters, which drops
          everything else too. A group that is currently filtering the list is
          in use, whatever the count says.

          The count is on the chip because it is the number that decides whether
          to tap it: "Over limit (7)" is a morning's work and "Over limit" is a
          question. When there is no count there are no brackets either — "(0)"
          beside a list of near-limit parties reads as a tally of what is on the
          screen. */}
      {((overLimitCount !== null && overLimitCount > 0) || credit !== '') && (
        <UbFilterChipGroup label={t('parties.credit.filter.label')}>
          {CREDIT_FILTERS.map((value) => (
            <UbFilterChip
              key={value}
              label={
                value === 'over' && overLimitCount !== null && overLimitCount > 0
                  ? `${t('parties.credit.filter.over')} (${overLimitCount})`
                  : t(`parties.credit.filter.${value}`)
              }
              pressed={credit === value}
              onToggle={(next) => handleCredit(value, next)}
            />
          ))}
        </UbFilterChipGroup>
      )}


      <UbFilterChipGroup label={t('parties.list.filter.balance.label')}>
        {BALANCE_FILTERS.map((value) => (
          <UbFilterChip
            key={value}
            label={t(`parties.list.filter.balance.${value}`)}
            pressed={balance === value}
            onToggle={(next) => handleBalance(value, next)}
          />
        ))}
      </UbFilterChipGroup>

      <UbFilterChipGroup label={t('parties.list.filter.type.label')}>
        {TYPE_FILTERS.map((value) => (
          <UbFilterChip
            key={value}
            label={t(`parties.list.filter.type.${value}`)}
            pressed={type === value}
            onToggle={(next) => handleType(value, next)}
          />
        ))}
      </UbFilterChipGroup>

      <UbFilterChipGroup label={t('parties.list.filter.collection.label')}>
        {COLLECTION_FILTERS.map((value) => (
          <UbFilterChip
            key={value}
            label={t(`parties.list.filter.collection.${value}`)}
            pressed={collection === value}
            onToggle={(next) => handleCollection(value, next)}
          />
        ))}
      </UbFilterChipGroup>

      {/* A picker rather than chips, and it is the one axis where that is
          right. The other three have two or three fixed answers that fit in the
          row; tags are a merchant's own set and there can be two hundred of
          them, so a chip per tag would be a filter bar longer than the list.
          It is multi-select because the tag group ORs within itself (BR-4) —
          "Camp Area or Deccan" is one question with two answers, unlike the
          three axes beside it, each of which takes one.

          Last in the bar, after the three fixed axes, because it is the only
          one whose contents a merchant has to have set up first. On a new
          install it is an empty picker, and an empty picker at the START of the
          row would be the first thing they met. */}
      {tags.length > 0 && (
        <PartyTagFilterLazy
          t={t}
          value={tag}
          onChange={onTagChange}
          tags={tags}
          className="w-48 shrink-0"
        />
      )}
    </UbFilterBar>
  );
}

PartyListFiltersBase.displayName = 'PartyListFilters';
export const PartyListFilters = memo(PartyListFiltersBase);
