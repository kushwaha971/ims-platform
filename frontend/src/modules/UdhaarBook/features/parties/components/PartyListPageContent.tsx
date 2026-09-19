'use client';

import { useMemo } from 'react';

import { UbCard, UbEmptyState, UbPageHeader, UbPageShell, UbSkeleton } from 'src/design-system';
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
        <UbPageHeader
          title={t('parties.list.title')}
          subtitle={
            status === 'succeeded'
              ? t('parties.list.count', { count: meta.total })
              : t('parties.list.subtitle')
          }
        />
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
            <button
              type="button"
              onClick={refetch}
              className="ds-body-sm-medium rounded-control border border-border-strong px-4 py-2 text-text-primary hover:bg-surface-hover"
            >
              {t('common.action.retry')}
            </button>
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
              <button
                type="button"
                onClick={clearFilters}
                className="ds-body-sm-medium rounded-control border border-border-strong px-4 py-2 text-text-primary hover:bg-surface-hover"
              >
                {t('common.action.retry')}
              </button>
            ) : undefined
          }
        />
      )}

      {rows.length > 0 && (
        <UbCard padded={false}>
          <ul className="flex flex-col">
            {rows.map((party) => (
              <PartyListRow key={party.id} party={party} balanceLabels={balanceLabels} />
            ))}
          </ul>
        </UbCard>
      )}
    </UbPageShell>
  );
}
