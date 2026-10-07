import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from 'src/tests/renderWithProviders';

import { SelfCheckInPageContent } from './SelfCheckInPageContent';

/**
 * Library P0 — the student's check-in page. What these protect: the button waits for a
 * number and exactly four digits; a success shows only the student's own first name and
 * place; a wrong half says one "could not find you" sentence; a dead poster says to use
 * the desk; and the page names the library, never the product.
 */
jest.mock('src/api/AxiosInstances', () => ({
  ...jest.requireActual('src/api/AxiosInstances'),
  publicApi: { get: jest.fn(), post: jest.fn() },
}));
const http = (
  jest.requireMock('src/api/AxiosInstances') as {
    publicApi: { get: jest.Mock; post: jest.Mock };
  }
).publicApi;

const fail = (code: string, status: number) => ({
  code,
  message: 'x',
  details: {},
  requestId: null,
  status,
  warnings: [],
});

beforeEach(() => {
  http.get.mockResolvedValue({ data: { data: { library: 'Vidya Reading Room' } } });
});

it('checks a student in with their number and four digits', async () => {
  http.post.mockResolvedValue({
    data: {
      data: { first_name: 'Rahul', already: false, seat: 'A-12', shift: 'Morning', warning: null },
    },
  });
  const { container } = renderWithProviders(<SelfCheckInPageContent token="tok.sig" />);
  expect(await screen.findByText('Vidya Reading Room')).toBeInTheDocument();
  const submit = screen.getByTestId('self-checkin-submit');
  await userEvent.type(screen.getByLabelText('Student number'), 'LIB-7');
  await userEvent.type(screen.getByLabelText('Last 4 digits of your mobile'), '00a11');
  expect(screen.getByLabelText('Last 4 digits of your mobile')).toHaveValue('0011');
  await userEvent.click(submit);
  expect(await screen.findByTestId('self-checkin-done')).toHaveTextContent(
    'Welcome, Rahul. You are checked in.'
  );
  expect(screen.getByText('Seat A-12 · Morning')).toBeInTheDocument();
  expect(http.post).toHaveBeenCalledWith('/public/in/tok.sig', {
    member_number: 'LIB-7',
    mobile_last4: '0011',
  });
  expect(container.innerHTML.toLowerCase()).not.toContain('yourkhata');
});

it('says one sentence for a wrong number or wrong digits', async () => {
  http.post.mockRejectedValue(fail('checkin_not_found', 404));
  renderWithProviders(<SelfCheckInPageContent token="tok.sig" />);
  await userEvent.type(await screen.findByLabelText('Student number'), 'NOPE');
  await userEvent.type(screen.getByLabelText('Last 4 digits of your mobile'), '1234');
  await userEvent.click(screen.getByTestId('self-checkin-submit'));
  expect(
    await screen.findByText('We could not find you. Check the number, or ask at the desk.')
  ).toBeInTheDocument();
});

it('sends a dead poster to the desk', async () => {
  http.get.mockRejectedValue(fail('not_found', 404));
  renderWithProviders(<SelfCheckInPageContent token="bad" />);
  await waitFor(() =>
    expect(screen.getByText('This check-in code is not in use')).toBeInTheDocument()
  );
});
