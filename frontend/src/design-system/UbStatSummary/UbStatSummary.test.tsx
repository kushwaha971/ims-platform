import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UbText } from 'src/design-system';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { UbStatSummary } from './UbStatSummary';

const ITEMS = [
  { key: 'sales', label: 'Sales', value: '₹1,420.00' },
  { key: 'cost', label: 'Cost', value: '₹1,196.00' },
  { key: 'profit', label: 'Profit', value: '₹224.00' },
];
const LABELS = { show: 'Details', hide: 'Hide' };

beforeEach(() => window.localStorage.clear());

/* Owner, 12 Oct 2026: "reduce the size … make it collapsible if the user
   doesn't want to see". These guard the closed strip being ONE toggle row and
   the cards appearing only when it is opened. */
it('is closed by default: one row that is itself the toggle, no cards', () => {
  renderWithProviders(
    <UbStatSummary items={ITEMS} storageKey="t" labels={LABELS}>
      <UbText>the cards</UbText>
    </UbStatSummary>
  );
  const toggle = screen.getByRole('button', { name: 'Details' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(toggle).toHaveTextContent('₹1,420.00');
  // A phone shows the first figure and how many more are folded away.
  expect(toggle).toHaveTextContent('+2');
  expect(screen.queryByText('the cards')).not.toBeInTheDocument();
});

it('opens to the cards without printing the figures twice, and remembers', async () => {
  const user = userEvent.setup();
  renderWithProviders(
    <UbStatSummary items={ITEMS} storageKey="t" labels={LABELS}>
      <UbText>the cards</UbText>
    </UbStatSummary>
  );
  await user.click(screen.getByRole('button', { name: 'Details' }));
  expect(screen.getByText('the cards')).toBeInTheDocument();
  expect(screen.queryByText('₹1,420.00')).not.toBeInTheDocument();
  expect(window.localStorage.getItem('ub.statSummary.t')).toBe('open');
});
