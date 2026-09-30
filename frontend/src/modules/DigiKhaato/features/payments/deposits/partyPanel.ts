import {
  registerPartyPanel,
  type PartyPanelComponent,
} from 'modules/DigiKhaato/features/parties/modulePanels';

/**
 * A4b (FRD 00 PLT-X02 §7) — the khata's deposit panel, through A6's module
 * panel registry. Keyed under `payments`, whose screens deposits belong to:
 * a business with payments off sees no panel and loads none of its code.
 * Importing this module costs the khata route one loader function.
 */
export const loadDepositPanel = (): Promise<PartyPanelComponent> =>
  import('./components/DepositPanel').then((module) => module.DepositPanel);

/** Only a party the server sent a deposit figure for (A2: present when non-zero,
    or while a deposit-writing module is on). Every shop has payments on, so
    without this every khata would fetch the panel's chunk to render nothing. */
export const depositPanelAppliesTo = (party: { readonly depositHeld?: string }): boolean =>
  party.depositHeld != null;

registerPartyPanel('payments', {
  key: 'payments.deposits',
  load: loadDepositPanel,
  appliesTo: depositPanelAppliesTo,
});
