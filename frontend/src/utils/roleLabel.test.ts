import { roleLabel } from './roleLabel';

const catalogue: Record<string, string> = {
  'tenant.role.staff': 'Staff',
  'lending.role.agent': 'Collection agent',
  'tenant.role.moduleFallback': 'Feature role',
};
const t = (id: string): string => catalogue[id] ?? id;

/**
 * A13 — one way to name a role on every screen. The tenant switcher, the
 * business chooser and the activity log each built `tenant.role.<code>`
 * themselves, so a collection agent (`lending_agent`) signing in saw the raw id
 * "tenant.role.lending_agent" under their business name.
 */
describe('roleLabel', () => {
  it('names a canon role by its tenant.role key', () => {
    expect(roleLabel(t, 'staff')).toBe('Staff');
  });

  it('names a module role by the label the server sent', () => {
    expect(roleLabel(t, 'lending_agent', 'lending.role.agent')).toBe('Collection agent');
  });

  it('derives a module role label from its code when none was sent', () => {
    // `<module>_<name>` → `<module>.role.<name>`, the verticals' convention.
    expect(roleLabel(t, 'lending_agent')).toBe('Collection agent');
  });

  it('falls back to plain words, never a message id', () => {
    expect(roleLabel(t, 'gym_trainer')).toBe('Feature role');
    expect(roleLabel(t, 'gym_trainer', 'gym.role.trainer')).toBe('Feature role');
  });
});
