import { screen } from '@testing-library/react';

import { UbText } from 'src/design-system';
import { usePermissions } from 'src/hooks/usePermissions';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import LibraryLayout from 'app/(app)/library/layout';

jest.mock('src/hooks/usePermissions', () => ({ usePermissions: jest.fn() }));

const withModules = (modules: readonly string[]): void => {
  (usePermissions as jest.Mock).mockReturnValue({
    hasModule: (module: string) => modules.includes(module),
  });
};

/**
 * F01 (G1) — the defect: `/library/...` typed by a tenant without the module
 * (or while it is unreleased, which the server reports as not enabled) drew
 * the page and a 403 snackbar — an unbuilt or unbought feature shown. The
 * layout must answer not found and render none of the page.
 */
describe('the library route gate', () => {
  it('renders not found, and not the page, when library is off', () => {
    withModules(['parties', 'ledger']);
    renderWithProviders(
      <LibraryLayout>
        <UbText>Library page</UbText>
      </LibraryLayout>
    );
    expect(screen.queryByText('Library page')).toBeNull();
    expect(screen.getByText('We could not find that page')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/dashboard');
  });

  it('renders the page when library is on', () => {
    withModules(['library']);
    renderWithProviders(
      <LibraryLayout>
        <UbText>Library page</UbText>
      </LibraryLayout>
    );
    expect(screen.getByText('Library page')).toBeInTheDocument();
  });
});
