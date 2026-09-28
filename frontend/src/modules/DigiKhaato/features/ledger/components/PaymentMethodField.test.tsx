import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { choiceFor, pairFor, PaymentMethodField } from './PaymentMethodField';

/**
 * The flattened chip row writes TWO server fields. What these prevent is the
 * two drifting apart: a PhonePe chip that saves as bare UPI, a Cash choice
 * that carries last week's app along, or a stored "UPI · BHIM" that shows with
 * no chip lit.
 */
const t = ((id: string) => id) as never;

describe('the chip ↔ field mapping', () => {
  it('shows a featured app as its own chip', () => {
    expect(choiceFor('upi', 'phonepe')).toBe('upi:phonepe');
  });

  it('shows any other app, or none, under Other UPI', () => {
    expect(choiceFor('upi', 'bhim')).toBe('upi');
    expect(choiceFor('upi', '')).toBe('upi');
  });

  it('writes UPI plus the app for a featured chip', () => {
    expect(pairFor('upi:gpay', '')).toEqual({ mode: 'upi', app: 'gpay' });
  });

  it('clears the app for a non-UPI mode', () => {
    expect(pairFor('cash', 'phonepe')).toEqual({ mode: 'cash', app: '' });
  });

  it('keeps a non-featured app when Other UPI is re-chosen, and drops a featured one', () => {
    expect(pairFor('upi', 'bhim')).toEqual({ mode: 'upi', app: 'bhim' });
    expect(pairFor('upi', 'phonepe')).toEqual({ mode: 'upi', app: '' });
  });
});

describe('PaymentMethodField', () => {
  it('offers the featured apps beside cash, one tap each', async () => {
    const onChange = jest.fn();
    render(<PaymentMethodField id="m" mode="cash" app="" onChange={onChange} t={t} />);

    expect(screen.getByRole('radio', { name: 'ledger.mode.cash' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await userEvent.click(screen.getByRole('radio', { name: 'ledger.upiApp.phonepe' }));

    expect(onChange).toHaveBeenCalledWith('upi', 'phonepe');
  });

  it('asks which app only under Other UPI', () => {
    const { rerender } = render(
      <PaymentMethodField id="m" mode="upi" app="phonepe" onChange={jest.fn()} t={t} />
    );
    expect(screen.queryByLabelText('ledger.entry.upiApp')).not.toBeInTheDocument();

    rerender(<PaymentMethodField id="m" mode="upi" app="" onChange={jest.fn()} t={t} />);
    expect(screen.getByLabelText('ledger.entry.upiApp')).toBeInTheDocument();
  });
});
