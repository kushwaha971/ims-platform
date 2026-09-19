'use client';

import { memo } from 'react';

import { UbAmount } from 'src/design-system';
import { cn } from 'src/utils/cn';

import { balanceView, initialsOf, secondaryLine } from '../view-model/partyDisplay';

import type { Party } from '../types/party.types';

export interface PartyListRowProps {
  readonly party: Party;
  /** Translated balance labels, resolved by the parent (a row has no `t()`). */
  readonly balanceLabels: Readonly<Record<string, string>>;
  readonly className?: string;
}

/**
 * R-C-3 / R-P-8 — a list row is memoised and takes no object literals. The
 * colour and the label both come from the view-model, never from the row's own
 * arithmetic (§19.1.1 layer 3).
 */
function PartyListRowBase({ party, balanceLabels, className }: Readonly<PartyListRowProps>) {
  const view = balanceView(party.balance);
  const secondary = secondaryLine(party);

  return (
    <li
      data-testid="party-list-row"
      data-row-id={party.id}
      className={cn(
        'flex items-center gap-3 border-b border-border-hairline px-4 py-3 last:border-b-0',
        'hover:bg-surface-hover',
        className
      )}
    >
      <span
        aria-hidden
        className="ds-label flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-surface-sunken text-text-secondary"
      >
        {initialsOf(party.name)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="ds-body-sm-medium truncate text-text-primary">{party.name}</span>
        {secondary && <span className="ds-caption text-text-muted">{secondary}</span>}
      </span>
      <UbAmount
        value={party.balance}
        tone={view.tone}
        sign={view.sign}
        label={balanceLabels[view.labelId] ?? ''}
        size="sm"
      />
    </li>
  );
}

PartyListRowBase.displayName = 'PartyListRow';
export const PartyListRow = memo(PartyListRowBase);
