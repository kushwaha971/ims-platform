'use client';

import { useCallback, useMemo, type KeyboardEvent } from 'react';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { BookCopy, FolderTree, MapPin, Plus } from 'lucide-react';

import {
  UbButton,
  UbEmptyState,
  UbFilterBar,
  UbFilterChip,
  UbFilterChipGroup,
  UbPageHeader,
  UbPageShell,
  UbSearchInput,
  UbNativeSelect,
  UbStack,
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

const ALL = 'all';

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
  const materialOptions = useMemo(
    () => [
      { value: ALL, label: t('library.filter.allTypes') },
      ...MATERIAL_TYPES.map((value) => ({ value, label: t(`library.material.${value}`) })),
    ],
    [t]
  );
  const toggle = useCallback(
    <K extends keyof TitleFilters>(key: K, value: TitleFilters[K]) =>
      (pressed: boolean) =>
        setFilters({ [key]: pressed ? value : '' } as Partial<TitleFilters>),
    [setFilters]
  );

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
        <UbFilterBar
          end={
            <UbNativeSelect
              name="library-material"
              aria-label={t('library.filter.type')}
              value={filters.materialType || ALL}
              options={materialOptions}
              onChange={(value: string) =>
                setFilters({
                  materialType: (value === ALL ? '' : value) as TitleFilters['materialType'],
                })
              }
              className="w-40"
            />
          }
        >
          <UbFilterChipGroup label={t('library.filter.availability')}>
            <UbFilterChip
              label={t('library.filter.onShelf')}
              pressed={filters.availability === 'on_shelf'}
              onToggle={toggle('availability', 'on_shelf')}
            />
            <UbFilterChip
              label={t('library.filter.allOut')}
              pressed={filters.availability === 'all_out'}
              onToggle={toggle('availability', 'all_out')}
            />
          </UbFilterChipGroup>
          <UbFilterChipGroup label={t('library.filter.status')}>
            <UbFilterChip
              label={t('library.filter.archived')}
              pressed={filters.status === 'archived'}
              onToggle={toggle('status', 'archived')}
            />
          </UbFilterChipGroup>
        </UbFilterBar>
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
