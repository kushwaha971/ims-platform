'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { useRouter } from 'next/navigation';

import {
  UbButton,
  UbEmptyState,
  UbFilterBar,
  UbFilterChip,
  UbFilterChipGroup,
  UbPageHeader,
  UbPageShell,
  UbSearchInput,
  UbSelect,
  UbStack,
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

const ALL = 'all';

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
  const statusOptions = useMemo(
    () => [
      { value: ALL, label: t('library.filter.allStatuses') },
      ...COPY_STATUSES.map((value) => ({ value, label: t(`library.copy.status.${value}`) })),
    ],
    [t]
  );
  const locationOptions = useMemo(
    () => [
      { value: ALL, label: t('library.filter.allLocations') },
      ...locations.map((loc) => ({ value: loc.id, label: loc.code })),
    ],
    [t, locations]
  );

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
        <UbFilterBar
          end={
            <UbStack direction="row" gap={2} wrap>
              <UbSelect
                name="library-copy-status"
                aria-label={t('library.filter.status')}
                value={filters.status || ALL}
                options={statusOptions}
                onChange={(value: string) =>
                  setFilters({ status: (value === ALL ? '' : value) as CopyFilters['status'] })
                }
                className="w-36"
              />
              {locations.length > 0 && (
                <UbSelect
                  name="library-copy-location"
                  aria-label={t('library.filter.location')}
                  value={filters.location || ALL}
                  options={locationOptions}
                  onChange={(value: string) => setFilters({ location: value === ALL ? '' : value })}
                  className="w-32"
                />
              )}
            </UbStack>
          }
        >
          <UbFilterChipGroup label={t('library.filter.register')}>
            <UbFilterChip
              label={t('library.filter.priceMissing')}
              pressed={filters.priceMissing === 'true'}
              onToggle={(pressed) => setFilters({ priceMissing: pressed ? 'true' : '' })}
            />
            <UbFilterChip
              label={t('library.filter.byTitle')}
              pressed={filters.ordering === 'title'}
              onToggle={(pressed) => setFilters({ ordering: pressed ? 'title' : '' })}
            />
          </UbFilterChipGroup>
        </UbFilterBar>
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
