'use client';

import { memo } from 'react';

import { UbAmount, UbAvatar, UbBox, UbListItemText } from 'src/design-system';
import { cn } from 'src/utils/cn';

import { balanceView, secondaryLine } from '../view-model/partyDisplay';

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
 *
 * The avatar disc and the two-line title are `UbAvatar` and `UbListItemText`
 * (§23.3): the same shape appears in the tenant chooser and the tenant-switcher
 * menu, and the three hand-written copies had already drifted apart.
 */
function PartyListRowBase({ party, balanceLabels, className }: Readonly<PartyListRowProps>) {
  const view = balanceView(party.balance);
  const secondary = secondaryLine(party);

  return (
    <UbBox
      as="li"
      data-testid="party-list-row"
      data-row-id={party.id}
      className={cn(
        'flex min-h-[60px] items-center gap-3 border-b border-border-hairline px-4 py-3',
        'last:border-b-0 hover:bg-surface-hover',
        className
      )}
    >
      <UbAvatar name={party.name} />
      <UbListItemText primary={party.name} secondary={secondary} secondaryTone="muted" />
      <UbAmount
        value={party.balance}
        tone={view.tone}
        sign={view.sign}
        label={balanceLabels[view.labelId] ?? ''}
        size="sm"
      />
    </UbBox>
  );
}

PartyListRowBase.displayName = 'PartyListRow';
export const PartyListRow = memo(PartyListRowBase);
