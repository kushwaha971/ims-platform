import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UbText } from 'src/design-system';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import { ReportPageShell } from './ReportPageShell';
import { ReportsHubPageContent } from './ReportsHubPageContent';

/**
 * The report shell is the contract W4-B builds on, so these pin what every
 * report gets from it: one state at a time (a loading report never also
 * shows an error), the server's sentence and request id on a failure with
 * Retry, Export only for a reader who may export, and nothing but the
 * no-access state for a reader who may not open the report.
 */
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/reports',
}));

const signIn = (permissions: readonly PermissionCode[], modules: readonly string[] = ['reports']) =>
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
      activeTenant: { id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata' }],
      permissions: [...permissions],
      enabledModules: [...modules] as never,
      version: 1,
    })
  );

const base = {
  title: 'Sales register',
  loadingLabel: 'Loading the register',
  exportAction: { path: '/reports/sales-register?date_from=2026-04-01' },
};

describe('ReportPageShell', () => {
  it('shows a busy skeleton and nothing else while loading', () => {
    signIn(['reports.basic.read']);
    renderWithProviders(
      <ReportPageShell<string> {...base} state="loading">
        <UbText>rows</UbText>
      </ReportPageShell>
    );
    expect(screen.getByRole('status', { name: 'Loading the register' })).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(screen.queryByText('rows')).not.toBeInTheDocument();
  });

  it("puts the server's sentence, its reference and Retry on a failure", async () => {
    signIn(['reports.basic.read']);
    const retry = jest.fn();
    renderWithProviders(
      <ReportPageShell<string>
        {...base}
        state="error"
        error={
          { code: 'server_error', message: 'The register is busy.', requestId: 'abc123' } as never
        }
        onRetry={retry}
      />
    );
    expect(screen.getByText('The register is busy.')).toBeInTheDocument();
    expect(screen.getByText(/abc123/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
  });

  it('renders the report body when ready, with Export only for a reader who may export', () => {
    signIn(['reports.basic.read']);
    const { unmount } = renderWithProviders(
      <ReportPageShell<string> {...base} state="ready">
        <UbText>rows</UbText>
      </ReportPageShell>
    );
    expect(screen.getByText('rows')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
    unmount();

    signIn(['reports.basic.read', 'reports.export']);
    renderWithProviders(
      <ReportPageShell<string> {...base} state="ready">
        <UbText>rows</UbText>
      </ReportPageShell>
    );
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });

  it('draws the period as presets on the scope bar (RPT-common)', async () => {
    signIn(['reports.basic.read']);
    const change = jest.fn();
    renderWithProviders(
      <ReportPageShell<'today' | 'custom'>
        {...base}
        state="ready"
        period={{
          presets: [
            { value: 'today', label: 'Today' },
            { value: 'custom', label: 'Custom' },
          ],
          preset: 'today',
          onPresetChange: change,
          customPreset: 'custom',
          from: '2026-09-18',
          to: '2026-09-18',
          onRangeChange: jest.fn(),
          labels: { presets: 'Period', from: 'From', to: 'To' },
        }}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Custom' }));
    expect(change).toHaveBeenCalledWith('custom');
  });

  it('shows only the no-access state to a reader who may not open the report', () => {
    signIn(['reports.basic.read', 'reports.export']);
    renderWithProviders(
      <ReportPageShell<string>
        {...base}
        state="ready"
        noAccess={{ title: 'Reports are not open to you' }}
      >
        <UbText>rows</UbText>
      </ReportPageShell>
    );
    expect(screen.getByText('Reports are not open to you')).toBeInTheDocument();
    expect(screen.queryByText('rows')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
  });
});

describe('ReportsHubPageContent', () => {
  it('lists only the built reports this reader can open (no "Soon" rows)', () => {
    signIn(['reports.basic.read', 'ledger.entry.read'], ['reports', 'ledger']);
    renderWithProviders(<ReportsHubPageContent />);
    expect(screen.getByRole('link', { name: 'Day book' })).toHaveAttribute(
      'href',
      '/reports/day-book'
    );
    expect(screen.getByRole('link', { name: 'Payables aging' })).toHaveAttribute(
      'href',
      '/ledger/aging?type=payable'
    );
    expect(screen.queryByRole('link', { name: 'Stock summary' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cashbook' })).not.toBeInTheDocument();
  });
});
