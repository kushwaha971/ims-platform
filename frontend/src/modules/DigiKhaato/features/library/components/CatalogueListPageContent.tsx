'use client';

import { useCallback, useMemo, type KeyboardEvent } from 'react';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { BookCopy, FolderTree, MapPin, Plus } from 'lucide-react';

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
import { useTitleList } from '../hooks/useCatalogueLists';
import { useLibraryGridLabels } from '../hooks/useLibraryGridLabels';
import {
  catalogueDrawerOpened,
  selectLibraryCatalogueForm,
} from '../redux/libraryCatalogueFormSlice';
import { lookupLibraryCode } from '../redux/libraryCatalogueThunk';
import { MATERIAL_TYPES, type TitleFilters, type TitleRow } from '../types/catalogue.types';
import { listGridState } from '../view-model/copyDisplay';

import { CatalogueActionsMenu } from './CatalogueActionsMenu';
import { createTitleColumns } from './CatalogueColumns';

/** The drawers load with the tap that opens them, not with the list (CLAUDE.md). */
const CatalogueDrawersLazy = dynamic(
  () => import('./CatalogueDrawers').then((m) => m.CatalogueDrawers),
  { ssr: false }
);

/**
 * F03 (LIB-02 FR-9, FR-10, §8) — `/library/catalogue`, "Books": every title,
 * one search box, the availability chips and a material-type filter, all in the
 * address bar. Enter on an exact accession number or barcode opens that copy
 * (FR-9); typing searches as usual. A row opens the title page.
 */
export function CatalogueListPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const list = useTitleList();
  const { drawer } = useAppSelector(selectLibraryCatalogueForm);
  const labels = useLibraryGridLabels();

  const { filters, setFilters, clearFilters, refetch, error } = list;
  const commitSearch = useCallback((q: string) => setFilters({ q }), [setFilters]);
  const [search, setSearch] = useCommittedSearch(
    filters.q,
    commitSearch,
    CATALOGUE_SEARCH_DEBOUNCE_MS
  );

  const onSearchKey = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      const code = search.trim();
      if (event.key !== 'Enter' || !code) return;
      void dispatch(lookupLibraryCode(code)).then((result) => {
        if (lookupLibraryCode.fulfilled.match(result) && result.payload.copyId) {
          router.push(`${ROUTES.LIBRARY_COPIES}/${result.payload.copyId}`);
        }
      });
    },
    [dispatch, router, search]
  );

  const openAdd = useCallback(
    (query = '') => dispatch(catalogueDrawerOpened({ kind: 'addBook', query })),
    [dispatch]
  );
  const columns = useMemo(() => createTitleColumns({ t }), [t]);
  const sheetSpecs = useMemo<UbFilterSpec[]>(
    () => [
      {
        kind: 'single',
        key: 'materialType',
        label: t('library.filter.type'),
        anyLabel: t('library.filter.allTypes'),
        options: MATERIAL_TYPES.map((value) => ({ value, label: t(`library.material.${value}`) })),
      },
      {
        kind: 'single',
        key: 'status',
        label: t('library.filter.status'),
        anyLabel: t('library.filter.allStatuses'),
        options: [{ value: 'archived', label: t('library.filter.archived') }],
      },
    ],
    [t]
  );
  const sheetValues: UbFilterValues = {
    materialType: filters.materialType,
    status: filters.status,
  };
  const applySheet = (next: UbFilterValues) =>
    setFilters({
      materialType: next.materialType ?? '',
      status: next.status ?? '',
    } as Partial<TitleFilters>);
  const emptyStates = useMemo<UbDataGridEmptyStates>(
    () => ({
      firstUse: {
        title: t('library.catalogue.empty.first'),
        description: t('library.catalogue.empty.firstBody'),
        action: list.canWrite ? (
          <UbButton icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => openAdd()}>
            {t('library.catalogue.add')}
          </UbButton>
        ) : undefined,
      },
      filtered: {
        title: filters.q
          ? t('library.catalogue.empty.filteredFor', { q: filters.q })
          : t('library.catalogue.empty.filtered'),
        action: (
          <UbStack direction="row" gap={2} wrap>
            <UbButton variant="secondary" onClick={clearFilters}>
              {t('common.action.clearFilters')}
            </UbButton>
            {list.canWrite && filters.q && (
              <UbButton variant="secondary" onClick={() => openAdd(filters.q)}>
                {t('library.catalogue.addNamed', { q: filters.q })}
              </UbButton>
            )}
          </UbStack>
        ),
      },
      error: {
        title: t('library.catalogue.error.title'),
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
    [t, list.canWrite, filters.q, openAdd, clearFilters, error, refetch]
  );

  const gridState = listGridState(list);

  const rowId = useCallback((row: TitleRow) => row.id, []);
  const rowName = useCallback((row: TitleRow) => row.title, []);
  const openRow = useCallback(
    (row: TitleRow) => router.push(`${ROUTES.LIBRARY_CATALOGUE}/${row.id}`),
    [router]
  );

  if (!list.canRead) {
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
      <UbPageHeader
        title={t('library.catalogue.title')}
        actions={
          <UbStack direction="row" gap={2}>
            {list.canWrite && (
              <UbButton
                icon={<Plus className="h-4 w-4" aria-hidden />}
                iconOnly="mobile"
                onClick={() => openAdd()}
                data-testid="library-add-book"
              >
                {t('library.catalogue.add')}
              </UbButton>
            )}
            <CatalogueActionsMenu
              t={t}
              items={[
                {
                  key: 'copies',
                  label: t('library.copies.title'),
                  icon: BookCopy,
                  action: () => router.push(ROUTES.LIBRARY_COPIES),
                },
                {
                  key: 'categories',
                  label: t('library.categories.title'),
                  icon: FolderTree,
                  action: () => router.push(`${ROUTES.LIBRARY_CATALOGUE}/categories`),
                },
                {
                  key: 'locations',
                  label: t('library.locations.title'),
                  icon: MapPin,
                  action: () => router.push(`${ROUTES.LIBRARY_CATALOGUE}/locations`),
                },
              ]}
            />
          </UbStack>
        }
      />
      <UbStack gap={4} data-testid="library-catalogue-screen">
        <UbSearchInput
          value={search}
          onChange={setSearch}
          onKeyDown={onSearchKey}
          placeholder={t('library.catalogue.search.placeholder')}
          aria-label={t('library.catalogue.search.label')}
        />
        {/* Owner, 6 Oct 2026: availability is the one dropdown; type and
            archived sit behind Filters and return as pills when on. */}
        <UbStack direction="row" align="center" gap={2} className="flex-wrap">
          <UbFilterSelect
            spec={{
              kind: 'single',
              key: 'availability',
              label: t('library.filter.availability'),
              anyLabel: t('library.filter.anyAvailability'),
              options: [
                { value: 'on_shelf', label: t('library.filter.onShelf') },
                { value: 'all_out', label: t('library.filter.allOut') },
              ],
            }}
            value={filters.availability}
            onChange={(availability) => setFilters({ availability } as Partial<TitleFilters>)}
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
          state={gridState}
          labels={labels}
          emptyStates={emptyStates}
          caption={t('library.catalogue.caption')}
          storageId="library.titles"
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
      {drawer && <CatalogueDrawersLazy />}
    </UbPageShell>
  );
}
