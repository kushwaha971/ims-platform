import { assignableRoleOptions, roleOptionLabel, roleText } from './roleDisplay';

import type { RoleOption } from '../types/role.types';

/** A `t` that knows a fixed catalogue and, like react-intl here, returns the id when it does not. */
const catalogue: Record<string, string> = {
  'tenant.role.staff': 'Staff',
  'tenant.role.owner': 'Owner',
  'lending.role.agent': 'Collection agent',
  'lending.role.agent.caption': 'Cannot see money or phone numbers',
  'nav.module.lending': 'Lending',
  'tenant.role.moduleFallback': 'Feature role',
  'team.role.inactive': 'Inactive while {module} is off',
  'team.role.inactiveFeature': 'Inactive while its feature is off',
};
const t = (id: string, values?: Record<string, string | number | Date>): string => {
  const text = catalogue[id] ?? id;
  return values ? text.replace('{module}', String(values.module)) : text;
};

const canon = (
  code: 'owner' | 'admin' | 'staff' | 'accountant',
  assignable = true
): RoleOption => ({
  code,
  module: null,
  labelId: `tenant.role.${code}`,
  assignable,
  isModuleRole: false,
});
const agent: RoleOption = {
  code: 'lending_agent',
  module: 'lending',
  labelId: 'lending.role.agent',
  assignable: true,
  isModuleRole: true,
};

/**
 * A13 (PLT-X12 §7-§8, BR-6) — how the team screen names a role. Pinned
 * because the two failure modes are both visible to a merchant: a raw message
 * id on screen ("lending.role.agent") and a member with a switched-off role
 * who looks exactly like everybody else and silently can do nothing.
 */
describe('assignableRoleOptions', () => {
  it('offers what the server lists, never owner', () => {
    const rows = [canon('owner', false), canon('staff'), agent];
    expect(
      assignableRoleOptions(rows, ['admin', 'staff', 'accountant']).map((r) => r.code)
    ).toEqual(['staff', 'lending_agent']);
  });

  it('refuses owner even if a server marked it assignable', () => {
    expect(assignableRoleOptions([canon('owner', true)], ['staff']).map((r) => r.code)).toEqual([]);
  });

  it('falls back to the canon three before the list arrives, never an empty picker', () => {
    expect(assignableRoleOptions([], ['admin', 'staff', 'accountant']).map((r) => r.code)).toEqual([
      'admin',
      'staff',
      'accountant',
    ]);
  });
});

describe('roleText', () => {
  it('names a canon role with no caption', () => {
    expect(
      roleText(t, { code: 'staff', labelId: 'tenant.role.staff', module: null, active: true })
    ).toEqual({ label: 'Staff', caption: null });
  });

  it('names a module role and says what it cannot see', () => {
    expect(
      roleText(t, {
        code: 'lending_agent',
        labelId: 'lending.role.agent',
        module: 'lending',
        active: true,
      })
    ).toEqual({ label: 'Collection agent', caption: 'Cannot see money or phone numbers' });
  });

  it('says a module role is inactive while its module is off', () => {
    expect(
      roleText(t, {
        code: 'lending_agent',
        labelId: 'lending.role.agent',
        module: 'lending',
        active: false,
      })
    ).toEqual({ label: 'Collection agent', caption: 'Inactive while Lending is off' });
  });

  it('names a row from a server without label ids by its canon key', () => {
    expect(roleText(t, { code: 'staff', labelId: '', module: null, active: true }).label).toBe(
      'Staff'
    );
  });

  it('never prints a message id when a label has no copy on this screen', () => {
    const text = roleText(t, {
      code: 'gym_trainer',
      labelId: 'gym.role.trainer',
      module: 'gym',
      active: true,
    });
    expect(text.label).toBe('Feature role');
    // Nor the raw module code: with no copy for the module there is no caption.
    expect(text.caption).toBeNull();
    expect(JSON.stringify(text)).not.toContain('gym.role.trainer');
  });

  it('says a role is inactive in general words when the module has no name here', () => {
    expect(
      roleText(t, {
        code: 'gym_trainer',
        labelId: 'gym.role.trainer',
        module: 'gym',
        active: false,
      }).caption
    ).toBe('Inactive while its feature is off');
  });

  it('names a picker option by role and module, and never by a raw module code', () => {
    const lending = { ...agent };
    const gym = {
      ...agent,
      code: 'gym_trainer' as const,
      module: 'gym' as const,
      labelId: 'gym.role.trainer',
    };
    expect(roleOptionLabel(t, lending)).toBe('Collection agent · Lending');
    expect(roleOptionLabel(t, gym)).toBe('Feature role');
  });
});
