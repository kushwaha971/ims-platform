import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { en, hi } from 'src/tests/allMessages';

/**
 * The defect: the catalogue drawers' Save button read "common.action.save" on screen —
 * a message id nobody had defined — and every check passed, because `i18n:check` checks
 * the catalogues against each other and jsdom tests match buttons by role. Every literal
 * id the library passes to `t()` must exist in English and Hindi.
 */
const ROOT = join(__dirname);
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !name.includes('.test.') ? [path] : [];
  });

describe('library message ids', () => {
  const ids = new Set(
    files(ROOT).flatMap((path) =>
      [...readFileSync(path, 'utf8').matchAll(/\bt\('([a-zA-Z][\w.]*)'/g)].map((m) => m[1] ?? '')
    )
  );

  it('finds the ids it checks', () => {
    expect(ids.size).toBeGreaterThan(50);
  });

  it.each([...ids].sort())('%s is defined in English and Hindi', (id) => {
    expect(en[id]).toBeDefined();
    expect(hi[id]).toBeDefined();
  });
});
