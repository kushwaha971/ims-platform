/**
 * **No horizontal scroll on a primary list, at any width.**
 *
 * A row you have to drag sideways to read is a row you cannot scan, and
 * scanning is the whole job the parties list exists to do. The rule is approved
 * design, so it is a test rather than a comment — and it lives here, beside the
 * component, because `/items`, `/sales/invoices` and `/payments` inherit the
 * same guarantee and should inherit the same guard rather than re-invent it.
 *
 * jsdom has no layout, so "does this overflow" cannot be measured. What CAN be
 * checked, and is what actually regresses, is the markup that PERMITS or FORCES
 * it: a scroll container that was opened up, or a width floor that makes the
 * content wider than its box. Both are the things a well-meaning fix reaches
 * for when a column will not fit.
 *
 * The one legitimate exception — an accountant's report at `lg` and up — opts
 * in explicitly, and announces itself with `data-ub-scroll-x="on"`, so this
 * function finds it and a report's own test can allow it by name.
 */

/** Classes that open a horizontal scroll container. */
const SCROLLING_CLASSES = [
  'overflow-x-auto',
  'overflow-x-scroll',
  'overflow-auto',
  'overflow-scroll',
];

/** Classes that force content wider than its box, which is the other half. */
const INTRINSIC_WIDTH_CLASSES = ['w-max', 'w-screen', 'min-w-max', 'min-w-screen'];

/**
 * A `min-width` floor only matters when it is big enough to push a row past the
 * viewport. `UbAmount`'s `min-w-[0.6em]` reserves one sign glyph so a column of
 * figures keeps a single decimal column, and flagging that would teach the next
 * author to distrust the guard. Anything from 200 px up is a real floor and is
 * reported.
 */
const FLOOR_LIMIT_PX = 200;
const UNIT_PX: Readonly<Record<string, number>> = { px: 1, rem: 16, em: 16, ch: 8, vw: 4 };

const floorPx = (value: string): number => {
  const match = /^([\d.]+)(px|rem|em|ch|vw)$/.exec(value.trim());
  if (!match) return Number.POSITIVE_INFINITY; // unparseable: report it
  return Number(match[1]) * (UNIT_PX[match[2] ?? 'px'] ?? 1);
};

export interface HorizontalOverflowFinding {
  readonly reason: string;
  readonly element: Element;
}

export const findHorizontalOverflow = (root: Element): readonly HorizontalOverflowFinding[] => {
  const findings: HorizontalOverflowFinding[] = [];
  const all = [root, ...Array.from(root.querySelectorAll('*'))];

  for (const element of all) {
    if (element.getAttribute('data-ub-scroll-x') === 'on') {
      findings.push({ reason: 'data-ub-scroll-x="on"', element });
    }
    const classes = element.getAttribute('class')?.split(/\s+/) ?? [];
    for (const name of classes) {
      if (SCROLLING_CLASSES.includes(name)) {
        findings.push({ reason: name, element });
      }
      if (INTRINSIC_WIDTH_CLASSES.includes(name)) {
        findings.push({ reason: name, element });
      }
      if (name.startsWith('min-w-[') && name.endsWith(']')) {
        const floor = floorPx(name.slice('min-w-['.length, -1));
        if (floor >= FLOOR_LIMIT_PX) findings.push({ reason: name, element });
      }
    }
  }

  return findings;
};

/** A readable failure: the offending class and the element it sits on. */
export const describeHorizontalOverflow = (
  findings: readonly HorizontalOverflowFinding[]
): readonly string[] =>
  findings.map(
    (finding) =>
      `${finding.element.tagName.toLowerCase()}${
        finding.element.getAttribute('data-testid')
          ? `[data-testid="${finding.element.getAttribute('data-testid')}"]`
          : ''
      } → ${finding.reason}`
  );
