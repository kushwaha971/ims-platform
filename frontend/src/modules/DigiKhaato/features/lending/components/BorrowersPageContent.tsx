'use client';

import { useEffect, useState } from 'react';

import { useRouter } from 'next/navigation';

import {
  UbCard,
  UbEmptyState,
  UbListItemText,
  UbPageHeader,
  UbPageShell,
  UbPressable,
  UbSearchInput,
  UbStack,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useCommittedSearch } from 'src/hooks/useCommittedSearch';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { formatPhoneForDisplay } from 'src/utils/share';

import { selectLendingForm } from '../redux/lendingFormSlice';
import { fetchLendingBorrowers } from '../redux/lendingThunk';

/** `/lending/borrowers` (FRD LEN-02): everybody who has borrowed; a tap opens their loans. */
export function BorrowersPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { borrowers } = useAppSelector(selectLendingForm);
  const { can, hasModule } = usePermissions();
  const canRead = hasModule('lending') && can('lending.borrower.read');
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
                    onClick={() => router.push(`${ROUTES.PARTIES}/${b.partyId}`)}
                  >
                    <UbListItemText
                      primary={b.name}
                      secondary={[
                        b.number,
                        b.mobile ? formatPhoneForDisplay(b.mobile) : '',
                        b.area,
                        b.route?.name ?? '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    />
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
