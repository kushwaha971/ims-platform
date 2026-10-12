import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MODULE_CODES } from 'src/types/domain.types';

import { HIDDEN_MODULES } from './ModuleToggleList';

/**
 * Owner, 12 Oct 2026: Settings → Modules showed "nav.module.lending" and
 * "settings.module.library.description" — raw message ids, because the list
 * draws every module the SERVER offers and nobody had written the words for the
 * verticals. Every module the list can show needs both, in both languages.
 */
const messages = (lang: string): Record<string, string> => {
  const root = join(process.cwd(), 'locales');
  const files = [
    join(root, `${lang}.json`),
    ...readdirSync(join(root, 'catalogues'))
      .filter((file) => file.endsWith(`.${lang}.json`))
      .map((file) => join(root, 'catalogues', file)),
  ];
  return Object.assign(
    {},
    ...files.map((file) => JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>)
  );
};

it.each(['en', 'hi'])('names and describes every module Settings can list, in %s', (lang) => {
  const all = messages(lang);
  const missing = MODULE_CODES.filter((code) => !HIDDEN_MODULES.includes(code)).flatMap((code) =>
    [`nav.module.${code}`, `settings.module.${code}.description`].filter((key) => !all[key])
  );
  expect(missing).toEqual([]);
});

it('never lists Gym or Hotel, which are out of the current scope', () => {
  // Owner, 12 Oct 2026: hidden even on a stack that releases every module.
  expect(HIDDEN_MODULES).toEqual(expect.arrayContaining(['gym', 'hospitality']));
});
