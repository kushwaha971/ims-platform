'use client';

import { useMemo } from 'react';

import {
  UbButton,
  UbCard,
  UbEmptyState,
  UbPageHeader,
  UbPageShell,
  UbSkeleton,
  UbStack,
  UbText,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { usePartyList } from '../hooks/usePartyList';

import { PartyListRow } from './PartyListRow';

/**
 * Part 32 S0-71 — the walking skeleton's screen, and the reference shape every
 * later page content copies: it composes `Ub*` components, owns no data logic,
 * calls one feature hook, and contains no axios, no Yup, no formatting and no
 * permission arithmetic.
 *
 * R-C-9: it renders ALL of its documented states — loading, first-use empty,
 * filtered empty, error (with the request id) and rows. PTY-02 proper is
 * Sprint 3 and grows this file; it does not replace it.
 *
 * ── CR-2026-09-19-D ─────────────────────────────────────────────────────────
 *  · **The filtered empty state offered "Try again".** The action clears the
 *    search, and the label said the opposite of what the button did —
 *    `common.action.retry` where `common.action.clearFilters` was three lines
 *    away in the same file and already used correctly by the tenant chooser.
 *    That is the kind of defect that only shows up when somebody reads the
 *    screen rather than the spec.
 *  · **The count moved out of the subtitle.** "12 customers" was the page
 *    subtitle, so the sentence explaining what this screen is for disappeared
 *    the moment data arrived. The subtitle is now constant and the count is a
 *    caption above the list, where a count belongs.
 *  · The list gets its own bounded card and the rows a 56 px rhythm.
 */
export function PartyListPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const { rows, meta, status, error, isFiltered, clearFilters, refetch } = usePartyList();

  // Resolved once here so a memoised row never has to reach for `react-intl`.
  const balanceLabels = useMemo(
    () => ({
      'parties.list.balance.receivable': t('parties.list.balance.receivable'),
      'parties.list.balance.payable': t('parties.list.balance.payable'),
      'parties.list.balance.settled': t('parties.list.balance.settled'),
    }),
    [t]
  );

  return (
    <UbPageShell
      header={
        <UbPageHeader title={t('parties.list.title')} subtitle={t('parties.list.subtitle')} />
      }
    >
      {status === 'loading' && <UbSkeleton variant="list" label={t('parties.list.loading')} />}

      {status === 'failed' && (
        <UbEmptyState
          variant="error"
          title={t('parties.list.error.title')}
          description={error?.message ?? t('parties.list.error.body')}
          requestId={error?.requestId ?? null}
          action={
            <UbButton variant="secondary" onClick={refetch}>
              {t('common.action.retry')}
            </UbButton>
          }
        />
      )}

      {status !== 'loading' && status !== 'failed' && rows.length === 0 && (
        <UbEmptyState
          variant={isFiltered ? 'filtered' : 'firstUse'}
          title={
            isFiltered
              ? t('parties.list.empty.filtered.title')
              : t('parties.list.empty.firstUse.title')
          }
          description={
            isFiltered
              ? t('parties.list.empty.filtered.body')
              : t('parties.list.empty.firstUse.body')
          }
          action={
            isFiltered ? (
              <UbButton variant="secondary" onClick={clearFilters}>
                {t('common.action.retry')}
              </UbButton>
            ) : undefined
          }
        />
      )}

      {rows.length > 0 && (
        <UbStack gap={2}>
          <UbText variant="label" tone="tertiary">
            {t('parties.list.count', { count: meta.total })}
          </UbText>
          <UbCard padded={false}>
            <UbStack as="ul">
              {rows.map((party) => (
                <PartyListRow key={party.id} party={party} balanceLabels={balanceLabels} />
              ))}
            </UbStack>
          </UbCard>
        </UbStack>
      )}
    </UbPageShell>
  );
}
