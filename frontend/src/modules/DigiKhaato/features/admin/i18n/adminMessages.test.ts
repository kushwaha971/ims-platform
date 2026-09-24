import en from 'locales/en.json';

import { ADMIN_MESSAGES } from './adminMessages';

/**
 * The console catalogue lies OVER the shell's, so a key in both would render
 * two different strings depending on which provider a component sits under —
 * and a snackbar id here would render raw, because the snackbar sits under the
 * shell's provider only.
 */
describe('ADMIN_MESSAGES', () => {
  it('holds only console keys, none of which the shell catalogue also defines', () => {
    const shell = en as Record<string, string>;
    for (const [key, value] of Object.entries(ADMIN_MESSAGES)) {
      expect(key.startsWith('admin.')).toBe(true);
      expect(value.trim()).not.toBe('');
      expect(shell[key]).toBeUndefined();
    }
  });

  it('leaves every id the global snackbar resolves in the shell catalogue', () => {
    const shell = en as Record<string, string>;
    for (const id of [
      'admin.tenant.save.done',
      'admin.tenant.save.error',
      'admin.access.requested',
      'admin.access.error',
      'admin.enter.error',
      'admin.error.body',
      'admin.banner.endError',
    ]) {
      expect(shell[id]).toBeDefined();
    }
  });
});
