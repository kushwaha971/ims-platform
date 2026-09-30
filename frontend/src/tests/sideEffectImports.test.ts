import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * A bare `import 'x'` is written for the module's SIDE EFFECT — a registration
 * (`registerPartyPanel`, `registerReminderTab`, …) or a lazy slice's `inject()`.
 * `package.json`'s `sideEffects` list tells the bundler which modules have
 * any; for every other module a bare import is dead code, and the production
 * build DROPS it. jest never tree-shakes, so every unit test passes either way.
 *
 * Found at the Wave A gate (30 Sep 2026): A4b registered the khata's deposit
 * panel from `payments/deposits/partyPanel.ts`, imported bare by
 * `PartyModulePanels`, and the file was not in `sideEffects`. The registration
 * was absent from every client chunk — a deposit could be held, could block an
 * archive, and no build the merchant can load would ever draw the panel to
 * return it. This guard fails for the next such import instead.
 */
const ROOT = join(__dirname, '..', '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  sideEffects: readonly string[];
};

const globToRegExp = (glob: string): RegExp =>
  new RegExp(
    `^${glob
      .replace(/^\.\//, '')
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*\//g, '(?:.*/)?')
      .replace(/\*/g, '[^/]*')}$`
  );
const declared = pkg.sideEffects.map(globToRegExp);
const isDeclared = (path: string): boolean =>
  declared.some((pattern) => pattern.test(path) || pattern.test(path.split('/').pop() ?? ''));

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) continue;
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
};

/** `modules/…` and `src/…` are the tsconfig aliases; `./` and `../` are relative. */
const resolve = (from: string, spec: string): string | null => {
  let base: string;
  if (spec.startsWith('modules/')) base = join(ROOT, 'src', spec);
  else if (spec.startsWith('src/')) base = join(ROOT, spec);
  else if (spec.startsWith('.')) base = join(from, '..', spec);
  else return null; // a package: its own package.json decides
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    try {
      if (statSync(candidate).isFile()) return relative(ROOT, candidate).split('\\').join('/');
    } catch {
      /* try the next spelling */
    }
  }
  return null;
};

describe('a bare import survives the production build', () => {
  const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'app'))];
  const bare = files.flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(/^import\s+'([^']+)';/gm)]
      .map((match) => match[1] ?? '')
      .filter((spec) => !/\.(css|scss)$/.test(spec))
      .map((spec) => ({ file: relative(ROOT, file), target: resolve(file, spec) }))
      .filter((row): row is { file: string; target: string } => row.target !== null)
  );

  it('finds the imports it is guarding (the scan is not vacuous)', () => {
    expect(bare.some((row) => row.target.endsWith('payments/deposits/partyPanel.ts'))).toBe(true);
  });

  it('every module imported for its side effect is in package.json sideEffects', () => {
    const undeclared = bare.filter((row) => !isDeclared(row.target));
    expect(undeclared).toEqual([]);
  });
});
