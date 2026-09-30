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

registerPartyPanel('payments', { key: 'payments.deposits', load: loadDepositPanel });
