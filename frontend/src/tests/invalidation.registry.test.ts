import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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
        const inQueries = Object.keys(QUERIES).includes(name);
        const inMutations = Object.keys(MUTATIONS).includes(name);
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
    expect(new Set(REGISTERED_THUNK_NAMES).size).toBe(REGISTERED_THUNK_NAMES.length);
  });

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
    const prefixes = Object.values({ ...QUERIES, ...MUTATIONS });
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});
