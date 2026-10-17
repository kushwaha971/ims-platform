/**
 * @jest-environment node
 *
 * Revamp F1 — every signed-in screen answers a tap with its loading view.
 *
 * The App Router shows NOTHING between a tap and a dynamic route's server
 * payload unless the route has a `loading.tsx`; the 17 Oct 2026 baseline
 * measured a frozen screen for 363 ms median and 819 ms p95 on a throttled
 * phone, with a loading state first in 0 of 57 navigations. Ninety-three
 * routes were given one at once, so the defect this prevents is the
 * ninety-fourth: a new screen added without one, silently back to a tap that
 * does nothing. It also holds each file to the shared `RouteLoading` views,
 * so the four shapes stay defined in one place.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const APP = join(process.cwd(), 'app', '(app)');

const pageFolders = (dir: string): readonly string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) return entry === 'page.tsx' ? [dir] : [];
    return pageFolders(full);
  });

describe('app routes', () => {
  const folders = pageFolders(APP);

  it('finds the app routes', () => {
    expect(folders.length).toBeGreaterThan(80);
  });

  it.each(folders.map((f) => [relative(APP, f) || '.', f]))('%s has a loading view', (_name, folder) => {
    const file = join(folder, 'loading.tsx');
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf8')).toMatch(
      /^export \{ (Home|List|Detail|Form)Loading as default \} from 'src\/components\/layout\/RouteLoading';\n$/
    );
  });
});
