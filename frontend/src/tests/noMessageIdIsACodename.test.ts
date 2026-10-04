import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PERMISSION_CODES } from 'src/types/domain.types';

/**
 * F04 QA-F04-3 and F06 — a message id spelled exactly like a permission
 * codename (`library.member.close`, `library.charge.waive`) is pinned to the
 * SHELL catalogue by `split-locales`, because the codename list is referenced
 * from shell code: one button label rode on every route. Twice in two features,
 * and nothing failed either time — this guard makes the third one fail.
 */
const LOCALES = join(__dirname, '..', '..', 'locales');

/** Predates the guard and belongs to the ledger feature, which renames it, not this test. */
const KNOWN: readonly string[] = ['ledger.statement.export'];

const messageIds = (): Set<string> => {
  const ids = new Set<string>();
  const files = [
    join(LOCALES, 'en.json'),
    ...readdirSync(join(LOCALES, 'catalogues'))
      .filter((name) => name.endsWith('.en.json'))
      .map((name) => join(LOCALES, 'catalogues', name)),
  ];
  for (const file of files) {
    for (const id of Object.keys(JSON.parse(readFileSync(file, 'utf8')) as object)) ids.add(id);
  }
  return ids;
};

describe('message ids and codenames', () => {
  it('never spells a message id like a permission codename', () => {
    const ids = messageIds();
    expect(PERMISSION_CODES.filter((code) => ids.has(code) && !KNOWN.includes(code))).toEqual([]);
  });
});
