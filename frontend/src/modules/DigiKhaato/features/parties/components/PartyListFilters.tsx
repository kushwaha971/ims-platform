'use client';

import { memo } from 'react';

import {
  UbActiveFilters,
  UbButton,
  UbFilterSelect,
  UbFilterSheet,
  type UbFilterSpec,
  type UbFilterValues,
} from 'src/design-system';
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
import { DEFAULT_ORDERING } from '../constants/partyListDefaults';
import { PHONE_SORT_CHOICES } from '../view-model/partyListSort';
import { roleChipLabel } from '../view-model/partyRoleDisplay';

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

import type { PartyRole, PartyTagWithCount } from '../types/party.types';

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
  /** The page itself is Customers or Suppliers, so the type is not a choice. */
  readonly typeFixed?: boolean;
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
  /**
   * A6 (PLT-X04 §2 flow 1) — the enabled modules' roles ("Members",
   * "Borrowers") and the applied comma list of codes, OR'd within the group.
   */
  readonly roles?: readonly PartyRole[];
  readonly role?: string;
  readonly onRoleChange?: (value: string) => void;
  readonly activeFilterCount: number;
  readonly onClear: () => void;
  /**
   * The controls sit in the grid's toolbar beside the search (owner, 6 Oct
   * 2026: one toolbar, not a row above the card); the pills for what is on sit
   * above the card. One component, two places, the same specs.
   */
  readonly part?: 'controls' | 'pills';
  /**
   * The approved design (12 Oct 2026): on a phone the list's toolbar is the
   * search and ONE Filters button. With `compact`, Show (active/archived) and
   * Balance move into the sheet instead of sitting beside it as two more
   * buttons. Each default reads as "no filter", so the badge counts only what
   * the merchant changed. (Sort can ride in too through `onOrderingChange`;
   * the party list keeps its one-tap sort sheet instead, UAT D5.)
   */
  readonly compact?: boolean;
  readonly status?: string;
  readonly onStatusChange?: (value: string) => void;
  readonly ordering?: string;
  readonly onOrderingChange?: (value: string) => void;
}

function PartyListFiltersBase({
  t,
  type,
  balance,
  collection,
  onTypeChange,
  typeFixed = false,
  onBalanceChange,
  onCollectionChange,
  credit,
  onCreditChange,
  overLimitCount,
  tag,
  onTagChange,
  tags,
  roles = [],
  role = '',
  onRoleChange,
  activeFilterCount,
  onClear,
  part = 'controls',
  compact = false,
  status = 'active',
  onStatusChange,
  ordering = DEFAULT_ORDERING,
  onOrderingChange,
}: Readonly<PartyListFiltersProps>) {
  const appliedRoles = role ? role.split(',').filter(Boolean) : [];

  /* Owner, 6 Oct 2026 — the approved filter pattern. Balance is the axis a
     merchant changes most ("who owes me"), so it is the one dropdown in the
     toolbar. Credit, role, type, collection and tags — up to five more rows of
     chips that took the first screen of a phone — live behind ONE Filters
     button and come back as pills only when they are on.

     The credit group keeps its rule: it is offered only when somebody is over
     their limit or a band is already applied, with the count on "Over limit". */
  const showCredit = (overLimitCount !== null && overLimitCount > 0) || credit !== '';
  const showRoles = Boolean(onRoleChange) && (roles.length > 0 || appliedRoles.length > 0);
  const specs: UbFilterSpec[] = [
    ...(showCredit
      ? [
          {
            kind: 'single' as const,
            key: 'credit',
            label: t('parties.credit.filter.label'),
            anyLabel: t('parties.list.filter.any'),
            options: CREDIT_FILTERS.map((value) => ({
              value,
              label: t(`parties.credit.filter.${value}`),
              hint:
                value === 'over' && overLimitCount !== null && overLimitCount > 0
                  ? String(overLimitCount)
                  : undefined,
            })),
          },
        ]
      : []),
    ...(showRoles
      ? [
          {
            kind: 'multi' as const,
            key: 'role',
            label: t('parties.list.filter.role.label'),
            options: [
              ...roles.map((option) => {
                /* Two roles whose words are not loaded here both fall back to
                   "Role" — two identical checkboxes. The code tells them apart. */
                const label = roleChipLabel(t, option);
                const twin = roles.some(
                  (other) => other.code !== option.code && roleChipLabel(t, other) === label
                );
                return {
                  value: option.code,
                  label: twin ? `${label} (${option.code.replace(/_/g, ' ')})` : label,
                };
              }),
              ...appliedRoles
                .filter((code) => !roles.some((option) => option.code === code))
                .map((code) => ({ value: code, label: t('parties.role.generic') })),
            ],
          },
        ]
      : []),
    ...(!typeFixed
      ? [
          {
            kind: 'single' as const,
            key: 'type',
            label: t('parties.list.filter.type.label'),
            anyLabel: t('parties.list.filter.any'),
            options: TYPE_FILTERS.map((value) => ({
              value,
              label: t(`parties.list.filter.type.${value}`),
            })),
          },
        ]
      : []),
    {
      kind: 'single',
      key: 'collection',
      label: t('parties.list.filter.collection.label'),
      anyLabel: t('parties.list.filter.any'),
      options: COLLECTION_FILTERS.map((value) => ({
        value,
        label: t(`parties.list.filter.collection.${value}`),
      })),
    },
    ...(tags.length > 0 || tag
      ? [
          {
            kind: 'multi' as const,
            key: 'tag',
            label: t('parties.tags.filter.label'),
            options: tags.map((option) => ({
              value: option.name,
              label: option.name,
              hint: String(option.partyCount),
            })),
          },
        ]
      : []),
  ];
  const balanceSpec: UbFilterSpec = {
    kind: 'single',
    key: 'balance',
    label: t('parties.list.filter.balance.label'),
    anyLabel: t('parties.list.filter.any'),
    options: BALANCE_FILTERS.map((value) => ({
      value,
      label: t(`parties.list.filter.balance.${value}`),
    })),
  };
  const defaultSort = PHONE_SORT_CHOICES.find((c) => c.ordering === DEFAULT_ORDERING);
  const compactSpecs: UbFilterSpec[] = compact
    ? [
        ...(onStatusChange
          ? [
              {
                kind: 'single' as const,
                key: 'status',
                label: t('parties.list.filter.status.label'),
                anyLabel: t('parties.list.status.active'),
                options: [{ value: 'archived', label: t('parties.list.status.archived') }],
              },
            ]
          : []),
        balanceSpec,
        ...(onOrderingChange
          ? [
              {
                kind: 'single' as const,
                key: 'ordering',
                label: t('parties.list.sort.label'),
                anyLabel: defaultSort ? t(defaultSort.labelKey) : undefined,
                options: PHONE_SORT_CHOICES.filter((c) => c.ordering !== DEFAULT_ORDERING).map(
                  (c) => ({ value: c.ordering, label: t(c.labelKey) })
                ),
              },
            ]
          : []),
      ]
    : [];
  const values: UbFilterValues = {
    status: status === 'archived' ? 'archived' : '',
    balance,
    ordering: ordering === DEFAULT_ORDERING ? '' : ordering,
    credit,
    role: appliedRoles.join(','),
    type,
    collection,
    tag,
  };
  const apply = (next: UbFilterValues) => {
    if (compact) {
      const nextStatus = next.status === 'archived' ? 'archived' : 'active';
      if (onStatusChange && nextStatus !== status) onStatusChange(nextStatus);
      if ((next.balance ?? '') !== balance)
        onBalanceChange((next.balance ?? '') as PartyBalanceFilter);
      const nextOrdering = next.ordering || DEFAULT_ORDERING;
      if (onOrderingChange && nextOrdering !== ordering) onOrderingChange(nextOrdering);
    }
    if ((next.credit ?? '') !== credit) onCreditChange((next.credit ?? '') as PartyCreditFilter);
    if ((next.role ?? '') !== values.role) onRoleChange?.(next.role ?? '');
    if (!typeFixed && (next.type ?? '') !== type)
      onTypeChange((next.type ?? '') as PartyTypeFilter);
    if ((next.collection ?? '') !== collection)
      onCollectionChange((next.collection ?? '') as PartyCollectionFilter);
    if ((next.tag ?? '') !== tag) onTagChange(next.tag ?? '');
  };

  if (part === 'pills') {
    return (
      <UbActiveFilters
        specs={specs}
        values={values}
        onChange={apply}
        labels={{
          remove: (pill) => t('common.filters.remove', { filter: pill }),
          clearAll: t('common.filters.clearAll'),
        }}
      />
    );
  }

  return (
    <>
      {!compact && (
        <UbFilterSelect
          spec={balanceSpec}
          value={balance}
          onChange={(next) => onBalanceChange(next as PartyBalanceFilter)}
          closeLabel={t('common.action.close')}
        />
      )}
      <UbFilterSheet
        compact
        specs={[...compactSpecs, ...specs]}
        values={values}
        onApply={apply}
        labels={{
          title: t('common.filters.title'),
          apply: t('common.action.apply'),
          reset: t('common.action.reset'),
          close: t('common.action.close'),
        }}
      />
      {activeFilterCount > 0 && (
        <UbButton variant="ghost" size="sm" onClick={onClear} className="shrink-0">
          {t('parties.list.filter.clear', { count: activeFilterCount })}
        </UbButton>
      )}
    </>
  );
}

PartyListFiltersBase.displayName = 'PartyListFilters';
export const PartyListFilters = memo(PartyListFiltersBase);
