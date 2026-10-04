import {
  registerPartyPanel,
  type PartyPanelComponent,
} from 'modules/DigiKhaato/features/parties/modulePanels';

/**
 * F04 (LIB-04 §7) — the khata's library panel, through A6's module panel
 * registry: a party who is a library member sees their card, books and dues
 * under the info panel. Registering costs the khata route one loader; the
 * panel's code and words load only on a member's khata, with library on.
 */
export const loadLibraryPartyPanel = (): Promise<PartyPanelComponent> =>
  import('./components/LibraryPartyPanel').then((module) => module.LibraryPartyPanel);

/** Only a party who holds the library's member role (B07's `library_member`). */
export const libraryPanelAppliesTo = (party: {
  readonly roleBadges?: readonly { readonly code: string }[];
}): boolean => party.roleBadges?.some((badge) => badge.code === 'library_member') ?? false;

registerPartyPanel('library', {
  key: 'library.member',
  load: loadLibraryPartyPanel,
  appliesTo: libraryPanelAppliesTo,
});
