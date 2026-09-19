import type { SessionTenant } from 'src/redux/slice/sessionSlice';
import { initialsOf } from 'src/utils/text';

import {
  CHOOSER_SEARCH_THRESHOLD,
  canLeave,
  canSetDefault,
  filterTenants,
  groupTenants,
  needsChooserSearch,
  tenantNameView,
} from './tenantDisplay';

const tenant = (over: Partial<SessionTenant> = {}): SessionTenant => ({
  id: 't1',
  name: 'Sharma General Store',
  timezone: 'Asia/Kolkata',
  role: 'owner',
  isDefault: false,
  status: 'active',
  membershipId: 'm1',
  ...over,
});

describe('groupTenants — PLT-04 FR-1', () => {
  it('splits "Your businesses" from "Invitations" and suspended rows', () => {
    const groups = groupTenants([
      tenant({ id: 'a' }),
      tenant({ id: 'b', status: 'invited' }),
      tenant({ id: 'c', status: 'suspended' }),
      tenant({ id: 'd', status: 'removed' }),
    ]);

    expect(groups.active.map((row) => row.id)).toEqual(['a']);
    expect(groups.invited.map((row) => row.id)).toEqual(['b']);
    expect(groups.suspended.map((row) => row.id)).toEqual(['c']);
  });

  it('treats a row with no status as active, which is the Sprint 0 fixture', () => {
    const groups = groupTenants([{ id: 'x', name: 'X', timezone: 'Asia/Kolkata' }]);
    expect(groups.active).toHaveLength(1);
  });
});

describe("the chooser's search — §5 / EC-5", () => {
  it('appears only above the documented threshold', () => {
    expect(needsChooserSearch(CHOOSER_SEARCH_THRESHOLD)).toBe(false);
    expect(needsChooserSearch(CHOOSER_SEARCH_THRESHOLD + 1)).toBe(true);
  });

  it('matches on a substring, case-insensitively', () => {
    const rows = [tenant({ id: 'a', name: 'Sharma Kirana' }), tenant({ id: 'b', name: 'Verma' })];
    expect(filterTenants(rows, 'kir').map((row) => row.id)).toEqual(['a']);
    expect(filterTenants(rows, 'VERMA').map((row) => row.id)).toEqual(['b']);
  });

  it('returns everything for an empty or whitespace query', () => {
    const rows = [tenant({ id: 'a' }), tenant({ id: 'b' })];
    expect(filterTenants(rows, '')).toHaveLength(2);
    expect(filterTenants(rows, '   ')).toHaveLength(2);
  });
});

describe("tenantNameView — §7's 22-character truncation", () => {
  it('leaves a short name alone and says it did', () => {
    expect(tenantNameView('Sharma')).toEqual({ text: 'Sharma', truncated: false });
  });

  it('truncates a long name and reports it, so the tooltip and the text agree', () => {
    const view = tenantNameView('Sharma General Store and Sons Private Limited');
    expect(view.truncated).toBe(true);
    expect(view.text).toHaveLength(22);
    expect(view.text.endsWith('…')).toBe(true);
  });
});

describe('initialsOf', () => {
  it('takes up to two initials', () => {
    expect(initialsOf('Sharma General Store')).toBe('SG');
    expect(initialsOf('Verma')).toBe('V');
  });

  it('works for Devanagari, where a "letter" is not a code unit', () => {
    expect(initialsOf('शर्मा जनरल स्टोर')).toBe('शज');
  });

  it('survives an empty name rather than throwing', () => {
    expect(initialsOf('')).toBe('');
  });
});

describe('the row actions — FR-5 / FR-7 / §12', () => {
  it('offers "set as default" only on an active row that is not already it', () => {
    expect(canSetDefault(tenant())).toBe(true);
    expect(canSetDefault(tenant({ isDefault: true }))).toBe(false);
    expect(canSetDefault(tenant({ status: 'invited' }))).toBe(false);
    expect(canSetDefault(tenant({ membershipId: null }))).toBe(false);
  });

  it('offers "leave" to an owner too — the SERVER decides about the last one', () => {
    // The client cannot count owners, so hiding this on a guess would hide it
    // from owners who are not the last one. 409 `last_owner` is the answer.
    expect(canLeave(tenant({ role: 'owner' }))).toBe(true);
    expect(canLeave(tenant({ role: 'staff' }))).toBe(true);
  });

  it('does not offer "leave" on a row that is not a live membership', () => {
    expect(canLeave(tenant({ status: 'invited' }))).toBe(false);
    expect(canLeave(tenant({ membershipId: null }))).toBe(false);
  });
});
