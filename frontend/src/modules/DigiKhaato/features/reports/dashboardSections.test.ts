import {
  dashboardSectionComponent,
  registerDashboardSection,
  registeredDashboardSectionKeys,
  resetDashboardSectionsForTests,
} from './dashboardSections';

/**
 * A10 — the client dashboard-section registry follows the server registries'
 * rules (ADR-042). What these protect: a module registering twice from a
 * re-evaluated module (harmless); two modules sharing a key so one section
 * silently replaces the other (throws); a key outside the module's own
 * namespace (throws — the server's key and the client's must be the same
 * string, and `<module>.` is what ties both to the module switch); and a
 * test's fake section leaking into the next test.
 */
const load = (): Promise<() => null> => Promise.resolve(() => null);
const otherLoad = (): Promise<() => null> => Promise.resolve(() => null);

beforeEach(() => resetDashboardSectionsForTests());

it('is idempotent for the same entry and hands back one component', () => {
  const entry = { module: 'library', load };
  registerDashboardSection('library.overdue', entry);
  registerDashboardSection('library.overdue', { module: 'library', load });
  expect(registeredDashboardSectionKeys()).toEqual(['library.overdue']);
  expect(dashboardSectionComponent('library.overdue')).not.toBeNull();
  expect(dashboardSectionComponent('library.unknown')).toBeNull();
});

it('refuses a different entry under a used key', () => {
  registerDashboardSection('library.overdue', { module: 'library', load });
  expect(() =>
    registerDashboardSection('library.overdue', { module: 'library', load: otherLoad })
  ).toThrow(/registered twice/);
});

it.each(['overdue', 'gym.overdue', 'Library.Overdue', 'library.'])(
  'refuses %s as a key of the library module',
  (key) => {
    expect(() => registerDashboardSection(key, { module: 'library', load })).toThrow();
  }
);

it('resets to the start-up registrations', () => {
  registerDashboardSection('library.overdue', { module: 'library', load });
  resetDashboardSectionsForTests();
  expect(registeredDashboardSectionKeys()).toEqual([]);
});
