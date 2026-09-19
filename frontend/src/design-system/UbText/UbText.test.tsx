import { render, screen } from '@testing-library/react';

import { UB_TEXT_VARIANT, type UbTextVariant } from 'src/design-system/scale';

import { UbText } from './UbText';

/**
 * Part 23 §23.2.2 / Part 25 R-C-2 — `UbText` is the component every string on
 * every screen now goes through, so its contract is pinned rather than left to
 * review.
 *
 * The one that matters most is polymorphism. The whole justification for
 * banning raw `<h1>` is that the replacement still renders an `<h1>`: if
 * `as="h1"` ever silently produced a `<p>`, this refactor would have traded a
 * style problem for a heading-outline problem, which is worse.
 */
describe('UbText — semantics', () => {
  it('defaults to <p>, which is what body copy is', () => {
    const { container } = render(<UbText>Body copy</UbText>);
    expect(container.firstElementChild?.tagName).toBe('P');
  });

  it('renders a real heading element for every heading level, so the outline survives', () => {
    for (const level of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const) {
      const { container, unmount } = render(
        <UbText as={level} variant="h2">
          Heading
        </UbText>
      );
      expect(container.firstElementChild?.tagName).toBe(level.toUpperCase());
      unmount();
    }
  });

  it('is reachable by heading role, which is how a screen reader builds the outline', () => {
    render(
      <UbText as="h2" variant="h3">
        Plan
      </UbText>
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Plan' })).toBeInTheDocument();
  });

  it('keeps the visual tier independent of the element — ds-h2 on an <h1> is legal', () => {
    const { container } = render(
      <UbText as="h1" variant="h2">
        Page title
      </UbText>
    );
    const el = container.firstElementChild;
    expect(el?.tagName).toBe('H1');
    expect(el?.className).toContain('ds-h2');
    expect(el?.className).not.toContain('ds-h1');
  });

  it('renders a <span> inside a <button>, where a <p> would be invalid HTML', () => {
    const { container } = render(
      <button type="button">
        <UbText as="span">Inside</UbText>
      </button>
    );
    expect(container.querySelector('button > span')).not.toBeNull();
    expect(container.querySelector('button > p')).toBeNull();
  });

  it('forwards element props — dir, lang and data-testid reach the DOM', () => {
    render(
      <UbText variant="mono" dir="ltr" lang="en-IN" data-testid="request-id">
        req_7f3a91
      </UbText>
    );
    const el = screen.getByTestId('request-id');
    expect(el).toHaveAttribute('dir', 'ltr');
    expect(el).toHaveAttribute('lang', 'en-IN');
  });
});

describe('UbText — the ds-* tiers (§23.2.2)', () => {
  it('maps every documented tier to its compound class and nothing else', () => {
    const cases: readonly (readonly [UbTextVariant, string])[] = [
      ['display', 'ds-display'],
      ['h1', 'ds-h1'],
      ['h2', 'ds-h2'],
      ['h3', 'ds-h3'],
      ['h4', 'ds-h4'],
      ['body', 'ds-body'],
      ['body-medium', 'ds-body-medium'],
      ['body-sm', 'ds-body-sm'],
      ['body-sm-medium', 'ds-body-sm-medium'],
      ['caption', 'ds-caption'],
      ['label', 'ds-label'],
      ['label-caps', 'ds-label-caps'],
      ['micro', 'ds-micro'],
      ['metric-xl', 'ds-metric-xl'],
      ['metric-lg', 'ds-metric-lg'],
      ['metric-md', 'ds-metric-md'],
      ['metric-sm', 'ds-metric-sm'],
      ['num', 'ds-num'],
      ['mono', 'ds-mono'],
    ];

    for (const [variant, expected] of cases) {
      const { container, unmount } = render(<UbText variant={variant}>x</UbText>);
      expect(container.firstElementChild?.className.split(' ')).toContain(expected);
      unmount();
    }

    // Every tier in the union is covered above — a new one cannot be added
    // without a row here saying which class it means.
    expect(cases.length + 1).toBe(Object.keys(UB_TEXT_VARIANT).length); // +1 for 'inherit'
  });

  it('`label` is the DEFAULT label tier, so a translated label is never uppercased', () => {
    const { container } = render(
      <UbText as="dt" variant="label" tone="tertiary">
        बकाया
      </UbText>
    );
    const className = container.firstElementChild?.className ?? '';
    expect(className).toContain('ds-label');
    // `ds-label-caps` is Latin-only (§23.2.2) and must never be the default.
    expect(className).not.toContain('ds-label-caps');
  });

  it('`inherit` adds no tier, for text inside a component that sets its own', () => {
    const { container } = render(<UbText variant="inherit">Menu row</UbText>);
    expect(container.firstElementChild?.className).not.toContain('ds-');
  });
});

describe('UbText — tone, alignment and truncation', () => {
  it('paints tone from a token class, never a hex (R-S-2)', () => {
    const { container } = render(<UbText tone="tertiary">Muted</UbText>);
    expect(container.firstElementChild?.className).toContain('text-text-tertiary');
  });

  it('keeps the ledger red and the validation red apart', () => {
    const { container: ledger } = render(<UbText tone="error">debit</UbText>);
    const { container: form } = render(<UbText tone="formError">invalid</UbText>);
    expect(ledger.firstElementChild?.className).toContain('text-error');
    expect(form.firstElementChild?.className).toContain('text-formError');
  });

  it('applies align and truncate as classes', () => {
    const { container } = render(
      <UbText align="center" truncate>
        x
      </UbText>
    );
    const className = container.firstElementChild?.className ?? '';
    expect(className).toContain('text-center');
    expect(className).toContain('truncate');
  });

  it('merges className last, so a call site can still override (R-S-8)', () => {
    const { container } = render(
      <UbText tone="primary" className="text-text-muted">
        x
      </UbText>
    );
    const className = container.firstElementChild?.className ?? '';
    // tailwind-merge resolves the conflict in favour of the caller's class.
    expect(className).toContain('text-text-muted');
    expect(className).not.toContain('text-text-primary');
  });
});
