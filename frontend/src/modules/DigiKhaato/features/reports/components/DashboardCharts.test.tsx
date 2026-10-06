import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from 'src/tests/renderWithProviders';

import { barsFor, type DashboardCharts as Charts } from '../api/dashboardChartsService';

import { DashboardCharts, groupLabels } from './DashboardCharts';

/**
 * The dashboard's graphs (owner, 6 Oct 2026: sales, profit and purchases "based
 * on day, monthly, week, year, all time"). The server decides which blocks a
 * reader may see; these pin that the screen draws exactly those, that one range
 * and one grouping drive every chart, that the owner picks what to compare, and
 * that a refused or failed read says why instead of leaving a blank.
 */
jest.mock('../api/dashboardChartsService', () => ({
  ...jest.requireActual('../api/dashboardChartsService'),
  getDashboardCharts: jest.fn(),
}));

const service = jest.requireMock('../api/dashboardChartsService') as {
  getDashboardCharts: jest.Mock;
};

const days = [
  '2026-09-30',
  '2026-10-01',
  '2026-10-02',
  '2026-10-03',
  '2026-10-04',
  '2026-10-05',
  '2026-10-06',
];

const full: Charts = {
  range: '7d',
  group: 'day',
  from: '2026-09-30',
  to: '2026-10-06',
  trend: {
    series: ['sales', 'purchases', 'profit', 'expenses'],
    points: days.map((date, i) => ({
      date,
      sales: `${i * 100}.00`,
      purchases: '50.00',
      profit: '-10.00',
      expenses: '5.00',
    })),
    totals: { sales: '2100.00', purchases: '350.00', profit: '-70.00', expenses: '35.00' },
  },
  uncostedLines: 2,
  money: {
    series: ['in', 'out'],
    points: days.map((date) => ({ date, in: '10.00', out: '5.00' })),
    totals: { in: '70.00', out: '35.00' },
  },
  topItems: [{ id: 'i1', name: 'Basmati Rice 5kg', amount: '4500.00', qty: '10.000', unit: 'BAG' }],
  topCustomers: [],
  receivableAging: [
    { key: '0_30', amount: '1000.00' },
    { key: '31_60', amount: '0.00' },
    { key: '61_90', amount: '0.00' },
    { key: '90_plus', amount: '250.00' },
  ],
};

const lastQuery = () => service.getDashboardCharts.mock.calls.at(-1)?.[0];

beforeEach(() => jest.clearAllMocks());

it('opens on the last 7 days, sales against purchases, and draws every block it was sent', async () => {
  service.getDashboardCharts.mockResolvedValue(full);
  renderWithProviders(<DashboardCharts />);
  expect(await screen.findByRole('heading', { name: 'Business trend' })).toBeInTheDocument();
  expect(lastQuery()).toMatchObject({ range: '7d', group: null, topBy: 'value' });
  expect(screen.getByText('Last 7 days: Sales ₹2,100.00 · Purchases ₹350.00')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Money in and out' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Top selling items' })).toBeInTheDocument();
  expect(screen.getByText('No bills to a customer in this period yet.')).toBeInTheDocument();
  expect(screen.getByText(/as of 6 Oct 2026/)).toBeInTheDocument();
});

it('lets the owner add profit from the legend and says what profit leaves out', async () => {
  service.getDashboardCharts.mockResolvedValue(full);
  renderWithProviders(<DashboardCharts />);
  await screen.findByRole('heading', { name: 'Business trend' });
  const profit = screen.getByRole('button', { name: 'Profit', pressed: false });
  await userEvent.click(profit);
  expect(screen.getByRole('button', { name: 'Profit', pressed: true })).toBeInTheDocument();
  expect(
    screen.getByText('Profit leaves out 2 sold lines that have no cost price.')
  ).toBeInTheDocument();
  // Three is the cap: with three shown the fourth cannot be added.
  expect(screen.getByRole('button', { name: 'Expenses', pressed: false })).toBeDisabled();
});

it('re-reads every chart for the period and the grouping picked from the two dropdowns', async () => {
  service.getDashboardCharts.mockResolvedValue(full);
  renderWithProviders(<DashboardCharts />);
  await screen.findByRole('heading', { name: 'Business trend' });
  await userEvent.click(screen.getByRole('button', { name: 'Period: Last 7 days' }));
  await userEvent.click(screen.getByRole('option', { name: 'This financial year' }));
  expect(lastQuery()).toMatchObject({ range: 'fy', group: null });
  await screen.findByRole('heading', { name: 'Business trend' });
  await userEvent.click(screen.getByRole('button', { name: 'Show by: Day' }));
  await userEvent.click(screen.getByRole('option', { name: 'Week' }));
  expect(lastQuery()).toMatchObject({ range: 'fy', group: 'week' });
});

it('shows the server’s reason when a range is refused', async () => {
  service.getDashboardCharts.mockResolvedValueOnce(full).mockRejectedValueOnce({
    status: 400,
    message: 'Please check the highlighted fields.',
    details: { group: ['That is 340 bars — group by a longer step.'] },
  });
  renderWithProviders(<DashboardCharts />);
  await screen.findByRole('heading', { name: 'Business trend' });
  await userEvent.click(screen.getByRole('button', { name: 'Period: Last 7 days' }));
  // A custom range is applied only with both dates.
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  await userEvent.click(screen.getByRole('option', { name: 'Last 12 months' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('group by a longer step');
});

it('hides the whole block when the reader may see no chart at all', async () => {
  service.getDashboardCharts.mockResolvedValue({
    range: '7d',
    group: 'day',
    from: '2026-09-30',
    to: '2026-10-06',
  });
  const { container } = renderWithProviders(<DashboardCharts />);
  await waitFor(() =>
    expect(container.querySelector('[data-testid="dashboard-charts"]')).toBeNull()
  );
});

it('greys a grouping that would draw more bars than the server allows', () => {
  expect(barsFor('2025-11-01', '2026-10-06', 'day')).toBeGreaterThan(120);
  expect(barsFor('2025-11-01', '2026-10-06', 'month')).toBe(12);
  expect(barsFor('2025-04-01', '2026-10-06', 'year')).toBe(2);
});

it('labels each grouping in the reader’s language', () => {
  expect(groupLabels('2026-10-06', 'day', 'en').label).toBe('06/10');
  expect(groupLabels('2026-10-01', 'month', 'en')).toEqual({
    label: 'Oct',
    longLabel: 'October 2026',
  });
  expect(groupLabels('2026-01-01', 'year', 'en').label).toBe('2026');
});
