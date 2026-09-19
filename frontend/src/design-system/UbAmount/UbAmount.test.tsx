import { render, screen } from '@testing-library/react';

import { UbAmount } from './UbAmount';

/**
 * Part 23 §23.2.6 / Part 25 R-C-2 — the four assertions that are the CONTRACT
 * rather than taste. Each one is a bug that has shipped in a ledger product
 * before, which is why they are pinned here rather than left to review.
 */
describe('UbAmount', () => {
  it('renders the U+2212 minus BEFORE the ₹ inside one non-wrapping element', () => {
    const { container } = render(
      <UbAmount value="500.00" tone="receivable" sign="minus" label="You gave" />
    );
    const figure = container.querySelector('[aria-hidden="true"]');
    expect(figure).not.toBeNull();
    expect(figure?.textContent).toBe('−₹500.00');
    // Never a hyphen, and never ₹−500.00 or (₹500.00).
    expect(figure?.textContent).not.toContain('-');
    expect(figure?.className).toContain('whitespace-nowrap');
  });

  it('forces a zero to neutral tone and no sign', () => {
    const { container } = render(
      <UbAmount value="0.00" tone="receivable" sign="minus" label="Settled" />
    );
    const figure = container.querySelector('[aria-hidden="true"]');
    expect(figure?.textContent).toBe('₹0.00');
    expect(figure?.className).toContain('text-text-primary');
    expect(figure?.className).not.toContain('text-error');
  });

  it('hides the visible figure from assistive tech and names it "{label}, {formatted}"', () => {
    render(<UbAmount value="500.00" tone="receivable" sign="minus" label="You gave" />);
    // The sign word is never spoken: the label already states the direction.
    expect(screen.getByText('You gave, ₹500.00')).toBeInTheDocument();
    expect(screen.queryByText('minus')).not.toBeInTheDocument();
  });

  it('pins lang="en-IN" and dir="ltr" so a Devanagari sentence cannot reorder it', () => {
    const { container } = render(
      <UbAmount value="123456.50" tone="payable" sign="plus" label="उधार मिला" />
    );
    const figure = container.querySelector('[aria-hidden="true"]');
    expect(figure?.getAttribute('lang')).toBe('en-IN');
    expect(figure?.getAttribute('dir')).toBe('ltr');
    // Indian grouping (2,2,3) and Latin numerals in both locales.
    expect(figure?.textContent).toBe('+₹1,23,456.50');
  });

  it('renders a balance unsigned and an absent value as a neutral dash', () => {
    const { container, rerender } = render(
      <UbAmount value="2800.00" tone="receivable" label="You will get" />
    );
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('₹2,800.00');

    rerender(<UbAmount value={null} />);
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('—');
  });

  it('keeps the label out of the layout but in the accessible name when hidden', () => {
    render(<UbAmount value="10.00" tone="payable" sign="plus" label="You got" labelHidden />);
    expect(screen.getByText('You got, ₹10.00')).toBeInTheDocument();
    expect(screen.queryByText('You got')).not.toBeInTheDocument();
  });
});
