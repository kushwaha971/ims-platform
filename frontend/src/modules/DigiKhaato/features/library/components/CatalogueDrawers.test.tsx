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

    const title = await screen.findByRole('textbox', { name: /^title/i });
    await waitFor(() => expect(title).toHaveFocus());
    expect(screen.queryByText(/enter the book's title/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers "Add copies to this title" when the search finds the work', async () => {
    jest.mocked(service.searchTitles).mockResolvedValue([WINGS]);
    store.dispatch(catalogueDrawerOpened({ kind: 'addBook', query: '' }));
    renderWithProviders(<CatalogueDrawers />);

    await userEvent.type(await screen.findByRole('textbox', { name: /^title/i }), 'Wings');
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

/**
 * F03 QA round 1. QA-F03-1: a server 400 on a field (`count`, `copies.price`)
 * was put in the banner above the form instead of under the field it names,
 * because the drawers told `applyServerErrors` they had no fields at all.
 * QA-F03-2: the first field was labelled "Title or ISBN" while an ISBN typed
 * into it was saved as the book's TITLE; the ISBN has its own field.
 */
describe('CatalogueDrawers — QA round 1', () => {
  it('QA-F03-1: anchors a server field error on the field it names', async () => {
    jest.mocked(service.addCopies).mockRejectedValue({
      code: 'validation_error',
      message: 'Check the highlighted fields.',
      details: { price: ['Enter a price of 0 or more.'] },
      requestId: null,
      status: 400,
      warnings: [],
    });
    store.dispatch(catalogueDrawerOpened({ kind: 'addCopies', titleId: 't1', title: 'Wings' }));
    renderWithProviders(<CatalogueDrawers />);

    await userEvent.click(await screen.findByRole('button', { name: /save/i }));

    const price = await screen.findByRole('textbox', { name: /^price/i });
    await waitFor(() => expect(price).toHaveAttribute('aria-invalid', 'true'));
  });

  it('QA-F03-2: labels the first field as the title, not "Title or ISBN"', async () => {
    store.dispatch(catalogueDrawerOpened({ kind: 'addBook', query: '' }));
    renderWithProviders(<CatalogueDrawers />);

    expect(await screen.findByRole('textbox', { name: /^title/i })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /title or isbn/i })).not.toBeInTheDocument();
  });
});
