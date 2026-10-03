'use client';

import {
  COPY_FILTER_DEFAULTS,
  COPY_LIST_URL,
  TITLE_FILTER_DEFAULTS,
  TITLE_LIST_URL,
} from '../constants/catalogueConstants';
import { fetchLibraryCopies, fetchLibraryTitles } from '../redux/libraryCatalogueThunk';
import { copyFiltersChanged, selectLibraryCopyList } from '../redux/libraryCopyListSlice';
import { selectLibraryTitleList, titleFiltersChanged } from '../redux/libraryTitleListSlice';

import { useCatalogueList, type CatalogueList, type CatalogueListSpec } from './useCatalogueList';

import type { CopyFilters, CopyRow, TitleFilters, TitleRow } from '../types/catalogue.types';

/* Module-level: `useListUrl` keys its effect on the spec's identity. */
const TITLES: CatalogueListSpec<TitleFilters, TitleRow> = {
  select: selectLibraryTitleList,
  changed: titleFiltersChanged,
  fetch: fetchLibraryTitles,
  codec: TITLE_LIST_URL,
  defaults: TITLE_FILTER_DEFAULTS,
};

const COPIES: CatalogueListSpec<CopyFilters, CopyRow> = {
  select: selectLibraryCopyList,
  changed: copyFiltersChanged,
  fetch: fetchLibraryCopies,
  codec: COPY_LIST_URL,
  defaults: COPY_FILTER_DEFAULTS,
};

/** F03 — the titles list (`/library/catalogue`). */
export const useTitleList = (): CatalogueList<TitleFilters, TitleRow> => useCatalogueList(TITLES);

/** F03 — the copies list (`/library/copies`). */
export const useCopyList = (): CatalogueList<CopyFilters, CopyRow> => useCatalogueList(COPIES);
