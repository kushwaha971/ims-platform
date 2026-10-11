'use client';

import { useEffect, useState } from 'react';

import { useRouter } from 'next/navigation';

import {
  UbActionLink,
  UbAmount,
  UbCard,
  UbEmptyState,
  UbListItemText,
  UbPageHeader,
  UbPageShell,
  UbPressable,
  UbSearchInput,
  UbStack,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useCommittedSearch } from 'src/hooks/useCommittedSearch';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { formatPhoneForDisplay } from 'src/utils/share';

import { selectLendingForm } from '../redux/lendingFormSlice';
import { fetchLendingBorrowers } from '../redux/lendingThunk';
import { caption, isNonZero } from '../view-model/lendingDisplay';

/**
 * `/lending/borrowers` (FRD LEN-02): everybody who has borrowed; a tap opens
 * THEIR LOANS.
 *
 * A borrower is a person and a loan is a loan (owner, 12 Oct 2026): one person
 * may hold several, each with its own terms. So a row says how many loans the
 * person has and how much is left across them, and a tap lists those loans. It
 * used to show a name and a phone number, and a tap opened the shop's khata
 * page for the person, which knows nothing about loans — while this docstring
 * said "a tap opens their loans".
 */
export function BorrowersPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { borrowers } = useAppSelector(selectLendingForm);
  const { can, hasModule } = usePermissions();
  const canRead = hasModule('lending') && can('lending.borrower.read');
  const canLend = hasModule('lending') && can('lending.loan.create');
  const [q, setQ] = useState('');
  const [search, setSearch] = useCommittedSearch(q, setQ, 300);

  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchLendingBorrowers(q));
    return () => promise.abort();
  }, [canRead, dispatch, q]);

  if (!canRead) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('lending.noAccess.title')}
          description={t('lending.noAccess.body')}
        />
      </UbPageShell>
    );
  }
  return (
    <UbPageShell width="measure">
      <UbPageHeader title={t('lending.borrowers.title')} />
      <UbStack gap={4} data-testid="lending-borrowers">
        <UbSearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('lending.borrowers.search')}
          aria-label={t('lending.borrowers.search')}
        />
        {borrowers.length === 0 ? (
          <UbEmptyState
            variant="firstUse"
            title={t('lending.borrowers.empty')}
            description={t('lending.borrowers.emptyBody')}
            action={
              canLend && !q ? (
                <UbActionLink href={ROUTES.LENDING_NEW_LOAN}>{t('lending.loan.new')}</UbActionLink>
              ) : undefined
            }
          />
        ) : (
          <UbCard padded>
            <UbStack as="ul" gap={0} aria-label={t('lending.borrowers.title')}>
              {borrowers.map((b) => (
                <UbStack
                  as="li"
                  key={b.id}
                  gap={0}
                  className="border-b border-border-hairline last:border-b-0"
                >
                  <UbPressable
                    className="w-full py-3 text-left"
                    onClick={() => router.push(`${ROUTES.LENDING_LOANS}?borrower=${b.id}`)}
                  >
                    <UbStack direction="row" justify="between" align="start" gap={3}>
                      <UbListItemText
                        primary={b.name}
                        secondary={caption([
                          b.number,
                          b.mobile ? formatPhoneForDisplay(b.mobile) : '',
                          b.area,
                        ])}
                      />
                      {b.summary ? (
                        <UbStack gap={1} align="end" className="shrink-0">
                          <UbAmount
                            value={b.summary.left}
                            tone={isNonZero(b.summary.late) ? 'receivable' : undefined}
                            label={t('lending.loans.left')}
                          />
                          {isNonZero(b.summary.late) ? (
                            <UbStatusBadge tone="error" label={t('lending.borrowers.late')} />
                          ) : null}
                          <UbText variant="caption" tone="tertiary">
                            {t('lending.borrowers.loans', {
                              loans: b.summary.loans,
                              running: b.summary.running,
                            })}
                          </UbText>
                        </UbStack>
                      ) : null}
                    </UbStack>
                  </UbPressable>
                </UbStack>
              ))}
            </UbStack>
          </UbCard>
        )}
      </UbStack>
    </UbPageShell>
  );
}
