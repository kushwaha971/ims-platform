import { screen } from '@testing-library/react';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { SettingsPageContent } from './SettingsPageContent';

/**
 * A9b (PLT-X08 §7, T-PLT-X08-5) — "Business days" sits in the Settings hub only
 * while an enabled feature reads the calendar. A shop with nothing that counts
 * days must not be offered a page of weekday chips whose effect it cannot see.
 */
jest.mock('../api/settingsService');
const service = jest.requireMock('../api/settingsService') as { fetchSettings: jest.Mock };

const settings = (calendarReaders: readonly string[]) => ({
  values: {
    'ledger.credit_limit_mode': { mode: 'warn' },
    'ledger.reminder_templates': { en: '', hi: '' },
  },
  numbering: {},
  fyLabel: '2026-27',
  modules: { enabled: ['platform'], available: ['platform'], locked: [], core: ['platform'] },
  calendarReaders,
  etag: '"x"',
});

beforeEach(() => {
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
      activeTenant: { id: 't1', name: 'City Library', timezone: 'Asia/Kolkata', role: 'owner' },
      tenants: [{ id: 't1', name: 'City Library', timezone: 'Asia/Kolkata', role: 'owner' }],
      permissions: ['platform.tenant.manage', 'platform.calendar.manage'],
      enabledModules: [],
      version: 1,
    })
  );
});

describe('Settings hub — Business days', () => {
  it('is absent when no enabled feature reads the calendar', async () => {
    service.fetchSettings.mockResolvedValue(settings([]));
    renderWithProviders(<SettingsPageContent />);
    expect(await screen.findByText('Your business')).toBeInTheDocument();
    // Wait for the settings to have LOADED, or the absence below proves nothing.
    expect(await screen.findByText(/Turn off what your business does not use/)).toBeInTheDocument();
    expect(screen.queryByText('Business days')).toBeNull();
  });

  it('links to the Business days screen when one does', async () => {
    service.fetchSettings.mockResolvedValue(settings(['library']));
    renderWithProviders(<SettingsPageContent />);
    const link = await screen.findByRole('link', { name: /Business days/ });
    expect(link).toHaveAttribute('href', '/settings/business-days');
  });
});
