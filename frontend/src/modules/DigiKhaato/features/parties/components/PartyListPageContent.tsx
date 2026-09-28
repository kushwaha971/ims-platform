'use client';

import { useCallback, useMemo } from 'react';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { Plus, Tags } from 'lucide-react';

import {
  UbActionLink,
  UbButton,
  UbPageHeader,
  UbPageShell,
  UbSelect,
  UbStack,
  UbStatusBanner,
  UbTextInput,
} from 'src/design-system';
import {
  UbDataGrid,
  useGridTier,
  type UbDataGridEmptyStates,
  type UbDataGridLabels,
  type UbGridSort,
  type UbGridState,
} from 'src/design-system/UbDataGrid';
import { useNowMs } from 'src/hooks/useNowMs';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES, partyPath } from 'src/routes';
import type { PartyStatus } from 'src/types/domain.types';

import {
  ImportActionLink,
  ListExportButton,
} from 'modules/DigiKhaato/features/imports/components/ListHeaderActions';

import { partyExportPath } from '../api/partyService';
import { PAGE_SIZE_OPTIONS } from '../constants/partyListDefaults';
import { TAG_CHIPS_PER_ROW } from '../constants/partyTags';
import { useBulkArchive } from '../hooks/usePartyArchive';
import { usePartyBulkTag } from '../hooks/usePartyBulkTag';
import { usePartyForm } from '../hooks/usePartyForm';
import { usePartyList } from '../hooks/usePartyList';
import { usePartyTags } from '../hooks/usePartyTags';
import { orderingFor, sortFromOrdering } from '../view-model/partyListSort';

import { PartyBulkArchiveDialog } from './PartyBulkArchiveDialog';
import { createPartyColumns } from './PartyListColumns';
import { PartyListFilters } from './PartyListFilters';
import { PartyListSortSheet } from './PartyListSortSheet';
import { PartyListStats } from './PartyListStats';

import type {
  PartyBalanceFilter,
  PartyCollectionFilter,
  PartyCreditFilter,
  PartyTypeFilter,
} from '../constants/partyFilters';
import type { Party } from '../types/party.types';

/**
 * `ssr: false` because a drawer is never part of a server render: it opens on
 * an interaction, so `open` is false in every server pass and there is no
 * hydration mismatch to avoid.
 */
const PartyFormDrawerLazy = dynamic(
  () => import('./PartyFormDrawer').then((m) => m.PartyFormDrawer),
  { ssr: false }
);

/**
 * PTY-05's bulk dialog, split out for the same reason and by the same measure.
 *
 * It carries `UbTokenInput` (a popover, a command palette and the chip
 * rendering), `UbRadioGroup` and the tag picker's own adapter — and it opens
 * only when a merchant has selected rows AND pressed Add tag, which is a
 * deliberate, occasional act. In the route chunk it cost /parties 7.4 KB gz,
 * paid by every merchant who opens the list to READ it, which is almost all of
 * them. The selection bar's button is what the page needs eagerly, and that is
 * a string.
 */
const PartyBulkTagDialogLazy = dynamic(
  () => import('./PartyBulkTagDialog').then((m) => m.PartyBulkTagDialog),
  { ssr: false }
);

/**
 * PTY-02's list, and the reference implementation of the approved responsive
 * rules: one column model, three renderings, chosen by `UbDataGrid`.
 *
 * What this screen still owns, and what it handed over:
 *
 *  · It owns the COPY (every string below is a key), the COLUMN MODEL and its
 *    priorities, and the decision about what each of the three empty states
 *    says. All three are domain judgements and none of them belongs in a `Ub*`.
 *  · It handed over the LAYOUT. Cards below `md`, priority columns at `md`,
 *    the full table with selection at `lg` — and the guarantee that none of the
 *    three scrolls sideways — are now the grid's contract, so `/items`,
 *    `/sales/invoices` and `/payments` inherit them instead of re-deciding them.
 *
 * ── Kept deliberately from the screen this replaces ─────────────────────────
 *  · **The filtered-empty state clears the search.** Its action was labelled
 *    `common.action.retry` — "Try again" on a button that clears a filter — and
 *    it is `common.action.clearFilters`, three lines from where the tenant
 *    chooser was already using it correctly.
 *  · **The subtitle is constant and the count is a caption.** The sentence that
 *    explains what the screen is for does not vanish the moment data arrives.
 *  · **The error state keeps its request id** (R-E-4) and its own in-page
 *    rendering — `partyService` suppresses the toast for exactly this reason.
 *
 * ── Added by this wave ──────────────────────────────────────────────────────
 *  · The two header totals, in the STICKY header, at every width.
 *  · Server-side sort on name, balance and last entry.
 *  · Selection and a bulk action at `lg` and up.
 */

const STATUS_OPTIONS: readonly PartyStatus[] = ['active', 'archived'];

export function PartyListPageContent(): React.JSX.Element {
  const { t, n } = useTranslation();
  const router = useRouter();
  const partyForm = usePartyForm();
  const {
    rows,
    meta,
    filters,
    status,
    error,
    totals,
    totalsScope,
    overLimit,
    selectedIds,
    setSelectedIds,
    setOrdering,
    setFilters,
    setPage,
    searchInput,
    setSearchInput,
    isFiltered,
    activeFilterCount,
    toggleBalance,
    clearFilters,
    refetch,
    isRefreshing,
    showingSaved,
  } = usePartyList();

  /** Read outside render, so the column array's memo key is stable. */
  const nowMs = useNowMs();

  const { tags, byUsage: tagOptions } = usePartyTags();

  /**
   * Whether the CHIP LANE is reserved on every row.
   *
   * Read from the tenant's tag list rather than from the rows on screen, and
   * the difference matters: a merchant filtered to "Settled" might be looking
   * at twenty-five untagged parties in a book that uses tags heavily, and a
   * lane that appeared and disappeared as they moved between filters would be
   * a list that changes height when they change their mind.
   */
  const hasTags = tags.length > 0;

  // Resolved once so a memoised cell never has to reach for `react-intl`.
  const balanceLabels = useMemo(
    () => ({
      'parties.list.balance.receivable': t('parties.list.balance.receivable'),
      'parties.list.balance.payable': t('parties.list.balance.payable'),
      'parties.list.balance.settled': t('parties.list.balance.settled'),
    }),
    [t]
  );

  /* The grid's own tier, read by the screen so the column model can be built
     for the rendering it is about to be painted at. `UbDataGrid` resolves this
     identically for itself, from the same media queries. */
  const tier = useGridTier();
  const tagChipsPerRow = TAG_CHIPS_PER_ROW[tier];

  const columns = useMemo(
    () => createPartyColumns({ t, nowMs, balanceLabels, hasTags, tagChipsPerRow }),
    [t, nowMs, balanceLabels, hasTags, tagChipsPerRow]
  );

  const labels = useMemo<UbDataGridLabels>(
    () => ({
      loading: t('parties.list.loading'),
      /**
       * `{page}` and `{pages}` are passed through as literal text: the grid
       * substitutes them itself, because it is the only thing that knows the
       * numbers. ICU does not re-parse a value, so what comes back is the
       * translated sentence with its two slots intact.
       */
      pageOf: t('common.grid.pageOf', { page: '{page}', pages: '{pages}' }),
      previousPage: t('common.grid.previousPage'),
      nextPage: t('common.grid.nextPage'),
      pageSize: t('common.grid.pageSize'),
      // `{page}` and `{total}` pass through as literal text, like `pageOf`
      // above: the pagination bar substitutes them, because it is the only
      // thing that knows which page a button points at.
      goToPage: t('common.grid.goToPage', { page: '{page}' }),
      ofTotal: t('common.grid.ofTotal', { total: '{total}' }),
      // The ONLY label here that is finished rather than a template, and the
      // reason is ICU: `selectedCount` is a PLURAL message, and a plural cannot
      // be resolved later. Passing the literal string `'{count}'` as its value
      // made `#` evaluate to NaN, so the selection bar read "NaN selected" —
      // which no unit test saw, because the test's fixture was a plain
      // `'{count} selected'` string that never went through `react-intl`. The
      // count is known here, and Hindi's one/other forms differ, so `t()` does
      // the plural and the grid paints what it is given.
      selectedCount: t('common.grid.selectedCount', { count: selectedIds.length }),

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
    // `selectedIds.length` is a real dependency now that the plural is resolved
    // here. It rebuilds this object while the merchant is ticking rows, which
    // is a handful of renders of a toolbar that is re-rendering anyway — the
    // alternative was a label that said NaN.
    [t, selectedIds.length]
  );

  /* NOT `onClick={partyForm.openCreate}`. The moment `openCreate` took an
     optional name, that spelling started handing React's MouseEvent to it as
     the name — and the form would have opened prefilled with an event object
     rendered as a string. TypeScript caught it here; a `() => void` signature
     would not have. */
  const openBlankCreate = useCallback(() => partyForm.openCreate(), [partyForm]);
  /** The committed term, trimmed once — the empty state quotes it and the Add
   *  action prefills the form with it, and they must be the same string. */
  const searchTerm = searchInput.trim();
  const addSearchedName = useCallback(
    () => partyForm.openCreate(searchTerm),
    [partyForm, searchTerm]
  );

  const isArchivedTab = filters.status === 'archived';
  /** Archived is the ONLY narrowing applied — see the filtered empty state. */
  const archivedOnly = isArchivedTab && activeFilterCount === 1;

  const emptyStates = useMemo<UbDataGridEmptyStates>(
    () => ({
      /* The ARCHIVED tab used to reach the grid's "empty" state — before UAT
         D7 `status` was not counted as a filter at all — and it got the
         first-use copy: a merchant with three hundred active parties opened
         Archived and read "No customers yet", with an Add party button, on a
         book full of them. Nobody archived is its own sentence, and it has no
         Add action: adding a party from here would add an ACTIVE one to a tab
         that cannot show it. While Archived counts as a filter the grid
         reaches the `filtered` branch below instead; this stays as the
         correct copy should that ever change. (PTY-02 §9 Empty / FR-13 name three
         variants; the tab is FR-6's.) */
      firstUse: isArchivedTab
        ? {
            title: t('parties.list.empty.archived.title'),
            description: t('parties.list.empty.archived.body'),
          }
        : {
            title: t('parties.list.empty.firstUse.title'),
            description: t('parties.list.empty.firstUse.body'),
            // The empty state's whole job is to offer the one move that closes
            // it. Before PTY-01 it described a screen and left the merchant to
            // find the way out themselves. FR-13's secondary "Import from CSV"
            // (PTY-10) and "Add from contacts" (PTY-07) are NOT drawn: neither
            // is built, and a control for an unbuilt feature is not rendered
            // (docs/DESIGN-SYSTEM.md §5).
            action: partyForm.canWrite ? (
              <UbButton onClick={openBlankCreate}>{t('parties.list.add')}</UbButton>
            ) : undefined,
          },
      filtered: archivedOnly
        ? {
            /* UAT D7 made Archived count as a filter, so an empty Archived
               tab now arrives HERE rather than at first-use. It keeps its own
               sentence — "No customers match these filters" would read as if
               the merchant had narrowed something by mistake — and gains the
               same way back every filter has. */
            title: t('parties.list.empty.archived.title'),
            description: t('parties.list.empty.archived.body'),
            action: (
              <UbButton variant="secondary" onClick={clearFilters}>
                {t('common.action.clearFilters')}
              </UbButton>
            ),
          }
        : {
            /* Two filtered-empty states, because there are two ways to reach it and
               they need different words. "No customers match this search. Clear the
               search to see everyone again." was the only copy, and the moment
               `isFiltered` started counting the chips as well, a merchant who
               tapped "Settled" with an empty search box was told to clear a search
               they had not made. The search wording also gets to quote the term,
               which is the thing they will want to check for a typo. */
            title: searchTerm
              ? t('parties.list.empty.filtered.searchTitle', { q: searchTerm })
              : t('parties.list.empty.filtered.chipsTitle'),
            description: searchTerm
              ? t('parties.list.empty.filtered.searchBody')
              : t('parties.list.empty.filtered.chipsBody'),
            /* Two ways out, and the second one is the point (T-PTY-02-15). A
               search that found nobody usually means the party is not in the book
               yet, not that the merchant mistyped — so the primary move is to add
               them, with the name they already typed. It is offered only when
               there IS a name: a chip filter that matched nothing says nothing
               about what to call anyone. */
            action: (
              <>
                {partyForm.canWrite && searchTerm.length > 0 && (
                  <UbButton onClick={addSearchedName}>
                    {t('parties.list.empty.filtered.add', { name: searchTerm })}
                  </UbButton>
                )}
                <UbButton variant="secondary" onClick={clearFilters}>
                  {t('common.action.clearFilters')}
                </UbButton>
              </>
            ),
          },
      error: {
        title: t('parties.list.error.title'),
        description: error?.message ?? t('parties.list.error.body'),
        requestId: error?.requestId ?? null,
        requestIdLabel: t('common.error.reference'),
        action: (
          <UbButton variant="secondary" onClick={refetch}>
            {t('common.action.retry')}
          </UbButton>
        ),
      },
    }),
    [
      t,
      clearFilters,
      refetch,
      error,
      partyForm.canWrite,
      openBlankCreate,
      addSearchedName,
      searchTerm,
      isArchivedTab,
      archivedOnly,
    ]
  );

  /* A failure over the saved answer to the SAME query keeps the rows (FR-15):
     the error state would take away a list the merchant could still read and
     act on, to tell them about a refresh they did not ask for. */
  const gridState: UbGridState =
    status === 'loading'
      ? 'loading'
      : status === 'failed' && !showingSaved
        ? 'error'
        : rows.length === 0
          ? isFiltered
            ? 'filtered-empty'
            : 'empty'
          : 'rows';

  /* §9 Initial: nothing has landed yet, so the tiles shimmer rather than
     claim ₹0. A later load over an EMPTY list (a filter change from a
     filtered-empty result) is the same situation — there are no figures to
     keep — and is drawn the same way. */
  const statsLoading = status === 'loading' && rows.length === 0;
  /* EC-1: a book with no parties at all hides the tiles entirely, "not ₹0 /
     ₹0, so the screen is not two meaningless zeroes" — the empty state below
     is the whole message. EC-13 is the opposite case and keeps them: when
     every party is settled, zero is information. The Archived tab with nobody
     in it is EC-1's situation on that tab.
     The ERROR state hides them too: with no answer to this query there are no
     figures for it, and what the tiles would show is either ₹0 (a cold
     failure) or the PREVIOUS query's totals under the new chips — the same
     lie the error state exists to avoid telling with rows. The stale-cache
     variant keeps them, because there the rows and totals ARE this query's. */
  const showStats = gridState !== 'empty' && gridState !== 'error';

  const sort = useMemo(() => sortFromOrdering(filters.ordering), [filters.ordering]);

  const handleSort = useCallback(
    (next: UbGridSort) => {
      const ordering = orderingFor(next);
      if (ordering) setOrdering(ordering);
    },
    [setOrdering]
  );

  const handleStatus = useCallback(
    (value: string) => setFilters({ status: value as PartyStatus }),
    [setFilters]
  );

  const handleType = useCallback((type: PartyTypeFilter) => setFilters({ type }), [setFilters]);
  const handleBalance = useCallback(
    (balance: PartyBalanceFilter) => setFilters({ balance }),
    [setFilters]
  );
  const handleCollection = useCallback(
    (collection: PartyCollectionFilter) => setFilters({ collection }),
    [setFilters]
  );
  const handleTag = useCallback((tag: string) => setFilters({ tag }), [setFilters]);
  const handleCredit = useCallback(
    (credit: PartyCreditFilter) => setFilters({ credit }),
    [setFilters]
  );

  const handlePageSize = useCallback((pageSize: number) => setPage(1, pageSize), [setPage]);

  const clearSelection = useCallback(() => setSelectedIds([]), [setSelectedIds]);

  /* The yearly clean-up (PTY-04 FR-9). The selection bar was a count and a
     "Clear selection" — the one thing a merchant can DO with a selection, and
     the reason the bar exists at all, was missing. */
  const bulk = useBulkArchive(selectedIds, clearSelection);
  const bulkTag = usePartyBulkTag(selectedIds, clearSelection);

  /* The list finally leads somewhere. Until PTY-03 there was no `/parties/[id]`
     to go to, so the grid's row-open affordance was left unwired — a chevron
     that navigated to a 404 would have been worse than a row that plainly does
     not move. */
  const openParty = useCallback((party: Party) => router.push(partyPath(party.id)), [router]);

  const rowId = useCallback((party: Party) => party.id, []);
  const rowName = useCallback((party: Party) => party.name, []);

  return (
    // `full` rather than the default `measure`: this is the data-grid opt-out
    // the shell documents. A 1120 px column on a 1440 px screen left a band of
    // empty canvas down the right of a table that had columns truncating in it.
    <UbPageShell
      width="full"
      header={
        <UbPageHeader
          title={t('parties.list.title')}
          subtitle={t('parties.list.subtitle')}
          actions={
            <>
              {/* FR-7 reaches the manager from an overflow menu on this header.
                  This screen's header has no overflow menu, and inventing one
                  for a single item would be a menu that exists to hide one
                  link. A secondary button says the same thing in one press.
                  It is shown to anyone who can READ parties, because the
                  manager is useful read-only — the counts are the fastest way
                  to see which tag holds which part of the book — and the
                  destructive actions inside it are permission-gated there. */}
              <UbActionLink
                href={ROUTES.PARTY_TAGS}
                icon={<Tags className="h-4 w-4" aria-hidden />}
                iconOnly="mobile"
              >
                {t('parties.tags.filter.manage')}
              </UbActionLink>
              {/* IMP-01 FR-14 / IMP-02 FR-13 — bring a sheet in, take this
                  list out. Each hides itself for a role that may not use it,
                  and the export carries the list's own filters (BR-1). */}
              <ImportActionLink kind="parties" />
              <ListExportButton
                listPath={partyExportPath(filters)}
                permission="parties.party.export"
                empty={status === 'succeeded' && meta.total === 0}
              />
              {/* Hidden rather than disabled when the role cannot write
                  (§19.7.5). A disabled Add button invites a support call; an
                  absent one says nothing a merchant has to interpret. */}
              {partyForm.canWrite && (
                <UbButton
                  icon={<Plus className="h-4 w-4" aria-hidden />}
                  iconOnly="mobile"
                  onClick={openBlankCreate}
                >
                  {t('parties.list.add')}
                </UbButton>
              )}
            </>
          }
        />
      }
    >
      {/* BrandHub's page rhythm: the figures under the title, then the list,
          16 px apart (tightened from 24 at the owner's request, 23 Sep). The
          count that used to sit here in grey label type is the third card
          now — it was the same job said in a different voice. */}
      <UbStack gap={4}>
        {showStats && (
          <PartyListStats
            loading={statsLoading}
            loadingLabel={t('parties.list.totals.loading')}
            totals={totals}
            total={meta.total}
            receivableLabel={t('parties.list.totals.receivable')}
            payableLabel={t('parties.list.totals.payable')}
            countLabel={t('parties.list.stats.customers')}
            countValue={n(meta.total)}
            regionLabel={t('parties.list.totals.region')}
            appliedBalance={filters.balance}
            onBalanceToggle={toggleBalance}
            receivableActionLabel={t('parties.list.totals.receivable.action')}
            payableActionLabel={t('parties.list.totals.payable.action')}
            scopeNote={
              totalsScope === 'filtered'
                ? t('parties.list.totals.scope.filtered')
                : t('parties.list.totals.scope.page', { count: rows.length })
            }
            countNote={
              isFiltered
                ? t('parties.list.stats.count.filtered')
                : t('parties.list.stats.count.all')
            }
          />
        )}

        {/* Between the figures and the list, which is the order the FRD sets
            and the order the eye takes: how much, then who. Not in the grid's
            toolbar — its filter slot is a `shrink-0` group that deliberately
            does not wrap, and seven chips in it would squeeze the search box
            to nothing. */}
        <PartyListFilters
          t={t}
          type={filters.type}
          balance={filters.balance}
          collection={filters.collection}
          onTypeChange={handleType}
          onBalanceChange={handleBalance}
          onCollectionChange={handleCollection}
          credit={filters.credit}
          onCreditChange={handleCredit}
          /* The count is the UNFILTERED one when nothing is applied, which is
             the number the chip is for. Once a filter narrows the list it
             narrows with it, so the chip answers the question the merchant just
             asked rather than one about a set they are not looking at. */
          overLimitCount={overLimit}
          tag={filters.tag}
          onTagChange={handleTag}
          tags={tagOptions}
          activeFilterCount={activeFilterCount}
          onClear={clearFilters}
        />

        {/* FR-15 / §9 Error, stale-cache variant: the refresh failed, the rows
            below are the last good answer to this same query, and the banner
            says so with the one move that fixes it. Amber, not red — the list
            is usable; it is only possibly out of date (§23.2.4). */}
        {showingSaved && (
          <UbStatusBanner
            tone="warning"
            title={t('parties.list.stale')}
            description={t('parties.list.stale.body')}
            action={
              <UbButton variant="secondary" size="sm" onClick={refetch}>
                {t('common.action.retry')}
              </UbButton>
            }
          />
        )}

        {/* `storageId` puts the column choices in `sessionStorage`: they survive
            a trip to a party and back. Session rather than account, because
            this is a reading preference for the afternoon rather than a
            setting — putting it on the server means an endpoint and a
            migration for something the merchant expects to undo by closing
            the tab. */}
        <UbDataGrid
          rows={rows}
          columns={columns}
          rowId={rowId}
          rowName={rowName}
          state={gridState}
          /* §9 Loading: a later load keeps the rows it has, dimmed under a
             progress bar; the slice turns a page change into `loading` (the
             skeleton) instead, because page 2 is not page 1 dimmed. */
          busy={isRefreshing}
          /* §9 Initial: eight skeleton rows, never a full-page spinner. */
          skeletonRows={8}
          labels={labels}
          emptyStates={emptyStates}
          caption={t('parties.list.caption')}
          storageId="parties.list"
          page={meta}
          onPageChange={setPage}
          onPageSizeChange={handlePageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          sort={sort}
          onSortChange={handleSort}
          onRowOpen={openParty}
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          /* The count is NOT repeated here. The selection bar paints
             "{n} selected" on its left now (BrandHub's arrangement), and this
             slot used to carry the same sentence again three inches to the
             right — so a merchant who ticked one row was told twice. What
             belongs here is what they can DO about the selection. */
          bulkActions={
            <>
              {/* Archived rows are already archived; offering it on that tab
                  would be a button whose every row comes back skipped. */}
              {/* Tagging comes FIRST, and the order is the point: it is the
                  everyday move on a selection and archiving is the yearly one,
                  so the destructive button must not be the one a thumb lands on
                  by default. */}
              {bulkTag.canTag && (
                <UbButton variant="secondary" size="sm" onClick={bulkTag.start}>
                  {t('parties.tags.bulk.action')}
                </UbButton>
              )}
              {bulk.canArchive && filters.status === 'active' && (
                <UbButton variant="destructive" size="sm" onClick={bulk.start}>
                  {t('parties.archive.action')}
                </UbButton>
              )}
              <UbButton variant="secondary" size="sm" onClick={clearSelection}>
                {t('parties.list.bulk.clearSelection')}
              </UbButton>
            </>
          }
          search={
            <UbTextInput
              value={searchInput}
              onChange={setSearchInput}
              type="text"
              aria-label={t('parties.list.search.label')}
              placeholder={t('parties.list.search.placeholder')}
            />
          }
          filters={
            <>
              <UbSelect
                value={filters.status}
                onChange={handleStatus}
                aria-label={t('parties.list.filter.status.label')}
                options={STATUS_OPTIONS.map((value) => ({
                  value,
                  label: t(`parties.list.status.${value}`),
                }))}
              />
              {/* UAT D5 — the cards have no column headers to sort by, so the
                  phone gets the same orderings from a sheet. Not drawn from
                  `md` up, where the headers ARE the sort control and a second
                  one would be the same action twice. */}
              {tier === 'cards' && (
                <PartyListSortSheet
                  t={t}
                  ordering={filters.ordering}
                  onOrderingChange={setOrdering}
                />
              )}
            </>
          }
        />
        {/* Loaded when the merchant asks for it, not when the list loads.
            Measured: the form carries React Hook Form's resolver, the Yup
            schema, a Radix switch and the three new inputs, and putting it in
            the route's own chunk cost /parties 39.8 KB gz — paid by every
            merchant who opens the list to READ it, which is almost all of
            them. `openFor` is the only thing the page needs eagerly, and that
            lives in the slice. */}
        {partyForm.open && <PartyFormDrawerLazy form={partyForm} />}

        {/* Mounted only once it is open, so the chunk is fetched on the press
            rather than on the route. */}
        {bulkTag.open && (
          <PartyBulkTagDialogLazy
            t={t}
            open={bulkTag.open}
            count={selectedIds.length}
            saving={bulkTag.saving}
            undoing={bulkTag.undoing}
            undone={bulkTag.undone}
            result={bulkTag.result}
            appliedMode={bulkTag.appliedMode}
            tags={tagOptions}
            onConfirm={bulkTag.confirm}
            onUndo={bulkTag.undo}
            onClose={bulkTag.close}
          />
        )}

        <PartyBulkArchiveDialog
          t={t}
          open={bulk.open}
          count={selectedIds.length}
          saving={bulk.saving}
          result={bulk.result}
          onConfirm={bulk.confirm}
          onClose={bulk.close}
        />
      </UbStack>
    </UbPageShell>
  );
}
