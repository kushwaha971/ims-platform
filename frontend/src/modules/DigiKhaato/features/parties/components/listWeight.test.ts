import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The party list is the screen a merchant opens to READ their book, so what
 * its route chunk carries is paid on nearly every visit. Its occasional acts —
 * create/edit, bulk tag and bulk archive — are `dynamic()` and fetched on the
 * press. These guards keep them out of the route: a static import put back
 * "for simplicity" moves the dialog's code into /parties without failing any
 * component test, because jsdom renders both spellings the same.
 *
 * The bulk archive dialog is the Wave A gate's finding (30 Sep 2026): A6 grew
 * it with the modules' open-records report, and /parties came out of Wave A
 * 3.4 KB gz heavier than before it, 1.9 over its budget.
 */
const read = (file: string) => readFileSync(join(__dirname, file), 'utf8');
const runtimeImports = (source: string) =>
  [...source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+'([^']+)'/gms)].map((m) => m[1] ?? '');

describe('the party list keeps its occasional dialogs out of the route', () => {
  it.each(['./PartyBulkArchiveDialog', './PartyBulkTagDialog', './PartyFormDrawer'])(
    '%s is not statically imported by the list page',
    (module) => {
      const source = read('PartyListPageContent.tsx');
      expect(runtimeImports(source)).not.toContain(module);
      expect(source).toContain(`import('${module}')`);
    }
  );
});
