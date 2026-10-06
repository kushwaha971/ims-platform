import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from 'src/tests/renderWithProviders';

import { InvoiceProfitCard } from './InvoiceProfitCard';

/**
 * docs/platform/15 §1.4 item 1 — bill-wise profit on the bill. A line with no
 * known cost is shown as such, never folded in as pure profit.
 */
jest.mock('../api/profitService', () => ({ getInvoiceProfit: jest.fn() }));
const service = jest.requireMock('../api/profitService') as { getInvoiceProfit: jest.Mock };

const PROFIT = {
  lines: [
    {
      lineNo: 1,
      description: 'Basmati Rice 5kg',
      qty: '2.000',
      returnedQty: '0.000',
      saleValue: '900.00',
      cost: '760.00',
      profit: '140.00',
      marginPct: '15.6',
    },
    {
      lineNo: 2,
      description: 'Fitting charge',
      qty: '1.000',
      returnedQty: '0.000',
      saleValue: '200.00',
      cost: null,
      profit: null,
      marginPct: null,
    },
  ],
  totals: { saleValue: '900.00', cost: '760.00', profit: '140.00', marginPct: '15.6' },
  linesWithoutCost: 1,
};

it('shows sale value, cost and profit with its margin', async () => {
  service.getInvoiceProfit.mockResolvedValue(PROFIT);
  renderWithProviders(<InvoiceProfitCard id="inv1" />);
  expect(await screen.findByText('Profit on this bill')).toBeInTheDocument();
  expect(screen.getByText('₹900.00')).toBeInTheDocument();
  expect(screen.getByText('₹760.00')).toBeInTheDocument();
  expect(screen.getByText('₹140.00 · 15.6%')).toBeInTheDocument();
  expect(screen.getByText(/1 line has no cost recorded/)).toBeInTheDocument();
});

it('lists each line, saying so where no cost was recorded', async () => {
  service.getInvoiceProfit.mockResolvedValue(PROFIT);
  renderWithProviders(<InvoiceProfitCard id="inv1" />);
  await userEvent.click(await screen.findByRole('button', { name: /Profit by line/ }));
  expect(screen.getByText('No cost recorded')).toBeInTheDocument();
});

it('draws nothing when the costs cannot be read', async () => {
  service.getInvoiceProfit.mockRejectedValue(new Error('403'));
  const { container } = renderWithProviders(<InvoiceProfitCard id="inv1" />);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(container).toBeEmptyDOMElement();
});
