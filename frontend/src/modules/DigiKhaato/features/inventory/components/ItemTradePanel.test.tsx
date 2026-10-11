import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from 'src/tests/renderWithProviders';

import { ItemTradePanel } from './ItemTradePanel';

import type { ItemTrade } from '../api/itemTradeService';

/**
 * The item page's Sales and Purchases tabs (Shop gap §1.4). These pin that the
 * party rows and the latest bills say what the server sent, that margin is
 * drawn only when the server sent it (never a ₹0.00 for a reader who may not
 * see costs), that a sale with no cost says so instead of claiming a margin,
 * and that changing the period asks the server again with a `from` date.
 */
jest.mock('../api/itemTradeService', () => ({
  ...jest.requireActual('../api/itemTradeService'),
  getItemTrade: jest.fn(),
}));
const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/items/i1',
  useSearchParams: () => new URLSearchParams(),
}));

const service = jest.requireMock('../api/itemTradeService') as { getItemTrade: jest.Mock };

const sales: ItemTrade = {
  side: 'sales',
  byParty: [
    {
      party: { id: 'p1', name: 'Suresh Traders' },
      qty: '20.000',
      amount: '1000.00',
      avgRate: '50.00',
      documents: 2,
      lastDate: '2026-10-06',
      margin: '200.00',
    },
    {
      party: null,
      qty: '1.000',
      amount: '100.00',
      avgRate: '100.00',
      documents: 1,
      lastDate: '2026-10-05',
      margin: '-5.00',
    },
  ],
  lines: [
    {
      document: { id: 'd1', kind: 'invoice', number: 'INV/1', date: '2026-10-06' },
      party: { id: 'p1', name: 'Suresh Traders' },
      walkInName: null,
      qty: '20.000',
      rate: '50.00',
      amount: '1000.00',
      margin: null,
    },
  ],
  totals: {
    qty: '21.000',
    amount: '1100.00',
    avgRate: '52.38',
    margin: '195.00',
    marginPct: '17.7',
    uncostedLines: 1,
  },
};

beforeEach(() => {
  service.getItemTrade.mockReset();
  push.mockReset();
});

test('sales by customer with margins, walk-ins together, and an uncosted sale named', async () => {
  service.getItemTrade.mockResolvedValue(sales);
  renderWithProviders(<ItemTradePanel itemId="i1" side="sales" unitCode="BAG" />);

  const rows = await screen.findAllByTestId('item-trade-party');
  expect(rows).toHaveLength(2);
  const [first, second] = rows as [HTMLElement, HTMLElement];
  expect(within(first).getByText('Suresh Traders')).toBeInTheDocument();
  expect(within(first).getByText(/Margin ₹200/)).toBeInTheDocument();
  expect(within(second).getByText('Walk-in customers')).toBeInTheDocument();
  expect(screen.getByTestId('item-trade-totals')).toHaveTextContent('(17.7%)');
  expect(screen.getByText(/1 sale has no purchase price/)).toBeInTheDocument();
  const line = screen.getByTestId('item-trade-line');
  expect(within(line).getByText('No cost price')).toBeInTheDocument();

  await userEvent.click(within(line).getByText('Suresh Traders'));
  expect(push).toHaveBeenCalledWith('/sales/invoices/d1');
  expect(service.getItemTrade).toHaveBeenCalledWith('i1', 'sales', null, expect.anything());
});

test('without the cost permission no margin is drawn at all', async () => {
  const { margin: _m, marginPct: _p, uncostedLines: _u, ...totals } = sales.totals;
  service.getItemTrade.mockResolvedValue({
    ...sales,
    byParty: sales.byParty.map(({ margin: _x, ...row }) => row),
    lines: sales.lines.map(({ margin: _x, ...line }) => line),
    totals,
  });
  renderWithProviders(<ItemTradePanel itemId="i1" side="sales" unitCode="BAG" />);
  await screen.findAllByTestId('item-trade-party');
  expect(screen.queryByText(/Margin/i)).toBeNull();
  expect(screen.queryByText('No cost price')).toBeNull();
});

test('an item never bought says so; a period asks again from a date', async () => {
  service.getItemTrade.mockResolvedValue({
    side: 'purchases',
    byParty: [],
    lines: [],
    totals: { qty: '0.000', amount: '0.00', avgRate: null },
  });
  renderWithProviders(<ItemTradePanel itemId="i1" side="purchases" unitCode="BAG" />);
  expect(await screen.findByText('Not bought yet')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /Period/ }));
  await userEvent.click(await screen.findByRole('option', { name: 'Last 30 days' }));
  await waitFor(() =>
    expect(service.getItemTrade).toHaveBeenLastCalledWith(
      'i1',
      'purchases',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      expect.anything()
    )
  );
});

test('a failed read offers a retry', async () => {
  service.getItemTrade.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(sales);
  renderWithProviders(<ItemTradePanel itemId="i1" side="sales" unitCode="BAG" />);
  await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  expect(await screen.findAllByTestId('item-trade-party')).toHaveLength(2);
});
