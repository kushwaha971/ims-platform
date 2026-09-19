/**
 * A guard that cannot fail is not a guard. These cases assert that the rule's
 * detector actually catches the three shapes a sideways-scrolling list takes,
 * and that it leaves alone the one shape that looks like them and is not.
 */
import { describeHorizontalOverflow, findHorizontalOverflow } from './noHorizontalOverflow';

const dom = (html: string): Element => {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host;
};

describe('findHorizontalOverflow', () => {
  it('catches an opened scroll container', () => {
    const findings = findHorizontalOverflow(dom('<div class="w-full overflow-x-auto"></div>'));
    expect(describeHorizontalOverflow(findings)).toEqual(['div → overflow-x-auto']);
  });

  it('catches a declared opt-in, wherever it is', () => {
    const findings = findHorizontalOverflow(dom('<table data-ub-scroll-x="on"></table>'));
    expect(describeHorizontalOverflow(findings)).toEqual(['table → data-ub-scroll-x="on"']);
  });

  it('catches a width floor wide enough to push a row past a 360 px phone', () => {
    const findings = findHorizontalOverflow(dom('<table class="min-w-[720px]"></table>'));
    expect(describeHorizontalOverflow(findings)).toEqual(['table → min-w-[720px]']);
  });

  it('catches intrinsic widths, which are the same mistake spelled differently', () => {
    expect(
      describeHorizontalOverflow(findHorizontalOverflow(dom('<div class="w-max"></div>')))
    ).toEqual(['div → w-max']);
  });

  it("leaves alone a glyph-sized floor — UbAmount's sign slot is not an overflow", () => {
    const findings = findHorizontalOverflow(dom('<span class="min-w-[0.6em]"></span>'));
    expect(describeHorizontalOverflow(findings)).toEqual([]);
  });
});
