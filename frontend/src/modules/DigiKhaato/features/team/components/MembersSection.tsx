'use client';

import { useCallback, useMemo } from 'react';

import dynamic from 'next/dynamic';

import { UserPlus } from 'lucide-react';

import {
  UbButton,
  UbConfirmDialog,
  UbStack,
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
import { useMembers } from '../hooks/useMembers';

import { createMemberColumns } from './MemberColumns';

import type { Member } from '../types/member.types';

/**
 * Part 19 §19.9 — both overlays are fetched when they are OPENED, not when the
 * screen is, for the reason `TeamPageContent` sets out next door: the form
 * stack (react-hook-form, yup, the resolver, `UbSelect`) is the heavier half of
 * this screen and the LIST needs none of it.
 */
const AddMemberDialog = dynamic(
  () => import('./AddMemberDialog').then((module) => module.AddMemberDialog),
  { ssr: false }
);

const CredentialsDialog = dynamic(
  () => import('./CredentialsDialog').then((module) => module.CredentialsDialog),
  { ssr: false }
);

/**
 * DEC-012 — the member half of Settings → Team: who actually works here.
 *
 * ── Why this is a section and not a second page ─────────────────────────────
 * "Who works here" and "who was asked and has not answered" are two answers to
 * one question, and an owner chasing a salesman who cannot sign in does not
 * know which of the two lists holds them. Splitting the pair across tabs makes
 * that a guess. They sit one above the other, members first, because members is
 * the list that is true — an invitation is a hope.
 *
 * Part 19 §19.1.1 layer 5: this composes and owns the COPY and the COLUMN
 * MODEL. Every decision behind them lives in `useMembers` and the slice; there
 * is no `useState` here and nothing reaches for a service.
 */
export function MembersSection(): React.JSX.Element {
  const { t, d } = useTranslation();
  const members = useMembers();
  const {
    rows,
    meta,
    status,
    error,
    canWrite,
    addOpen,
    lastCredentials,
    openAdd,
    requestRegenerate,
    regenerateTarget,
    isRegenerating,
    cancelRegenerate,
    confirmRegenerate,
    setPage,
    refetch,
  } = members;

  /** Read outside render, so the column array's memo key is stable. */
  const nowMs = useNowMs();

  const formatDate = useCallback((value: string | Date) => d(value), [d]);

  const columns = useMemo(
    () =>
      createMemberColumns({
        t,
        d: formatDate,
        nowMs,
        canWrite,
        onRegenerate: requestRegenerate,
      }),
    [t, formatDate, nowMs, canWrite, requestRegenerate]
  );

  const labels = useMemo<UbDataGridLabels>(
    () => ({
      loading: t('team.members.loading'),
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
      firstUse: {
        title: t('team.members.empty.title'),
        description: t('team.members.empty.body'),
      },
      // No filter on this screen; the copy exists because the grid's contract
      // requires all three, and is written for the day one arrives.
      filtered: {
        title: t('team.list.empty.filtered.title'),
        description: t('team.list.empty.filtered.body'),
      },
      error: {
        title: t('team.members.error.title'),
        description: error?.message ?? t('team.members.error.body'),
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

  const rowId = useCallback((member: Member) => member.id, []);
  const rowName = useCallback((member: Member) => member.fullName || member.email, []);
  const handlePageSize = useCallback((pageSize: number) => setPage(1, pageSize), [setPage]);
  const handleRegenerateOpenChange = useCallback(
    (next: boolean) => {
      if (!next) cancelRegenerate();
    },
    [cancelRegenerate]
  );
  const handleConfirmRegenerate = useCallback(() => {
    void confirmRegenerate();
  }, [confirmRegenerate]);

  return (
    <UbStack gap={2}>
      {/* There is no `UbSectionHeader` in the design system and this screen is
          not the place to invent one: a section heading plus a trailing action
          is a pattern the product will want in several places, and adding it
          here would make the first version of it a team-screen shape. A row
          composed from existing primitives is the honest interim. */}
      <UbStack direction="row" justify="between" align="center" gap={2}>
        <UbText variant="h4">{t('team.tab.members')}</UbText>
        <Can permission="platform.members.manage">
          <UbButton
            onClick={openAdd}
            icon={<UserPlus aria-hidden className="h-4 w-4" />}
            // Class C, online only: disabled rather than hidden (§19.10.4).
            disabled={!canWrite}
          >
            {t('team.member.add.action')}
          </UbButton>
        </Can>
      </UbStack>

      <UbText variant="label" tone="tertiary">
        {t('team.members.count', { count: meta.total })}
      </UbText>

      <UbDataGrid
        rows={rows}
        columns={columns}
        rowId={rowId}
        rowName={rowName}
        state={gridState}
        labels={labels}
        emptyStates={emptyStates}
        caption={t('team.members.caption')}
        page={meta}
        onPageChange={setPage}
        onPageSizeChange={handlePageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
      />

      {addOpen && <AddMemberDialog members={members} />}
      {lastCredentials && <CredentialsDialog members={members} />}

      <UbConfirmDialog
        open={Boolean(regenerateTarget)}
        onOpenChange={handleRegenerateOpenChange}
        title={t('team.regenerate.title')}
        description={t('team.regenerate.body', {
          name: regenerateTarget?.fullName ?? regenerateTarget?.email ?? '',
        })}
        confirmLabel={t('team.regenerate.confirm')}
        cancelLabel={t('team.regenerate.cancel')}
        busyLabel={t('team.regenerate.working')}
        closeLabel={t('common.action.close')}
        busy={isRegenerating}
        // The password the owner already sent stops working the instant this is
        // pressed, and every session held on it is thrown out. That is
        // destructive in the sense the dialog means, even though nothing is
        // deleted: somebody loses access they currently have.
        destructive
        onConfirm={handleConfirmRegenerate}
      />
    </UbStack>
  );
}
