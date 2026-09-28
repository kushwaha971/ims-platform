import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UbStatCard } from './UbStatCard';

describe('UbStatCard — the form most of a ledger dashboard takes', () => {
  it('shows the label beside the figure, so colour is never the only signal', () => {
    render(<UbStatCard label="Overdue" value="₹31,000.00" tone="danger" />);
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    const value = screen.getByText('₹31,000.00');
    expect(value.className).toContain('text-error');
  });

  /**
   * Sprint 12 a11y sweep: the danger and warning tiles painted their TEXT in the
   * `-bright` fill steps — #E73F3F (4.05:1) and #E49614 (2.39:1) on white — so
   * "To collect" on the dashboard and "Low or out" on items failed WCAG 1.4.3.
   * Text takes the 4.5:1 step; only the icon may stay bright.
   */
  it.each([
    ['danger', 'text-error'],
    ['warning', 'text-warning'],
  ] as const)(
    'paints %s label and figure at text contrast, never in a -bright fill',
    (tone, cls) => {
      render(<UbStatCard label="To collect" value="₹1,807.00" tone={tone} />);
      for (const el of [screen.getByText('To collect'), screen.getByText('₹1,807.00')]) {
        expect(el).toHaveClass(cls);
        expect(el.className).not.toMatch(/-bright\b/);
      }
    }
  );

  it('paints a plain figure in the text tone, not in a semantic one', () => {
    render(<UbStatCard label="Cash in hand" value="₹8,420.00" />);
    expect(screen.getByText('₹8,420.00').className).toContain('text-text-primary');
  });

  it('takes the direction of a delta from the caller, because up is not always good', () => {
    const { rerender } = render(
      <UbStatCard
        label="Overdue"
        value="₹31,000.00"
        delta={{ value: '+12%', direction: 'up', baseline: 'vs last month', tone: 'bad' }}
      />
    );
    expect(screen.getByText('+12%').className).toContain('text-error');
    expect(screen.getByText('vs last month')).toBeInTheDocument();

    rerender(
      <UbStatCard
        label="Collections"
        value="₹31,000.00"
        delta={{ value: '+12%', direction: 'up', baseline: 'vs last month', tone: 'good' }}
      />
    );
    expect(screen.getByText('+12%').className).toContain('text-success');
  });

  it('becomes a real button — with a 44 px target — only when it acts', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    const { rerender } = render(<UbStatCard label="To collect" value="₹1,02,300.00" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(<UbStatCard label="To collect" value="₹1,02,300.00" onClick={onClick} />);
    const button = screen.getByRole('button', { name: /To collect/ });
    expect(button.className).toContain('min-h-[44px]');
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('the BrandHub slots', () => {
  it('puts the scope on the value, where the figure is read', () => {
    render(
      <UbStatCard
        icon={<svg data-testid="glyph" />}
        label="To collect"
        value="₹36,018.00"
        subtext="across all 30 customers"
      />
    );

    // A figure without its scope is a figure nobody can act on: ₹36,018 means
    // one thing across the whole book and another across this page of 25.
    expect(screen.getByText('across all 30 customers')).toBeInTheDocument();
    expect(screen.getByText('₹36,018.00')).toBeInTheDocument();
  });

  it('hides the glyph from a screen reader — the label carries the meaning', () => {
    const { container } = render(
      <UbStatCard icon={<svg data-testid="glyph" />} label="To pay" value="₹293.00" />
    );

    const glyph = container.querySelector('[aria-hidden="true"]');
    expect(glyph).not.toBeNull();
    expect(glyph?.querySelector('svg')).not.toBeNull();
  });
});
