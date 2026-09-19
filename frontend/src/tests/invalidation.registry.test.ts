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
const FEATURES_ROOT = join(process.cwd(), 'src/modules/UdhaarBook/features');

const walk = (dir: string): readonly string[] => {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
};

const thunkFiles = walk(FEATURES_ROOT).filter((path) => /redux[/\\][^/\\]*Thunk\.ts$/.test(path));

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
});
