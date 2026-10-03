import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import * as service from '../api/libraryCatalogueService';
import {
  catalogueDrawerOpened,
  selectLibraryCatalogueForm,
} from '../redux/libraryCatalogueFormSlice';

import { CatalogueDrawers } from './CatalogueDrawers';

import type { TitleRow } from '../types/catalogue.types';

/**
 * T-LIB-02-8 — the add-book drawer opens with NO error text and its first
 * field focused (the LED-01 defect: a dialog that stole focus made the field
 * touched and opened red), offers "Add copies to this title" when the search
 * finds the work already (FR-3), and a typed number someone else holds is
 * said ON that number (FR-4), not in a banner.
 */
jest.mock('../api/libraryCatalogueService', () => ({
  ...jest.requireActual('../api/libraryCatalogueService'),
  listCategories: jest.fn(),
  listLocations: jest.fn(),
  searchTitles: jest.fn(),
  createTitle: jest.fn(),
  addCopies: jest.fn(),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/library/catalogue',
  useSearchParams: () => new URLSearchParams(),
}));

const WINGS: TitleRow = {
  id: 't1',
  title: 'Wings of Fire',
  subtitle: '',
  authors: 'A. P. J. Abdul Kalam',
  isbn13: '9788173711466',
  isbn10: '8173711461',
  category: null,
  materialType: 'book',
  copiesTotal: 3,
  copiesAvailable: 2,
  status: 'active',
};

beforeEach(() => {
  jest.mocked(service.listCategories).mockResolvedValue([]);
  jest.mocked(service.listLocations).mockResolvedValue([]);
  jest.mocked(service.searchTitles).mockResolvedValue([]);
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
      permissions: ['library.catalogue.read', 'library.catalogue.write'],
      enabledModules: ['library'],
      version: 1,
    })
  );
});

describe('CatalogueDrawers', () => {
  it('opens Add book on the title field, with nothing in red', async () => {
    store.dispatch(catalogueDrawerOpened({ kind: 'addBook', query: '' }));
    renderWithProviders(<CatalogueDrawers />);

    const title = await screen.findByRole('textbox', { name: /title or isbn/i });
    await waitFor(() => expect(title).toHaveFocus());
    expect(screen.queryByText(/enter the book's title/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers "Add copies to this title" when the search finds the work', async () => {
    jest.mocked(service.searchTitles).mockResolvedValue([WINGS]);
    store.dispatch(catalogueDrawerOpened({ kind: 'addBook', query: '' }));
    renderWithProviders(<CatalogueDrawers />);

    await userEvent.type(await screen.findByRole('textbox', { name: /title or isbn/i }), 'Wings');
    await userEvent.click(await screen.findByRole('button', { name: /add copies to this title/i }));

    expect(selectLibraryCatalogueForm(store.getState()).drawer).toEqual({
      kind: 'addCopies',
      titleId: 't1',
      title: 'Wings of Fire',
    });
  });

  it('says a taken number on the number that was typed', async () => {
    jest.mocked(service.addCopies).mockRejectedValue({
      code: 'library_accession_taken',
      message: 'Accession number 1024 is already used.',
      details: { number: '1024', copy_id: 'k9', title: 'Godaan' },
      requestId: null,
      status: 409,
      warnings: [],
    });
    store.dispatch(catalogueDrawerOpened({ kind: 'addCopies', titleId: 't1', title: 'Wings' }));
    renderWithProviders(<CatalogueDrawers />);

    await userEvent.click(await screen.findByRole('radio', { name: /i'll type them/i }));
    await userEvent.type(screen.getByRole('textbox', { name: /number for copy 1/i }), '1024');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText('1024 is already Godaan.')).toBeInTheDocument();
    expect(jest.mocked(service.addCopies).mock.calls[0]?.[1]).toMatchObject({
      count: '1',
      numbering: 'typed',
      numbers: ['1024'],
    });
  });
});
