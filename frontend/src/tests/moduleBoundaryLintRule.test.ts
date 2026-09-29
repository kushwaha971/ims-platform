/**
 * @jest-environment node
 *
 * A11 / FRD 00 PLT-X14 T-PLT-X14-2 — the frontend half of the module boundary
 * (ADR-041, 10-architecture §3 and §6.7): an engine feature folder never
 * imports another engine, a vertical, or Shop & billing; a vertical never
 * imports another vertical, Shop & billing, or an engine it does not use.
 *
 * The defect it prevents: gym's member page lazily loads library's loan panel
 * "because it was there", and from that day the library module cannot be
 * switched off, released or rewritten without breaking gym — which is exactly
 * the coupling the vision forbids and the one no test sees until a merchant who
 * has gym and not library opens that page. It also guards the quieter failure
 * the party-fetch suite guards: a config that parses but no longer fires.
 *
 * Mechanics are `partyFetchLintRule.test.ts`'s, for its reasons: the config is
 * ESM, so ESLint runs as a process; the parser is type-aware, so every fixture
 * is written to a REAL path inside the TypeScript project, and the bad imports
 * point at planted target files that exist for the run, because
 * `import/no-restricted-paths` judges the RESOLVED file and an unresolvable
 * import would pass for the wrong reason. Hence the `fatal` check, and the
 * control fixtures that must lint clean.
 *
 * None of the seven module folders exists yet, so the run creates the ones it
 * needs and removes exactly those afterwards.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = process.cwd();
const ESLINT_BIN = join(ROOT, 'node_modules/.bin/eslint');
const FIXTURE_DIR = join(ROOT, 'src/tests/lint-fixtures/module-boundaries');
const FEATURES = 'src/modules/DigiKhaato/features';
const PROBE_DIR = '__lint_probe_boundaries__';
const RULE = 'import/no-restricted-paths';
/** A substring of MODULE_BOUNDARY_MESSAGE in eslint.config.mjs. */
const BOUNDARY_TEXT = 'Module boundary (ADR-041)';

interface LintMessage {
  readonly ruleId: string | null;
  readonly severity: number;
  readonly message: string;
  readonly fatal?: boolean;
}

interface LintResult {
  readonly filePath: string;
  readonly messages: readonly LintMessage[];
}

interface Fixture {
  readonly name: string;
  readonly lintAt: string;
  readonly fires: boolean;
  readonly source: string;
}

const readFixtures = (): readonly Fixture[] =>
  readdirSync(FIXTURE_DIR)
    .filter((file) => file.endsWith('.fixture'))
    .sort()
    .map((name) => {
      const source = readFileSync(join(FIXTURE_DIR, name), 'utf8');
      const lintAt = /^\/\/ @lint-at: (.+)$/m.exec(source)?.[1]?.trim();
      const expect = /^\/\/ @expect: (.+)$/m.exec(source)?.[1]?.trim();
      if (!lintAt || (expect !== 'fire' && expect !== 'none')) {
        throw new Error(`${name} is missing its @lint-at/@expect header`);
      }
      if (lintAt.split('/')[1] !== PROBE_DIR) {
        throw new Error(`${name} must be linted inside <feature>/${PROBE_DIR}/`);
      }
      return { name, lintAt: `${FEATURES}/${lintAt}`, fires: expect === 'fire', source };
    });

const FIXTURES = readFixtures();
const byPath = new Map<string, readonly LintMessage[]>();

const boundaryMessages = (messages: readonly LintMessage[]): readonly LintMessage[] =>
  messages.filter((message) => message.message.includes(BOUNDARY_TEXT));

const messagesFor = (fixture: Fixture): readonly LintMessage[] => {
  const messages = byPath.get(join(ROOT, fixture.lintAt));
  if (!messages) throw new Error(`ESLint reported nothing for ${fixture.lintAt}`);
  return messages;
};

jest.setTimeout(180_000);

beforeAll(() => {
  // Remove only what this run created: a module folder that already exists
  // (once the module is built) keeps everything but the probe directory.
  const featureDirs = [...new Set(FIXTURES.map((f) => f.lintAt.split('/').slice(0, 5).join('/')))];
  const created = featureDirs.filter((dir) => !existsSync(join(ROOT, dir)));
  const cleanUp = (): void => {
    for (const dir of featureDirs) {
      rmSync(join(ROOT, dir, PROBE_DIR), { recursive: true, force: true });
    }
    for (const dir of created) rmSync(join(ROOT, dir), { recursive: true, force: true });
  };
  cleanUp();
  try {
    for (const fixture of FIXTURES) {
      const absolute = join(ROOT, fixture.lintAt);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, fixture.source, 'utf8');
    }
    let raw: string;
    try {
      raw = execFileSync(
        ESLINT_BIN,
        ['--no-ignore', ...FIXTURES.map((fixture) => fixture.lintAt), '--format', 'json'],
        { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
      );
    } catch (error) {
      // A non-zero exit is expected: the bad fixtures are meant to fail.
      raw = String((error as { stdout?: Buffer | string }).stdout ?? '[]');
    }
    for (const result of JSON.parse(raw) as readonly LintResult[]) {
      byPath.set(result.filePath, result.messages);
    }
  } finally {
    cleanUp();
  }
});

describe('the module-boundary zones fire on every spelling of a sideways import', () => {
  it('has fixtures of both kinds — an empty directory would pass vacuously', () => {
    expect(FIXTURES.filter((f) => f.fires).length).toBeGreaterThanOrEqual(7);
    expect(FIXTURES.filter((f) => !f.fires).length).toBeGreaterThanOrEqual(3);
  });

  it.each(FIXTURES.filter((f) => f.fires).map((f) => [f.name, f] as const))(
    '%s is refused by the boundary zone',
    (_name, fixture) => {
      const messages = messagesFor(fixture);
      // A parse failure would make the assertion below meaningless.
      expect(messages.filter((message) => message.fatal)).toEqual([]);
      const boundary = boundaryMessages(messages);
      expect(boundary.map((message) => message.ruleId)).toEqual([RULE]);
      expect(boundary[0]?.severity).toBe(2);
    }
  );
});

describe('the zones do not catch what the matrix allows', () => {
  it.each(FIXTURES.filter((f) => !f.fires).map((f) => [f.name, f] as const))(
    '%s lints clean of the boundary',
    (_name, fixture) => {
      const messages = messagesFor(fixture);
      expect(messages.filter((message) => message.fatal)).toEqual([]);
      expect(boundaryMessages(messages)).toEqual([]);
    }
  );

  it('left no probe folder behind', () => {
    for (const fixture of FIXTURES) {
      expect(existsSync(join(ROOT, dirname(fixture.lintAt)))).toBe(false);
    }
  });
});
