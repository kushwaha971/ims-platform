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

  it('renders a NEGATIVE balance unsigned, because the label carries the direction', () => {
    /**
     * §23.2.6 rule 3, and the case the rule exists for. The test above asserts
     * an unsigned balance using a POSITIVE value, which every implementation
     * passes — including the broken one.
     *
     * The defect: the magnitude came from `formatInr(value)`, and `formatInr`
     * signs what it formats. So `sign="none"` rendered an empty sign slot and
     * the minus arrived anyway, inside the number, and a party the merchant
     * owes ₹282.90 read "−₹282.90 · You will give" on the list and on the khata
     * page. Two mechanisms, one silently overruling the other.
     */
    const { container } = render(
      <UbAmount value="-282.90" tone="payable" label="You will give" />
    );

    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('₹282.90');
  });

  it('still says it out loud without a sign word', () => {
    /** Rule 8: "minus two hundred rupees" is not how the number is read in the
     *  shop, and the label has already said which way it goes. */
    render(<UbAmount value="-282.90" tone="payable" label="You will give" />);

    expect(screen.getByText('You will give, ₹282.90')).toBeInTheDocument();
  });

  it('puts the glyph in the slot when a caller genuinely wants a sign', () => {
    /**
     * A ledger delta is signed on purpose, and the fixed slot is what keeps its
     * decimal column aligned with the unsigned rows around it. Fixing the
     * magnitude must not take that away — so a negative value asked to show a
     * minus shows exactly one.
     */
    const { container } = render(
      <UbAmount value="-500.00" tone="payable" sign="minus" label="You gave" />
    );

    const figure = container.querySelector('[aria-hidden="true"]')?.textContent;
    expect(figure).toBe('\u2212₹500.00');
    expect(figure?.match(/[−-]/g)).toHaveLength(1);
  });
});
