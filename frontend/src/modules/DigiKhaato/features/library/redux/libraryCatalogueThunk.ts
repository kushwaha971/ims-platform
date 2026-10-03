import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import './libraryInvalidation';

import type {
  CataloguePage,
  CopiesCreated,
  CopiesFormValues,
  CopyDetail,
  CopyFilters,
  CopyRow,
  LibraryCategory,
  LibraryLocation,
  TitleDetail,
  TitleFilters,
  TitleFormValues,
  TitleRow,
  WithdrawFormValues,
} from '../types/catalogue.types';

/**
 * F03 (LIB-02) — the catalogue's thunks: one service call each and a catch
 * that normalises (Part 19 §19.3.3). The service is imported INSIDE each
 * thunk, as payments does, so a screen that only dispatches never pays for the
 * service until its first request. The bare import above registers the
 * library's invalidation map before any of these can be dispatched (ADR-062).
 */
const service = () => import('../api/libraryCatalogueService');

type Reject = { rejectValue: ApiErrorShape };

// ── Queries ──────────────────────────────────────────────────────────────────

export const fetchLibraryTitles = createAsyncThunk<CataloguePage<TitleRow>, TitleFilters, Reject>(
  'libraryTitleList/fetch',
  async (filters, { signal, rejectWithValue }) => {
    try {
      return await (await service()).listTitles(filters, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.catalogue.error.title'));
    }
  }
);

export const fetchLibraryTitle = createAsyncThunk<TitleDetail, string, Reject>(
  'libraryTitleDetail/fetch',
  async (id, { signal, rejectWithValue }) => {
    try {
      return await (await service()).getTitle(id, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.title.error.title'));
    }
  }
);

/** FR-3 — the add-book drawer's search-first step. */
export const searchLibraryTitles = createAsyncThunk<readonly TitleRow[], string, Reject>(
  'libraryCatalogueForm/search',
  async (q, { signal, rejectWithValue }) => {
    try {
      return await (await service()).searchTitles(q, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.catalogue.error.title'));
    }
  }
);

export const fetchLibraryCopies = createAsyncThunk<CataloguePage<CopyRow>, CopyFilters, Reject>(
  'libraryCopyList/fetch',
  async (filters, { signal, rejectWithValue }) => {
    try {
      return await (await service()).listCopies(filters, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.copies.error.title'));
    }
  }
);

export const fetchLibraryCopy = createAsyncThunk<CopyDetail, string, Reject>(
  'libraryCopyDetail/fetch',
  async (id, { signal, rejectWithValue }) => {
    try {
      return await (await service()).getCopy(id, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.copy.error.title'));
    }
  }
);

export const fetchLibraryCategories = createAsyncThunk<readonly LibraryCategory[], void, Reject>(
  'libraryCatalogueForm/fetchCategories',
  async (_, { signal, rejectWithValue }) => {
    try {
      return await (await service()).listCategories(signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.categories.error'));
    }
  }
);

export const fetchLibraryLocations = createAsyncThunk<readonly LibraryLocation[], void, Reject>(
  'libraryCatalogueForm/fetchLocations',
  async (_, { signal, rejectWithValue }) => {
    try {
      return await (await service()).listLocations(signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.locations.error'));
    }
  }
);

// ── Mutations ────────────────────────────────────────────────────────────────

export const createLibraryTitle = createAsyncThunk<
  { readonly title: TitleDetail; readonly created: CopiesCreated },
  {
    readonly values: TitleFormValues;
    readonly copies: CopiesFormValues;
    readonly idempotencyKey: string;
  },
  Reject
>('libraryCatalogueForm/createTitle', async (arg, { rejectWithValue }) => {
  try {
    return await (await service()).createTitle(arg.values, arg.copies, arg.idempotencyKey);
  } catch (error) {
    return rejectWithValue(toApiError(error));
  }
});

export const patchLibraryTitle = createAsyncThunk<
  TitleDetail,
  { readonly id: string; readonly values: TitleFormValues; readonly version: number },
  Reject
>('libraryCatalogueForm/patchTitle', async ({ id, values, version }, { rejectWithValue }) => {
  try {
    return await (await service()).patchTitle(id, values, version);
  } catch (error) {
    return rejectWithValue(toApiError(error));
  }
});

export const addLibraryCopies = createAsyncThunk<
  CopiesCreated,
  {
    readonly title: { readonly id: string; readonly title: string };
    readonly copies: CopiesFormValues;
    readonly idempotencyKey: string;
  },
  Reject
>('libraryCatalogueForm/addCopies', async (arg, { rejectWithValue }) => {
  try {
    return await (await service()).addCopies(arg.title, arg.copies, arg.idempotencyKey);
  } catch (error) {
    return rejectWithValue(toApiError(error));
  }
});

export const setLibraryTitleArchived = createAsyncThunk<
  TitleRow,
  { readonly id: string; readonly archived: boolean },
  Reject
>('libraryTitleDetail/setArchived', async ({ id, archived }, { rejectWithValue }) => {
  try {
    const s = await service();
    return await (archived ? s.archiveTitle(id) : s.restoreTitle(id));
  } catch (error) {
    return rejectWithValue(toApiError(error));
  }
});

export const withdrawLibraryCopy = createAsyncThunk<
  CopyDetail,
  { readonly id: string; readonly values: WithdrawFormValues },
  Reject
>('libraryCopyDetail/withdraw', async ({ id, values }, { rejectWithValue }) => {
  try {
    return await (await service()).withdrawCopy(id, values);
  } catch (error) {
    return rejectWithValue(toApiError(error));
  }
});

export const moveLibraryCopy = createAsyncThunk<
  CopyDetail,
  { readonly id: string; readonly move: 'repair' | 'back-to-shelf' },
  Reject
>('libraryCopyDetail/move', async ({ id, move }, { rejectWithValue }) => {
  try {
    return await (await service()).moveCopy(id, move);
  } catch (error) {
    return rejectWithValue(toApiError(error));
  }
});

export const saveLibraryCategory = createAsyncThunk<
  LibraryCategory,
  {
    readonly id: string | null;
    readonly name: string;
    readonly parentId?: string | null;
    readonly isActive?: boolean;
  },
  Reject
>('libraryCatalogueForm/saveCategory', async ({ id, ...body }, { rejectWithValue }) => {
  try {
    return await (await service()).saveCategory(id, body);
  } catch (error) {
    return rejectWithValue(toApiError(error));
  }
});

export const deleteLibraryCategory = createAsyncThunk<string, string, Reject>(
  'libraryCatalogueForm/deleteCategory',
  async (id, { rejectWithValue }) => {
    try {
      await (await service()).deleteCategory(id);
      return id;
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  }
);

export const mergeLibraryCategory = createAsyncThunk<
  LibraryCategory,
  { readonly id: string; readonly intoId: string },
  Reject
>('libraryCatalogueForm/mergeCategory', async ({ id, intoId }, { rejectWithValue }) => {
  try {
    return await (await service()).mergeCategory(id, intoId);
  } catch (error) {
    return rejectWithValue(toApiError(error));
  }
});

export const saveLibraryLocation = createAsyncThunk<
  LibraryLocation,
  {
    readonly id: string | null;
    readonly code: string;
    readonly name: string;
    readonly isActive?: boolean;
  },
  Reject
>('libraryCatalogueForm/saveLocation', async ({ id, ...body }, { rejectWithValue }) => {
  try {
    return await (await service()).saveLocation(id, body);
  } catch (error) {
    return rejectWithValue(toApiError(error));
  }
});

export const deleteLibraryLocation = createAsyncThunk<string, string, Reject>(
  'libraryCatalogueForm/deleteLocation',
  async (id, { rejectWithValue }) => {
    try {
      await (await service()).deleteLocation(id);
      return id;
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  }
);
