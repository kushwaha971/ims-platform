import { fireEvent, screen } from '@testing-library/react';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { LedgerSettingsSection } from './LedgerSettingsSection';

import type { UseTenantSettingsResult } from '../hooks/useTenantSettings';

const settings = (en: string): UseTenantSettingsResult =>
  ({
    data: {
      values: {
        'ledger.credit_limit_mode': { mode: 'warn' },
        'ledger.reminder_templates': { en, hi: '' },
      },
    },
    savingSection: null,
    canWrite: true,
    saveSection: jest.fn().mockResolvedValue(true),
    loadDefaults: jest.fn(),
  }) as unknown as UseTenantSettingsResult;

beforeAll(() => {
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Suresh',
        email: 's@store.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: 't1', name: 'Sharma Stores', timezone: 'Asia/Kolkata', role: 'owner' },
      tenants: [{ id: 't1', name: 'Sharma Stores', timezone: 'Asia/Kolkata', role: 'owner' }],
      permissions: [] as never,
      enabledModules: ['parties', 'ledger'],
      version: 1,
    })
  );
});

describe('LedgerSettingsSection reminder template', () => {
  it("previews {business_name} as the merchant's own business (QA D6)", () => {
    renderWithProviders(
      <LedgerSettingsSection settings={settings('From {business_name}')} canEdit />
    );
    expect(screen.getAllByText('From Sharma Stores').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Sharma General Store/)).not.toBeInTheDocument();
  });

  it('inserts a placeholder chip at the caret, not at the end (QA D7)', () => {
    renderWithProviders(<LedgerSettingsSection settings={settings('Hello  owes')} canEdit />);
    const box = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement;
    box.focus();
    box.setSelectionRange(6, 6);
    // The first "Customer name" chip belongs to the English box.
    fireEvent.click(screen.getAllByRole('button', { name: 'Customer name' })[0] as HTMLElement);
    expect(box.value).toBe('Hello {party_name} owes');
  });
});
