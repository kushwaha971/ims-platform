import { api } from 'src/api/AxiosInstances';

import { TITLE_FILTER_DEFAULTS } from '../constants/catalogueConstants';

import { addCopies, createTitle, listCopies, listTitles } from './libraryCatalogueService';

import type { CopiesFormValues, TitleFormValues } from '../types/catalogue.types';

/**
 * F03 — the catalogue service is tested on what it SENDS and how it reads what
 * comes back, because the E2E for this feature (LIB-02 §12) asserts the
 * network, and a mapping that drops `copies.count` passes every screen test.
 */
jest.mock('src/api/AxiosInstances', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  ubConfig: (extras: unknown) => extras,
}));

const mocked = api as jest.Mocked<typeof api>;

const TITLE_WIRE = {
  id: 't1',
  title: 'Wings of Fire',
  subtitle: '',
  authors: 'A. P. J. Abdul Kalam; Arun Tiwari',
  isbn13: '9788173711466',
  isbn10: '8173711461',
  category: { id: 'c1', name: 'Biography' },
  material_type: 'book',
  copies_total: 3,
  copies_available: 3,
  status: 'active',
  publisher: '',
  edition: '',
  year: null,
  language: 'English',
  call_number: '',
  keywords: '',
  notes: '',
  copies: [
    {
      id: 'k1',
      accession_number: '4513',
      barcode: null,
      title: { id: 't1', title: 'Wings of Fire', authors: 'A. P. J. Abdul Kalam' },
      location: { id: 'l1', code: 'A-3' },
      location_text: '',
      status: 'available',
      is_reference: false,
      price: '250.00',
      condition: 'good',
      volume_label: '',
    },
  ],
  version: 1,
};

const TITLE: TitleFormValues = {
  title: ' Wings of Fire ',
  subtitle: '',
  authors: 'A. P. J. Abdul Kalam; Arun Tiwari',
  isbn: '978-81-7371-146-6',
  publisher: '',
  edition: '',
  year: '',
  language: 'English',
  categoryId: 'c1',
  materialType: 'book',
  callNumber: '',
  keywords: '',
  notes: '',
};

const COPIES: CopiesFormValues = {
  count: '3',
  numbering: 'auto',
  numbers: ['', '', ''],
  locationId: 'l1',
  price: '250',
  acquiredOn: '2026-10-04',
  source: 'bought',
  sourceNote: 'Bill 118, Sharma Book Depot',
  isReference: false,
  volumeLabel: '',
};

beforeEach(() => jest.clearAllMocks());

describe('libraryCatalogueService', () => {
  it('sends the first copies with the title, a key, and no numbers when they are automatic', async () => {
    mocked.post.mockResolvedValueOnce({
      data: {
        data: TITLE_WIRE,
        meta: { created_numbers: ['4513', '4514', '4515'], warnings: [] },
      },
    });

    const { title, created } = await createTitle(TITLE, COPIES, 'key-1');

    const [path, body, config] = mocked.post.mock.calls[0] ?? [];
    expect(path).toBe('/library/titles');
    expect(body).toMatchObject({
      title: 'Wings of Fire',
      isbn: '978-81-7371-146-6',
      category_id: 'c1',
      year: null,
      copies: { count: 3, location_id: 'l1', price: '250', source: 'bought' },
    });
    expect((body as { copies: object }).copies).not.toHaveProperty('numbers');
    expect(config).toEqual({ headers: { 'Idempotency-Key': 'key-1' } });
    expect(title.copies[0]?.accessionNumber).toBe('4513');
    expect(title.copies[0]?.location?.code).toBe('A-3');
    expect(created).toEqual({
      titleId: 't1',
      title: 'Wings of Fire',
      numbers: ['4513', '4514', '4515'],
      isbnExists: false,
    });
  });

  it('sends exactly COUNT typed numbers when the merchant types them', async () => {
    mocked.post.mockResolvedValueOnce({ data: { data: [], meta: { created_numbers: ['1024'] } } });

    await addCopies(
      { id: 't1', title: 'Godaan' },
      { ...COPIES, count: '1', numbering: 'typed', numbers: [' 1024 ', '1025'] },
      'key-2'
    );

    const [path, body] = mocked.post.mock.calls[0] ?? [];
    expect(path).toBe('/library/titles/t1/copies');
    expect(body).toMatchObject({ count: 1, numbers: ['1024'] });
  });

  it('reads a duplicate-ISBN warning as a flag, not an error (BR-5)', async () => {
    mocked.post.mockResolvedValueOnce({
      data: {
        data: TITLE_WIRE,
        meta: { created_numbers: ['4516'], warnings: [{ code: 'isbn_exists', title_id: 't0' }] },
      },
    });

    const { created } = await createTitle(TITLE, { ...COPIES, count: '1' }, 'key-3');

    expect(created.isbnExists).toBe(true);
  });

  it('leaves default axes out of the list query and maps the page meta', async () => {
    mocked.get.mockResolvedValueOnce({
      data: { data: [TITLE_WIRE], meta: { page: 2, page_size: 25, total: 26, total_pages: 2 } },
    });

    const page = await listTitles({
      ...TITLE_FILTER_DEFAULTS,
      q: 'wings',
      materialType: 'book',
      page: '2',
    });

    expect(mocked.get.mock.calls[0]?.[0]).toBe('/library/titles?q=wings&material_type=book&page=2');
    expect(page).toMatchObject({ page: 2, pageSize: 25, total: 26, totalPages: 2 });
    expect(page.rows[0]?.category).toEqual({ id: 'c1', name: 'Biography' });
  });

  it('sends the copies filters under their server names', async () => {
    mocked.get.mockResolvedValueOnce({
      data: { data: [], meta: { page: 1, page_size: 25, total: 0, total_pages: 1 } },
    });

    await listCopies({
      q: '',
      status: 'in_repair',
      location: 'l1',
      title: '',
      priceMissing: 'true',
      ordering: 'title',
      page: '1',
    });

    expect(mocked.get.mock.calls[0]?.[0]).toBe(
      '/library/copies?status=in_repair&location=l1&price_missing=true&ordering=title'
    );
  });
});
