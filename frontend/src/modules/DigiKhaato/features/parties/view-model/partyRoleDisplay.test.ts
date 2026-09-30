import { createIntl } from '@formatjs/intl';

import { ALL_MESSAGES } from 'src/tests/allMessages';

import { relationLine } from './partyRelationDisplay';
import { openRecordsMessage, roleBadgeLabel, roleChipLabel } from './partyRoleDisplay';

/**
 * A6 — the words for roles and a module's archive refusal. The one rule under
 * test is that a module's message id NEVER reaches the screen: react-intl
 * answers a missing id with the id, and a merchant reading
 * "gym.archive.activeMemberships" has been told nothing.
 */
const translator = (extra: Record<string, string> = {}) => {
  const intl = createIntl({
    locale: 'en-IN',
    messages: { ...ALL_MESSAGES.en, ...extra },
    onError: () => undefined,
  });
  return (id: string, values?: Record<string, string | number | Date>) =>
    intl.formatMessage({ id, defaultMessage: id }, values);
};

const MEMBER = { code: 'gym_member', module: 'gym', labelId: 'gym.role.members' };

describe('role labels', () => {
  it('use the module plural: "Members" on the chip, "Member" on the badge', () => {
    const t = translator({ 'gym.role.members': '{count, plural, one {Member} other {Members}}' });
    expect(roleChipLabel(t, MEMBER)).toBe('Members');
    expect(roleBadgeLabel(t, MEMBER)).toBe('Member');
  });

  it('fall back to the module name, then to a plain word — never the id', () => {
    expect(roleChipLabel(translator({ 'nav.module.gym': 'Gym' }), MEMBER)).toBe('Gym');
    expect(roleChipLabel(translator(), MEMBER)).toBe('Role');
    // A badge with nothing to say is not drawn.
    expect(roleBadgeLabel(translator(), MEMBER)).toBeNull();
  });
});

describe('openRecordsMessage', () => {
  const block = { module: 'gym', count: 2, labelId: 'gym.archive.activeMemberships' };

  it("is the module's own sentence when loaded", () => {
    const t = translator({
      'gym.archive.activeMemberships': '{name} has {count} active memberships.',
    });
    expect(openRecordsMessage(t, block, 'Rahul')).toBe('Rahul has 2 active memberships.');
  });

  it('names the module when only its name is loaded, and nothing when neither is', () => {
    expect(openRecordsMessage(translator({ 'nav.module.gym': 'Gym' }), block, 'Rahul')).toBe(
      'Gym has 2 open records for Rahul. Close them first.'
    );
    expect(openRecordsMessage(translator(), block, 'Rahul')).toBe(
      'Rahul still has 2 open records. Close them first.'
    );
  });

  it("reads parties' own guardian guard from the parties catalogue", () => {
    const guardian = { module: 'parties', count: 1, labelId: 'parties.archive.activeGuardian' };
    expect(openRecordsMessage(translator(), guardian, 'Mohan')).toBe(
      'Mohan is the guardian of 1 active party. Remove the link, or archive that party first.'
    );
  });
});

describe('relationLine', () => {
  const end = (id: string, name: string) => ({
    id,
    name,
    mobileMasked: null,
    status: 'active' as const,
  });
  const relation = {
    id: 'r1',
    kind: 'guardian' as const,
    receivesMessages: false,
    fromOn: '2026-09-01',
    toOn: null,
    active: true,
    party: end('p1', 'Rahul'),
    relatedParty: end('p2', 'Mohan'),
  };

  it('reads from whichever khata it is shown on, and links to the other party', () => {
    const t = translator();
    expect(relationLine(t, relation, 'person')).toEqual({
      title: 'Guardian: Mohan',
      other: relation.relatedParty,
    });
    expect(relationLine(t, relation, 'related')).toEqual({
      title: 'Guardian of Rahul',
      other: relation.party,
    });
  });
});
