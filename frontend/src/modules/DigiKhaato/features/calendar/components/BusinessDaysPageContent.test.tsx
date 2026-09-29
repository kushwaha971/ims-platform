import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { ALL_MESSAGES, hi } from 'src/tests/allMessages';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import { BusinessDaysPageContent } from './BusinessDaysPageContent';

/**
 * A9b (PLT-X08 §2, §7-§8) — Settings → Business days, screen → hook → thunk →
 * service with the service stubbed at the module boundary.
 */
jest.mock('../api/calendarService');
const service = jest.requireMock('../api/calendarService') as {
  listClosedDays: jest.Mock;
  saveWeekdays: jest.Mock;
  addClosedDays: jest.Mock;
  deleteClosedDay: jest.Mock;
};

// The vertical ships its module name; the test stands in for that line.
const MESSAGES = { ...ALL_MESSAGES.en, 'nav.module.library': 'Library' };

const DATA = {
  rows: [
    { id: 'r1', date: '2026-10-12', reason: 'Local holiday', module: null },
    { id: 'r2', date: '2026-11-08', reason: 'Stock-taking', module: 'library' },
  ],
  closedWeekdays: [6],
  moduleWeekdays: {},
  readers: ['library'],
};

const signIn = (permissions: readonly PermissionCode[]): void => {
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Owner',
        email: 'owner@shop.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: 't1', name: 'City Library', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'City Library', timezone: 'Asia/Kolkata' }],
      permissions: [...permissions],
      enabledModules: [],
      version: 1,
    })
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  service.listClosedDays.mockResolvedValue(DATA);
  service.saveWeekdays.mockImplementation(async (draft) => ({
    value: draft.value,
    modules: Object.fromEntries(Object.entries(draft.modules).filter(([, days]) => days !== null)),
  }));
});

describe('Business days', () => {
  it('shows Sunday closed, the closures by month, and a feature-only tag', async () => {
    signIn(['platform.calendar.manage']);
    renderWithProviders(<BusinessDaysPageContent />, { messages: MESSAGES });

    const sunday = await screen.findByRole('button', { name: 'Sun' });
    expect(sunday).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Mon' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Local holiday')).toBeInTheDocument();
    expect(screen.getByText('Library only')).toBeInTheDocument();
    expect(screen.getByText(/October 2026/)).toBeInTheDocument();
  });

  it('saves a weekday the moment it is tapped', async () => {
    const user = userEvent.setup();
    signIn(['platform.calendar.manage']);
    renderWithProviders(<BusinessDaysPageContent />, { messages: MESSAGES });

    await user.click(await screen.findByRole('button', { name: 'Sat' }));
    await waitFor(() =>
      expect(service.saveWeekdays).toHaveBeenCalledWith({ value: [5, 6], modules: {} })
    );
    // The global snackbar is mounted by AppProviders, not by this harness.
    await waitFor(() => expect(store.getState().snackbar.id).toBe('calendar.saved'));
  });

  it('turns on a feature override starting from the business days', async () => {
    const user = userEvent.setup();
    signIn(['platform.calendar.manage']);
    renderWithProviders(<BusinessDaysPageContent />, { messages: MESSAGES });

    await user.click(await screen.findByRole('switch', { name: /Library uses different days/ }));
    await waitFor(() =>
      expect(service.saveWeekdays).toHaveBeenCalledWith({ value: [6], modules: { library: [6] } })
    );
  });

  it('never lets the last open day be closed (BR-2)', async () => {
    signIn(['platform.calendar.manage']);
    service.listClosedDays.mockResolvedValue({ ...DATA, closedWeekdays: [0, 1, 2, 3, 4, 5] });
    renderWithProviders(<BusinessDaysPageContent />, { messages: MESSAGES });
    expect(await screen.findByRole('button', { name: 'Sun' })).toBeDisabled();
  });

  it('is read-only without the calendar codename, with no add or remove', async () => {
    signIn([]);
    renderWithProviders(<BusinessDaysPageContent />, { messages: MESSAGES });

    expect(await screen.findByRole('button', { name: 'Sun' })).toBeDisabled();
    expect(screen.getByText('Only the owner or an admin can change these.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add closure' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove the closure/ })).toBeNull();
  });

  it('says so plainly when no feature reads the calendar', async () => {
    signIn(['platform.calendar.manage']);
    service.listClosedDays.mockResolvedValue({ ...DATA, readers: [] });
    renderWithProviders(<BusinessDaysPageContent />, { messages: MESSAGES });
    expect(await screen.findByText('No feature uses business days')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sun' })).toBeNull();
  });

  it('adds a closure through the dialog', async () => {
    const user = userEvent.setup();
    signIn(['platform.calendar.manage']);
    service.addClosedDays.mockResolvedValue({
      rows: [{ id: 'r3', date: '2026-10-20', reason: 'Diwali', module: null }],
      skippedExisting: 0,
    });
    renderWithProviders(<BusinessDaysPageContent />, { messages: MESSAGES });

    await user.click(await screen.findByRole('button', { name: 'Add closure' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Reason/), 'Diwali');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(service.addClosedDays).toHaveBeenCalled());
    expect(service.addClosedDays.mock.calls[0][0]).toMatchObject({
      reason: 'Diwali',
      module: null,
    });
    await waitFor(() => expect(store.getState().snackbar.id).toBe('calendar.added'));
    expect(await screen.findByText('Diwali')).toBeInTheDocument();
  });

  it('lets the seven weekday chips wrap on a phone', async () => {
    // Found by LOOKING (the A9b screenshot pass): the chip group is built not
    // to wrap, and at 390 px "Sun" was cut in half. jsdom cannot measure; this
    // pins the class that lets the row wrap.
    signIn(['platform.calendar.manage']);
    renderWithProviders(<BusinessDaysPageContent />, { messages: MESSAGES });
    await screen.findByRole('button', { name: 'Sun' });
    for (const group of screen.getAllByRole('group')) expect(group).toHaveClass('flex-wrap');
  });

  it('uses whole generic sentences for a feature with no name on this screen', async () => {
    signIn(['platform.calendar.manage']);
    renderWithProviders(<BusinessDaysPageContent />);
    expect(await screen.findByText('A feature uses different days')).toBeInTheDocument();
    expect(screen.getByText('One feature only')).toBeInTheDocument();
    expect(screen.queryByText(/This feature/)).toBeNull();
  });

  it('renders in Hindi', async () => {
    signIn(['platform.calendar.manage']);
    renderWithProviders(<BusinessDaysPageContent />, {
      locale: 'hi',
      messages: { ...hi, 'nav.module.library': 'लाइब्रेरी' } as Record<string, string>,
    });
    expect(await screen.findByText('हर हफ़्ते बंद')).toBeInTheDocument();
    expect(screen.getByText('सिर्फ़ लाइब्रेरी')).toBeInTheDocument();
  });
});
