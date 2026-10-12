import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import * as service from '../api/itemService';

import { ItemListPageContent } from './ItemListPageContent';

import type { ItemListResult } from '../types/item.types';

/**
 * The approved list designs (owner, 12 Oct 2026: "I don't want that type of
 * screen in case of empty"). An empty catalogue is one sentence and one
 * button — not "Items 0 · Stock value ₹0.00", four tabs at 0, a search box
 * and Filters over a dashed box. And on a phone the stock tabs are inside the
 * one Filters sheet.
 */
jest.mock('../api/itemService', () => ({
  ...jest.requireActual('../api/itemService'),
  listItems: jest.fn(),
}));
let mockSearch = '';
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, prefetch: jest.fn() }),
  usePathname: () => '/items',
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

const PAGE: ItemListResult = {
  rows: [],
  page: 1,
  pageSize: 25,
  total: 0,
  totalPages: 0,
  totals: { items: 0, stockValue: '0.00' },
  counts: { all: 0, in: 0, low: 0, out: 0 },
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
      activeTenant: { id: 't1', name: 'Gupta Kirana Store', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Gupta Kirana Store', timezone: 'Asia/Kolkata' }],
      permissions: [...permissions],
      enabledModules: ['inventory'],
      version: 1,
    })
  );
};

beforeEach(() => {
  mockSearch = '';
  mockReplace.mockReset();
});

it('an empty catalogue is one sentence and one button', async () => {
  jest.mocked(service.listItems).mockResolvedValue({ ...PAGE, hasAny: false });
  signIn(['inventory.item.read', 'inventory.item.write']);
  renderWithProviders(<ItemListPageContent />);
  expect(await screen.findByText('No items yet')).toBeInTheDocument();
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  expect(screen.queryByTestId('filters-button')).not.toBeInTheDocument();
  expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  expect(screen.queryByText('₹0.00')).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /Add item/ })).toHaveLength(1);
});

it('on a phone, Low stock is chosen in the one Filters sheet', async () => {
  jest.mocked(service.listItems).mockResolvedValue({
    ...PAGE,
    hasAny: true,
    counts: { all: 3, in: 2, low: 1, out: 0 },
  });
  signIn(['inventory.item.read']);
  const user = userEvent.setup();
  renderWithProviders(<ItemListPageContent />);
  await user.click(await screen.findByTestId('filters-button'));
  expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  const group = await screen.findByRole('radiogroup', { name: 'Stock' });
  await user.click(within(group).getByRole('radio', { name: /Low/ }));
  await user.click(screen.getByTestId('filters-apply'));
  await waitFor(() =>
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('tab=low'), {
      scroll: false,
    })
  );
});
