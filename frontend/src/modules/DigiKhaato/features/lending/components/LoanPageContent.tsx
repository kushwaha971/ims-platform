'use client';

import { useEffect, useState } from 'react';

import dynamic from 'next/dynamic';

import {
  Ban,
  FileCheck2,
  FileText,
  FileX2,
  HandCoins,
  MessageCircle,
  Printer,
  QrCode,
} from 'lucide-react';

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
  UbStatusBanner,
  UbText,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectLocale } from 'src/redux/slice/localeSlice';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { ROUTES } from 'src/routes';
import { formatBusinessDate, todayInTenantTz } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';
import { formatPhoneForDisplay } from 'src/utils/share';

import { selectLendingLoans } from '../redux/lendingLoansSlice';
import { fetchLendingLoan } from '../redux/lendingThunk';
import {
  LOAN_STATUS_TONE,
  endedReason,
  isNonZero,
  isRemindable,
  localClock,
  localDay,
} from '../view-model/lendingDisplay';

import type { LendingMessageKind, LoanDue } from '../types/lending.types';
import type { LoanPaper } from './print/LoanPapersPrint';

const CollectDialogLazy = dynamic(() => import('./CollectDialog').then((m) => m.CollectDialog), {
  ssr: false,
});
const NotPaidDialogLazy = dynamic(() => import('./NotPaidDialog').then((m) => m.NotPaidDialog), {
  ssr: false,
});
/* Shop P0 — the borrower's UPI QR for what is due, with Share and Copy link. */
const UpiPayQrDialogLazy = dynamic(
  () => import('../../payments/pay-link/components/UpiPayQrDialog').then((m) => m.UpiPayQrDialog),
  { ssr: false }
);
/* LEN-09 — the late-fee and waiver dialog loads with the tap. */
const AdjustDueDialogLazy = dynamic(
  () => import('./AdjustDueDialog').then((m) => m.AdjustDueDialog),
  { ssr: false }
);
const OPEN_DUE = new Set(['due', 'overdue']);
/* LEN-10 — write-off and cancel load with the tap. */
const EndLoanDialogLazy = dynamic(() => import('./EndLoanDialog').then((m) => m.EndLoanDialog), {
  ssr: false,
});

/* Lending P0 — receipt, statement and closure letter: the sheet loads with the tap. */
const LoanPapersPrintLazy = dynamic(
  () => import('./print/LoanPapersPrint').then((m) => m.LoanPapersPrint),
  { ssr: false }
);
const MessageDialogLazy = dynamic(() => import('./MessageDialog').then((m) => m.MessageDialog), {
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
  const locale = useAppSelector(selectLocale);
  const { can, hasModule } = usePermissions();
  const canRead = hasModule('lending') && can('lending.loan.read');
  const canCollect = hasModule('lending') && can('lending.collection.create');
  const [collecting, setCollecting] = useState(false);
  const [visiting, setVisiting] = useState(false);
  const canRemind = hasModule('lending') && can('lending.reminder.send');
  const [messaging, setMessaging] = useState<{
    kind: LendingMessageKind;
    collectionId?: string;
  } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showingQr, setShowingQr] = useState(false);
  const canCharge = hasModule('lending') && can('lending.charge.create');
  const canWaive = hasModule('lending') && can('lending.waiver.create');
  const canClose = hasModule('lending') && can('lending.loan.close');
  // A write-off is the owner's alone; `platform.tenant.manage` is the owner's codename.
  const isOwner = can('platform.tenant.manage');
  const [ending, setEnding] = useState<'write_off' | 'cancel' | null>(null);
  const [adjusting, setAdjusting] = useState<{ due: LoanDue; mode: 'fee' | 'waive' } | null>(null);
  const [paper, setPaper] = useState<{
    kind: LoanPaper;
    collectionId?: string;
    key: number;
  } | null>(null);
  const printPaper = (kind: LoanPaper, collectionId?: string) =>
    setPaper((current) => ({ kind, collectionId, key: (current?.key ?? 0) + 1 }));

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
  const remindable = canRemind && isRemindable(loan, today);
  const remindedToday = state.messages.find(
    (m) => m.kind === 'reminder' && localDay(m.at) === today
  );
  // "Receipt after a collection": offered on the latest one still standing.
  // An opening row (QA F8) had no receipt, so it is never the one offered.
  const latestCollection = state.collections.find((c) => !c.voided && !c.opening);
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
        className="ub-print-hide"
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
      <UbStack gap={4} data-testid="lending-loan" className="ub-print-hide">
        {(loan.status === 'written_off' || loan.status === 'cancelled') && (
          <UbStatusBanner
            tone="warning"
            title={t(`lending.end.banner.${loan.status}`, {
              date: loan.closedOn ? formatBusinessDate(loan.closedOn) : '',
            })}
            description={loan.statusReason ? endedReason(loan.statusReason, t) : undefined}
            data-testid="lending-loan-ended"
          />
        )}
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
            {((active && canCollect && isNonZero(asked)) ||
              remindable ||
              (active && canCollect)) && (
              <UbStack direction="row" gap={2} align="center" wrap>
                {active && canCollect && (
                  <UbButton
                    size="sm"
                    variant="secondary"
                    icon={<QrCode className="h-4 w-4" aria-hidden />}
                    onClick={() => setShowingQr(true)}
                    data-testid="lending-loan-upi-qr"
                  >
                    {t('payLink.button')}
                  </UbButton>
                )}
                {active && canCollect && isNonZero(asked) && (
                  <UbButton size="sm" variant="secondary" onClick={() => setVisiting(true)}>
                    {t('lending.visit.button')}
                  </UbButton>
                )}
                {remindable && (
                  <UbButton
                    size="sm"
                    variant="secondary"
                    icon={<MessageCircle className="h-4 w-4" aria-hidden />}
                    onClick={() => setMessaging({ kind: 'reminder' })}
                    data-testid="lending-loan-remind"
                  >
                    {t('lending.messages.remind')}
                  </UbButton>
                )}
                {remindable && remindedToday && (
                  <UbText variant="caption" tone="tertiary">
                    {t('lending.messages.remindedAt', {
                      time: localClock(remindedToday.at),
                      channel: t(`lending.messages.channel.${remindedToday.channel}`),
                    })}
                  </UbText>
                )}
              </UbStack>
            )}
          </UbStack>
        </UbCard>

        {/* Lending P0 — the papers a borrower is handed: the statement any time, and
            the closure letter ("no dues") once the loan is paid off. */}
        <UbStack direction="row" gap={2} wrap data-testid="lending-loan-papers">
          <UbButton
            size="sm"
            variant="secondary"
            icon={<FileText className="h-4 w-4" aria-hidden />}
            onClick={() => printPaper('statement')}
            data-testid="lending-loan-print-statement"
          >
            {t('lending.papers.statement.print')}
          </UbButton>
          {active &&
            canClose &&
            isOwner &&
            loan.writeOffAmount &&
            isNonZero(loan.writeOffAmount) && (
              <UbButton
                size="sm"
                variant="secondary"
                icon={<FileX2 className="h-4 w-4" aria-hidden />}
                onClick={() => setEnding('write_off')}
                data-testid="lending-loan-write-off"
              >
                {t('lending.end.writeOff.button')}
              </UbButton>
            )}
          {active && canClose && !loan.hasCollections && (
            <UbButton
              size="sm"
              variant="secondary"
              icon={<Ban className="h-4 w-4" aria-hidden />}
              onClick={() => setEnding('cancel')}
              data-testid="lending-loan-cancel"
            >
              {t('lending.end.cancel.button')}
            </UbButton>
          )}
          {loan.status === 'closed' && !isNonZero(loan.remaining) && (
            <UbButton
              size="sm"
              variant="secondary"
              icon={<FileCheck2 className="h-4 w-4" aria-hidden />}
              onClick={() => printPaper('closure')}
              data-testid="lending-loan-print-closure"
            >
              {t('lending.papers.closure.print')}
            </UbButton>
          )}
        </UbStack>

        <UbCard padded>
          <UbStack gap={2}>
            <UbInfoRow label={t('lending.loan.terms')} value={rateLine} />
            {loan.lateFee.kind !== 'none' && (
              <UbInfoRow
                label={t('lending.loan.lateFeeRule')}
                value={t(`lending.lateFee.rule.${loan.lateFee.kind}`, {
                  value: formatInr(loan.lateFee.value ?? '0'),
                  rate: Number(loan.lateFee.value ?? 0).toString(),
                  cap: formatInr(loan.lateFee.cap ?? '0'),
                  days: loan.lateFee.graceDays,
                })}
              />
            )}
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
              <UbStack key={due.id} gap={1} className="border-t border-border-hairline py-2">
                <UbStack direction="row" justify="between" align="center" gap={2}>
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
                {(isNonZero(due.lateFee) || isNonZero(due.waived)) && (
                  <UbText variant="caption" tone="tertiary" data-testid="lending-due-adjusted">
                    {[
                      isNonZero(due.lateFee)
                        ? t('lending.due.lateFee', { amount: formatInr(due.lateFee) })
                        : '',
                      isNonZero(due.waived)
                        ? t('lending.due.waived', { amount: formatInr(due.waived) })
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </UbText>
                )}
                {active && OPEN_DUE.has(due.status) && (canCharge || canWaive) && (
                  <UbStack direction="row" gap={2}>
                    {canCharge && loan.lateFee.kind !== 'none' && due.status === 'overdue' && (
                      <UbButton
                        size="sm"
                        variant="ghost"
                        onClick={() => setAdjusting({ due, mode: 'fee' })}
                        data-testid="lending-due-late-fee"
                      >
                        {t('lending.adjust.fee.button')}
                      </UbButton>
                    )}
                    {canWaive && (
                      <UbButton
                        size="sm"
                        variant="ghost"
                        onClick={() => setAdjusting({ due, mode: 'waive' })}
                        data-testid="lending-due-waive"
                      >
                        {t('lending.adjust.waive.button')}
                      </UbButton>
                    )}
                  </UbStack>
                )}
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
                      c.opening ? t('lending.loan.collectedBefore') : t(`lending.mode.${c.mode}`),
                      c.receiptNumber,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </UbText>
                </UbStack>
                {!c.opening && (c.note || c.reference || c.voided) && (
                  <UbText variant="caption" tone="secondary">
                    {[c.voided ? t('lending.loan.voided') : '', c.reference, c.note]
                      .filter(Boolean)
                      .join(' · ')}
                  </UbText>
                )}
                {!c.opening && (
                  <UbButton
                    size="sm"
                    variant="ghost"
                    className="self-start"
                    icon={<Printer className="h-4 w-4" aria-hidden />}
                    onClick={() => printPaper('receipt', c.id)}
                    data-testid="lending-loan-print-receipt"
                  >
                    {t('lending.papers.receipt.print')}
                  </UbButton>
                )}
                {canRemind && c.id === latestCollection?.id && (
                  <UbButton
                    size="sm"
                    variant="ghost"
                    className="self-start"
                    icon={<MessageCircle className="h-4 w-4" aria-hidden />}
                    onClick={() => setMessaging({ kind: 'receipt', collectionId: c.id })}
                    data-testid="lending-loan-receipt"
                  >
                    {t('lending.messages.sendReceipt')}
                  </UbButton>
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

        {state.messages.length > 0 && (
          <UbCard padded>
            <UbStack gap={1} data-testid="lending-loan-messages">
              <UbText variant="label">{t('lending.messages.history')}</UbText>
              {state.messages.map((m) => (
                <UbText
                  key={m.id}
                  variant="caption"
                  tone="tertiary"
                  className="border-t border-border-hairline py-2"
                >
                  {[
                    `${formatBusinessDate(localDay(m.at))} ${localClock(m.at)}`,
                    t(`lending.messages.kind.${m.kind}`),
                    t(`lending.messages.channel.${m.channel}`),
                  ].join(' · ')}
                </UbText>
              ))}
            </UbStack>
          </UbCard>
        )}
      </UbStack>
      {ending && <EndLoanDialogLazy loan={loan} mode={ending} onClose={() => setEnding(null)} />}
      {adjusting && (
        <AdjustDueDialogLazy
          loanId={loan.id}
          due={adjusting.due}
          mode={adjusting.mode}
          onClose={() => setAdjusting(null)}
        />
      )}
      {paper && (
        <LoanPapersPrintLazy
          loan={loan}
          collections={state.collections}
          paper={paper.kind}
          collectionId={paper.collectionId ?? null}
          locale={locale}
          today={today}
          printKey={paper.key}
        />
      )}
      {showingQr && (
        <UpiPayQrDialogLazy
          amount={isNonZero(asked) ? asked : loan.instalmentAmount}
          reference={loan.number}
          title={t('payLink.loanTitle', {
            amount: formatInr(isNonZero(asked) ? asked : loan.instalmentAmount),
          })}
          onClose={() => setShowingQr(false)}
        />
      )}
      {messaging && (
        <MessageDialogLazy
          loanId={loan.id}
          name={loan.borrower.name}
          kind={messaging.kind}
          collectionId={messaging.collectionId}
          onClose={() => setMessaging(null)}
        />
      )}
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
