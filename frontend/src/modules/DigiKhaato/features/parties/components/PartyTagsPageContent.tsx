'use client';

import { useCallback, useMemo, useState } from 'react';

import dynamic from 'next/dynamic';

import { Plus } from 'lucide-react';

import {
  UbButton,
  UbConfirmDialog,
  UbPageHeader,
  UbPageShell,
  UbStack,
  UbStatusBanner,
  UbTextInput,
} from 'src/design-system';
import {
  UbDataGrid,
  type UbDataGridEmptyStates,
  type UbDataGridLabels,
  type UbGridSort,
  type UbGridState,
} from 'src/design-system/UbDataGrid';
import { useTranslation } from 'src/hooks/useTranslation';

import { MAX_TAGS_PER_TENANT } from '../constants/partyTags';
import { usePartyTagManager } from '../hooks/usePartyTagManager';
import { usePartyTags } from '../hooks/usePartyTags';

import { createPartyTagColumns } from './PartyTagsColumns';

import type { PartyTagWithCount } from '../types/party.types';

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

/**
 * Both dialogs open on an interaction, so neither belongs in the route chunk.
 *
 * Together they carry a combobox, a radio group, the chip preview and the
 * merge picker — 20 KB gz of controls for two overlays that a merchant on this
 * screen may never open, because reading the counts is a perfectly good reason
 * to be here. `ssr: false` because an overlay is never part of a server render:
 * `open` is false in every server pass, so there is no hydration mismatch to
 * avoid.
 */
const PartyTagFormDialogLazy = dynamic(
  () => import('./PartyTagFormDialog').then((m) => m.PartyTagFormDialog),
  { ssr: false }
);
const PartyTagMergeDialogLazy = dynamic(
  () => import('./PartyTagMergeDialog').then((m) => m.PartyTagMergeDialog),
  { ssr: false }
);

/**
 * PTY-05 FR-7 — the tag manager.
 *
 * ── Paged and searched on the CLIENT, and that is not laziness ──────────────
 * Every other list in this product pages on the server, because every other
 * list can be arbitrarily long. This one cannot: FR-13 caps a tenant at two
 * hundred tags, the endpoint is deliberately unpaginated, and the whole set is
 * already in the store because four other screens need it there. Asking the
 * server to slice two hundred rows it has already sent would be a round trip
 * to learn something this page is holding.
 *
 * So `q`, the sort and the page are local state, and the grid gets a slice. The
 * consequence worth naming: the sort is a `localeCompare`, not Postgres's
 * collation, so a book with mixed Devanagari and Latin tags may order slightly
 * differently here than the server would. On a two-hundred-row list a merchant
 * is scanning rather than paging, and the search is what they actually reach
 * for.
 *
 * ── The ceiling is stated before it is hit ──────────────────────────────────
 * FR-13. "184 of 200 tags used" sits under the title from the start, so the
 * refusal at 201 is the end of a sentence the merchant has been reading rather
 * than a surprise — and the row that tells them which tags are unused is two
 * clicks away, sorted, in the column beside it.
 */
export function PartyTagsPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  /* `force`, because on this screen the counts ARE the content: "Camp Area ·
     34" is the number a merchant is about to make a delete decision on, and a
     cached one from when the picker last opened is a number they would be right
     to trust and should not. */
  const { tags, status, error, refetch } = usePartyTags({ force: true });
  const manager = usePartyTagManager();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<UbGridSort>({ columnId: 'name', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    const matched = needle
      ? tags.filter((tag) => tag.name.toLocaleLowerCase().includes(needle))
      : tags;
    const direction = sort.direction === 'asc' ? 1 : -1;
    return [...matched].sort((left, right) =>
      sort.columnId === 'partyCount'
        ? /* Ties broken by name, always. Without it a book with forty unused
             tags reorders itself every time this screen re-renders, and a
             merchant working down the list loses their place. */
          direction * (left.partyCount - right.partyCount) ||
          left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
        : direction * left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    );
  }, [tags, search, sort]);

  const pageRows = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  );

  const columns = useMemo(
    () =>
      createPartyTagColumns({
        t,
        canWrite: manager.canWrite,
        canDelete: manager.canDelete,
        onEdit: manager.openEdit,
        onMerge: manager.openMerge,
        onDelete: manager.openDelete,
      }),
    [
      t,
      manager.canWrite,
      manager.canDelete,
      manager.openEdit,
      manager.openMerge,
      manager.openDelete,
    ]
  );

  const labels = useMemo<UbDataGridLabels>(
    () => ({
      loading: t('parties.tags.manage.title'),
      pageOf: t('common.grid.pageOf', { page: '{page}', pages: '{pages}' }),
      previousPage: t('common.grid.previousPage'),
      nextPage: t('common.grid.nextPage'),
      pageSize: t('common.grid.pageSize'),
      goToPage: t('common.grid.goToPage', { page: '{page}' }),
      ofTotal: t('common.grid.ofTotal', { total: '{total}' }),
      selectedCount: t('common.grid.selectedCount', { count: 0 }),
      selectAll: t('parties.list.select.all'),
      selectRow: t('parties.list.select.row', { name: '{name}' }),
      showing: t('common.grid.showing'),
      columns: t('common.grid.columns'),
      showAllColumns: t('common.grid.showAllColumns'),
      sortBy: t('common.grid.sortBy', { column: '{column}' }),
      sortedAscending: t('common.grid.sortedAscending'),
      sortedDescending: t('common.grid.sortedDescending'),
      openRow: t('parties.list.open', { name: '{name}' }),
    }),
    [t]
  );

  const emptyStates = useMemo<UbDataGridEmptyStates>(
    () => ({
      firstUse: {
        title: t('parties.tags.manage.empty.title'),
        description: t('parties.tags.manage.empty.body'),
        action: manager.canWrite ? (
          <UbButton onClick={manager.openCreate}>{t('parties.tags.manage.new')}</UbButton>
        ) : undefined,
      },
      filtered: {
        title: t('parties.tags.manage.empty.title'),
        description: t('parties.tags.filter.empty'),
        action: (
          <UbButton variant="secondary" onClick={() => setSearch('')}>
            {t('common.action.clearFilters')}
          </UbButton>
        ),
      },
      error: {
        title: t('parties.tags.manage.error.title'),
        description: error?.message ?? t('parties.tags.load.error'),
        requestId: error?.requestId ?? null,
        action: (
          <UbButton variant="secondary" onClick={refetch}>
            {t('parties.tags.manage.error.retry')}
          </UbButton>
        ),
      },
    }),
    [t, manager.canWrite, manager.openCreate, error, refetch]
  );

  const gridState: UbGridState =
    status === 'loading'
      ? 'loading'
      : status === 'failed'
        ? 'error'
        : pageRows.length === 0
          ? search.trim()
            ? 'filtered-empty'
            : 'empty'
          : 'rows';

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    /* Any narrowing resets the page — the shared rule of §17.0.3, and here it
       is load-bearing rather than tidy: searching from page 3 of a set that is
       now one page long would show an empty grid over a list that has matches. */
    setPage(1);
  }, []);

  const handlePageSize = useCallback((next: number) => {
    setPageSize(next);
    setPage(1);
  }, []);

  const rowId = useCallback((tag: PartyTagWithCount) => tag.id, []);
  const rowName = useCallback((tag: PartyTagWithCount) => tag.name, []);

  const atCeiling = tags.length >= MAX_TAGS_PER_TENANT;

  return (
    <UbPageShell
      width="full"
      header={
        <UbPageHeader
          title={t('parties.tags.manage.title')}
          subtitle={t('parties.tags.manage.subtitle')}
          actions={
            manager.canWrite ? (
              <UbButton
                icon={<Plus className="h-4 w-4" aria-hidden />}
                onClick={manager.openCreate}
                /* Disabled rather than hidden, uniquely on this screen: the
                   reason is stated in the banner directly above it and the fix
                   — merge or delete one — is the screen the button is on. This
                   is the case §19.7.5's "hidden, not disabled" rule excludes: a
                   control blocked by something the user can see and change. */
                disabled={atCeiling}
              >
                {t('parties.tags.manage.new')}
              </UbButton>
            ) : undefined
          }
        />
      }
    >
      <UbStack gap={6}>
        {atCeiling ? (
          <UbStatusBanner
            tone="warning"
            title={t('parties.tags.manage.limitReached', { max: MAX_TAGS_PER_TENANT })}
          />
        ) : (
          tags.length > 0 && (
            <UbStatusBanner
              tone="info"
              title={t('parties.tags.manage.limit', {
                used: tags.length,
                max: MAX_TAGS_PER_TENANT,
              })}
            />
          )
        )}

        <UbDataGrid
          rows={pageRows}
          columns={columns}
          rowId={rowId}
          rowName={rowName}
          state={gridState}
          labels={labels}
          emptyStates={emptyStates}
          caption={t('parties.tags.manage.title')}
          storageId="parties.tags"
          page={{
            page,
            pageSize,
            total: filtered.length,
            totalPages: Math.max(Math.ceil(filtered.length / pageSize), 1),
          }}
          onPageChange={setPage}
          onPageSizeChange={handlePageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          sort={sort}
          onSortChange={setSort}
          /* No initials disc: these are labels, not people. "CA" beside "Camp
             Area" invites the reader to look for somebody, and the 40 px it
             costs is the difference between a card's three actions sitting on
             one line and stacking on three. */
          cardAvatar={false}
          search={
            <UbTextInput
              value={search}
              onChange={handleSearch}
              type="text"
              aria-label={t('parties.tags.filter.search')}
              placeholder={t('parties.tags.filter.search')}
            />
          }
        />
      </UbStack>

      {manager.stage === 'form' && (
        <PartyTagFormDialogLazy
          t={t}
          open
          draft={manager.draft}
          saving={manager.saving}
          error={manager.error}
          collision={manager.collision}
          canMerge={manager.canWrite}
          onSave={manager.save}
          onAcceptMerge={manager.acceptMerge}
          onClose={manager.close}
        />
      )}

      {manager.stage === 'merge' && (
        <PartyTagMergeDialogLazy
          t={t}
          open
          source={manager.target}
          tags={tags}
          saving={manager.saving}
          error={manager.error}
          onMerge={manager.merge}
          onClose={manager.close}
        />
      )}

      <UbConfirmDialog
        open={manager.stage === 'delete'}
        onOpenChange={(next) => {
          if (!next) manager.close();
        }}
        destructive
        title={t('parties.tags.delete.title', { name: manager.target?.name ?? '' })}
        /* The count is the server's, fetched with `?dry_run=true` when the
           dialog opened — see the hook for why the row's own number will not
           do. Until it lands the sentence says what SURVIVES, which is true
           whatever the number turns out to be and is the half merchants are
           actually anxious about: deleting a label must not delete the people. */
        description={
          /* `null` means the count is still in flight, and it is NOT the same
             as zero. Both branches used to render "No party is using it." — so
             a merchant on a 2G connection opened the delete dialog for a tag on
             thirty-four parties, read that no party used it, and had an enabled
             Delete button under the sentence. A destructive confirmation that
             states a falsehood is worse than one that says nothing. */
          manager.deleteCount === null
            ? t('parties.tags.delete.checking')
            : manager.deleteCount === 0
              ? t('parties.tags.delete.bodyUnused')
              : manager.deleteCount === 1
                ? t('parties.tags.delete.bodyOne')
                : t('parties.tags.delete.body', { count: manager.deleteCount })
        }
        confirmLabel={t('parties.tags.delete.confirm')}
        cancelLabel={t('parties.tags.form.cancel')}
        closeLabel={t('common.action.close')}
        onConfirm={manager.remove}
        /* Busy until the count lands, so Delete cannot be pressed under a
           sentence that has not finished being true. */
        busy={manager.saving || manager.deleteCount === null}
        busyLabel={t('parties.tags.form.saving')}
      />
    </UbPageShell>
  );
}
