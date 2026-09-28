import {
  actionLabel,
  actorLabel,
  diffLines,
  entityTypeLabel,
  fieldLabel,
  flatten,
  formatValue,
  fullDiff,
  periodRange,
} from './auditDisplay';

import type { AuditRow } from '../types/audit.types';

const KNOWN: Record<string, string> = {
  'audit.action.party.created': 'Added party',
  'audit.actor.system': 'System (scheduled job)',
  'audit.value.on': 'On',
  'audit.value.off': 'Off',
  'audit.field.bank_details': 'Bank details',
  'audit.field.ifsc': 'IFSC',
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
    expect(actionLabel('member.role_changed', t)).toBe('Role changed');
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
    expect(lines[0]).toEqual({
      key: 'address.city',
      label: 'Address › City',
      before: 'Pune',
      after: 'Nashik',
    });
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
    expect(diff).toEqual([{ key: 'value', label: 'Value', before: 'Off', after: 'On' }]);
  });

  it('resolves the period chips to inclusive days ending today', () => {
    expect(periodRange('today', '2026-09-24')).toEqual({ from: '2026-09-24', to: '2026-09-24' });
    expect(periodRange('last7', '2026-09-24')).toEqual({ from: '2026-09-18', to: '2026-09-24' });
  });

  /**
   * QA D5 — the log showed "Auth login succeeded" (with a lowercase "a" in the
   * card's disc), drawer lines like "address Before: {} · After: —", raw
   * timestamps "2026-10-01 15:06:53.893825+00:00" and keys like bank_details.
   */
  describe('reads as words, not internals (QA D5)', () => {
    it('drops the domain prefix from an unlabelled action code', () => {
      expect(actionLabel('auth.login_succeeded', t)).toBe('Login succeeded');
      expect(actionLabel('party.tag.merged', t)).toBe('Tag merged');
      expect(actionLabel('export', t)).toBe('Export');
    });

    it('names entity types without their table prefix', () => {
      expect(entityTypeLabel('platform_audit_log', t)).toBe('Audit log');
      expect(entityTypeLabel('sales_document', t)).toBe('Document');
    });

    it('humanises field names, using the locale where it has one', () => {
      expect(fieldLabel('bank_details.ifsc', t)).toBe('Bank details › IFSC');
      expect(fieldLabel('created_user', t)).toBe('Created user');
    });

    it('formats stored timestamps and dates as dd/mm/yyyy', () => {
      expect(formatValue('2026-10-01 15:06:53.893825+00:00', t)).toMatch(
        /^01\/10\/2026, \d{2}:\d{2}$/
      );
      expect(formatValue('2026-10-01T09:30:00Z', t)).toMatch(/^01\/10\/2026, \d{2}:\d{2}$/);
      expect(formatValue('2026-10-01', t)).toBe('01/10/2026');
    });

    it('hides a field that is empty on both sides, such as {} → nothing', () => {
      const diff = fullDiff(
        row({ before: { address: {}, name: 'A' }, after: { address: null, name: 'B' } }),
        t
      );
      expect(diff.map((line) => line.key)).toEqual(['name']);
      expect(formatValue({}, t)).toBe('—');
      expect(formatValue([], t)).toBe('—');
    });
  });
});
