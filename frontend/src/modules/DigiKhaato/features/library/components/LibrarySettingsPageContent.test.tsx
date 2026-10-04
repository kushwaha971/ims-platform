import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import * as service from '../api/librarySettingsService';

import { LibrarySettingsPageContent } from './LibrarySettingsPageContent';

import type { LibrarySettingsBundle } from '../types/settings.types';

/**
 * F02 (LIB-01 §8) — the settings screen: the counters show the next number
 * large; a reader sees every control disabled and no Save; a refusal on a
 * field opens the tab that field is on.
 */
jest.mock('../api/librarySettingsService', () => ({
  ...jest.requireActual('../api/librarySettingsService'),
  getLibrarySettings: jest.fn(),
  putLibrarySettings: jest.fn(),
}));

const BUNDLE: LibrarySettingsBundle = {
  settings: {
    version: 1,
    fineSkipClosedDays: true,
    fineRounding: 'rupee',
    overdueIssueRule: 'block',
    lostCountsTowardLimit: true,
    renewFrom: 'today',
    renewOverdue: 'charge_fine',
    holdPickupDays: 3,
    lostMultiplier: '1.00',
    lostProcessingFee: '0.00',
    lostFoundPaid: 'refund',
    fallbackPrice: null,
    damageMinorAmount: '20.00',
    damageMajorPercent: 50,
    waiverCeiling: null,
    overdueReminderDays: [1, 7, 14, 30],
    remindDayBefore: false,
  },
  numbering: { accessionNext: 4513, memberPrefix: 'M-', memberNext: 43, memberDisplay: 'M-0043' },
  closedWeekdays: [6],
};

const signIn = (permissions: PermissionCode[]): void => {
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Owner',
        email: 'owner@library.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: 't1', name: 'Saraswati Library', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Saraswati Library', timezone: 'Asia/Kolkata' }],
      permissions,
      enabledModules: ['library'],
      version: 1,
    })
  );
};

beforeEach(() => {
  jest.mocked(service.getLibrarySettings).mockResolvedValue(BUNDLE);
});

describe('LibrarySettingsPageContent', () => {
  it('shows the next numbers and the closed weekday, and saves only when changed', async () => {
    signIn(['library.settings.manage', 'library.loan.read']);
    renderWithProviders(<LibrarySettingsPageContent />);
    expect(await screen.findByTestId('library-next-library_accession')).toHaveTextContent('4513');
    expect(screen.getByTestId('library-next-library_member')).toHaveTextContent('M-0043');
    expect(screen.getByTestId('library-settings-save')).toBeDisabled();
    await userEvent.click(screen.getByRole('tab', { name: 'Fines' }));
    expect(screen.getByText('The library is closed on Sunday.')).toBeInTheDocument();
  });

  it('opens the tab of a field the form refuses', async () => {
    signIn(['library.settings.manage', 'library.loan.read']);
    renderWithProviders(<LibrarySettingsPageContent />);
    await screen.findByTestId('library-next-library_accession');
    await userEvent.click(screen.getByRole('tab', { name: 'Holds and reminders' }));
    const days = screen.getByLabelText('Days to collect a book kept aside');
    await userEvent.clear(days);
    await userEvent.type(days, '45');
    await userEvent.click(screen.getByRole('tab', { name: 'General' }));
    await userEvent.click(screen.getByTestId('library-settings-save'));
    expect(await screen.findByText('Enter a whole number from 1 to 30.')).toBeInTheDocument();
    expect(service.putLibrarySettings).not.toHaveBeenCalled();
  });

  it('saves the whole row with its version, the reminder days sorted', async () => {
    // QA-F02-1 — Save threw before any request: the empty optional amounts
    // arrive from the resolver as null.
    jest.mocked(service.putLibrarySettings).mockResolvedValue(BUNDLE);
    signIn(['library.settings.manage', 'library.loan.read']);
    renderWithProviders(<LibrarySettingsPageContent />);
    await screen.findByTestId('library-next-library_accession');
    await userEvent.click(screen.getByRole('tab', { name: 'Holds and reminders' }));
    const days = screen.getByLabelText('Remind after these many days late');
    await userEvent.clear(days);
    await userEvent.type(days, '30, 1, 7');
    await userEvent.click(screen.getByTestId('library-settings-save'));
    await waitFor(() => expect(service.putLibrarySettings).toHaveBeenCalled());
    const sent = jest.mocked(service.putLibrarySettings).mock.calls[0]?.[0];
    expect(sent).toMatchObject({
      version: 1,
      overdueReminderDays: [1, 7, 30],
      fallbackPrice: null,
    });
  });

  it('is read-only for a library reader without settings.manage', async () => {
    signIn(['library.loan.read']);
    renderWithProviders(<LibrarySettingsPageContent />);
    await screen.findByTestId('library-next-library_accession');
    expect(screen.queryByTestId('library-settings-save')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: /lost books count/i })).toBeDisabled()
    );
  });
});
