'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { useRouter } from 'next/navigation';

import {
  UbButton,
  UbEmptyState,
  UbPageHeader,
  UbPageShell,
  UbSearchInput,
  UbStack,
  UbActiveFilters,
  UbFilterSelect,
  UbFilterSheet,
  type UbFilterSpec,
  type UbFilterValues,
} from 'src/design-system';
import { UbDataGrid, type UbDataGridEmptyStates } from 'src/design-system/UbDataGrid';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useCommittedSearch } from 'src/hooks/useCommittedSearch';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';

import { CATALOGUE_SEARCH_DEBOUNCE_MS } from '../constants/catalogueConstants';
import { useCopyList } from '../hooks/useCatalogueLists';
import { useLibraryGridLabels } from '../hooks/useLibraryGridLabels';
import { selectLibraryCatalogueForm } from '../redux/libraryCatalogueFormSlice';
import { fetchLibraryLocations } from '../redux/libraryCatalogueThunk';
import { COPY_STATUSES, type CopyFilters, type CopyRow } from '../types/catalogue.types';
import { listGridState } from '../view-model/copyDisplay';

import { createCopyColumns } from './CatalogueColumns';

/**
 * F03 (LIB-02 FR-10) — `/library/copies`: every physical book, in accession
 * order (numeric-aware, BR-4), filtered by status and location, with the
 * "price missing" chip a librarian uses to finish a register. A row opens the
 * copy page.
 */
export function CopyListPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const list = useCopyList();
  const { locations } = useAppSelector(selectLibraryCatalogueForm);
  const labels = useLibraryGridLabels();
  const { filters, setFilters, clearFilters, refetch, error, canRead } = list;

  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchLibraryLocations());
    return () => promise.abort();
  }, [dispatch, canRead]);

  const commitSearch = useCallback((q: string) => setFilters({ q }), [setFilters]);
  const [search, setSearch] = useCommittedSearch(
    filters.q,
    commitSearch,
    CATALOGUE_SEARCH_DEBOUNCE_MS
  );

  const columns = useMemo(() => createCopyColumns({ t }), [t]);
  const sheetSpecs = useMemo<UbFilterSpec[]>(
    () => [
      ...(locations.length > 0
        ? [
            {
              kind: 'single' as const,
              key: 'location',
              label: t('library.filter.location'),
              anyLabel: t('library.filter.allLocations'),
              options: locations.map((loc) => ({ value: loc.id, label: loc.code })),
            },
          ]
        : []),
      {
        kind: 'single',
        key: 'priceMissing',
        label: t('library.filter.priceMissing'),
        anyLabel: t('library.members.filter.any'),
        options: [{ value: 'true', label: t('library.members.filter.yes') }],
      },
      {
        kind: 'single',
        key: 'ordering',
        label: t('library.filter.order'),
        anyLabel: t('library.filter.byAccession'),
        options: [{ value: 'title', label: t('library.filter.byTitle') }],
      },
    ],
    [t, locations]
  );
  const sheetValues: UbFilterValues = {
    location: filters.location,
    priceMissing: filters.priceMissing,
    ordering: filters.ordering,
  };
  const applySheet = (next: UbFilterValues) =>
    setFilters({
      location: next.location ?? '',
      priceMissing: next.priceMissing ?? '',
      ordering: next.ordering ?? '',
    } as Partial<CopyFilters>);

  const emptyStates = useMemo<UbDataGridEmptyStates>(
    () => ({
      firstUse: {
        title: t('library.copies.empty.first'),
        description: t('library.copies.empty.firstBody'),
        action: (
          <UbButton variant="secondary" onClick={() => router.push(ROUTES.LIBRARY_CATALOGUE)}>
            {t('library.catalogue.title')}
          </UbButton>
        ),
      },
      filtered: {
        title: t('library.copies.empty.filtered'),
        action: (
          <UbButton variant="secondary" onClick={clearFilters}>
            {t('common.action.clearFilters')}
          </UbButton>
        ),
      },
      error: {
        title: t('library.copies.error.title'),
        description: error?.message ?? t('library.catalogue.error.body'),
        requestId: error?.requestId ?? null,
        requestIdLabel: t('common.error.reference'),
        action: (
          <UbButton variant="secondary" onClick={refetch}>
            {t('common.action.retry')}
          </UbButton>
        ),
      },
    }),
    [t, router, clearFilters, error, refetch]
  );

  const rowId = useCallback((row: CopyRow) => row.id, []);
  const rowName = useCallback((row: CopyRow) => `${row.accessionNumber} ${row.title.title}`, []);
  const openRow = useCallback(
    (row: CopyRow) => router.push(`${ROUTES.LIBRARY_COPIES}/${row.id}`),
    [router]
  );

  if (!canRead) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('library.noAccess.title')}
          description={t('library.noAccess.body')}
        />
      </UbPageShell>
    );
  }

  return (
    <UbPageShell>
      <UbPageHeader title={t('library.copies.title')} />
      <UbStack gap={4} data-testid="library-copies-screen">
        <UbSearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('library.copies.search.placeholder')}
          aria-label={t('library.copies.search.label')}
        />
        {/* Owner, 6 Oct 2026: status is the one dropdown; place, the
            missing-price register and the order sit behind Filters. */}
        <UbStack direction="row" align="center" gap={2} className="flex-wrap">
          <UbFilterSelect
            spec={{
              kind: 'single',
              key: 'status',
              label: t('library.filter.status'),
              anyLabel: t('library.filter.allStatuses'),
              options: COPY_STATUSES.map((value) => ({
                value,
                label: t(`library.copy.status.${value}`),
              })),
            }}
            value={filters.status}
            onChange={(status) => setFilters({ status } as Partial<CopyFilters>)}
            closeLabel={t('common.action.close')}
          />
          <UbFilterSheet
            specs={sheetSpecs}
            values={sheetValues}
            onApply={applySheet}
            labels={{
              title: t('common.filters.title'),
              apply: t('common.action.apply'),
              reset: t('common.action.reset'),
              close: t('common.action.close'),
            }}
          />
        </UbStack>
        <UbActiveFilters
          specs={sheetSpecs}
          values={sheetValues}
          onChange={applySheet}
          labels={{
            remove: (pill) => t('common.filters.remove', { filter: pill }),
            clearAll: t('common.filters.clearAll'),
          }}
        />
        <UbDataGrid
          rows={list.rows}
          columns={columns}
          rowId={rowId}
          rowName={rowName}
          state={listGridState(list)}
          labels={labels}
          emptyStates={emptyStates}
          caption={t('library.copies.caption')}
          storageId="library.copies"
          page={{
            page: list.page,
            pageSize: list.pageSize,
            total: list.total,
            totalPages: list.totalPages,
          }}
          onPageChange={list.setPage}
          onRowOpen={openRow}
          cardAvatar={false}
        />
      </UbStack>
    </UbPageShell>
  );
}
