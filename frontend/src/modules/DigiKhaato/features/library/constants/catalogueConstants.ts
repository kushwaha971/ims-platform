import { libraryListCodec } from '../hooks/useLibraryListUrl';
import { COPY_STATUSES, MATERIAL_TYPES } from '../types/catalogue.types';

import type { CopyFilters, TitleFilters } from '../types/catalogue.types';

/** F03 — the catalogue lists' defaults: what a URL that names no axis means. */
export const TITLE_FILTER_DEFAULTS: TitleFilters = {
  q: '',
  availability: '',
  materialType: '',
  category: '',
  status: '',
  ordering: '',
  page: '1',
};

export const COPY_FILTER_DEFAULTS: CopyFilters = {
  q: '',
  status: '',
  location: '',
  title: '',
  priceMissing: '',
  ordering: '',
  page: '1',
};

/** How each list's filters travel in the address bar (FR-10, `useLibraryListUrl`). */
export const TITLE_LIST_URL = libraryListCodec<TitleFilters>({
  keys: ['q', 'availability', 'materialType', 'category', 'status', 'ordering', 'page'],
  closed: {
    availability: ['on_shelf', 'all_out'],
    materialType: [...MATERIAL_TYPES],
    status: ['archived', 'all'],
    ordering: ['-created_at'],
  },
});

export const COPY_LIST_URL = libraryListCodec<CopyFilters>({
  keys: ['q', 'status', 'location', 'title', 'priceMissing', 'ordering', 'page'],
  closed: {
    status: [...COPY_STATUSES],
    priceMissing: ['true'],
    ordering: ['title'],
  },
});

/** FR-9 — the search box waits this long after the last key (UI/UX §8). */
export const CATALOGUE_SEARCH_DEBOUNCE_MS = 300;

/** LIB-02 §9 — at most this many copies in one request. */
export const COPIES_MAX = 200;

/** LIB-02 §9 — an accession number's shape and width. */
export const ACCESSION_MAX = 24;
export const ACCESSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/-]*$/;
