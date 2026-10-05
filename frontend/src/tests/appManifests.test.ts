import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { APP_MANIFESTS } from 'modules/appManifests';
import {
  PLATFORM_NAV_ITEMS,
  PLATFORM_SECTION,
} from 'modules/DigiKhaato/features/navigation/appManifest';

/**
 * docs/platform/14 §4.2, step 3 — apps are registered, not listed in shared code.
 *
 * Four rules, each a defect class the old shared `sidebarConfig.ts` had:
 *  - a manifest is DATA: it imports only icons, routes and the manifest type,
 *    so the shell never pays for an app's screens or slices;
 *  - every vertical with an `app.ts` is listed, so an app cannot be built and
 *    then silently absent from every menu;
 *  - keys are unique and every row sits in a section its app declares;
 *  - shared code never names an app: the shell knows apps only through
 *    manifests (the top bar used to test `workspace === 'shop'`).
 */
const ROOT = process.cwd();
const FEATURES = join(ROOT, 'src/modules/DigiKhaato/features');

const walk = (dir: string): readonly string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });

describe('app manifests', () => {
  it('import nothing but icons, routes and the manifest type', () => {
    const allowed = [
      'lucide-react',
      'src/routes',
      'modules/DigiKhaato/features/navigation/appManifest',
      '../navigation/appManifest',
    ];
    for (const folder of readdirSync(FEATURES)) {
      const file = join(FEATURES, folder, 'app.ts');
      let source: string;
      try {
        source = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const imported = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
      expect({
        folder,
        imported: imported.filter((path) => !allowed.includes(path ?? '')),
      }).toEqual({ folder, imported: [] });
    }
  });

  it('lists every app that has a manifest', () => {
    const withManifest = readdirSync(FEATURES).filter((folder) => {
      try {
        return statSync(join(FEATURES, folder, 'app.ts')).isFile();
      } catch {
        return false;
      }
    });
    expect(APP_MANIFESTS.map((app) => app.code).sort()).toEqual(withManifest.sort());
  });

  it('has unique row keys and places every row in a section its app declares', () => {
    const keys = [
      ...APP_MANIFESTS.flatMap((app) => app.navigation.map((item) => item.key)),
      ...PLATFORM_NAV_ITEMS.map((item) => item.key),
    ];
    expect(new Set(keys).size).toBe(keys.length);
    for (const app of APP_MANIFESTS) {
      const sections = new Set([...app.sections.map((s) => s.key), PLATFORM_SECTION.key]);
      for (const item of app.navigation)
        expect([app.code, sections.has(item.section)]).toEqual([app.code, true]);
    }
  });
});

describe('shared code', () => {
  it('never names an app — it reads manifests', () => {
    const codes = APP_MANIFESTS.map((app) => app.code);
    const shared = [...walk(join(ROOT, 'src/components')), ...walk(join(FEATURES, 'navigation'))];
    const offenders = shared.flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return codes
        .filter((code) =>
          new RegExp(`=== '${code}'|!== '${code}'|workspace: '${code}'`).test(source)
        )
        .map((code) => `${file.slice(ROOT.length)} names '${code}'`);
    });
    expect(offenders).toEqual([]);
  });
});
