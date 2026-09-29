import {
  hasModuleReports,
  registerModuleReport,
  resetModuleReportsForTests,
  visibleModuleReports,
  type ServerModuleReport,
} from './reportsRegistry';

/**
 * A10 / PLT-X13 EC-2 — a module report is offered only when the server listed
 * it (module on, codename held) AND a module registered its screen. What this
 * protects: a hub row that opens a 404 because the server knew a report no
 * screen was built for; a row for a switched-off module; and a registration
 * leaking between tests.
 */
const server = (key: string, module = key.split('.')[0] ?? ''): ServerModuleReport => ({
  key,
  module,
  labelId: `${key}.label`,
  permission: `${module}.x.read`,
  hasCsv: false,
});

beforeEach(() => resetModuleReportsForTests());

it('lists the intersection of the server list and the registered screens', () => {
  expect(hasModuleReports()).toBe(false);
  registerModuleReport('library.overdue', { module: 'library', href: '/library/reports/overdue' });
  registerModuleReport('library.fines', { module: 'library', href: '/library/reports/fines' });
  expect(hasModuleReports()).toBe(true);
  const visible = visibleModuleReports([server('library.overdue'), server('library.no_screen')]);
  expect(visible.map((r) => [r.key, r.href])).toEqual([
    ['library.overdue', '/library/reports/overdue'],
  ]);
});

it('is idempotent for the same entry and refuses a conflict or a foreign key', () => {
  const entry = { module: 'library', href: '/library/reports/overdue' };
  registerModuleReport('library.overdue', entry);
  registerModuleReport('library.overdue', { ...entry });
  expect(() =>
    registerModuleReport('library.overdue', { module: 'library', href: '/elsewhere' })
  ).toThrow(/registered twice/);
  expect(() => registerModuleReport('gym.overdue', { module: 'library', href: '/x' })).toThrow();
});
