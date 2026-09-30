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

  it('narrows to the parties a panel says it is for, given the party', () => {
    /* Wave A gate: payments is on for every shop, so the deposit panel names
       the parties it applies to rather than loading its chunk on every khata. */
    registerPartyPanel('gym', { key: 'gym.membership', load });
    registerPartyPanel('payments', {
      key: 'payments.deposits',
      load,
      appliesTo: (party) => party.depositHeld != null,
    });
    const holder = { depositHeld: '380.00' } as Parameters<typeof partyPanelsFor>[1];
    const plain = {} as Parameters<typeof partyPanelsFor>[1];
    const keys = (party: typeof holder) =>
      partyPanelsFor(['gym', 'payments'], party).map((panel) => panel.key);
    expect(keys(holder)).toEqual(['gym.membership', 'payments.deposits']);
    expect(keys(plain)).toEqual(['gym.membership']);
    expect(partyPanelsFor(['gym', 'payments']).map((panel) => panel.key)).toHaveLength(2);
  });
});
