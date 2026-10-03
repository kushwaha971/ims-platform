import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { moduleThunks, registeredInvalidationModules } from 'src/redux/invalidation/moduleRegistry';
import { MUTATIONS, QUERIES, REGISTERED_THUNK_NAMES } from 'src/redux/invalidation/registry';

/**
 * Part 19 §19.3.6 enforcement point 3 — the one an engineer can otherwise route
 * around, and the one that catches the fourteenth feature.
 *
 * Every `createAsyncThunk(` in `features/**\/redux/*Thunk.ts` must appear in
 * exactly one of QUERIES or MUTATIONS. A thunk in neither fails with the file,
 * the name and the instruction.
 *
 * The spec's version walks the TypeScript compiler API. This one scans the
 * source with a regex, which is the same guarantee for the shape the standards
 * actually permit — `export const <name> = createAsyncThunk<` at the top level
 * (R-FN-2, R-C-1) — without adding the compiler as a test-time dependency.
 */
const FEATURES_ROOT = join(process.cwd(), 'src/modules/DigiKhaato/features');

const walk = (dir: string): readonly string[] => {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
};

// A16 / R33 — `src/print` holds the shared print letterhead's thunk; it is
// policed exactly like a feature's, so moving it out of sales lost no check.
const PRINT_ROOT = join(process.cwd(), 'src/print');

const thunkFiles = [
  ...walk(FEATURES_ROOT).filter((path) => /redux[/\\][^/\\]*Thunk\.ts$/.test(path)),
  ...walk(PRINT_ROOT).filter((path) => /[^/\\]*Thunk\.ts$/.test(path)),
];

const THUNK_DECLARATION = /export const (\w+)\s*=\s*createAsyncThunk</g;

/**
 * ADR-062 (1 Oct amendment) — a module (a vertical or a Wave B engine) that
 * has `features/<m>/redux/<m>Invalidation.ts` registers its thunks THERE, not
 * in core's lists. Its thunk files are held to that module's registries.
 */
const invalidationFileOf = (module: string): string =>
  join(FEATURES_ROOT, module, 'redux', `${module}Invalidation.ts`);
const moduleOf = (path: string): string | null => {
  const match = /features[/\\]([^/\\]+)[/\\]redux[/\\]/.exec(path);
  const name = match?.[1];
  return name && existsSync(invalidationFileOf(name)) ? name : null;
};
const MODULES = [
  ...new Set(readdirSync(FEATURES_ROOT).filter((module) => existsSync(invalidationFileOf(module)))),
];
MODULES.forEach((module) => require(invalidationFileOf(module)));
const registryFor = (path: string): { queries: object; mutations: object } => {
  const owner = moduleOf(path);
  if (!owner) return { queries: QUERIES, mutations: MUTATIONS };
  return moduleThunks(owner) ?? { queries: {}, mutations: {} };
};
const moduleThunkNames = (): string[] =>
  MODULES.flatMap((module) => {
    const thunks = moduleThunks(module);
    return thunks ? [...Object.keys(thunks.queries), ...Object.keys(thunks.mutations)] : [];
  });

describe('invalidation registry', () => {
  it('finds the thunk files it is supposed to police', () => {
    expect(thunkFiles.length).toBeGreaterThan(0);
  });

  it('registers every createAsyncThunk exactly once, as a QUERY or a MUTATION', () => {
    const unregistered: string[] = [];

    thunkFiles.forEach((path) => {
      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(THUNK_DECLARATION)) {
        const name = match[1];
        if (!name) continue;
        const registry = registryFor(path);
        const inQueries = Object.keys(registry.queries).includes(name);
        const inMutations = Object.keys(registry.mutations).includes(name);
        if (inQueries === inMutations) {
          unregistered.push(
            `${path}: ${name} — register this thunk in QUERIES or MUTATIONS; ` +
              'if it mutates, add its INVALIDATION entry.'
          );
        }
      }
    });

    expect(unregistered).toEqual([]);
  });

  it('registers no thunk twice', () => {
    const all = [...REGISTERED_THUNK_NAMES, ...moduleThunkNames()];
    expect(new Set(all).size).toBe(all.length);
  });

  it('finds the library module registration (the module half is not vacuous)', () => {
    expect(MODULES).toContain('library');
    expect(registeredInvalidationModules()).toContain('library');
  });

  /**
   * ADR-062 amendment — the map must be registered before the module's first
   * dispatch, so EVERY thunk file of a module bare-imports its
   * `<m>Invalidation.ts`, and importing that thunk file ALONE registers the
   * module. A thunk dispatched from a dialog that never loaded the module's
   * slice would otherwise invalidate nothing, silently.
   */
  it.each(MODULES.map((module) => [module]))(
    'every %s thunk file registers its module when imported alone',
    (module) => {
      const files = thunkFiles.filter((path) => moduleOf(path) === module);
      files.forEach((path) => {
        expect(readFileSync(path, 'utf8')).toContain(`import './${module}Invalidation';`);
        jest.isolateModules(() => {
          require(path);
          const isolated = require('src/redux/invalidation/moduleRegistry') as {
            registeredInvalidationModules: () => readonly string[];
          };
          expect(isolated.registeredInvalidationModules()).toContain(module);
        });
      });
    }
  );

  /**
   * W4-P — the registry names each thunk by its `typePrefix` STRING, so that
   * the store's listener can recognise `${typePrefix}/fulfilled` without
   * importing 145 thunks into the app shell (see `registry.ts`). A string can
   * drift from the thunk it stands for — a renamed prefix would make a mutation
   * silently stop invalidating anything — so this imports every thunk module
   * and holds each entry to the real thunk's `typePrefix`, by name.
   */
  it("holds every entry to its thunk's real typePrefix", () => {
    const registry: Record<string, string> = { ...QUERIES, ...MUTATIONS };
    MODULES.forEach((module) => {
      const thunks = moduleThunks(module);
      if (thunks) Object.assign(registry, thunks.queries, thunks.mutations);
    });
    const actual = new Map<string, string>();
    thunkFiles.forEach((path) => {
      const exported = require(path) as Record<string, unknown>;
      for (const [name, value] of Object.entries(exported)) {
        const prefix = (value as { typePrefix?: unknown } | null)?.typePrefix;
        if (typeof value === 'function' && typeof prefix === 'string') actual.set(name, prefix);
      }
    });

    expect(actual.size).toBeGreaterThan(100);
    const drifted = Object.entries(registry)
      .filter(([name, prefix]) => actual.get(name) !== prefix)
      .map(
        ([name, prefix]) => `${name}: registry says '${prefix}', thunk says '${actual.get(name)}'`
      );
    expect(drifted).toEqual([]);
    const unregistered = [...actual.keys()].filter((name) => !(name in registry));
    expect(unregistered).toEqual([]);
  });

  it('gives no two thunks the same typePrefix', () => {
    const prefixes = [
      ...Object.values({ ...QUERIES, ...MUTATIONS }),
      ...MODULES.flatMap((module) => {
        const thunks = moduleThunks(module);
        return thunks ? [...Object.values(thunks.queries), ...Object.values(thunks.mutations)] : [];
      }),
    ];
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});
