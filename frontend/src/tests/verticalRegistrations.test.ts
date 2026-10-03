import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * ADR-061 (with its 1 Oct amendment) — vertical registrations reach core
 * through ONE sanctioned file.
 *
 * The defects this prevents:
 *  - a registration nothing imports (the A4b class): the panel, tab or section
 *    simply never appears, and no unit test of the vertical notices;
 *  - a `register.ts` imported from somewhere else — a layout, `AppProviders`,
 *    the store — which puts every vertical's registration data on `/login`;
 *  - `registrations.ts` itself imported by the shell, the same cost by a
 *    longer road;
 *  - a message id written in a `register.ts`, which `check-locales` would read
 *    as rendered on the khata, dashboard and reminders routes and so pull the
 *    vertical's whole catalogue onto them.
 */
const ROOT = join(__dirname, '..', '..');
const FEATURES = join(ROOT, 'src/modules/DigiKhaato/features');
const REGISTRATIONS = 'src/modules/registrations.ts';
const VERTICALS = ['lending', 'library', 'gym', 'hospitality'] as const;
const ENGINES = ['dues', 'bookings', 'attendance'] as const;

/** The registry readers ADR-061 names (the reports hub joins with F11). */
const READERS = [
  'src/modules/DigiKhaato/features/parties/components/PartyModulePanels.tsx',
  'src/modules/DigiKhaato/features/reports/components/DashboardModuleSections.tsx',
  'src/modules/DigiKhaato/features/reminders/components/RemindersPageContent.tsx',
  'src/modules/DigiKhaato/features/reminders/components/ReminderSettingsDialog.tsx',
];

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) continue;
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
};

const resolve = (from: string, spec: string): string | null => {
  let base: string;
  if (spec.startsWith('modules/')) base = join(ROOT, 'src', spec);
  else if (spec.startsWith('src/')) base = join(ROOT, spec);
  else if (spec.startsWith('.')) base = join(from, '..', spec);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return relative(ROOT, candidate).split('\\').join('/');
    }
  }
  return null;
};

/** Every module specifier a file imports, re-exports or `import()`s. */
const SPECIFIERS =
  /(?:import|export)[^'"`;]*?from\s+'([^']+)'|import\s+'([^']+)'|import\(\s*'([^']+)'\s*\)/g;

const edges = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'app'))].flatMap((file) =>
  [...readFileSync(file, 'utf8').matchAll(SPECIFIERS)]
    .map((m) => m[1] ?? m[2] ?? m[3] ?? '')
    .map((spec) => ({ from: relative(ROOT, file).split('\\').join('/'), to: resolve(file, spec) }))
    .filter((edge): edge is { from: string; to: string } => edge.to !== null)
);

const registerFiles = VERTICALS.map(
  (v) => `src/modules/DigiKhaato/features/${v}/register.ts`
).filter((path) => existsSync(join(ROOT, path)));

describe('vertical registrations (ADR-061)', () => {
  it('finds at least one register.ts (the guard is not vacuous)', () => {
    expect(registerFiles).toContain('src/modules/DigiKhaato/features/library/register.ts');
  });

  it('imports every register.ts from registrations.ts and from nowhere else', () => {
    const importers = edges
      .filter((edge) => /features\/[^/]+\/register\.ts$/.test(edge.to))
      .filter((edge) => !/\.test\.tsx?$/.test(edge.from));
    expect(importers.filter((edge) => edge.from !== REGISTRATIONS)).toEqual([]);
    expect(importers.map((edge) => edge.to).sort()).toEqual([...registerFiles].sort());
  });

  it('is imported by exactly the registry readers — never a layout, AppProviders or the store', () => {
    const importers = edges
      .filter((edge) => edge.to === REGISTRATIONS && !/\.test\.tsx?$/.test(edge.from))
      .map((edge) => edge.from)
      .sort();
    expect(importers).toEqual([...READERS].sort());
  });

  it('gives no engine a register.ts (the consuming vertical registers its components)', () => {
    for (const engine of ENGINES) {
      expect(existsSync(join(FEATURES, engine, 'register.ts'))).toBe(false);
    }
  });

  it.each(registerFiles.map((path) => [path]))('%s names no message id', (path) => {
    const source = readFileSync(join(ROOT, path), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const literals = [...source.matchAll(/'([^']*)'/g)].map((m) => m[1] ?? '');
    const ids = literals.filter((text) => /^[a-z][a-zA-Z]*(\.[a-zA-Z0-9_]+)+$/.test(text));
    // Import specifiers are paths with slashes, so they never match.
    expect(ids).toEqual([]);
  });
});
