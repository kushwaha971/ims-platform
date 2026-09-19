import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

import { render } from '@testing-library/react';

import { UbAgingBars } from './UbAgingBars';
import { UbRankedBars } from './UbRankedBars';
import { UbTrendArea } from './UbTrendArea';

import * as charts from './index';

/**
 * **The ban, mechanically enforced.**
 *
 * Pies, donuts, gauges and dual-axis charts are banned product-wide. A policy
 * written in a chapter lasts until the first person who has not read it; this
 * suite fails the build instead.
 *
 * It checks the ban three ways, because each one alone has a hole:
 *
 *  1. **Source scan** (comments stripped, so the prose that EXPLAINS the ban
 *     does not trip it). Catches an author who reaches for one by name.
 *  2. **Rendered geometry.** A pie, a donut and a gauge are all elliptical
 *     arcs; nothing in the three approved forms is. So: no `A`/`a` command in
 *     any rendered path, and no dash-array arc, which is how a gauge is drawn
 *     when somebody avoids the arc command.
 *  3. **The exported registry.** The folder exports three chart forms. A
 *     fourth is a decision, not a commit.
 */

const CHARTS_DIR = __dirname;

/** Banned by name. Each entry is matched against code with comments removed. */
const BANNED_FORM_PATTERNS: readonly (readonly [string, RegExp])[] = [
  ['pie chart', /\bpie\b/i],
  ['donut chart', /\bdonuts?\b|\bdoughnuts?\b/i],
  ['gauge', /\bgauge\b/i],
  ['dual axis', /dual[-_\s]?axis/i],
  ['second y scale', /(secondary|right|twin|second)[-_\s]?(y[-_\s]?)?axis/i],
  /* Not `\by2\b`: that is an SVG line endpoint, which every gridline has. A
     second SCALE has to be named, and these are the names it gets. */
  ['second y scale, by name', /\b(yAxisRight|rightYAxis|axisRight|secondScale|scale2|yScale2)\b/],
];

/** Comments are documentation, not code; the ban is about what is BUILT. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const sourceFiles = (dir: string): readonly string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!['.ts', '.tsx'].includes(extname(entry))) return [];
    if (/\.test\.tsx?$/.test(entry)) return [];
    return [full];
  });

describe('banned chart forms never enter the design system', () => {
  it.each(BANNED_FORM_PATTERNS)('no file builds a %s', (_name, pattern) => {
    const offenders = sourceFiles(CHARTS_DIR).filter((file) =>
      pattern.test(stripComments(readFileSync(file, 'utf8')))
    );
    expect(offenders).toEqual([]);
  });

  it('scans a non-trivial number of files — an empty walk would pass vacuously', () => {
    expect(sourceFiles(CHARTS_DIR).length).toBeGreaterThan(10);
  });

  it('exports exactly the three approved chart forms', () => {
    const forms = Object.keys(charts)
      .filter((name) => name.startsWith('Ub'))
      .filter((name) => /Bars$|Area$/.test(name))
      .sort();
    expect(forms).toEqual(['UbAgingBars', 'UbRankedBars', 'UbTrendArea']);
  });
});

const BUCKETS = [
  { key: '0_30', label: '0–30 days', amount: '42000.00' },
  { key: '31_60', label: '31–60 days', amount: '18500.00' },
  { key: '61_90', label: '61–90 days', amount: '9250.00' },
  { key: '90_plus', label: '90+ days', amount: '31000.00' },
];

const POINTS = [
  { date: '2026-09-01', amount: '12000.00' },
  { date: '2026-09-08', amount: '18500.00' },
  { date: '2026-09-15', amount: '9400.00' },
];

const PARTIES = [
  { id: 'p1', name: 'Rajesh Traders', amount: '84200.00' },
  { id: 'p2', name: 'Shree Balaji Kirana Stores', amount: '51300.00' },
];

const CHART_CASES = [
  ['UbAgingBars', <UbAgingBars key="a" buckets={BUCKETS} labelledBy="t" describedBy="d" />],
  ['UbTrendArea', <UbTrendArea key="t" points={POINTS} labelledBy="t" describedBy="d" />],
  ['UbRankedBars', <UbRankedBars key="r" parties={PARTIES} labelledBy="t" describedBy="d" />],
] as const;

describe('rendered geometry cannot be a pie, a donut or a gauge', () => {
  it.each(CHART_CASES)('%s draws no elliptical arc', (_name, element) => {
    const { container } = render(element);
    const paths = Array.from(container.querySelectorAll('path'));
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(path.getAttribute('d') ?? '').not.toMatch(/[Aa]\s*-?[\d.]/);
    }
  });

  it.each(CHART_CASES)(
    '%s draws no dash-array arc (the other way to fake a gauge)',
    (_name, element) => {
      const { container } = render(element);
      for (const shape of Array.from(container.querySelectorAll('path, circle, ellipse'))) {
        expect(shape.getAttribute('stroke-dasharray')).toBeNull();
      }
    }
  );

  it.each(CHART_CASES)('%s gives every drawn shape an explicit fill', (_name, element) => {
    const { container } = render(element);
    for (const shape of Array.from(container.querySelectorAll('path, circle, rect'))) {
      const hasFillAttribute = shape.getAttribute('fill') !== null;
      const hasFillClass = /(^|\s|:)fill-/.test(shape.getAttribute('class') ?? '');
      expect(hasFillAttribute || hasFillClass).toBe(true);
    }
  });

  it('plots the trend on ONE y scale — a single axis-tick group, no second scale', () => {
    const { container } = render(<UbTrendArea points={POINTS} labelledBy="t" describedBy="d" />);
    const svg = container.querySelector('svg');
    const ticks = Array.from(svg?.querySelectorAll('text') ?? []);
    // Every y tick is anchored to the left gutter; a second scale would need a
    // right-anchored tick column, which would show up as a second x position.
    const yTickXs = new Set(
      ticks
        .filter((node) => node.getAttribute('text-anchor') === 'end')
        .map((node) => node.getAttribute('x'))
    );
    // Two: the y gutter, and the single endpoint direct label / last date tick.
    expect(yTickXs.size).toBeLessThanOrEqual(2);
  });
});
