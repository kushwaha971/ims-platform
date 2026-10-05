import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from 'src/tests/renderWithProviders';

import { AppSetupCard } from './AppSetupCard';

/**
 * docs/platform/14 step 5 — an app's setup list on its home: never blocking,
 * a link per undone step, gone once complete or hidden.
 */
jest.mock('../api/appSetupService', () => ({ getAppSetup: jest.fn(), hideAppSetup: jest.fn() }));
const service = jest.requireMock('../api/appSetupService') as {
  getAppSetup: jest.Mock;
  hideAppSetup: jest.Mock;
};

const STEPS = [
  { key: 'plans', labelId: 'library.setup.plans', path: '/library/fees', done: true },
  { key: 'seats', labelId: 'library.setup.seats', path: '/library/seats', done: false },
];
const setup = (over = {}) => ({
  app: 'library',
  steps: STEPS,
  complete: false,
  hidden: false,
  canHide: true,
  ...over,
});

beforeEach(() => jest.clearAllMocks());

it('links each undone step to the page that does it, and strikes the done ones', async () => {
  service.getAppSetup.mockResolvedValue(setup());
  renderWithProviders(<AppSetupCard app="library" appName="Library" />);
  expect(await screen.findByText('Get Library ready')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Lay out your seats' })).toHaveAttribute(
    'href',
    '/library/seats'
  );
  expect(screen.queryByRole('link', { name: 'Add your fee plans' })).toBeNull();
  expect(screen.getByText(/1 of 2 done/)).toBeInTheDocument();
});

it('is gone once every step is done', async () => {
  service.getAppSetup.mockResolvedValue(setup({ complete: true }));
  const { container } = renderWithProviders(<AppSetupCard app="library" appName="Library" />);
  await waitFor(() => expect(service.getAppSetup).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
});

it('lets the owner hide it for the business', async () => {
  service.getAppSetup.mockResolvedValue(setup());
  service.hideAppSetup.mockResolvedValue(setup({ hidden: true }));
  renderWithProviders(<AppSetupCard app="library" appName="Library" />);
  await userEvent.click(await screen.findByRole('button', { name: 'Hide' }));
  await waitFor(() => expect(screen.queryByText('Get Library ready')).toBeNull());
  expect(service.hideAppSetup).toHaveBeenCalledWith('library');
});

it('offers no Hide to someone who may not hide it', async () => {
  service.getAppSetup.mockResolvedValue(setup({ canHide: false }));
  renderWithProviders(<AppSetupCard app="library" appName="Library" />);
  await screen.findByText('Get Library ready');
  expect(screen.queryByRole('button', { name: 'Hide' })).toBeNull();
});
