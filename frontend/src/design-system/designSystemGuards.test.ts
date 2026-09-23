/**
 * @jest-environment node
 *
 * Source-level guards for two classes of defect that no rendering test catches,
 * because in both cases the CSS is produced correctly — it is just the wrong
 * CSS, or none at all.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

const walk = (dir: string): readonly string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const sourceFiles = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'app'))].filter(
  (file) => /\.tsx?$/.test(file) && !/\.(test|spec)\.tsx?$/.test(file)
);

/**
 * Every `ds-*` class the plugin emits. Parsed from the plugin rather than
 * listed here, so the two cannot drift.
 */
/* Run the plugin rather than grep it: the BrandHub tiers are generated in a
   loop (`ds-body-{size}-{weight}`), so their names never appear as literals. */
const emittedTiers = (() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const typography = require('./typographyPlugin.js') as {
    handler: (api: { addComponents: (components: Record<string, unknown>) => void }) => void;
  };
  const names = new Set<string>();
  typography.handler({
    addComponents: (components) => {
      for (const selector of Object.keys(components)) names.add(selector.replace(/^\./, ''));
    },
  });
  return names;
})();

describe('every ds-* class used in the product is one the plugin emits', () => {
  /**
   * The defect this prevents is silent. A `ds-*` class that does not exist
   * compiles to nothing — no warning, no error, no failing test — and the
   * element simply inherits whatever it would have had anyway. It is only
   * visible as "that text looks a bit off".
   *
   * It happened three times in one file: `UbCombobox` carried `ds-body-base` on
   * its trigger, its search field and its option rows. That is BrandHub's name
   * (`ds-body-base-regular`), and reading their code while porting is exactly
   * how it got here. All three did nothing, so the closed trigger rendered at
   * 15px body while the open list kept ml-uikit's 14px — a one-pixel step
   * between a control and its own menu.
   */
  /**
   * Comments are stripped first. Without that, the prose that documents a tier
   * family — "wears `ds-metric-*`", "registered as `ds-wordmark-*`" — matched as
   * `ds-metric` and `ds-wordmark`, neither of which the plugin emits, and the
   * guard failed on two files whose code was entirely correct. A guard that
   * cries wolf over a docstring is one somebody deletes.
   */
  const stripComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

  const used = new Map<string, string>();
  for (const file of sourceFiles) {
    for (const match of stripComments(readFileSync(file, 'utf8')).matchAll(
      /\b(ds-[a-z0-9-]+)\b/g
    )) {
      const tier = match[1] as string;
      if (!used.has(tier)) used.set(tier, file.slice(ROOT.length + 1));
    }
  }

  it.each([...used.entries()])('%s (%s) is emitted by the plugin', (tier, file) => {
    expect({ tier, file, emitted: emittedTiers.has(tier) }).toEqual({
      tier,
      file,
      emitted: true,
    });
  });
});

describe('the vendored ml-uikit bundle carries no absolute colour', () => {
  /**
   * ml-uikit ships compiled with BrandHub's palette baked into its class
   * strings, and `tailwind.config.js` puts the bundle in `content` — so those
   * classes compile and win over the token classes the `Ub*` wrappers add.
   *
   * Two things shipped because of it: the tick beside a selected option rendered
   * BrandHub's brand green — another company's colour, in this product — and
   * DARK THEME WAS UNREADABLE, because every menu kept `text-[#111111]` and
   * `border-[#e6e6e6]` on a dark surface.
   *
   * `scripts/retone-ml-uikit.mjs` rewrote all 650 of them to tokens. This is
   * what makes that permanent: an ml-uikit upgrade that reintroduces a literal
   * fails here, not on a merchant's screen, and the fix is to re-run the script.
   */
  const vendorSource = walk(join(ROOT, 'vendor/ml-uikit/dist'))
    .filter((file) => /\.(js|cjs|mjs)$/.test(file))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');

  it('uses no hex literal in a colour utility', () => {
    const found = [
      ...new Set(
        [
          ...vendorSource.matchAll(/(?:bg|text|border|ring|fill|stroke)-\[(#[0-9a-fA-F]{6})\]/g),
        ].map((match) => (match[1] as string).toLowerCase())
      ),
    ].sort();
    expect(found).toEqual([]);
  });

  it('uses no absolute white or black, except the scrims', () => {
    // `bg-black/80` is ml-uikit's dialog and drawer overlay. A scrim IS black in
    // both themes — what is behind it is the page, not a surface — so it is the
    // one absolute colour that belongs here.
    const found = [
      ...new Set(
        [...vendorSource.matchAll(/\b(?:bg|text|border)-(?:white|black)\b(?![/-])/g)].map(
          (match) => match[0] as string
        )
      ),
    ].sort();
    expect(found).toEqual([]);
  });
});

/**
 * The skeleton table and the real table are two components painting one table,
 * and the whole reason that is worth doing — no layout shift when the rows
 * land — holds only while their geometry is identical. `tableChrome.ts` exists
 * so that geometry is written once.
 *
 * A rendering test cannot catch this. Both files would still render, the
 * columns would just be 4 px apart, and the only symptom is a flinch at the
 * moment the reader starts reading.
 */
describe('the data grid paints one table, not two', () => {
  const chrome = ['GRID_TABLE', 'GRID_THEAD', 'GRID_HEAD_ROW', 'GRID_TH', 'GRID_SELECT_CELL'];

  it.each([['UbDataGridTable.tsx'], ['UbDataGridStateTable.tsx']])(
    '%s takes its chrome from tableChrome.ts',
    (file) => {
      const source = readFileSync(join(ROOT, 'src/design-system/UbDataGrid', file), 'utf8');
      for (const constant of chrome) expect(source).toContain(constant);
    }
  );

  it.each([['UbDataGridTable.tsx'], ['UbDataGridStateTable.tsx']])(
    '%s spells no cell padding or row height of its own',
    (file) => {
      const source = readFileSync(join(ROOT, 'src/design-system/UbDataGrid', file), 'utf8');
      // The literals that decide where a column edge lands. Finding one here
      // means someone re-typed the chrome instead of importing it, and the two
      // tables have started to diverge.
      const strays = ['h-12 select-none', 'border-collapse', "'h-14"];
      for (const stray of strays) expect(source).not.toContain(stray);
    }
  );
});
