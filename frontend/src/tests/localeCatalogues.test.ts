import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { en, hi } from 'src/tests/allMessages';

import shellEn from 'locales/en.json';

/**
 * W4-P — the product loads each screen's words with its own chunk, and the
 * component tests cannot see that: `renderWithProviders` hands IntlProvider
 * every catalogue at once. So the one thing that can put a raw message id on a
 * real screen — a route that renders a catalogue it never imports — is checked
 * here, by running `scripts/check-locales.mjs` over the import graph, so that
 * `npm test` fails on it and not only `npm run i18n:check`.
 */
describe('message catalogues', () => {
  it('are complete, disjoint, current, and loaded by every chunk that renders them', () => {
    const run = (): string =>
      execFileSync('node', [join(process.cwd(), 'scripts/check-locales.mjs')], {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    let output = '';
    try {
      output = run();
    } catch (error) {
      const failed = error as { stdout?: string; stderr?: string };
      throw new Error(`check-locales failed:\n${failed.stderr ?? ''}${failed.stdout ?? ''}`);
    }
    expect(output).toContain('✓ locales in step');
  });

  it('keep the shell catalogue to a fraction of the words', () => {
    /* The shell catalogue ships to every route, /login and /legal/terms
       included. It was all ~2,800 keys (36.6 KB gz) until this change; a
       number creeping back towards that is a feature's words landing in the
       shell, which `locales/catalogues.json` exists to prevent. */
    const shell = Object.keys(shellEn).length;
    expect(shell).toBeLessThan(Object.keys(en).length / 5);
  });

  it('hand the tests the same key set in both languages', () => {
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
  });
});
