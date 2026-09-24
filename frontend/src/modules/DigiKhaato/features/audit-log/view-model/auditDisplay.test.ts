import { actionLabel, actorLabel, diffLines, flatten, fullDiff, periodRange } from './auditDisplay';

import type { AuditRow } from '../types/audit.types';

const KNOWN: Record<string, string> = {
  'audit.action.party.created': 'Added party',
  'audit.actor.system': 'System (scheduled job)',
  'audit.value.on': 'On',
  'audit.value.off': 'Off',
};
const t = (id: string): string => KNOWN[id] ?? id;

const row = (overrides: Partial<AuditRow> = {}): AuditRow => ({
  id: 'a1',
  createdAt: '2026-09-24T08:30:00Z',
  actor: null,
  actorType: 'user',
  action: 'party.updated',
  entityType: 'parties_party',
  entityId: 'p1',
  entityLabel: 'Ramesh Traders',
  entityRoute: '/parties/p1',
  before: null,
  after: null,
  changedKeys: [],
  reason: null,
  requestId: null,
  ip: null,
  ...overrides,
});

/** PLT-08 — the words and the diff a merchant reads in the activity log. */
describe('auditDisplay', () => {
  it('uses the locale label and falls back to readable words, never a raw code', () => {
    // A new server action must not print `member.role_changed` mid-log — the
    // statement printed `ledger.entry.type.manual_got` the same way.
    expect(actionLabel('party.created', t)).toBe('Added party');
    expect(actionLabel('member.role_changed', t)).toBe('Member role changed');
  });

  it('names the system actor rather than leaving "Who" blank', () => {
    expect(actorLabel(row({ actorType: 'system' }), t)).toBe('System (scheduled job)');
  });

  it('shows at most three changed fields and counts the rest (T-PLT-08-6)', () => {
    const r = row({
      before: { name: 'A', mobile: '1', email: 'a@x', address: { city: 'Pune' } },
      after: { name: 'B', mobile: '2', email: 'b@x', address: { city: 'Nashik' } },
      changedKeys: ['address.city', 'email', 'mobile', 'name'],
    });
    const { lines, more } = diffLines(r, t);
    expect(lines.map((l) => l.key)).toEqual(['address.city', 'email', 'mobile']);
    expect(lines[0]).toEqual({ key: 'address.city', before: 'Pune', after: 'Nashik' });
    expect(more).toBe(1);
  });

  it('flattens nested jsonb exactly as the server names the keys (EC-5)', () => {
    expect(flatten({ address: { city: 'Pune' }, value: true })).toEqual({
      'address.city': 'Pune',
      value: true,
    });
  });

  it('lists every key in the drawer, with booleans in words', () => {
    const diff = fullDiff(row({ before: { value: false }, after: { value: true } }), t);
    expect(diff).toEqual([{ key: 'value', before: 'Off', after: 'On' }]);
  });

  it('resolves the period chips to inclusive days ending today', () => {
    expect(periodRange('today', '2026-09-24')).toEqual({ from: '2026-09-24', to: '2026-09-24' });
    expect(periodRange('last7', '2026-09-24')).toEqual({ from: '2026-09-18', to: '2026-09-24' });
  });
});
