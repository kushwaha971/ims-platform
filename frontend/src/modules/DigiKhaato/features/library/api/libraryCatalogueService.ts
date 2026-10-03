import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import {
  copyListQuery,
  titleListQuery,
  toCategory,
  toCopiesBody,
  toCopyDetail,
  toCopyRow,
  toLocation,
  toTitleBody,
  toTitleDetail,
  toTitleRow,
} from './libraryMapping';
import { LIBRARY_PATHS } from './libraryPaths';

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
 * F03 (LIB-02 §6) — the catalogue's endpoints. One async function each and the
 * mapping call, nothing else: no React, no Redux, no `Ub*` (Part 19 §19.3.4).
 */

type Wire = Readonly<Record<string, unknown>>;

interface PageApi {
  readonly data: readonly Wire[];
  readonly meta: { page: number; page_size: number; total: number; total_pages: number };
}

const toPage = <R>(body: PageApi, map: (row: Wire) => R): CataloguePage<R> => ({
  rows: body.data.map(map),
  page: body.meta.page,
  pageSize: body.meta.page_size,
  total: body.meta.total,
  totalPages: body.meta.total_pages,
});

const withKey = (key: string) => ubConfig({ headers: { 'Idempotency-Key': key } });

export const listTitles = async (
  filters: TitleFilters,
  signal?: AbortSignal
): Promise<CataloguePage<TitleRow>> => {
  const response = await api.get<PageApi>(
    `${LIBRARY_PATHS.TITLES}${toQueryString(titleListQuery(filters))}`,
    ubConfig({ signal })
  );
  return toPage(response.data, toTitleRow);
};

export const getTitle = async (id: string, signal?: AbortSignal): Promise<TitleDetail> => {
  const response = await api.get<{ data: Wire }>(LIBRARY_PATHS.TITLE(id), ubConfig({ signal }));
  return toTitleDetail(response.data.data);
};

/** FR-3 — "Add book" searches first; the drawer offers what this finds. */
export const searchTitles = async (
  q: string,
  signal?: AbortSignal
): Promise<readonly TitleRow[]> => {
  const response = await api.get<PageApi>(
    `${LIBRARY_PATHS.TITLES}${toQueryString({ q, status: 'all', page_size: 5 })}`,
    ubConfig({ signal })
  );
  return response.data.data.map(toTitleRow);
};

/**
 * `POST /library/titles` with its first copies (FR-4). The key is minted once
 * per logical save and reused on a retry, so a slow first attempt never
 * becomes a second title with three more numbers.
 */
export const createTitle = async (
  values: TitleFormValues,
  copies: CopiesFormValues,
  idempotencyKey: string
): Promise<{ readonly title: TitleDetail; readonly created: CopiesCreated }> => {
  const response = await api.post<{
    data: Wire;
    meta: { created_numbers: string[]; warnings: { code: string }[] };
  }>(
    LIBRARY_PATHS.TITLES,
    { ...toTitleBody(values), copies: toCopiesBody(copies) },
    withKey(idempotencyKey)
  );
  const title = toTitleDetail(response.data.data);
  return {
    title,
    created: {
      titleId: title.id,
      title: title.title,
      numbers: response.data.meta.created_numbers,
      isbnExists: response.data.meta.warnings.some((w) => w.code === 'isbn_exists'),
    },
  };
};

export const patchTitle = async (
  id: string,
  values: TitleFormValues,
  version: number
): Promise<TitleDetail> => {
  const response = await api.patch<{ data: Wire }>(
    LIBRARY_PATHS.TITLE(id),
    { ...toTitleBody(values), version },
    ubConfig({})
  );
  return toTitleDetail(response.data.data);
};

export const addCopies = async (
  title: { readonly id: string; readonly title: string },
  copies: CopiesFormValues,
  idempotencyKey: string
): Promise<CopiesCreated> => {
  const response = await api.post<{ data: Wire[]; meta: { created_numbers: string[] } }>(
    LIBRARY_PATHS.TITLE_COPIES(title.id),
    toCopiesBody(copies),
    withKey(idempotencyKey)
  );
  return {
    titleId: title.id,
    title: title.title,
    numbers: response.data.meta.created_numbers,
    isbnExists: false,
  };
};

export const archiveTitle = async (id: string): Promise<TitleRow> => {
  const response = await api.post<{ data: Wire }>(
    LIBRARY_PATHS.TITLE_ARCHIVE(id),
    {},
    ubConfig({})
  );
  return toTitleRow(response.data.data);
};

export const restoreTitle = async (id: string): Promise<TitleRow> => {
  const response = await api.post<{ data: Wire }>(
    LIBRARY_PATHS.TITLE_RESTORE(id),
    {},
    ubConfig({})
  );
  return toTitleRow(response.data.data);
};

export const listCopies = async (
  filters: CopyFilters,
  signal?: AbortSignal
): Promise<CataloguePage<CopyRow>> => {
  const response = await api.get<PageApi>(
    `${LIBRARY_PATHS.COPIES}${toQueryString(copyListQuery(filters))}`,
    ubConfig({ signal })
  );
  return toPage(response.data, toCopyRow);
};

export const getCopy = async (id: string, signal?: AbortSignal): Promise<CopyDetail> => {
  const response = await api.get<{ data: Wire }>(LIBRARY_PATHS.COPY(id), ubConfig({ signal }));
  return toCopyDetail(response.data.data);
};

export const withdrawCopy = async (id: string, values: WithdrawFormValues): Promise<CopyDetail> => {
  const response = await api.post<{ data: Wire }>(
    LIBRARY_PATHS.COPY_WITHDRAW(id),
    { reason_code: values.reason, note: values.note.trim() },
    ubConfig({})
  );
  return toCopyDetail(response.data.data);
};

export const moveCopy = async (
  id: string,
  move: 'repair' | 'back-to-shelf'
): Promise<CopyDetail> => {
  const path =
    move === 'repair' ? LIBRARY_PATHS.COPY_REPAIR(id) : LIBRARY_PATHS.COPY_BACK_TO_SHELF(id);
  const response = await api.post<{ data: Wire }>(path, {}, ubConfig({}));
  return toCopyDetail(response.data.data);
};

/**
 * FR-9 — an exact accession number or barcode is a copy, not a search: the
 * counter's resolver (BR-8) answers which record a typed code names.
 */
export const lookupCode = async (
  code: string,
  signal?: AbortSignal
): Promise<{ readonly kind: string; readonly copyId: string | null }> => {
  const response = await api.get<{ data: { kind: string; copy?: Wire } }>(
    `${LIBRARY_PATHS.LOOKUP}${toQueryString({ code })}`,
    ubConfig({ signal })
  );
  const { kind, copy } = response.data.data;
  return { kind, copyId: copy ? toCopyRow(copy).id : null };
};

export const listCategories = async (signal?: AbortSignal): Promise<readonly LibraryCategory[]> => {
  const response = await api.get<{ data: Wire[] }>(LIBRARY_PATHS.CATEGORIES, ubConfig({ signal }));
  return response.data.data.map(toCategory);
};

export const saveCategory = async (
  id: string | null,
  body: { readonly name: string; readonly parentId?: string | null; readonly isActive?: boolean }
): Promise<LibraryCategory> => {
  const wire = {
    name: body.name.trim(),
    ...(body.parentId !== undefined ? { parent_id: body.parentId } : {}),
    ...(body.isActive !== undefined ? { is_active: body.isActive } : {}),
  };
  const response = id
    ? await api.patch<{ data: Wire }>(LIBRARY_PATHS.CATEGORY(id), wire, ubConfig({}))
    : await api.post<{ data: Wire }>(LIBRARY_PATHS.CATEGORIES, wire, ubConfig({}));
  return toCategory(response.data.data);
};

export const deleteCategory = async (id: string): Promise<void> => {
  await api.delete(LIBRARY_PATHS.CATEGORY(id), ubConfig({}));
};

export const mergeCategory = async (id: string, intoId: string): Promise<LibraryCategory> => {
  const response = await api.post<{ data: Wire }>(
    LIBRARY_PATHS.CATEGORY_MERGE(id),
    { into_id: intoId },
    ubConfig({})
  );
  return toCategory(response.data.data);
};

export const listLocations = async (signal?: AbortSignal): Promise<readonly LibraryLocation[]> => {
  const response = await api.get<{ data: Wire[] }>(LIBRARY_PATHS.LOCATIONS, ubConfig({ signal }));
  return response.data.data.map(toLocation);
};

export const saveLocation = async (
  id: string | null,
  body: { readonly code: string; readonly name: string; readonly isActive?: boolean }
): Promise<LibraryLocation> => {
  const wire = {
    code: body.code.trim(),
    name: body.name.trim(),
    ...(body.isActive !== undefined ? { is_active: body.isActive } : {}),
  };
  const response = id
    ? await api.patch<{ data: Wire }>(LIBRARY_PATHS.LOCATION(id), wire, ubConfig({}))
    : await api.post<{ data: Wire }>(LIBRARY_PATHS.LOCATIONS, wire, ubConfig({}));
  return toLocation(response.data.data);
};

export const deleteLocation = async (id: string): Promise<void> => {
  await api.delete(LIBRARY_PATHS.LOCATION(id), ubConfig({}));
};
