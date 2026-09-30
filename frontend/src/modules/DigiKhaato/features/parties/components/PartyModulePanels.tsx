'use client';

import { useMemo } from 'react';

import { UbStack } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { selectEnabledModules } from 'src/redux/slice/sessionSlice';

import { partyPanelsFor } from '../modulePanels';

// ── A4b ── core's own panel (held deposits, PLT-X02 §7) registers itself on import.
import 'modules/DigiKhaato/features/payments/deposits/partyPanel';

import type { PartyDetail } from '../types/party.types';

/**
 * A6 (PLT-X04 §7) — every registered module panel whose module is on (and
 * which applies to this party), under the khata's info panel. Renders nothing
 * at all when no panel applies. Mounted whatever the party's ROLES: a panel
 * belongs to its module, not to the "Guardian and payer" block (Wave A gate —
 * a held deposit had no panel on a khata with no module roles on).
 */
export function PartyModulePanels({
  party,
  readOnly,
  className,
}: Readonly<{
  party: PartyDetail;
  readOnly: boolean;
  className?: string;
}>): React.JSX.Element | null {
  const enabled = useAppSelector(selectEnabledModules);
  const panels = useMemo(() => partyPanelsFor(enabled, party), [enabled, party]);
  if (panels.length === 0) return null;
  return (
    <UbStack gap={4} className={className}>
      {panels.map(({ key, Component }) => (
        <Component key={key} party={party} readOnly={readOnly} />
      ))}
    </UbStack>
  );
}
