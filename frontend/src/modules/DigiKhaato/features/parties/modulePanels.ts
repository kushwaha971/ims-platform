import type { ComponentType } from 'react';

import dynamic from 'next/dynamic';

import type { PartyDetail } from './types/party.types';

/**
 * A6 / FRD 00 PLT-X04 §7 — the khata's module panels.
 *
 * A module that keeps a profile for a person (a gym membership, a borrower's
 * loans, a library card) draws its own panel under the party's info panel.
 * Core never imports the module: the module registers here, from its own
 * feature entry, and `PartyModulePanels` renders a registered panel only while
 * that module is in the tenant's `enabled_modules` — so a switched-off module's
 * panel never appears, and its code never loads.
 *
 * Every panel is `dynamic()` (10-architecture §6.8): it loads in its own chunk,
 * and only on the khata of a business with that module on. Registering costs
 * the khata route a loader function.
 *
 * Same rules as the other registries (ADR-042): keyed by `<module>.<name>`,
 * idempotent for the same entry, a different entry under a used key throws,
 * and a reset for tests.
 */

export interface PartyPanelProps {
  readonly party: PartyDetail;
  /** True for an archived party: a panel shows its records but offers no writes. */
  readonly readOnly: boolean;
}

export type PartyPanelComponent = ComponentType<PartyPanelProps>;

export interface PartyPanelEntry {
  /** `<module>.<name>` — the React key and the registry key. */
  readonly key: string;
  readonly load: () => Promise<PartyPanelComponent>;
}

export interface RegisteredPartyPanel {
  readonly module: string;
  readonly key: string;
  readonly Component: PartyPanelComponent;
}

const KEY = /^([a-z][a-z0-9_]*)\.[a-z0-9][a-z0-9_]*$/;
const registry = new Map<
  string,
  RegisteredPartyPanel & { readonly load: PartyPanelEntry['load'] }
>();

export const registerPartyPanel = (module: string, entry: PartyPanelEntry): void => {
  const match = KEY.exec(entry.key);
  if (!match || match[1] !== module) {
    throw new Error(`Party panel "${entry.key}" must be "<module>.<name>" of ${module}`);
  }
  const existing = registry.get(entry.key);
  if (existing) {
    if (existing.module === module && existing.load === entry.load) return;
    throw new Error(`Party panel "${entry.key}" is registered twice`);
  }
  registry.set(entry.key, {
    module,
    key: entry.key,
    load: entry.load,
    Component: dynamic(entry.load, { ssr: false }),
  });
};

/** The panels of the modules in `enabledModules`, in registration order. */
export const partyPanelsFor = (
  enabledModules: readonly string[]
): readonly RegisteredPartyPanel[] =>
  [...registry.values()].filter((panel) => enabledModules.includes(panel.module));

let baseline: ReadonlyMap<string, RegisteredPartyPanel & { load: PartyPanelEntry['load'] }> | null =
  null;

/** Tests only: back to what was registered when first called — never to empty. */
export const resetPartyPanelsForTests = (): void => {
  baseline ??= new Map(registry);
  registry.clear();
  baseline.forEach((value, key) => registry.set(key, value));
};
