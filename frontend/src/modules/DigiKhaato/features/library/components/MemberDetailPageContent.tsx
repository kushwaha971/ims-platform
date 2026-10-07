'use client';

import { useEffect, useState } from 'react';

import dynamic from 'next/dynamic';

import {
  Armchair,
  Ban,
  CirclePlay,
  DoorClosed,
  MessageCircle,
  QrCode,
  Receipt,
  RefreshCw,
  UserRoundPlus,
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
import { useTranslation } from 'src/hooks/useTranslation';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { ROUTES } from 'src/routes';
import { formatBusinessDate, todayInTenantTz } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';
import { formatPhoneForDisplay } from 'src/utils/share';

import { useMemberDetail } from '../hooks/useMemberDetail';
import { selectLibraryMemberList } from '../redux/libraryMemberListSlice';
import { fetchLibraryMembershipTypes } from '../redux/libraryMemberThunk';
import {
  blockParams,
  FEE_TONE,
  isNonZero,
  shiftHours,
  STATUS_TONE,
  validityLine,
} from '../view-model/memberDisplay';

import { CatalogueActionsMenu } from './CatalogueActionsMenu';
import { MemberAttendanceStrip } from './MemberAttendanceStrip';
import { MemberChargesSection } from './MemberChargesSection';

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
/* Shop P0 — the student's UPI QR for the fee, with Share and Copy link. */
const UpiPayQrDialogLazy = dynamic(
  () => import('../../payments/pay-link/components/UpiPayQrDialog').then((m) => m.UpiPayQrDialog),
  { ssr: false }
);
const SeatDialogLazy = dynamic(() => import('./SeatDialog').then((m) => m.SeatDialog), {
  ssr: false,
});

/**
 * F04 (LIB-04 §7, §8) — `/library/members/[membershipId]`: who the member is,
 * how long they may borrow, what they have out and what they owe. The header
 * follows the khata header: the name owns its line, badges sit on the caption
 * line, the number is monospace. Renew is the one primary action; the rest are
 * behind ⋯ (the LED-02 lesson — five buttons made a page wider than a phone).
 */
export function MemberDetailPageContent({ id }: Readonly<{ id: string }>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const detail = useMemberDetail(id);
  const { types } = useAppSelector(selectLibraryMemberList);
  const timezone = useAppSelector(selectTenantTimezone);
  const today = todayInTenantTz(timezone ?? undefined);
  const [dialog, setDialog] = useState<MemberDialogKind | null>(null);
  const [seating, setSeating] = useState(false);
  const [messaging, setMessaging] = useState<MessageKind | null>(null);
  const [showingQr, setShowingQr] = useState(false);
  const { member } = detail;

  useEffect(() => {
    if (!detail.canRead || types.length > 0) return undefined;
    const promise = dispatch(fetchLibraryMembershipTypes());
    return () => promise.abort();
  }, [dispatch, detail.canRead, types.length]);

  if (!detail.canRead) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('library.noAccess.title')}
          description={t('library.noAccess.body')}
        />
      </UbPageShell>
    );
  }
  if (detail.status === 'failed' && !member) {
    const notFound = detail.error?.status === 404;
    return (
      <UbPageShell>
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
      </UbPageShell>
    );
  }
  if (!member) return <UbPageSkeleton variant="card" />;

  const closed = member.effectiveStatus === 'closed';
  const suspended = member.effectiveStatus === 'suspended';
  const busy = detail.actionStatus === 'loading';
  // Shop P0 — what the fee QR asks for: what is owed, else the plan's fee (a renewal).
  const feeAmount = isNonZero(member.duesAmount) ? member.duesAmount : member.planFee;
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
    <UbPageShell>
      <UbPageHeader
        title={member.name}
        actions={
          <UbStack direction="row" gap={2}>
            {!closed && detail.canWrite && (
              <UbButton
                icon={<RefreshCw className="h-4 w-4" aria-hidden />}
                onClick={() => setDialog('renew')}
                data-testid="library-member-renew"
              >
                {t('library.member.renew')}
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
                    detail.canWrite && !closed && member.feeState !== 'paid'
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
                  action: detail.canWrite && closed ? () => setDialog('rejoin') : undefined,
                },
              ]}
            />
          </UbStack>
        }
      />
      <UbStack gap={4}>
        <UbStack direction="row" gap={2} align="center" wrap>
          <UbText variant="body-sm" className="ds-mono" data-testid="library-member-number">
            {member.memberNumber}
          </UbText>
          <UbStatusBadge
            tone={FEE_TONE[member.feeState]}
            label={t(`library.fee.${member.feeState}`)}
          />
          {suspended && (
            <UbStatusBadge
              tone={STATUS_TONE[member.effectiveStatus]}
              label={t(`library.member.status.${member.effectiveStatus}`)}
            />
          )}
          <UbLink href={`${ROUTES.PARTIES}/${member.party.id}`}>{t('library.member.khata')}</UbLink>
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

        <UbCard padded>
          <UbStack gap={3}>
            <UbStack direction="row" gap={4} wrap>
              <UbStack gap={0} className="min-w-28" data-testid="library-member-seat">
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
              {member.loansOpen > 0 && (
                <UbStack gap={0} className="min-w-28">
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
              <UbStack gap={0} className="min-w-28">
                <UbText variant="caption" tone="tertiary">
                  {t('library.member.owes')}
                </UbText>
                {isNonZero(member.duesAmount) ? (
                  <UbAmount
                    value={member.duesAmount}
                    size="lg"
                    tone="receivable"
                    label={t('library.member.owes')}
                    labelHidden
                  />
                ) : (
                  <UbText variant="metric-sm">{t('library.member.noDues')}</UbText>
                )}
              </UbStack>
              {member.deposit && (
                <UbStack gap={0} className="min-w-28">
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
                </UbStack>
              )}
            </UbStack>
            {!closed && detail.canWrite && (
              <UbStack direction="row" gap={2} wrap>
                <UbButton
                  size="sm"
                  variant="secondary"
                  onClick={() => setSeating(true)}
                  data-testid="library-member-place"
                >
                  {t(member.seat ? 'library.place.change' : 'library.place.give')}
                </UbButton>
                {member.seat && (
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
        </UbCard>

        <UbCard padded>
          <UbStack gap={2}>
            {facts.map(([label, value]) => (
              <UbInfoRow key={label} label={label} value={value} />
            ))}
          </UbStack>
        </UbCard>

        <MemberAttendanceStrip
          membershipId={member.membershipId}
          startsOn={member.startsOn}
          today={today}
          t={t}
        />

        <MemberChargesSection member={member} t={t} />

        {member.periods.length > 0 && (
          <UbCard padded>
            <UbStack gap={2}>
              <UbText variant="label">{t('library.member.history')}</UbText>
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
          </UbCard>
        )}
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
          onClose={() => setMessaging(null)}
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
      {dialog && (
        <MemberActionDialogLazy
          kind={dialog}
          member={member}
          types={types}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(body) => detail.act(dialog, body)}
        />
      )}
    </UbPageShell>
  );
}
