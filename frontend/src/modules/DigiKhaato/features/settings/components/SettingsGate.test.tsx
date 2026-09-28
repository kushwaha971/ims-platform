import { screen } from '@testing-library/react';

import { UbText } from 'src/design-system';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { SettingsGate } from './SettingsGate';

const signInAs = (role: string, permissions: readonly string[]): void => {
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Ravi',
        email: 'ravi@kirana.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: 't1', name: 'Kumar Kirana', timezone: 'Asia/Kolkata', role },
      tenants: [{ id: 't1', name: 'Kumar Kirana', timezone: 'Asia/Kolkata', role }],
      permissions: [...permissions] as never,
      enabledModules: ['parties', 'ledger', 'platform'],
      version: 1,
    })
  );
};

const Section = () => <UbText>Activity rows</UbText>;

/**
 * QA D4 — staff who opened /settings/activity directly saw the whole page, its
 * request went out, and only then did a permission error arrive. The gate keeps
 * the section unmounted (so it fetches nothing) and says so calmly instead.
 */
describe('SettingsGate (QA D4)', () => {
  it('shows staff a no-access state and never mounts the section', () => {
    signInAs('staff', ['parties.party.read']);
    renderWithProviders(
      <SettingsGate need="canReadAudit">
        <Section />
      </SettingsGate>
    );
    expect(screen.queryByText('Activity rows')).not.toBeInTheDocument();
    expect(screen.getByText('This setting is not available')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Settings' })).toHaveAttribute(
      'href',
      '/settings'
    );
  });

  it('renders the section for a role that may read it', () => {
    signInAs('accountant', ['platform.audit.read']);
    renderWithProviders(
      <SettingsGate need="canReadAudit">
        <Section />
      </SettingsGate>
    );
    expect(screen.getByText('Activity rows')).toBeInTheDocument();
  });

  it('lets an owner into the profile even without the audit permission', () => {
    signInAs('owner', []);
    renderWithProviders(
      <SettingsGate need="canView">
        <Section />
      </SettingsGate>
    );
    expect(screen.getByText('Activity rows')).toBeInTheDocument();
  });
});
