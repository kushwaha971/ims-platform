'use client';

import { useMemo } from 'react';

import { UbStack } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { selectEnabledModules } from 'src/redux/slice/sessionSlice';

import { partyPanelsFor } from '../modulePanels';

import type { PartyDetail } from '../types/party.types';

/**
 * A6 (PLT-X04 §7) — every registered module panel whose module is on, under
 * the khata's info panel. Renders nothing at all for a business with no such
 * module, which is every business until the first vertical registers one.
 */
export function PartyModulePanels({
  party,
  readOnly,
}: Readonly<{ party: PartyDetail; readOnly: boolean }>): React.JSX.Element | null {
  const enabled = useAppSelector(selectEnabledModules);
  const panels = useMemo(() => partyPanelsFor(enabled), [enabled]);
  if (panels.length === 0) return null;
  return (
    <UbStack gap={4}>
      {panels.map(({ key, Component }) => (
        <Component key={key} party={party} readOnly={readOnly} />
      ))}
    </UbStack>
  );
}
