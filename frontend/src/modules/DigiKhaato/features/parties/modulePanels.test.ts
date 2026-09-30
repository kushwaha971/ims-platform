import { partyPanelsFor, registerPartyPanel, resetPartyPanelsForTests } from './modulePanels';

/**
 * A6 (PLT-X04 §7) — the khata's module-panel registry, under the ADR-042 rules
 * every registry in the product keeps.
 */
const load = async () => () => null;

afterEach(() => resetPartyPanelsForTests());

describe('registerPartyPanel', () => {
  it("shows a module's panel only while that module is on", () => {
    registerPartyPanel('gym', { key: 'gym.membership', load });
    expect(partyPanelsFor(['parties', 'gym']).map((panel) => panel.key)).toEqual([
      'gym.membership',
    ]);
    expect(partyPanelsFor(['parties'])).toEqual([]);
  });

  it('is idempotent for the same entry and refuses a second one under a used key', () => {
    registerPartyPanel('gym', { key: 'gym.membership', load });
    registerPartyPanel('gym', { key: 'gym.membership', load });
    expect(partyPanelsFor(['gym'])).toHaveLength(1);
    expect(() =>
      registerPartyPanel('gym', { key: 'gym.membership', load: async () => () => null })
    ).toThrow();
  });

  it("refuses a key outside the module's own namespace", () => {
    expect(() => registerPartyPanel('gym', { key: 'lending.loans', load })).toThrow();
    expect(() => registerPartyPanel('gym', { key: 'membership', load })).toThrow();
  });
});
