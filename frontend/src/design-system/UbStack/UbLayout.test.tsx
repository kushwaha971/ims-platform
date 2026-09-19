import { render, screen } from '@testing-library/react';

import { UbBox } from 'src/design-system/UbBox';
import { UbDivider } from 'src/design-system/UbDivider';
import { UbGrid } from 'src/design-system/UbGrid';
import { UbSpacer } from 'src/design-system/UbSpacer';

import { UbStack } from './UbStack';

/**
 * Part 23 §23.3 / Part 25 R-C-2 — the layout primitives' contract.
 *
 * Two things are pinned here and neither is cosmetic:
 *
 *  1. **Polymorphism keeps semantics.** `<UbStack as="ul">` has to produce a
 *     real `<ul>` of real `<li>`s, or the party list and the tenant chooser
 *     stop being lists to a screen reader the moment they stop being `<div>`s
 *     — which would make this whole refactor an accessibility regression.
 *  2. **Spacing is a literal class.** Tailwind reads source text, so a scale
 *     built with `gap-${n}` compiles to no CSS at all and every gap silently
 *     becomes zero. The maps in `scale.ts` are the fix, and these assertions
 *     are what stops someone "simplifying" them back into a template string.
 */
describe('UbStack', () => {
  it('is a flex column by default — the mobile-first direction (R-S-6)', () => {
    const { container } = render(<UbStack>x</UbStack>);
    const className = container.firstElementChild?.className ?? '';
    expect(container.firstElementChild?.tagName).toBe('DIV');
    expect(className).toContain('flex');
    expect(className).toContain('flex-col');
  });

  it('emits a literal gap class for every step of the scale', () => {
    const cases = [
      [0, 'gap-0'],
      [0.5, 'gap-0.5'],
      [1, 'gap-1'],
      [1.5, 'gap-1.5'],
      [2, 'gap-2'],
      [2.5, 'gap-2.5'],
      [3, 'gap-3'],
      [4, 'gap-4'],
      [5, 'gap-5'],
      [6, 'gap-6'],
      [8, 'gap-8'],
      [10, 'gap-10'],
    ] as const;

    for (const [gap, expected] of cases) {
      const { container, unmount } = render(<UbStack gap={gap}>x</UbStack>);
      expect(container.firstElementChild?.className.split(' ')).toContain(expected);
      unmount();
    }
  });

  it('maps direction, align, justify and wrap to their flex classes', () => {
    const { container } = render(
      <UbStack direction="row" align="baseline" justify="between" wrap>
        x
      </UbStack>
    );
    const className = container.firstElementChild?.className ?? '';
    expect(className).toContain('flex-row');
    expect(className).toContain('items-baseline');
    expect(className).toContain('justify-between');
    expect(className).toContain('flex-wrap');
  });

  it('renders a real list when asked for one, and its rows are real list items', () => {
    render(
      <UbStack as="ul" gap={2}>
        <UbStack as="li">Sharma General Store</UbStack>
        <UbBox as="li">Verma Traders</UbBox>
      </UbStack>
    );
    const list = screen.getByRole('list');
    expect(list.tagName).toBe('UL');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('keeps landmarks as landmarks', () => {
    render(
      <UbStack as="main">
        <UbBox as="nav" aria-label="Primary">
          x
        </UbBox>
      </UbStack>
    );
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
  });

  it('leaves className as the escape hatch for responsive modifiers', () => {
    const { container } = render(
      <UbStack gap={6} className="md:flex-row md:gap-10">
        x
      </UbStack>
    );
    const className = container.firstElementChild?.className ?? '';
    // A breakpoint variant does not conflict with the base class, so both survive.
    expect(className).toContain('flex-col');
    expect(className).toContain('md:flex-row');
    expect(className).toContain('gap-6');
    expect(className).toContain('md:gap-10');
  });
});

describe('UbBox', () => {
  it('is a <div> by default and anything else on request', () => {
    const { container: plain } = render(<UbBox>x</UbBox>);
    expect(plain.firstElementChild?.tagName).toBe('DIV');

    const { container: dl } = render(<UbBox as="dl">x</UbBox>);
    expect(dl.firstElementChild?.tagName).toBe('DL');
  });

  it('forwards the element own props, type-checked against that element', () => {
    render(
      <UbBox as="section" aria-label="Summary" data-testid="summary">
        x
      </UbBox>
    );
    const el = screen.getByTestId('summary');
    expect(el.tagName).toBe('SECTION');
    expect(el).toHaveAttribute('aria-label', 'Summary');
  });
});

describe('UbGrid', () => {
  it('takes a plain column count', () => {
    const { container } = render(<UbGrid columns={3}>x</UbGrid>);
    const className = container.firstElementChild?.className ?? '';
    expect(className).toContain('grid');
    expect(className).toContain('grid-cols-3');
  });

  it('takes a per-breakpoint count, so responsive layout stays out of className', () => {
    const { container } = render(
      <UbGrid columns={{ base: 1, sm: 2, md: 4 }} gap={3}>
        x
      </UbGrid>
    );
    const className = container.firstElementChild?.className ?? '';
    expect(className).toContain('grid-cols-1');
    expect(className).toContain('sm:grid-cols-2');
    expect(className).toContain('md:grid-cols-4');
    expect(className).toContain('gap-3');
  });

  it('can be a description list, which is what a label/value grid is', () => {
    const { container } = render(
      <UbGrid as="dl" columns={{ base: 1, sm: 2 }}>
        x
      </UbGrid>
    );
    expect(container.firstElementChild?.tagName).toBe('DL');
  });
});

describe('UbDivider and UbSpacer', () => {
  it('renders a horizontal rule, which is already a separator to assistive tech', () => {
    const { container } = render(<UbDivider />);
    expect(container.firstElementChild?.tagName).toBe('HR');
  });

  it('announces a vertical rule as a separator with an orientation', () => {
    render(<UbDivider orientation="vertical" />);
    const rule = screen.getByRole('separator');
    expect(rule).toHaveAttribute('aria-orientation', 'vertical');
  });

  it('hides a decorative rule from assistive technology', () => {
    const { container } = render(<UbDivider orientation="vertical" decorative />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstElementChild).not.toHaveAttribute('role');
  });

  it('a spacer is always furniture — hidden, and sized off the same scale', () => {
    const { container } = render(<UbSpacer size={6} />);
    const el = container.firstElementChild;
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el?.className.split(' ')).toContain('h-6');

    const { container: horizontal } = render(<UbSpacer size={2} axis="horizontal" />);
    expect(horizontal.firstElementChild?.className.split(' ')).toContain('w-2');
  });
});
