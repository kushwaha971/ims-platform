'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useIdempotencyKey } from 'src/hooks/useIdempotencyKey';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { ROUTES } from 'src/routes';
import type { ApiErrorShape } from 'src/types/api.types';
import { applyServerErrors } from 'src/utils/applyServerErrors';
import { todayInTenantTz } from 'src/utils/dates';
import { readDetailString } from 'src/utils/errorDetails';

import {
  catalogueDrawerClosed,
  catalogueDrawerOpened,
  selectLibraryCatalogueForm,
  type LibraryCatalogueFormState,
} from '../redux/libraryCatalogueFormSlice';
import {
  addLibraryCopies,
  createLibraryTitle,
  fetchLibraryCategories,
  fetchLibraryLocations,
  patchLibraryTitle,
  searchLibraryTitles,
} from '../redux/libraryCatalogueThunk';

import type {
  AddBookFormValues,
  CopiesCreated,
  CopiesFormValues,
  TitleDetail,
  TitleFormValues,
} from '../types/catalogue.types';
import type { FieldValues, UseFormSetError } from 'react-hook-form';

/**
 * F03 (LIB-02 FR-3, FR-4) — the catalogue drawers' data and their saves, so
 * the drawers only render.
 *
 * A save's key is minted once per logical write and reused on a retry; a 400
 * rotates it, because a corrected form is a new write and the old key already
 * has an answer. A taken accession number (409, `{number, title}`) is said on
 * the number the merchant typed — "1024 is already *Godaan*" — not in a banner.
 */
export const emptyCopies = (today: string): CopiesFormValues => ({
  count: '1',
  numbering: 'auto',
  numbers: [''],
  locationId: '',
  price: '',
  acquiredOn: today,
  source: 'bought',
  sourceNote: '',
  isReference: false,
  volumeLabel: '',
});

export const emptyTitle = (query = ''): TitleFormValues => ({
  title: query,
  subtitle: '',
  authors: '',
  isbn: '',
  publisher: '',
  edition: '',
  year: '',
  language: '',
  categoryId: '',
  materialType: 'book',
  callNumber: '',
  keywords: '',
  notes: '',
});

export const titleFormValues = (title: TitleDetail): TitleFormValues => ({
  title: title.title,
  subtitle: title.subtitle,
  authors: title.authors,
  isbn: title.isbn13 ?? '',
  publisher: title.publisher,
  edition: title.edition,
  year: title.year ? String(title.year) : '',
  language: title.language,
  categoryId: title.category?.id ?? '',
  materialType: title.materialType,
  callNumber: title.callNumber,
  keywords: title.keywords,
  notes: title.notes,
});

/*
 * The fields each drawer can anchor a server message on (QA-F03-1: with none
 * named, every 400 went to the banner above the form instead of under the
 * field it was about).
 */
const TITLE_FIELDS = Object.keys(emptyTitle());
const COPIES_FIELDS = Object.keys(emptyCopies(''));
const BOOK_FIELDS = [...TITLE_FIELDS, 'copies'];

/** `copies.location_id` → `copies.locationId`; `isbn13` is the form's `isbn`. */
const toFormPath = (wire: string, prefix: string): string =>
  prefix +
  wire
    .split('.')
    .map((part) =>
      part === 'isbn13' ? 'isbn' : part.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
    )
    .join('.');

export interface CatalogueFormResult extends LibraryCatalogueFormState {
  readonly today: string;
  readonly formErrors: readonly string[];
  readonly busy: boolean;
  readonly close: () => void;
  readonly search: (q: string) => void;
  readonly switchToAddCopies: (titleId: string, title: string) => void;
  readonly createTitle: (
    values: AddBookFormValues,
    setError: UseFormSetError<AddBookFormValues>
  ) => Promise<void>;
  readonly addCopies: (
    title: { readonly id: string; readonly title: string },
    copies: CopiesFormValues,
    setError: UseFormSetError<CopiesFormValues>
  ) => Promise<void>;
  readonly editTitle: (
    id: string,
    version: number,
    values: TitleFormValues,
    setError: UseFormSetError<TitleFormValues>
  ) => Promise<void>;
}

export const useCatalogueForm = (): CatalogueFormResult => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { t } = useTranslation();
  const form = useAppSelector(selectLibraryCatalogueForm);
  const timezone = useAppSelector(selectTenantTimezone);
  const today = useMemo(() => todayInTenantTz(timezone ?? undefined), [timezone]);
  const { key, rotate } = useIdempotencyKey();
  const [formErrors, setFormErrors] = useState<readonly string[]>([]);

  useEffect(() => {
    const categories = dispatch(fetchLibraryCategories());
    const locations = dispatch(fetchLibraryLocations());
    return () => {
      categories.abort();
      locations.abort();
    };
  }, [dispatch]);

  const close = useCallback(() => {
    setFormErrors([]);
    dispatch(catalogueDrawerClosed());
  }, [dispatch]);

  const search = useCallback(
    (q: string) => {
      if (q.trim().length >= 2) void dispatch(searchLibraryTitles(q.trim()));
    },
    [dispatch]
  );
  const switchToAddCopies = useCallback(
    (titleId: string, title: string) => {
      dispatch(catalogueDrawerOpened({ kind: 'addCopies', titleId, title }));
    },
    [dispatch]
  );

  /** Says a failed save where it belongs; true when it was answerable in place. */
  const showError = useCallback(
    <T extends FieldValues>(
      error: ApiErrorShape,
      setError: UseFormSetError<T>,
      copiesPrefix: string,
      numbers: readonly string[],
      knownFields: readonly string[]
    ): void => {
      if (error.code === 'validation_error') {
        rotate();
        const translated: ApiErrorShape = {
          ...error,
          details: Object.fromEntries(
            Object.entries(error.details ?? {}).map(([path, messages]) => [
              path.startsWith('copies.') || path === 'copies'
                ? toFormPath(path.replace(/^copies\.?/, ''), copiesPrefix).replace(/\.$/, '')
                : toFormPath(path, ''),
              messages,
            ])
          ),
        };
        setFormErrors(applyServerErrors(translated, setError, knownFields));
        return;
      }
      if (error.code === 'library_accession_taken') {
        const number = readDetailString(error.details, 'number') ?? '';
        const title = readDetailString(error.details, 'title') ?? '';
        const message = t('library.form.number.taken', { number, title });
        const at = numbers.findIndex((n) => n.trim().toUpperCase() === number.toUpperCase());
        if (at >= 0) {
          setError(`${copiesPrefix}numbers.${at}` as Parameters<UseFormSetError<T>>[0], {
            message,
          });
          setFormErrors([]);
        } else {
          setFormErrors([message]);
        }
        return;
      }
      if (error.status === 409 || error.status === 404) setFormErrors([error.message]);
    },
    [rotate, t]
  );

  const announce = useCallback(
    (created: CopiesCreated) => {
      dispatch(
        showSnackbar({
          severity: 'success',
          id: 'library.catalogue.added',
          params: {
            title: created.title,
            count: created.numbers.length,
            numbers: created.numbers.join(', '),
          },
        })
      );
      if (created.isbnExists) {
        dispatch(showSnackbar({ severity: 'info', id: 'library.form.isbn.exists' }));
      }
    },
    [dispatch]
  );

  const createTitle = useCallback(
    async (values: AddBookFormValues, setError: UseFormSetError<AddBookFormValues>) => {
      const { copies, ...title } = values;
      const result = await dispatch(
        createLibraryTitle({ values: title, copies, idempotencyKey: key })
      );
      if (createLibraryTitle.fulfilled.match(result)) {
        rotate();
        close();
        announce(result.payload.created);
        router.push(`${ROUTES.LIBRARY_CATALOGUE}/${result.payload.title.id}`);
        return;
      }
      if (result.payload) {
        showError(result.payload, setError, 'copies.', copies.numbers, BOOK_FIELDS);
      }
    },
    [dispatch, key, rotate, close, announce, router, showError]
  );

  const addCopies = useCallback(
    async (
      title: { readonly id: string; readonly title: string },
      copies: CopiesFormValues,
      setError: UseFormSetError<CopiesFormValues>
    ) => {
      const result = await dispatch(addLibraryCopies({ title, copies, idempotencyKey: key }));
      if (addLibraryCopies.fulfilled.match(result)) {
        rotate();
        close();
        announce(result.payload);
        return;
      }
      if (result.payload) showError(result.payload, setError, '', copies.numbers, COPIES_FIELDS);
    },
    [dispatch, key, rotate, close, announce, showError]
  );

  const editTitle = useCallback(
    async (
      id: string,
      version: number,
      values: TitleFormValues,
      setError: UseFormSetError<TitleFormValues>
    ) => {
      const result = await dispatch(patchLibraryTitle({ id, values, version }));
      if (patchLibraryTitle.fulfilled.match(result)) {
        close();
        dispatch(showSnackbar({ severity: 'success', id: 'library.title.saved' }));
        return;
      }
      if (result.payload) showError(result.payload, setError, '', [], TITLE_FIELDS);
    },
    [dispatch, close, showError]
  );

  return {
    ...form,
    today,
    formErrors,
    busy: form.saveStatus === 'loading',
    close,
    search,
    switchToAddCopies,
    createTitle,
    addCopies,
    editTitle,
  };
};
