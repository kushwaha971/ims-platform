'use client';

import { useCallback, useMemo } from 'react';

import dynamic from 'next/dynamic';

import { UserPlus } from 'lucide-react';

import {
  UbButton,
  UbConfirmDialog,
  UbPageHeader,
  UbPageShell,
  UbStack,
  UbStatusBanner,
  UbText,
} from 'src/design-system';
import {
  UbDataGrid,
  type UbDataGridEmptyStates,
  type UbDataGridLabels,
  type UbGridState,
} from 'src/design-system/UbDataGrid';
import { useNowMs } from 'src/hooks/useNowMs';
import { useTranslation } from 'src/hooks/useTranslation';

import { Can } from '../../auth/components/Can';
import { PAGE_SIZE_OPTIONS } from '../constants/teamDefaults';
import { useInvitations } from '../hooks/useInvitations';

import { createInvitationColumns } from './InvitationColumns';
import { MembersSection } from './MembersSection';

import type { Invitation } from '../types/invitation.types';

/**
 * Part 19 §19.9 — the two overlays are fetched when they are OPENED, not when
 * the screen is.
 *
 * The invite dialog is the whole of this screen's form stack: react-hook-form,
 * yup, `@hookform/resolvers` and `UbSelect`, none of which the LIST needs. It
 * is the same argument `UbDataGrid` already makes for `@tanstack/react-table`,
 * and the measurement is the same kind: the route's first load falls from
 * 109.2 KB gz to 62.9 — 46 KB that every merchant who opens Settings → Team to
 * read it, which is most of them, no longer downloads to look at a list.
 *
 * `ssr: false` because both are modals: there is nothing to render on the
 * server for a dialog that is shut, and the route is a client screen anyway.
 * Each is rendered only while it is open, so the import is not triggered by the
 * mere presence of the element.
 */
const InviteMemberDialog = dynamic(
  () => import('./InviteMemberDialog').then((module) => module.InviteMemberDialog),
  { ssr: false }
);

const InviteLinkDialog = dynamic(
  () => import('./InviteLinkDialog').then((module) => module.InviteLinkDialog),
  { ssr: false }
);

/**
 * PLT-05 — Settings → Team: who has been asked into this business, and taking
 * it back.
 *
 * Part 19 §19.1.1 layer 5: the screen composes and owns the COPY and the COLUMN
 * MODEL; every decision behind them — whether to fetch at all, what an invite
 * costs, what a revoke does to the list — is in `useInvitations` and the slice.
 * There is no `useState` here and nothing reaches for a service.
 *
 * ── The five states, and where each one is ──────────────────────────────────
 *
 *  · **permission-denied** — `<Can permission="platform.members.manage">` with
 *    a `fallback`, wrapped around everything below the header. This is the
 *    component's first real use in the product, and the shape matters: the
 *    CONTROLS are hidden when they are not this user's to press (R-SEC-2), but
 *    the PAGE says plainly why it is empty, because a member who followed a
 *    link and got a blank screen files a bug. The hook makes the same check and
 *    does not fetch, so a viewer with no permission spends no round trip being
 *    told 403.
 *  · **loading** — the grid's own skeleton, announced; the route file's
 *    `UbPageSkeleton` covers the chunk load before this component exists.
 *  · **empty** — a business with no invitations at all, offering the one move
 *    that closes the gap.
 *  · **error** — in page, with the request id and Try again (R-E-4), because
 *    `listInvitations` suppresses the toast for exactly this.
 *  · **success** — the rows, plus the one-time link dialog after a create.
 *
 * There is no `filtered-empty` reachable on this screen: it has no search and
 * no filter, because an invitation list is short by nature and a search box
 * over four rows is furniture. The copy is still supplied — the grid's contract
 * requires all three — and it is written for the day a filter arrives.
 */
export function TeamPageContent(): React.JSX.Element {
  const { t, d } = useTranslation();
  const invitations = useInvitations();
  const {
    rows,
    meta,
    status,
    error,
    canWrite,
    inviteOpen,
    lastInvite,
    openInvite,
    requestRevoke,
    revokeTarget,
    isRevoking,
    cancelRevoke,
    confirmRevoke,
    setPage,
    refetch,
  } = invitations;

  /** Read outside render, so the column array's memo key is stable. */
  const nowMs = useNowMs();

  const formatDate = useCallback((value: string | Date) => d(value), [d]);

  const columns = useMemo(
    () => createInvitationColumns({ t, d: formatDate, nowMs, canWrite, onRevoke: requestRevoke }),
    [t, formatDate, nowMs, canWrite, requestRevoke]
  );

  const labels = useMemo<UbDataGridLabels>(
    () => ({
      loading: t('team.list.loading'),
      // `{page}` and `{pages}` pass through as literal text: the grid
      // substitutes them itself, because it is the only thing that knows them.
      pageOf: t('common.grid.pageOf', { page: '{page}', pages: '{pages}' }),
      previousPage: t('common.grid.previousPage'),
      nextPage: t('common.grid.nextPage'),
      pageSize: t('common.grid.pageSize'),
      // `{page}` and `{total}` pass through as literal text, like `pageOf`
      // above: the pagination bar substitutes them, because it is the only
      // thing that knows which page a button points at.
      goToPage: t('common.grid.goToPage', { page: '{page}' }),
      ofTotal: t('common.grid.ofTotal', { total: '{total}' }),
      selectAll: t('team.list.select.all'),
      selectRow: t('team.list.select.row', { name: '{name}' }),
      sortBy: t('common.grid.sortBy', { column: '{column}' }),
      sortedAscending: t('common.grid.sortedAscending'),
      sortedDescending: t('common.grid.sortedDescending'),
      openRow: t('team.list.open', { name: '{name}' }),
    }),
    [t]
  );

  const emptyStates = useMemo<UbDataGridEmptyStates>(
    () => ({
      /**
       * No action button, deliberately, and the party list makes the same
       * choice for the same reason: the header carries "Invite member" at every
       * state, directly above this panel. A second, identical primary on an
       * otherwise empty screen is two controls for one act — the reader has to
       * work out whether they differ, and they do not.
       */
      firstUse: {
        title: t('team.list.empty.firstUse.title'),
        description: t('team.list.empty.firstUse.body'),
      },
      filtered: {
        title: t('team.list.empty.filtered.title'),
        description: t('team.list.empty.filtered.body'),
      },
      error: {
        title: t('team.list.error.title'),
        description: error?.message ?? t('team.list.error.body'),
        requestId: error?.requestId ?? null,
        action: (
          <UbButton variant="secondary" onClick={refetch}>
            {t('common.action.retry')}
          </UbButton>
        ),
      },
    }),
    [t, error, refetch]
  );

  const gridState: UbGridState =
    status === 'loading'
      ? 'loading'
      : status === 'failed'
        ? 'error'
        : rows.length === 0
          ? 'empty'
          : 'rows';

  const rowId = useCallback((invitation: Invitation) => invitation.id, []);
  const rowName = useCallback((invitation: Invitation) => invitation.email, []);
  const handlePageSize = useCallback((pageSize: number) => setPage(1, pageSize), [setPage]);
  const handleRevokeOpenChange = useCallback(
    (next: boolean) => {
      if (!next) cancelRevoke();
    },
    [cancelRevoke]
  );
  const handleConfirmRevoke = useCallback(() => {
    void confirmRevoke();
  }, [confirmRevoke]);

  return (
    <UbPageShell
      header={
        <UbPageHeader
          title={t('team.title')}
          subtitle={t('team.subtitle')}
          /* No page-level action. This header used to carry "Invite member" as
             a solid primary, and DEC-012 put "Add member" — also a solid
             primary, also about putting a person in this business — directly
             beneath it. Two indigo buttons a centimetre apart, leading to two
             different outcomes, and nothing on screen to tell them apart
             without reading both lists first.
             Each section now carries the control that belongs to its own list,
             and the two are weighted by which one a merchant actually wants:
             adding somebody is primary, inviting is secondary. */
        />
      }
    >
      <Can
        permission="platform.members.manage"
        fallback={
          <UbStatusBanner
            tone="warning"
            title={t('team.denied.title')}
            description={t('team.denied.body')}
          />
        }
      >
        <UbStack gap={6}>
          {!canWrite && (
            <UbStatusBanner
              tone="offline"
              title={t('common.network.offline')}
              description={t('team.offline.body')}
            />
          )}

          {/* DEC-012 — members FIRST. "Who works here" is the list that is
              true; an invitation is a hope. An owner chasing a salesman who
              cannot sign in should meet the real answer before the pending
              one. */}
          <MembersSection />

          <UbStack gap={2}>
            <UbStack direction="row" justify="between" align="center" gap={2}>
              <UbText variant="h4">{t('team.tab.invitations')}</UbText>
              <Can permission="platform.members.manage">
                <UbButton
                  variant="secondary"
                  onClick={openInvite}
                  icon={<UserPlus aria-hidden className="h-4 w-4" />}
                  // Class C, online only: disabled rather than hidden (§19.10.4).
                  disabled={!canWrite}
                >
                  {t('team.invite.action')}
                </UbButton>
              </Can>
            </UbStack>
            <UbText variant="label" tone="tertiary">
              {t('team.list.count', { count: meta.total })}
            </UbText>

          <UbDataGrid
            rows={rows}
            columns={columns}
            rowId={rowId}
            rowName={rowName}
            state={gridState}
            labels={labels}
            emptyStates={emptyStates}
            caption={t('team.list.caption')}
            page={meta}
            onPageChange={setPage}
            onPageSizeChange={handlePageSize}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
            />
          </UbStack>
        </UbStack>

        {inviteOpen && <InviteMemberDialog invitations={invitations} />}
        {lastInvite !== null && <InviteLinkDialog invitations={invitations} />}

        <UbConfirmDialog
          open={revokeTarget !== null}
          onOpenChange={handleRevokeOpenChange}
          title={t('team.revoke.title')}
          // The CONSEQUENCE, in one sentence, naming the person — a confirm
          // that says "Are you sure?" makes the merchant reconstruct what they
          // clicked from memory.
          description={t('team.revoke.body', { email: revokeTarget?.email ?? '' })}
          confirmLabel={t('team.revoke.confirm')}
          cancelLabel={t('common.action.cancel')}
          closeLabel={t('common.action.close')}
          onConfirm={handleConfirmRevoke}
          busy={isRevoking}
          busyLabel={t('team.revoke.busy')}
        />
      </Can>
    </UbPageShell>
  );
}
