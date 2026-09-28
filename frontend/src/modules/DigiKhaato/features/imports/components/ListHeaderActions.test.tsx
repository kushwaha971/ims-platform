import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetAllFeatureState } from 'src/redux/actions';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import { ImportActionLink, ListExportButton } from './ListHeaderActions';

/**
 * IMP-01 FR-14 / IMP-02 FR-13 — the two header actions every list shares. What
 * is protected: they are hidden (not disabled) for a role that cannot use
 * them, the export asks for THIS list's filters, and a big export is not a
 * page of JSON but a promise to deliver the file.
 */
jest.mock('../api/exportService', () => ({
  requestListExport: jest.fn(),
  getExport: jest.fn(),
  exportDownloadUrl: (id: string) => `http://api.test/reports/exports/${id}/download`,
}));

const service = jest.requireMock('../api/exportService') as {
  requestListExport: jest.Mock;
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
      activeTenant: { id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata' }],
      permissions: [...permissions],
      enabledModules: ['parties', 'ledger', 'inventory', 'import_export'],
      version: 1,
    })
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  store.dispatch(resetAllFeatureState());
});

describe('ImportActionLink', () => {
  it('opens the wizard with the kind already chosen (FR-14)', () => {
    signIn(['parties.party.write', 'ledger.entry.write']);
    renderWithProviders(<ImportActionLink kind="parties" />);
    expect(screen.getByRole('link', { name: 'Import' })).toHaveAttribute(
      'href',
      '/imports?kind=parties'
    );
  });

  it('is absent for a role that cannot create what the file would create', () => {
    // The accountant reads everything and writes nothing (canon §0.9).
    signIn(['parties.party.read', 'inventory.item.read']);
    renderWithProviders(<ImportActionLink kind="items" />);
    expect(screen.queryByRole('link', { name: 'Import' })).not.toBeInTheDocument();
  });
});

describe('ListExportButton', () => {
  it('is absent without the export codename, not disabled', () => {
    signIn(['parties.party.read']);
    renderWithProviders(
      <ListExportButton listPath="/parties?status=active" permission="parties.party.export" />
    );
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
  });

  it('exports the list the merchant is looking at, and saves the file (BR-1)', async () => {
    const user = userEvent.setup();
    signIn(['parties.party.export']);
    const create = jest.fn(() => 'blob:export');
    const revoke = jest.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    service.requestListExport.mockResolvedValue({
      kind: 'file',
      blob: new Blob(['name\r\n']),
      filename: 'yourkhata-parties-20260924-1142.csv',
    });
    renderWithProviders(
      <ListExportButton
        listPath="/parties?q=Kumar&tag=Camp%20Area"
        permission="parties.party.export"
      />
    );
    await user.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(service.requestListExport).toHaveBeenCalledWith('/parties?q=Kumar&tag=Camp%20Area');
    expect(create).toHaveBeenCalled();
    click.mockRestore();
  });

  it('says a big export is being prepared instead of downloading JSON (FR-6, FR-14)', async () => {
    const user = userEvent.setup();
    signIn(['reports.export']);
    service.requestListExport.mockResolvedValue({
      kind: 'queued',
      exportId: 'e-1',
      rowCount: 8123,
    });
    renderWithProviders(<ListExportButton listPath="/items" permission="reports.export" />);
    await user.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(store.getState().snackbar.id).toBe('exports.queued'));
    expect(store.getState().snackbar.params).toEqual({ count: 8123 });
  });

  it("hands a refusal to the snackbar in the server's own words", async () => {
    const user = userEvent.setup();
    signIn(['reports.export']);
    service.requestListExport.mockRejectedValue({
      code: 'nothing_to_export',
      message: 'Nothing matches these filters — clear a filter and try again.',
      details: {},
      requestId: 'r-1',
      status: 400,
      warnings: [],
    });
    renderWithProviders(<ListExportButton listPath="/expenses" permission="reports.export" />);
    await user.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() =>
      expect(store.getState().snackbar.snackbarMessage).toBe(
        'Nothing matches these filters — clear a filter and try again.'
      )
    );
    expect(store.getState().snackbar.requestId).toBe('r-1');
  });
});
