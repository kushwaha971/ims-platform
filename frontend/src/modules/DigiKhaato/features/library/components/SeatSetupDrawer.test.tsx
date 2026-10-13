import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from 'src/tests/renderWithProviders';

import { SeatSetupDrawer } from './SeatSetupDrawer';

jest.mock('../hooks/useSeats', () => ({ useSeats: () => ({ seats: [], shifts: [] }) }));

it('clears the To error when correcting From makes the range valid (QA B15)', async () => {
  // A cross-field refusal must not remain after the field it depends on is corrected.
  const user = userEvent.setup();
  renderWithProviders(<SeatSetupDrawer onClose={jest.fn()} />);
  const from = screen.getByRole('textbox', { name: 'From' });
  const to = screen.getByRole('textbox', { name: 'To' });
  await user.clear(from);
  await user.type(from, '10');
  await user.clear(to);
  await user.type(to, '5');
  await user.click(screen.getByRole('button', { name: 'Add seats' }));
  expect(await screen.findByText('The last number is before the first.')).toBeInTheDocument();
  await user.clear(from);
  await user.type(from, '1');
  await waitFor(() =>
    expect(screen.queryByText('The last number is before the first.')).not.toBeInTheDocument()
  );
});
