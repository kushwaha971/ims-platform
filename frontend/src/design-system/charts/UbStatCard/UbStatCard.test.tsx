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
