'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import type { ListUrlCodec } from 'src/hooks/useListUrl';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectNetworkImpaired } from 'src/redux/slice/networkSlice';
import type { RootState } from 'src/redux/store';
import type { ApiErrorShape } from 'src/types/api.types';

import { useLibraryListUrl } from './useLibraryListUrl';

import type { LibraryListState } from '../redux/libraryListState';
import type { CataloguePage } from '../types/catalogue.types';
import type { LibraryListFilters } from '../types/library.types';
import type { AsyncThunkAction, PayloadAction } from '@reduxjs/toolkit';

/**
 * F03 — everything a catalogue list does, so its page only renders (Part 19
 * §19.4): the filters seeded from and written back to the address bar
 * (`useLibraryListUrl`), a fetch per filter set that aborts the one it
 * replaces, and a refetch when a write elsewhere stales the list.
 */
export interface CatalogueListSpec<F extends LibraryListFilters & { page: string }, R> {
  readonly select: (state: RootState) => LibraryListState<F, R>;
  readonly changed: (patch: Partial<F>) => PayloadAction<Partial<F>>;
  readonly fetch: (
    filters: F
  ) => AsyncThunkAction<CataloguePage<R>, F, { rejectValue: ApiErrorShape }>;
  readonly codec: ListUrlCodec<F>;
  readonly defaults: F;
}

export type CatalogueList<F, R> = LibraryListState<F, R> & {
  readonly canRead: boolean;
  readonly canWrite: boolean;
  readonly setFilters: (patch: Partial<F>) => void;
  readonly clearFilters: () => void;
  readonly setPage: (page: number) => void;
  readonly refetch: () => void;
  /** Narrowed by a FILTER (not its page or its order) — filtered-empty vs first use. */
  readonly narrowed: boolean;
};

export const useCatalogueList = <F extends LibraryListFilters & { page: string }, R>(
  spec: CatalogueListSpec<F, R>
): CatalogueList<F, R> => {
  const { select, changed, fetch, codec, defaults } = spec;
  const dispatch = useAppDispatch();
  const state = useAppSelector(select);
  const isImpaired = useAppSelector(selectNetworkImpaired);
  const { can, hasModule } = usePermissions();
  const canRead = hasModule('library') && can('library.catalogue.read');
  const canWrite = canRead && can('library.catalogue.write');

  const setFilters = useCallback(
    (patch: Partial<F>) => {
      dispatch(changed(patch));
    },
    [dispatch, changed]
  );
  useLibraryListUrl({ codec, filters: state.filters, defaults, onSeed: setFilters });

  const { filters, stale } = state;
  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetch(filters));
    return () => promise.abort();
  }, [dispatch, fetch, canRead, filters]);

  useEffect(() => {
    if (!stale || isImpaired || !canRead) return undefined;
    const promise = dispatch(fetch(filters));
    return () => promise.abort();
  }, [dispatch, fetch, stale, isImpaired, canRead, filters]);

  const refetch = useCallback(() => {
    void dispatch(fetch(filters));
  }, [dispatch, fetch, filters]);
  const clearFilters = useCallback(() => setFilters(defaults), [setFilters, defaults]);
  const setPage = useCallback(
    (page: number) => setFilters({ page: String(page) } as Partial<F>),
    [setFilters]
  );
  const narrowed = useMemo(
    () =>
      codec.keys.some(
        (key) => key !== 'page' && key !== 'ordering' && filters[key] !== defaults[key]
      ),
    [codec, filters, defaults]
  );

  return { ...state, canRead, canWrite, setFilters, clearFilters, setPage, refetch, narrowed };
};
