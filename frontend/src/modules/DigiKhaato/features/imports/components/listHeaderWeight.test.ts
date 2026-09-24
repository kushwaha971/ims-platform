import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The Import and Export header actions are statically imported by the
 * parties, items and expenses list routes, so whatever their modules import
 * is downloaded by every merchant who opens those lists to READ them.
 *
 * The first build of this feature put `importDisplay` in all three route
 * chunks — money, date and quantity formatting for a wizard preview on a
 * different route — because `useListExport` took `pollDelay` from it and
 * Turbopack tree-shakes between modules, not within one. /parties and /items
 * grew +4.5 KB gz for two buttons. These guards keep the header's module graph
 * to what it needs.
 */
const FEATURE = join(__dirname, '..');
const read = (path: string) => readFileSync(join(FEATURE, path), 'utf8');
const runtimeImports = (source: string) =>
  [...source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+'([^']+)'/gms)].map((m) => m[1] ?? '');

describe('the list header actions stay light', () => {
  it('importAccess and pollDelay import nothing at runtime', () => {
    expect(runtimeImports(read('constants/importAccess.ts'))).toEqual([]);
    expect(runtimeImports(read('view-model/pollDelay.ts'))).toEqual([]);
  });

  it('the header and the export hook never reach the wizard modules', () => {
    const heavy = ['importKinds', 'importDisplay', 'importService', 'exportService'];
    for (const file of ['components/ListHeaderActions.tsx', 'hooks/useListExport.ts']) {
      const imports = runtimeImports(read(file));
      for (const name of heavy) {
        expect(imports.filter((path) => path.endsWith(`/${name}`))).toEqual([]);
      }
    }
  });
});
