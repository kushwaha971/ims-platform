'use client';

import { useEffect, useState } from 'react';

import dynamic from 'next/dynamic';

import {
  Armchair,
  ArrowLeftRight,
  Ban,
  CirclePlay,
  DoorClosed,
  MessageCircle,
  Pencil,
  Phone,
  QrCode,
  Receipt,
  RefreshCw,
  UserRoundPlus,
} from 'lucide-react';

import {
  UbActionLink,
  UbAmount,
  UbButton,
  UbDisclosure,
  UbEmptyState,
  UbPageHeader,
  UbPageShell,
  UbPageSkeleton,
  UbStack,
  UbStatusBadge,
  UbStatusBanner,
  UbText,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useIsOwnerOrAdmin } from 'src/hooks/useIsOwnerOrAdmin';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { ROUTES } from 'src/routes';
import { formatBusinessDate, todayInTenantTz } from 'src/utils/dates';
import { addMoney, formatInr } from 'src/utils/money';
import { formatPhoneForDisplay } from 'src/utils/share';

import { useMemberDetail } from '../hooks/useMemberDetail';
import { selectLibraryMemberList } from '../redux/libraryMemberListSlice';
import { fetchLibraryMembershipTypes } from '../redux/libraryMemberThunk';
import {
  blockParams,
  FEE_TONE,
  feeLabel,
  owesFee,
  renewalPreview,
  isNonZero,
  shiftHours,
  STATUS_TONE,
  validityLine,
} from '../view-model/memberDisplay';

import { CatalogueActionsMenu } from './CatalogueActionsMenu';
import { LibraryCard } from './LibraryCard';
import { LIBRARY_OVERLAY_CLASSNAME } from './LibraryOverlays';
import { MemberAttendanceStrip } from './MemberAttendanceStrip';
import { MemberChargesSection } from './MemberChargesSection';
import { MemberMessageLog } from './MemberMessageLog';

import type { MemberDialogKind } from './MemberActionDialog';
import type { MessageKind } from '../types/message.types';

/** Each act's dialog loads with the tap that opens it (CLAUDE.md). */
const MemberActionDialogLazy = dynamic(
  () => import('./MemberActionDialog').then((m) => m.MemberActionDialog),
  { ssr: false }
);

const MessageDialogLazy = dynamic(() => import('./MessageDialog').then((m) => m.MessageDialog), {
  ssr: false,
});
const MemberPaymentHistoryLazy = dynamic(
  () => import('./MemberPaymentHistory').then((m) => m.MemberPaymentHistory),
  { ssr: false }
);
/* Shop P0 — the student's UPI QR for the fee, with Share and Copy link. */
const UpiPayQrDialogLazy = dynamic(
  () => import('../../payments/pay-link/components/UpiPayQrDialog').then((m) => m.UpiPayQrDialog),
  { ssr: false }
);
const SeatDialogLazy = dynamic(() => import('./SeatDialog').then((m) => m.SeatDialog), {
  ssr: false,
});
/* A form belongs in the chunk that OPENS it (CLAUDE.md): RHF's resolver and the
   schema load with the tap on "Edit details", not with the page. */
const SUMMARY_AMOUNT_ALIGNMENT = 'items-start [&>span[aria-hidden]>span]:min-w-0';

const MemberEditDrawerLazy = dynamic(
  () => import('./MemberEditDrawer').then((m) => m.MemberEditDrawer),
  { ssr: false }
);
const PartyIdentityDrawerLazy = dynamic(
  () => import('../../parties/components/PartyIdentityDrawer').then((m) => m.PartyIdentityDrawer),
  { ssr: false }
);
const PaymentFormDrawerLazy = dynamic(
  () => import('../../payments/components/PaymentFormDrawer').then((m) => m.PaymentFormDrawer),
  { ssr: false }
);

/**
 * F04 (LIB-04 §7, §8) — `/library/members/[membershipId]`: who the member is,
 * how long they may borrow, what they have out and what they owe. The header
 * follows the khata header: the name owns its line, badges sit on the caption
 * line, the number is monospace. Renew is the one primary action; the rest are
 * behind ⋯ (the LED-02 lesson — five buttons made a page wider than a phone).
 */
export function MemberDetailPageContent({
  id,
  embedded = false,
}: Readonly<{ id: string; embedded?: boolean }>): React.JSX.Element {
  const { t } = useTranslation();
  const DetailShell = embedded ? UbStack : UbPageShell;
  const dispatch = useAppDispatch();
  const { can, hasModule } = usePermissions();
  const isManager = useIsOwnerOrAdmin();
  const detail = useMemberDetail(id);
  const { types } = useAppSelector(selectLibraryMemberList);
  const timezone = useAppSelector(selectTenantTimezone);
  const today = todayInTenantTz(timezone ?? undefined);
  const [dialog, setDialog] = useState<MemberDialogKind | null>(null);
  const [seating, setSeating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [collectingFees, setCollectingFees] = useState(false);
  const [messaging, setMessaging] = useState<MessageKind | null>(null);
  // Bumped when a message dialog closes, so the log shows a send at once.
  const [messageLogKey, setMessageLogKey] = useState(0);
  const [paymentHistoryRevision, setPaymentHistoryRevision] = useState(0);
  const [showingQr, setShowingQr] = useState(false);
  const { member } = detail;

  useEffect(() => {
    if (!detail.canRead || types.length > 0) return undefined;
    const promise = dispatch(fetchLibraryMembershipTypes());
    return () => promise.abort();
  }, [dispatch, detail.canRead, types.length]);

  if (!detail.canRead) {
    return (
      <DetailShell>
        <UbEmptyState
          variant="firstUse"
          title={t('library.noAccess.title')}
          description={t('library.noAccess.body')}
        />
      </DetailShell>
    );
  }
  if (detail.status === 'failed' && !member) {
    const notFound = detail.error?.status === 404;
    return (
      <DetailShell>
        <UbEmptyState
          variant={notFound ? 'firstUse' : 'error'}
          title={t(notFound ? 'library.member.notFound' : 'library.member.error.title')}
          description={notFound ? undefined : detail.error?.message}
          requestId={notFound ? null : (detail.error?.requestId ?? null)}
          requestIdLabel={t('common.error.reference')}
          action={
            notFound ? (
              <UbActionLink href={ROUTES.LIBRARY_MEMBERS} variant="secondary">
                {t('library.member.title')}
              </UbActionLink>
            ) : (
              <UbButton variant="secondary" onClick={detail.refetch}>
                {t('common.action.retry')}
              </UbButton>
            )
          }
        />
      </DetailShell>
    );
  }
  if (!member) return <UbPageSkeleton variant="card" />;

  const closed = member.effectiveStatus === 'closed';
  const renewable = renewalPreview(member, today) !== null;
  const suspended = member.effectiveStatus === 'suspended';
  const busy = detail.actionStatus === 'loading';
  // Shop P0 — what the fee QR asks for: what is owed, else the plan's fee (a renewal).
  const feeAmount = isNonZero(member.duesAmount) ? member.duesAmount : member.planFee;
  // QA B4 — a deposit not taken at admission is owed beside the fees; it is
  // counted here and named, never folded into the fee dues the server keeps.
  const depositDue = member.deposit && isNonZero(member.deposit.due) ? member.deposit.due : null;
  const owedInAll = addMoney(member.duesAmount, depositDue ?? '0.00');
  const validity = validityLine(member, today);
  const validityText = t(
    validity.id,
    validity.params && 'date' in validity.params
      ? { date: formatBusinessDate(String(validity.params.date)) }
      : validity.params
  );

  const facts: readonly [string, string][] = [
    [
      t('library.member.type'),
      isNonZero(member.planFee)
        ? t('library.member.planWithFee', {
            plan: member.type.name,
            fee: formatInr(member.planFee),
          })
        : member.type.name,
    ],
    // QA-F04-2 — under the label "Valid until", the value is the date alone;
    // the sentence form ("Expires in 3 days") is for when the date is near.
    [
      t('library.member.validUntil'),
      validity.id === 'library.member.validUntilOn' && member.validUntil
        ? formatBusinessDate(member.validUntil)
        : validityText,
    ],
    [t('library.member.group'), member.groupLabel],
    [t('library.member.guardian'), member.guardian?.name ?? ''],
    [t('library.member.mobile'), formatPhoneForDisplay(member.party.mobile)],
    [t('library.member.since'), formatBusinessDate(member.startsOn)],
  ].filter((fact): fact is [string, string] => fact[1] !== '');

  return (
    <DetailShell>
      <UbPageHeader
        wrapTitle={embedded}
        className={
          embedded ? '[&>div:first-child]:items-start [&_h1]:min-h-10 [&_h1]:leading-10' : undefined
        }
        title={member.name}
        actions={
          <UbStack direction="row" gap={2}>
            {/* QA B5 — a plan with no end date has nothing to renew: Renew
                answered "Please check the highlighted fields" over a dialog with
                no fields. Such a student is offered Change plan instead. */}
            {!closed && detail.canWrite && renewable && (
              <UbButton
                icon={<RefreshCw className="h-4 w-4" aria-hidden />}
                onClick={() => setDialog('renew')}
                data-testid="library-member-renew"
              >
                {t('library.member.renew')}
              </UbButton>
            )}
            {!closed && detail.canWrite && !renewable && !embedded && (
              <UbButton
                variant="secondary"
                icon={<ArrowLeftRight className="h-4 w-4" aria-hidden />}
                onClick={() => setDialog('changePlan')}
                data-testid="library-member-change-plan"
              >
                {t('library.member.changePlan')}
              </UbButton>
            )}
            <CatalogueActionsMenu
              t={t}
              items={[
                {
                  key: 'remind',
                  label: t('library.messages.kind.fee.menu'),
                  icon: MessageCircle,
                  action:
                    detail.canWrite && !closed && owesFee(member.feeState)
                      ? () => setMessaging('fee')
                      : undefined,
                },
                {
                  key: 'upiQr',
                  label: t('payLink.feeTitle'),
                  icon: QrCode,
                  action:
                    detail.canWrite && !closed && isNonZero(feeAmount)
                      ? () => setShowingQr(true)
                      : undefined,
                },
                /* QA F4 / B51 — a paid student can be told their plan's end date,
                   thanked for renewing, or sent the desk's own words; a custom
                   message reaches any student, a closed one included. */
                {
                  key: 'planEnd',
                  label: t('library.messages.kind.plan_end.menu'),
                  icon: MessageCircle,
                  action:
                    detail.canWrite && !closed && member.validUntil
                      ? () => setMessaging('plan_end')
                      : undefined,
                },
                {
                  key: 'thanks',
                  label: t('library.messages.kind.thanks.menu'),
                  icon: MessageCircle,
                  action:
                    detail.canWrite && !closed && member.validUntil
                      ? () => setMessaging('thanks')
                      : undefined,
                },
                {
                  key: 'custom',
                  label: t('library.messages.kind.custom.menu'),
                  icon: MessageCircle,
                  action: detail.canWrite ? () => setMessaging('custom') : undefined,
                },
                {
                  key: 'welcome',
                  label: t('library.messages.kind.welcome.menu'),
                  icon: MessageCircle,
                  action: detail.canWrite && !closed ? () => setMessaging('welcome') : undefined,
                },
                {
                  key: 'receipt',
                  label: t('library.messages.kind.receipt.menu'),
                  icon: Receipt,
                  action: detail.canWrite ? () => setMessaging('receipt') : undefined,
                },
                {
                  key: 'seat',
                  label: t(member.seat ? 'library.place.change' : 'library.place.give'),
                  icon: Armchair,
                  action: detail.canWrite && !closed ? () => setSeating(true) : undefined,
                },
                /* Owner, 12 Oct 2026 — editing, suspending, reactivating, closing
                   and re-admitting a student are the owner's or an admin's; the
                   hook's flags already carry that, so these items are simply not
                   drawn for anybody else (§19.7.5). Kept on any status: a closed
                   student's note or number can still be wrong. */
                {
                  key: 'freeSeat',
                  label: t('library.place.free', { seat: member.seat?.label ?? '' }),
                  icon: Armchair,
                  action:
                    embedded && member.seat && detail.canWrite && !closed && !busy
                      ? () => {
                          void detail.place({ seatId: null });
                        }
                      : undefined,
                },
                {
                  key: 'edit',
                  label: t('library.member.edit'),
                  icon: Pencil,
                  action: detail.canEdit ? () => setEditing(true) : undefined,
                },
                {
                  key: 'identity',
                  label: t('library.member.edit.nameLink'),
                  icon: Pencil,
                  action:
                    isManager && can('parties.party.write')
                      ? () => setEditingIdentity(true)
                      : undefined,
                },
                {
                  key: 'changePlan',
                  label: t('library.member.changePlan'),
                  icon: ArrowLeftRight,
                  action:
                    detail.canWrite && !closed && renewable
                      ? () => setDialog('changePlan')
                      : undefined,
                },
                {
                  key: 'suspend',
                  label: t('library.member.suspend'),
                  icon: Ban,
                  action:
                    detail.canClose && !closed && !suspended
                      ? () => setDialog('suspend')
                      : undefined,
                },
                {
                  key: 'reactivate',
                  label: t('library.member.reactivate'),
                  icon: CirclePlay,
                  action: detail.canClose && suspended ? () => setDialog('reactivate') : undefined,
                },
                {
                  key: 'close',
                  label: t('library.member.closeMembership'),
                  icon: DoorClosed,
                  action: detail.canClose && !closed ? () => setDialog('close') : undefined,
                },
                {
                  key: 'rejoin',
                  label: t('library.member.rejoin'),
                  icon: UserRoundPlus,
                  action: detail.canRejoin && closed ? () => setDialog('rejoin') : undefined,
                },
              ]}
            />
          </UbStack>
        }
      />
      <UbStack gap={3} className="mx-auto w-full max-w-6xl">
        <UbStack direction="row" gap={2} align="center" wrap>
          <UbText variant="body-sm" className="ds-mono" data-testid="library-member-number">
            {member.memberNumber}
          </UbText>
          {/* A suspended student's own badge below says "On hold" already. */}
          {member.feeState !== 'on_hold' && (
            <UbStatusBadge
              tone={FEE_TONE[member.feeState]}
              label={
                embedded && isNonZero(member.duesAmount)
                  ? t('library.members.totals.dues', { amount: formatInr(member.duesAmount) })
                  : feeLabel(t, member.feeState, member.validUntil)
              }
            />
          )}
          {suspended && (
            <UbStatusBadge
              tone={STATUS_TONE[member.effectiveStatus]}
              label={t(`library.member.status.${member.effectiveStatus}`)}
            />
          )}
        </UbStack>

        {closed && (
          <UbStatusBanner
            tone="info"
            title={t('library.member.closedOn', {
              date: member.closedOn ? formatBusinessDate(member.closedOn) : '',
            })}
            description={member.closedReason || undefined}
          />
        )}
        {suspended && (
          <UbStatusBanner
            tone="warning"
            title={
              member.suspendedUntil
                ? t('library.member.suspendedUntil', {
                    date: formatBusinessDate(member.suspendedUntil),
                  })
                : t('library.member.suspendedOpen')
            }
            description={member.suspensionReason || undefined}
          />
        )}

        <LibraryCard padded={false}>
          <UbStack gap={3} className="p-3">
            <UbStack
              className={
                embedded ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-2 gap-3 md:grid-cols-4'
              }
            >
              <UbStack gap={0} className="min-w-0" data-testid="library-member-seat">
                <UbText variant="caption" tone="tertiary">
                  {t('library.members.column.seat')}
                </UbText>
                <UbText variant="metric-sm">
                  {member.seat?.label ?? t('library.members.noSeat')}
                </UbText>
                {member.shift && (
                  <UbText variant="caption" tone="tertiary">
                    {`${member.shift.name} · ${shiftHours(member.shift)}`}
                  </UbText>
                )}
                {member.lockerLabel && (
                  <UbText variant="caption" tone="tertiary">
                    {t('library.member.lockerOf', { locker: member.lockerLabel })}
                  </UbText>
                )}
              </UbStack>
              {embedded &&
                member.feeState === 'no_fee' &&
                !isNonZero(detail.chargeTotals?.paid ?? '0.00') && (
                  <UbStack gap={1} className="min-w-0">
                    <UbText variant="caption" tone="tertiary">
                      {t('library.fees.title')}
                    </UbText>
                    <UbText variant="body-sm-medium">{t('library.fee.no_fee')}</UbText>
                  </UbStack>
                )}
              {detail.chargeTotals &&
                [
                  {
                    key: 'total',
                    label: 'library.member.fees.total',
                    value: detail.chargeTotals.amount,
                  },
                  {
                    key: 'paid',
                    label: 'library.member.fees.paid',
                    value: detail.chargeTotals.paid,
                  },
                ]
                  .filter(
                    (figure) =>
                      !embedded ||
                      (figure.key === 'paid' &&
                        (member.feeState !== 'no_fee' || isNonZero(figure.value)))
                  )
                  .map((figure) => (
                    <UbStack
                      key={figure.key}
                      gap={0}
                      className="min-w-0"
                      data-testid={`library-member-fees-${figure.key}`}
                    >
                      <UbText variant="caption" tone="tertiary">
                        {t(figure.label)}
                      </UbText>
                      <UbAmount
                        value={figure.value}
                        size="lg"
                        tone={figure.key === 'paid' ? 'payable' : 'neutral'}
                        label={t(figure.label)}
                        labelHidden
                        className={SUMMARY_AMOUNT_ALIGNMENT}
                      />
                    </UbStack>
                  ))}
              {member.loansOpen > 0 && (
                <UbStack gap={0} className="min-w-0">
                  <UbText variant="caption" tone="tertiary">
                    {t('library.member.booksOut')}
                  </UbText>
                  <UbText variant="metric-sm">
                    {t('library.member.booksOf', {
                      count: member.loansOpen,
                      max: member.type.maxCopies,
                    })}
                  </UbText>
                  {member.loansOverdue > 0 && (
                    <UbText variant="caption" tone="error">
                      {t('library.member.overdueCount', { count: member.loansOverdue })}
                    </UbText>
                  )}
                </UbStack>
              )}
              {(!embedded || depositDue) && (
                <UbStack gap={0} className="min-w-0">
                  <UbText variant="caption" tone="tertiary">
                    {t(depositDue ? 'library.member.toCollect' : 'library.member.owes')}
                  </UbText>
                  {isNonZero(owedInAll) ? (
                    <UbAmount
                      value={owedInAll}
                      size="lg"
                      tone="receivable"
                      label={t('library.member.owes')}
                      labelHidden
                    />
                  ) : (
                    <UbText variant="metric-sm">{t('library.member.noDues')}</UbText>
                  )}
                  {depositDue && (
                    <UbText
                      variant="caption"
                      tone="tertiary"
                      data-testid="library-member-owes-deposit"
                    >
                      {t('library.member.owesInclDeposit', { deposit: formatInr(depositDue) })}
                    </UbText>
                  )}
                </UbStack>
              )}
              {member.deposit && (
                <UbStack gap={0} className="min-w-0">
                  <UbText variant="caption" tone="tertiary">
                    {t('library.member.depositHeld')}
                  </UbText>
                  <UbText variant="metric-sm">
                    {Number(member.deposit.held) < Number(member.deposit.expected)
                      ? t('library.member.depositOf', {
                          held: formatInr(member.deposit.held),
                          expected: formatInr(member.deposit.expected),
                        })
                      : formatInr(member.deposit.held)}
                  </UbText>
                  <UbText variant="caption" tone="tertiary">
                    {t('library.member.depositReturned')}
                  </UbText>
                  {depositDue && !closed && detail.canWrite && (
                    <UbButton
                      size="sm"
                      variant="secondary"
                      className="mt-1 self-start"
                      onClick={() => setDialog('deposit')}
                      data-testid="library-member-take-deposit"
                    >
                      {t('library.member.deposit.take')}
                    </UbButton>
                  )}
                </UbStack>
              )}
            </UbStack>
            {!closed && (
              <UbStack
                direction="row"
                gap={2}
                wrap
                className={embedded ? 'grid grid-cols-2' : undefined}
              >
                {hasModule('payments') &&
                  can('payments.payment.write') &&
                  isNonZero(member.duesAmount) && (
                    <UbButton
                      size="sm"
                      onClick={() => setCollectingFees(true)}
                      data-testid="library-member-collect-fees"
                    >
                      {t('library.member.fees.collect')}
                    </UbButton>
                  )}
                {embedded && detail.canWrite && !renewable && (
                  <UbButton
                    size="sm"
                    variant="outlineNeutral"
                    onClick={() => setDialog('changePlan')}
                    data-testid="library-member-change-plan"
                  >
                    {t('library.member.changePlan')}
                  </UbButton>
                )}
                {detail.canWrite && (
                  <>
                    <UbButton
                      size="sm"
                      variant="outlineNeutral"
                      onClick={() => setSeating(true)}
                      data-testid="library-member-place"
                    >
                      {t(member.seat ? 'library.place.change' : 'library.place.give')}
                    </UbButton>
                    {member.seat && !embedded && (
                      <UbButton
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void detail.place({ seatId: null })}
                        data-testid="library-member-free-seat"
                      >
                        {t('library.place.free', { seat: member.seat.label })}
                      </UbButton>
                    )}
                  </>
                )}
              </UbStack>
            )}
            {member.blocks.length > 0 && !closed && member.loansOpen > 0 && (
              <UbStack gap={1} data-testid="library-member-blocks">
                {member.blocks.map((block) => (
                  <UbText key={block.code} variant="body-sm" tone="warning">
                    {t(`library.member.block.${block.code}`, blockParams(block))}
                  </UbText>
                ))}
              </UbStack>
            )}
          </UbStack>
        </LibraryCard>

        <UbStack
          className={embedded ? 'grid gap-4' : 'grid items-start gap-4 lg:grid-cols-[2fr_1fr]'}
        >
          <LibraryCard padded={false}>
            <UbStack gap={3} className="p-3">
              <UbText as="h2" variant="body-medium">
                {t('library.member.contactDetails')}
              </UbText>
              <UbStack className="grid grid-cols-2 gap-x-4 gap-y-3">
                {facts.map(([label, value]) => (
                  <UbStack key={label} gap={1} className="min-w-0">
                    <UbText variant="caption" tone="tertiary">
                      {label}
                    </UbText>
                    {label === t('library.member.mobile') && member.party.mobile ? (
                      <UbActionLink
                        href={`tel:${member.party.mobile}`}
                        variant="ghost"
                        size="sm"
                        className="justify-start p-0"
                        icon={<Phone className="h-4 w-4" aria-hidden />}
                      >
                        {value}
                      </UbActionLink>
                    ) : (
                      <UbText variant="body-sm-medium" className="break-words">
                        {value}
                      </UbText>
                    )}
                  </UbStack>
                ))}
              </UbStack>
            </UbStack>
          </LibraryCard>

          <MemberAttendanceStrip
            membershipId={member.membershipId}
            startsOn={member.startsOn}
            today={today}
            t={t}
          />
        </UbStack>

        <UbDisclosure
          label={t('library.member.activityDetails')}
          defaultOpen={!embedded}
          keepMounted
          className="rounded-none border-0 [&>[role=region]]:px-0 [&>[role=region]]:pb-0 [&>button]:rounded-none"
        >
          <UbStack gap={3}>
            <UbStack className={embedded ? 'grid gap-4' : 'grid items-start gap-4 xl:grid-cols-2'}>
              <MemberChargesSection
                member={member}
                t={t}
                onPaymentSaved={() => setPaymentHistoryRevision((current) => current + 1)}
              />
              <MemberPaymentHistoryLazy
                membershipId={member.membershipId}
                partyId={member.party.id}
                revision={paymentHistoryRevision}
              />
            </UbStack>

            <MemberMessageLog membershipId={member.membershipId} refreshKey={messageLogKey} t={t} />

            {member.periods.length > 0 && (
              <LibraryCard padded={false}>
                <UbStack gap={3} className="p-3">
                  <UbText as="h2" variant="body-medium">
                    {t('library.member.history')}
                  </UbText>
                  {member.periods.map((period, index) => (
                    <UbStack key={`${period.onDate}-${index}`} gap={0}>
                      <UbText variant="body-sm">{t(`library.member.period.${period.kind}`)}</UbText>
                      <UbText variant="caption" tone="tertiary">
                        {[
                          formatBusinessDate(period.onDate),
                          period.validUntil
                            ? t('library.member.validUntilOn', {
                                date: formatBusinessDate(period.validUntil),
                              })
                            : t('library.member.noExpiry'),
                          period.reason,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </UbText>
                    </UbStack>
                  ))}
                </UbStack>
              </LibraryCard>
            )}
          </UbStack>
        </UbDisclosure>
      </UbStack>

      {showingQr && (
        <UpiPayQrDialogLazy
          amount={feeAmount}
          reference={member.memberNumber}
          title={t('payLink.feeTitle')}
          onClose={() => setShowingQr(false)}
        />
      )}
      {messaging && (
        <MessageDialogLazy
          membershipId={member.membershipId}
          name={member.name}
          kind={messaging}
          onClose={() => {
            setMessaging(null);
            setMessageLogKey((key) => key + 1);
          }}
        />
      )}
      {seating && (
        <SeatDialogLazy
          member={member}
          busy={busy}
          onClose={() => setSeating(false)}
          onSubmit={detail.place}
        />
      )}
      {collectingFees && (
        <PaymentFormDrawerLazy
          className={LIBRARY_OVERLAY_CLASSNAME}
          context={{
            direction: 'in',
            partyId: member.party.id,
            partyName: member.party.name,
            receivable: member.duesAmount,
            bucket: 'library',
            entry: 'party',
          }}
          onSaved={() => setPaymentHistoryRevision((value) => value + 1)}
          onClose={() => setCollectingFees(false)}
        />
      )}
      {editingIdentity && (
        <PartyIdentityDrawerLazy
          key={member.party.id}
          party={member.party}
          onClose={() => setEditingIdentity(false)}
        />
      )}
      {editing && (
        <MemberEditDrawerLazy
          member={member}
          busy={busy}
          onClose={() => setEditing(false)}
          onSubmit={detail.edit}
        />
      )}
      {dialog && (
        <MemberActionDialogLazy
          kind={dialog}
          member={member}
          types={types}
          today={today}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(body) => detail.act(dialog, body)}
        />
      )}
    </DetailShell>
  );
}
