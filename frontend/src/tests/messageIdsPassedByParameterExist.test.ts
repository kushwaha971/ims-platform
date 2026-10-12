import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { en, hi } from 'src/tests/allMessages';

/**
 * QA B7 (12 Oct 2026) — "Add shift" and "Save plan" with an empty name showed the
 * raw text `validation.required`. The id was the DEFAULT of a parameter in
 * `useValidationSchemas` (`requiredText(max, messageId = 'validation.required')`)
 * and existed in no catalogue; `i18n:check` reads `t('…')` literals and cannot see
 * an id that arrives through a parameter. This reads the ids that travel that way —
 * the helpers' defaults and every id passed to them — and fails on one with no
 * English and Hindi copy.
 */
const SRC = join(__dirname, '..');

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });

const PASSED = [
  // A helper's default: `messageId = '…'`, `requiredMessageId = '…'`.
  /\b\w*[mM]essageId\s*=\s*'([a-z][\w.]+)'/g,
  // `requiredText(160, 'id')` and `requiredBoundedText(160, 3, 'id')`.
  /\brequiredText\(\s*[^,()]+,\s*'([a-z][\w.]+)'/g,
  /\brequiredBoundedText\(\s*[^,()]+,\s*[^,()]+,\s*'([a-z][\w.]+)'/g,
];

it('has English and Hindi copy for every message id passed through a validation helper', () => {
  const missing: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const pattern of PASSED) {
      for (const match of text.matchAll(pattern)) {
        const id = match[1] as string;
        if (!(id in en) || !(id in hi)) missing.push(`${id} — ${file.slice(SRC.length + 1)}`);
      }
    }
  }
  expect(missing).toEqual([]);
});
