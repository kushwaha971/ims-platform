/**
 * @jest-environment node
 *
 * Sprint 3 §32.6.7 — "Party search becomes four different implementations in
 * four features." The mitigation is `usePartySearch` plus a lint rule that
 * forbids a second party fetch outside it; this suite is what proves the rule
 * exists and FIRES, in the way S0-05 asks of every lint rule here: deliberately
 * bad fixture files, each failing with the expected rule id.
 *
 * The defect it prevents: sales, purchases, payments and expenses each grow a
 * party picker, and each one writes its own `setTimeout` around `listParties`
 * (or dispatches the list's thunk, or hand-rolls `GET /parties?q=`). Four
 * debounces, four abort strategies, four minimum-length rules — and a party
 * findable in one picker and not in the next. It also guards the quieter
 * failure: a config that PARSES but no longer applies, because a later `files`
 * block took the rule off feature code or put a feature file on the allowlist.
 *
 * Mechanics, borrowed from `forbidElements.test.ts` for the same reasons: the
 * config is ESM (jest's CJS runtime cannot import it), so ESLint is run as a
 * process; and the parser is type-aware, so each fixture is written to a REAL
 * path inside the TypeScript project and deleted again — piping through
 * `--stdin` with a path outside the project fails to parse, and every "it
 * fired" assertion would then pass for the wrong reason. Hence the
 * `fatal` check below.
 *
 * The fixtures live in `src/tests/lint-fixtures/party-fetch/*.fixture`, whose
 * extension keeps tsc, eslint and jest off them while they sit there. The rule
 * keys on WHERE a file lives, so each one is linted at a throwaway feature path
 * named in its own `// @lint-at:` header.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = process.cwd();
const ESLINT_BIN = join(ROOT, 'node_modules/.bin/eslint');
const FIXTURE_DIR = join(ROOT, 'src/tests/lint-fixtures/party-fetch');
/** A feature folder nobody owns, removed whole afterwards. */
const PROBE_ROOT = 'src/modules/DigiKhaato/features/__lint_probe_party_fetch__';

/** The real sources, which must lint clean of this rule (the allowlist works). */
const ALLOWED_REAL_FILES = [
  'src/modules/DigiKhaato/features/parties/hooks/usePartySearch.ts',
  'src/modules/DigiKhaato/features/parties/hooks/usePartyList.ts',
  'src/modules/DigiKhaato/features/parties/redux/partyListThunk.ts',
  'src/modules/DigiKhaato/features/parties/redux/partyListWarmup.ts',
  'src/modules/DigiKhaato/features/parties/api/partyService.ts',
  'src/redux/invalidation/registry.ts',
] as const;

/** A substring of PARTY_FETCH_MESSAGE in eslint.config.mjs. */
const PARTY_FETCH_TEXT = 'never a second party fetch';

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
  readonly expected: readonly string[];
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
      if (!lintAt || !expect) throw new Error(`${name} is missing its @lint-at/@expect header`);
      return {
        name,
        lintAt: `${PROBE_ROOT}/${lintAt}`,
        expected: expect === '(none)' ? [] : expect.split(',').map((id) => id.trim()),
        source,
      };
    });

const FIXTURES = readFixtures();
const byPath = new Map<string, readonly LintMessage[]>();

const partyFetchMessages = (messages: readonly LintMessage[]): readonly LintMessage[] =>
  messages.filter((message) => message.message.includes(PARTY_FETCH_TEXT));

const messagesFor = (relativePath: string): readonly LintMessage[] => {
  const messages = byPath.get(join(ROOT, relativePath));
  if (!messages) throw new Error(`ESLint reported nothing for ${relativePath}`);
  return messages;
};

// One ESLint process for every fixture and every real file: the type-aware
// program is the slow part, and it is built once per process.
jest.setTimeout(180_000);

beforeAll(() => {
  rmSync(join(ROOT, PROBE_ROOT), { recursive: true, force: true });
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
        [
          // The probe folder is in the config's global `ignores` so a
          // concurrent `npm run lint` never walks into it; this run names
          // its files explicitly and lifts that ignore.
          '--no-ignore',
          ...FIXTURES.map((fixture) => fixture.lintAt),
          ...ALLOWED_REAL_FILES,
          '--format',
          'json',
        ],
        { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
      );
    } catch (error) {
      // A non-zero exit is the EXPECTED outcome — the fixtures are meant to
      // fail. The JSON report is still on stdout.
      raw = String((error as { stdout?: Buffer | string }).stdout ?? '[]');
    }
    for (const result of JSON.parse(raw) as readonly LintResult[]) {
      byPath.set(result.filePath, result.messages);
    }
  } finally {
    rmSync(join(ROOT, PROBE_ROOT), { recursive: true, force: true });
  }
});

describe('the party-fetch fence fires on every spelling of a second party search', () => {
  it('has fixtures to run — an empty directory would pass every case below vacuously', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(6);
  });

  it.each(FIXTURES.map((fixture) => [fixture.name, fixture] as const))(
    '%s fails with exactly the expected rule ids',
    (_name, fixture) => {
      const messages = messagesFor(fixture.lintAt);
      // A parse failure would make every assertion below meaningless.
      expect(messages.filter((message) => message.fatal)).toEqual([]);

      const fence = partyFetchMessages(messages);
      const ruleIds = [...new Set(fence.map((message) => message.ruleId))].sort();
      expect(ruleIds).toEqual([...fixture.expected].sort());
      for (const message of fence) expect(message.severity).toBe(2);
    }
  );

  it('catches a feature COMPONENT calling listParties, which is the case the sprint plan names', () => {
    const fixture = FIXTURES.find((f) => f.name.startsWith('ComponentCallsListParties'));
    expect(fixture).toBeDefined();
    const fence = partyFetchMessages(messagesFor(fixture?.lintAt ?? ''));
    expect(fence.map((message) => message.ruleId)).toContain('no-restricted-imports');
  });

  it('is the ONLY rule that stops a hook doing it — the layering rule fences components alone', () => {
    /* If this ever fails because `import/no-restricted-paths` also fires, the
       zone rule grew; the party-fetch fence is still required for the files it
       does not cover (hooks, thunks, other services). */
    const fixture = FIXTURES.find((f) => f.name.startsWith('HookDebouncesListParties'));
    const messages = messagesFor(fixture?.lintAt ?? '');
    expect(messages.filter((m) => m.ruleId === 'import/no-restricted-paths')).toEqual([]);
    expect(partyFetchMessages(messages).map((m) => m.ruleId)).toEqual(['no-restricted-imports']);
  });
});

describe('the fence does not catch what it must allow', () => {
  it.each(ALLOWED_REAL_FILES)('%s — a real party source — lints clean of it', (file) => {
    const messages = messagesFor(file);
    expect(messages.filter((message) => message.fatal)).toEqual([]);
    expect(partyFetchMessages(messages)).toEqual([]);
  });
});
