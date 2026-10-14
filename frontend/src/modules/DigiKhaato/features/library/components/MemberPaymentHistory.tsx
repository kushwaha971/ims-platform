'use client';

import { useEffect, useState } from 'react';

import {
  UbAmount,
  UbButton,
  UbCard,
  UbEmptyState,
  UbListItemText,
  UbSkeleton,
  UbStack,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import { selectMemberPayments } from '../redux/libraryMemberPaymentsSlice';
import { fetchMemberPayments } from '../redux/libraryPaymentThunk';

import 'src/i18n/catalogues/library';
import 'src/i18n/catalogues/payments';
import 'src/i18n/catalogues/money';

/** Actual receipts stay on the student; a successful fee save refreshes only this read. */
export function MemberPaymentHistory({
  membershipId,
  partyId,
  revision,
}: Readonly<{
  membershipId: string;
  partyId: string;
  revision: number;
}>): React.JSX.Element | null {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { can, hasModule } = usePermissions();
  const allowed = hasModule('payments') && can('payments.payment.read');
  const state = useAppSelector(selectMemberPayments);
  const [pageChoice, setPageChoice] = useState({ revision, page: 1 });
  const page = pageChoice.revision === revision ? pageChoice.page : 1;
  useEffect(() => {
    if (!allowed) return undefined;
    const request = dispatch(fetchMemberPayments({ membershipId, partyId, page }));
    return () => request.abort();
  }, [allowed, dispatch, membershipId, partyId, page, revision]);
  if (!allowed) return null;
  const matches = state.membershipId === membershipId && state.partyId === partyId;
  const data = matches ? state.data : null;
  const status = matches ? state.status : 'idle';
  const busy = status === 'loading' || status === 'refreshing';
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <UbStack gap={0} data-testid="library-payment-history">
      <UbCard title={t('library.member.payments.title')}>
        {!data && status !== 'failed' ? (
          <UbSkeleton variant="list" count={2} />
        ) : status === 'failed' ? (
          <UbEmptyState
            variant="error"
            title={t('payments.list.error.title')}
            action={
              <UbButton
                variant="secondary"
                onClick={() => void dispatch(fetchMemberPayments({ membershipId, partyId, page }))}
              >
                {t('common.action.retry')}
              </UbButton>
            }
          />
        ) : !data?.rows.length ? (
          <UbText variant="body-sm" tone="tertiary">
            {t('library.member.payments.empty')}
          </UbText>
        ) : (
          <UbStack as="ul" gap={0} aria-busy={busy}>
            {data.rows.map((payment) => (
              <UbStack
                as="li"
                key={payment.id}
                gap={1}
                className="border-b border-border-hairline py-3 last:border-b-0"
              >
                <UbStack direction="row" justify="between" align="start" gap={3}>
                  <UbListItemText
                    primary={payment.number}
                    secondary={[
                      t(`library.member.payments.${payment.direction}`),
                      formatBusinessDate(payment.paymentDate),
                      t(`ledger.mode.${payment.primaryMode}`),
                    ].join(' · ')}
                  />
                  <UbAmount value={payment.amount} />
                </UbStack>
                {payment.status === 'void' && (
                  <UbStatusBadge tone="neutral" label={t('payments.status.void')} />
                )}
                {payment.unallocatedAmount !== '0.00' && payment.status !== 'void' && (
                  <UbText variant="caption" tone="tertiary">
                    {t('library.member.payments.advance', {
                      amount: formatInr(payment.unallocatedAmount),
                    })}
                  </UbText>
                )}
                {payment.reference && (
                  <UbText variant="caption" tone="tertiary">
                    {payment.reference}
                  </UbText>
                )}
              </UbStack>
            ))}
          </UbStack>
        )}
        {pages > 1 && (
          <UbStack direction="row" justify="between" align="center" gap={2}>
            <UbButton
              variant="secondary"
              disabled={busy || page <= 1}
              onClick={() => setPageChoice({ revision, page: page - 1 })}
            >
              {t('common.grid.previousPage')}
            </UbButton>
            <UbText variant="caption">{t('library.member.payments.page', { page, pages })}</UbText>
            <UbButton
              variant="secondary"
              disabled={busy || page >= pages}
              onClick={() => setPageChoice({ revision, page: page + 1 })}
            >
              {t('common.grid.nextPage')}
            </UbButton>
          </UbStack>
        )}
      </UbCard>
    </UbStack>
  );
}
