'use client';

import { useEffect, useState } from 'react';

import dynamic from 'next/dynamic';

import { HandCoins } from 'lucide-react';

import {
  UbActionLink,
  UbAmount,
  UbButton,
  UbCard,
  UbEmptyState,
  UbInfoRow,
  UbLink,
  UbPageHeader,
  UbPageShell,
  UbPageSkeleton,
  UbStack,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { ROUTES } from 'src/routes';
import { formatBusinessDate, todayInTenantTz } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';
import { formatPhoneForDisplay } from 'src/utils/share';

import { selectLendingLoans } from '../redux/lendingLoansSlice';
import { fetchLendingLoan } from '../redux/lendingThunk';
import { isNonZero, LOAN_STATUS_TONE } from '../view-model/lendingDisplay';

const CollectDialogLazy = dynamic(() => import('./CollectDialog').then((m) => m.CollectDialog), {
  ssr: false,
});
const NotPaidDialogLazy = dynamic(() => import('./NotPaidDialog').then((m) => m.NotPaidDialog), {
  ssr: false,
});

const DUE_TONE: Readonly<Record<string, 'success' | 'warning' | 'error' | 'neutral' | 'info'>> = {
  paid: 'success',
  overdue: 'error',
  due: 'warning',
  scheduled: 'neutral',
};

/**
 * `/lending/loans/[id]` (FRD LEN-05): the loan as agreed and as it stands —
 * what is late, what is left, the instalments with what each has taken, every
 * collection with its mode and note, and the visits.
 */
export function LoanPageContent({ id }: Readonly<{ id: string }>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectLendingLoans);
  const timezone = useAppSelector(selectTenantTimezone);
  const today = todayInTenantTz(timezone ?? undefined);
  const { can, hasModule } = usePermissions();
  const canRead = hasModule('lending') && can('lending.loan.read');
  const canCollect = hasModule('lending') && can('lending.collection.create');
  const [collecting, setCollecting] = useState(false);
  const [visiting, setVisiting] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchLendingLoan(id));
    return () => promise.abort();
  }, [canRead, dispatch, id]);
  const staleNow = state.stale && state.staleUrgency === 'now';
  useEffect(() => {
    if (canRead && staleNow) void dispatch(fetchLendingLoan(id));
  }, [canRead, staleNow, dispatch, id]);

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
  const loan = state.loan?.id === id ? state.loan : null;
  if (!loan) {
    if (state.status === 'failed') {
      return (
        <UbPageShell>
          <UbEmptyState
            variant="firstUse"
            title={t('lending.loan.notFound')}
            action={
              <UbActionLink href={ROUTES.LENDING_LOANS} variant="secondary">
                {t('lending.loans.title')}
              </UbActionLink>
            }
          />
        </UbPageShell>
      );
    }
    return <UbPageSkeleton variant="card" />;
  }
  const active = loan.status === 'active';
  const asked = (Number(loan.dueToday) + Number(loan.arrears)).toFixed(2);
  const schedule = showAll
    ? loan.schedule
    : loan.schedule.filter((d) => d.status !== 'paid').slice(0, 6);
  const rateLine =
    loan.planType === 'fixed_daily'
      ? t('lending.loan.fixedLine', {
          amount: formatInr(loan.instalmentAmount),
          count: loan.instalmentCount,
        })
      : t(`lending.loan.rateLine.${loan.rateUnit}`, {
          rate: Number(loan.rate).toString(),
          plan: t(`lending.plan.${loan.planType}`),
        });

  return (
    <UbPageShell>
      <UbPageHeader
        title={loan.borrower.name}
        actions={
          active && canCollect ? (
            // One Collect, with its amount, in the header (the owner's one-row
            // header rule); the card used to carry a second one (L02 QA).
            <UbButton
              onClick={() => setCollecting(true)}
              data-testid="lending-loan-collect"
              icon={<HandCoins className="h-4 w-4" aria-hidden />}
              iconOnly="mobile"
            >
              {t('lending.collect.button', {
                amount: formatInr(isNonZero(asked) ? asked : loan.instalmentAmount),
              })}
            </UbButton>
          ) : undefined
        }
      />
      <UbStack gap={4} data-testid="lending-loan">
        <UbStack direction="row" gap={2} align="center" wrap>
          <UbText variant="body-sm" className="ds-mono">
            {loan.number}
          </UbText>
          {isNonZero(loan.arrears) ? (
            <UbStatusBadge
              tone="error"
              label={t('lending.loans.late', { days: loan.daysPastDue })}
            />
          ) : (
            <UbStatusBadge
              tone={LOAN_STATUS_TONE[loan.status]}
              label={t(`lending.status.${loan.status}`)}
            />
          )}
          <UbLink href={`${ROUTES.PARTIES}/${loan.borrower.partyId}`}>
            {t('lending.loan.ledger')}
          </UbLink>
        </UbStack>

        <UbCard padded>
          <UbStack gap={3}>
            <UbStack direction="row" gap={5} wrap>
              {[
                ['lending.loan.dueNow', asked, isNonZero(loan.arrears)],
                ['lending.loan.left', loan.remaining, false],
                ['lending.loan.collected', loan.collected, false],
              ].map(([label, amount, late]) => (
                <UbStack key={String(label)} gap={0} className="min-w-28">
                  <UbText variant="caption" tone="tertiary">
                    {t(String(label))}
                  </UbText>
                  {/* self-start: UbAmount is a right-aligned column, and stretched
                      across its stack the figure sat away from its label. */}
                  <UbAmount
                    value={String(amount)}
                    size="lg"
                    tone={late ? 'receivable' : undefined}
                    label={t(String(label))}
                    labelHidden
                    className="self-start"
                  />
                </UbStack>
              ))}
            </UbStack>
            {isNonZero(loan.arrears) && (
              <UbText variant="body-sm" tone="error">
                {t('lending.today.late', {
                  amount: formatInr(loan.arrears),
                  days: loan.daysPastDue,
                })}
              </UbText>
            )}
            {/* "Not paid" records a missed visit, so it is offered only when
                something is actually due (L02 QA: it showed on a loan whose
                first instalment was tomorrow). */}
            {active && canCollect && isNonZero(asked) && (
              <UbStack direction="row" gap={2} wrap>
                <UbButton size="sm" variant="secondary" onClick={() => setVisiting(true)}>
                  {t('lending.visit.button')}
                </UbButton>
              </UbStack>
            )}
          </UbStack>
        </UbCard>

        <UbCard padded>
          <UbStack gap={2}>
            <UbInfoRow label={t('lending.loan.terms')} value={rateLine} />
            <UbInfoRow
              label={t('lending.preview.rate')}
              value={t('lending.preview.rateValue', {
                rate: Number(loan.effectiveAnnualRate).toFixed(1),
              })}
            />
            <UbInfoRow label={t('lending.loan.principal')} value={formatInr(loan.principal)} />
            <UbInfoRow label={t('lending.preview.cash')} value={formatInr(loan.cashHandedOver)} />
            <UbInfoRow label={t('lending.preview.total')} value={formatInr(loan.totalPayable)} />
            {loan.deductions.map((d) => (
              <UbInfoRow key={d.label} label={d.label} value={formatInr(d.amount)} />
            ))}
            <UbInfoRow
              label={t('lending.loan.given')}
              value={formatBusinessDate(loan.disbursedOn)}
            />
            <UbInfoRow label={t('lending.loan.ends')} value={formatBusinessDate(loan.maturityOn)} />
            {loan.borrower.mobile && (
              <UbInfoRow
                label={t('lending.form.mobile')}
                value={formatPhoneForDisplay(loan.borrower.mobile)}
              />
            )}
            {loan.route && <UbInfoRow label={t('lending.route.label')} value={loan.route.name} />}
            {loan.notes && <UbInfoRow label={t('lending.form.notes')} value={loan.notes} />}
          </UbStack>
        </UbCard>

        <UbCard padded>
          <UbStack gap={1} data-testid="lending-loan-schedule">
            <UbText variant="label">{t('lending.loan.instalments')}</UbText>
            {schedule.map((due) => (
              <UbStack
                key={due.id}
                direction="row"
                justify="between"
                align="center"
                gap={2}
                className="border-t border-border-hairline py-2"
              >
                <UbText variant="body-sm">{`${due.seq}. ${formatBusinessDate(due.dueOn)}`}</UbText>
                <UbStack direction="row" gap={2} align="center">
                  <UbText variant="body-sm">
                    {formatInr(isNonZero(due.outstanding) ? due.outstanding : due.amount)}
                  </UbText>
                  <UbStatusBadge
                    tone={DUE_TONE[due.status] ?? 'neutral'}
                    label={t(
                      due.status === 'scheduled' && !isNonZero(due.outstanding)
                        ? 'lending.due.prepaid'
                        : `lending.due.${due.status}`
                    )}
                  />
                </UbStack>
              </UbStack>
            ))}
            <UbButton size="sm" variant="ghost" onClick={() => setShowAll((s) => !s)}>
              {showAll
                ? t('lending.loan.showOpen')
                : t('lending.loan.showAll', { count: loan.schedule.length })}
            </UbButton>
          </UbStack>
        </UbCard>

        <UbCard padded>
          <UbStack gap={1} data-testid="lending-loan-collections">
            <UbText variant="label">{t('lending.loan.collections')}</UbText>
            {state.collections.length === 0 && (
              <UbText variant="body-sm" tone="tertiary">
                {t('lending.loan.noCollections')}
              </UbText>
            )}
            {state.collections.map((c) => (
              <UbStack key={c.id} gap={0} className="border-t border-border-hairline py-2">
                <UbStack direction="row" justify="between" gap={2}>
                  <UbText variant="body-sm-medium" tone={c.voided ? 'tertiary' : undefined}>
                    {formatInr(c.amount)}
                  </UbText>
                  <UbText variant="caption" tone="tertiary">
                    {[
                      formatBusinessDate(c.collectedOn),
                      t(`lending.mode.${c.mode}`),
                      c.receiptNumber,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </UbText>
                </UbStack>
                {(c.note || c.reference || c.voided) && (
                  <UbText variant="caption" tone="secondary">
                    {[c.voided ? t('lending.loan.voided') : '', c.reference, c.note]
                      .filter(Boolean)
                      .join(' · ')}
                  </UbText>
                )}
              </UbStack>
            ))}
            {state.visits.map((v, i) => (
              <UbText
                key={`${v.onDate}-${i}`}
                variant="caption"
                tone="tertiary"
                className="border-t border-border-hairline py-2"
              >
                {[
                  formatBusinessDate(v.onDate),
                  t(`lending.visit.outcome.${v.outcome}`),
                  v.promisedOn ? formatBusinessDate(v.promisedOn) : '',
                  v.reason,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </UbText>
            ))}
          </UbStack>
        </UbCard>
      </UbStack>
      {collecting && (
        <CollectDialogLazy
          loanId={loan.id}
          name={loan.borrower.name}
          number={loan.number}
          suggested={isNonZero(asked) ? asked : loan.instalmentAmount}
          onClose={() => setCollecting(false)}
        />
      )}
      {visiting && (
        <NotPaidDialogLazy
          loanId={loan.id}
          name={loan.borrower.name}
          today={today}
          onClose={() => setVisiting(false)}
        />
      )}
    </UbPageShell>
  );
}
